# 27 — Dynamic `import()` at request time on workerd, and module instance identity

Research findings for
[issue 27](../issues/27-workerd-dynamic-import-at-request-time.md).
Map: [ursprung v0](../map.md).

The upload/linking half of the ticket is **not** re-researched here — see
[`05-wrangler.md`](./05-wrangler.md), which established it by running Wrangler.
This file answers only the runtime half.

## Answer in one paragraph

**Yes.** `import()` from inside a `fetch` handler is permitted on workerd, on the
default (legacy) module registry, with **no compatibility flag required**, and it is
exercised by workerd's own test suite. Module **evaluation** is deferred to first
import, so the proposal's premise holds. On the default registry the evaluation is
charged to a **third, separate budget** — `IsolateLimitEnforcer::enterDynamicImportJs`
— not to request CPU and not to startup; the request is parked on `awaitIo` while it
happens. Under the experimental `new_module_registry` flag the accounting is
different: evaluation is charged to the ambient **request** CPU budget. And the module
registry does guarantee **one instance per resolved specifier** on both registries, so
shared-module extraction on the server is safe. There are four sharp edges, listed in
§7, of which the two that matter are: **compilation is still eager at startup on the
default registry** (only evaluation is deferred), and **a dynamically imported
module's top-level code runs with no `IoContext`**, so it may not do I/O.

## What this was established against

| Source                                   | Version / revision                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `cloudflare/workerd` source              | commit `22b2a0020044d7a910f4d98d640822de6bb312d6`, 2026-08-07 (`main`)   |
| developers.cloudflare.com                | fetched 2026-08-07                                                        |

The workerd tree was cloned to a scratch directory, read, and deleted. Nothing was
built or run — **every source-code claim below is read, not executed.** The one piece
of executable evidence is workerd's own committed test suite (§5), which is stronger
than reading but weaker than running it here.

**Claims are tagged.** `[SOURCE]` = read from workerd's C++/JS source or its in-repo
architecture docs. `[DOCS]` = developers.cloudflare.com. `[TEST]` = workerd's committed
test suite. Where a claim is `[SOURCE]` only, note that the **production** limit
enforcer is closed-source (workerd's open-source one is a no-op stub, §3), so the
_interface_ is established but the _numbers_ are not.

---

## 1. There are two module registries, and which one you get is a compat flag

`[SOURCE]` workerd carries two independent module registry implementations:

- **Legacy** — `src/workerd/jsg/modules.h` / `modules.c++`, `kj::Path`-keyed. **This is
  the default and it is what production Workers use today.**
- **New** — `src/workerd/jsg/modules-new.h` / `modules-new.c++`, `jsg::Url`-keyed,
  gated behind the `new_module_registry` compatibility flag.

The flag definition, verbatim
([`src/workerd/io/compatibility-date.capnp:514`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/compatibility-date.capnp#L514)):

```capnp
  newModuleRegistry @52 :Bool
      $compatEnableFlag("new_module_registry")
      $compatDisableFlag("legacy_module_registry")
      $experimental;
```

`[SOURCE]` **`$experimental`, and there is no `$compatEnableDate`.** So no
compatibility date turns it on; it must be named explicitly, and `$experimental` flags
are not generally available on production Cloudflare Workers. `[DOCS]` Corroborating:
neither `new_module_registry` nor `legacy_module_registry` appears anywhere on
[the compatibility flags page](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
(fetched and searched, 2026-08-07) — consistent with an internal experimental flag.

`[SOURCE]` The flag is also suppressed for Python Workers
([`src/workerd/io/features.h:37`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/features.h#L37)):

```cpp
inline bool isNewModuleRegistryEnabled(const CompatibilityFlags::Reader& flags) {
  return flags.getNewModuleRegistry() && !flags.getPythonWorkers();
}
```

**Consequence for ursprung: design against the legacy registry.** Everything below is
stated for both, but the legacy one is the one v0 will actually run on.

---

## 2. Dynamic import from inside a request is permitted — legacy registry

`[SOURCE]` The proof is `Worker::Script::Impl::configureDynamicImports`
([`src/workerd/io/worker.c++:902`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L902)).
It installs the embedder's dynamic-import callback and branches on whether an
`IoContext` (a request) is currently active. Verbatim, from line 953:

```cpp
    modules.setDynamicImportCallback([](jsg::Lock& js, DynamicImportHandler handler) mutable {
      KJ_IF_SOME(context, IoContext::tryCurrent()) {
        // If we are within the scope of a IoContext, then we are going to pop
        // out of it to perform the actual module instantiation.

        return context.awaitIo(js,
            handleDynamicImport(kj::atomicAddRef(context.getWorker()), kj::mv(handler),
                jsg::AsyncContextFrame::currentRef(js)),
            [](jsg::Lock& js, DynamicImportResult result) {
          if (result.isException) {
            return js.rejectedPromise<jsg::Value>(kj::mv(result.value));
          }
          return js.resolvedPromise(kj::mv(result.value));
        });
      }

      // If we got here, there is no current IoContext. We're going to perform the
      // module resolution synchronously and we do not have to worry about blocking any
      // i/o. We get here, for instance, when dynamic import is used at the top level of
      // a script (which is weird, but allowed).
      //
      // We do not need to use limitEnforcer.enterDynamicImportJs() here because this should
      // already be covered by the startup resource limiter.
      return js.resolvedPromise(handler());
    });
```

Two things are established by that block and nothing else needs to be inferred:

1. **The in-request path is the _first_ branch and it is the designed-for one.** The
   no-request path is the one the comment calls "weird, but allowed". Dynamic import at
   request time is the normal case, not a tolerated accident.
2. **It is not in the "disallowed operation" family.** `[SOURCE]` That error
   (`kAsyncIoErrorMessage`,
   [`src/workerd/io/io-context.c++:1498`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/io-context.c%2B%2B#L1498))
   is thrown by `IoContext::current()` when there is **no** current request — i.e. it
   guards I/O at the _top level_, the exact opposite direction. Nothing in the dynamic
   import path consults it. The ticket asked us to look for it; it is not there.

`[SOURCE]` The mechanics of the in-request path, from `handleDynamicImport`
([`worker.c++:909`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L909)):
it `co_await kj::yield()`s, takes an async isolate lock **without a request**
(`takeAsyncLockWithoutRequest`), runs the instantiation, and hands the result back
through `context.awaitIo(...)`. So from the request's point of view the import is an
**I/O wait**, and the module's own top-level code runs outside the request's
`IoContext`. That last point has teeth — see §7.1.

---

## 3. Which budget the evaluation lands in

This is the part the ticket flagged as decision-changing, and the two registries
answer it **differently**.

### 3.1 Legacy registry: a third, separate budget

`[SOURCE]` `handleDynamicImport` wraps the call to the instantiation handler in its own
limit scope ([`worker.c++:926`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L926)):

```cpp
            auto limitScope = worker->getIsolate().getLimitEnforcer().enterDynamicImportJs(
                lock, limitErrorOrTime);
            return DynamicImportResult(handler());
```

`[SOURCE]` `enterDynamicImportJs` is a first-class member of the isolate limit
enforcer interface, documented in place
([`src/workerd/io/limit-enforcer.h:57`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/limit-enforcer.h#L57)):

```cpp
  // Like enterStartupJs(), but used when compiling a dynamically-imported module.
  virtual kj::Own<void> enterDynamicImportJs(
      jsg::Lock& lock, kj::OneOf<kj::Exception, kj::Duration>& limitErrorOrTime) const = 0;
```

So it sits alongside `enterStartupJs`, `enterStartupPython`, `enterLoggingJs` and
`enterInspectorJs` as a **peer** of the startup budget, not a subset of it and not the
request budget. `[SOURCE]` If it is exceeded, the failure surfaces as a thrown
`"Failed to load dynamic module."` or the enforcer's own exception
([`worker.c++:940–948`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L940)).

**The number is not establishable from primary sources.** `[SOURCE]` workerd's
open-source enforcer is a no-op stub — `enterDynamicImportJs` returns `{}` with no
accounting at all
([`src/workerd/server/server.c++:3263`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/server/server.c%2B%2B#L3263)),
alongside identically-stubbed `enterStartupJs` and friends. The production enforcer
lives in Cloudflare's closed internal repo. `[DOCS]` The docs publish a value for
startup ("A Worker must parse and execute its global scope (top-level code outside of
handlers) within 1 second", error code `10021`,
[Limits](https://developers.cloudflare.com/workers/platform/limits/)) but publish
**nothing** for the dynamic-import budget. It is not in the docs at all.

**So the honest statement is:** the request CPU budget is not what pays for it, the
1-second startup budget is not what pays for it, and the size of the budget that does
is unpublished. The comment at `limit-enforcer.h:57` ("Like `enterStartupJs()`")
suggests it is startup-shaped rather than request-shaped, but that is an inference from
a code comment, not an established number.

### 3.2 New registry: the ambient request budget

`[SOURCE]` Under `new_module_registry` there is no separate scope. workerd states this
outright in two places. First, the assertion guarding the legacy path
([`worker.c++:903`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L903)):

```cpp
    // This is only used with the original module registry implementation. The new
    // module registry handles dynamic imports via dynamicImportModuleCallback() in
    // modules-new.c++, which resolves synchronously within the V8 callback and relies
    // on the ambient request/startup CPU budget rather than enterDynamicImportJs().
```

Second, at the callback itself
([`src/workerd/jsg/modules-new.c++:1318`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/jsg/modules-new.c%2B%2B#L1318)):

```cpp
// Dynamic import callback for the new module registry.
//
// Unlike the legacy module registry (see Worker::Script::Impl::configureDynamicImports in
// worker.c++), the new registry resolves dynamic imports synchronously within the V8
// callback rather than popping out of the IoContext for a separate compile step. This
// means no per-import CPU limit (enterDynamicImportJs) is applied; instead, the import
// charges against the ambient request or startup CPU budget. This is intentional: the
// new registry's lazy compilation model means dynamic imports do not trigger eager
// compilation of all transitive dependencies, so the per-import limit that protected
// against that in the legacy path is unnecessary.
```

**This is the ticket's feared case**, and it is real — but only on the experimental
flag, and it comes with lazy _compilation_ (§4) which is what makes it affordable.
`[DOCS]` For scale: the request CPU limit is 30 s by default, 5 min max on the Paid
plan, and "waiting on network requests … does not count toward CPU time"
([Limits](https://developers.cloudflare.com/workers/platform/limits/)). A Route module's
evaluation is pure CPU against a 30-second ceiling, which is two orders of magnitude
more headroom than the 1-second startup budget it replaces. The "per-Route latency
cliff" the ticket worried about is a real shape but a small one.

---

## 4. Lazy evaluation is real; lazy *compilation* is not, on the default registry

This is the finding most likely to change how ticket 21 sizes things, and it was not
anticipated by the ticket.

`[SOURCE]` **Legacy registry: every worker-bundle module is compiled at startup,
whether or not anything imports it.** `WorkerdApi::compileModules`
([`src/workerd/server/workerd-api.c++:515`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/server/workerd-api.c%2B%2B#L515))
loops over the whole uploaded module set unconditionally:

```cpp
    for (auto& module: source.modules) {
      auto path = kj::Path::parse(module.name);
      auto maybeInfo = tryCompileLegacyModule(
          lockParam, module.name, module.content, modules->getObserver(), featureFlags);
      KJ_IF_SOME(info, maybeInfo) {
        modules->add(path, kj::mv(info));
      }
    }
```

and it is called from inside the startup limit scope
([`worker.c++:1509–1520`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L1509)),
guarded by `enterStartupJs`. `[SOURCE]` workerd's own architecture doc states the same
thing as a named characteristic
([`docs/reference/detail/legacy-module-registry.md`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/docs/reference/detail/legacy-module-registry.md),
"Key Characteristics and Limitations" #2):

> **Eager compilation for bundle modules.** All worker bundle modules are compiled
> during `compileModules`, before any request is served. Builtin modules are lazily
> compiled on first import.

**Evaluation, however, is genuinely deferred.** `[SOURCE]` Only the main module is
evaluated at startup: `tryResolveMainModule`
([`worker.c++:1786`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L1786))
takes an `enterStartupJs` scope and calls `js.resolveModule(mainModule…)`, which runs
V8 instantiation + `Evaluate` over the main module's **static** import graph. A module
that nothing statically imports is compiled but never evaluated until an `import()`
reaches it.

`[SOURCE]` **New registry: both are lazy.** From
[`docs/reference/detail/new-module-registry.md`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/docs/reference/detail/new-module-registry.md),
design goal #3:

> **Fully lazy compilation and evaluation.** No modules are compiled during
> `ModuleRegistry` construction. Both ESM compilation and synthetic module evaluation
> happen on first import. The legacy registry eagerly compiled all worker bundle ESM
> modules at startup.

### What this means for the proposal, precisely

| Cost                                    | Single bundle           | Root + N Route modules, legacy registry | Root + N Route modules, `new_module_registry` |
| --------------------------------------- | ----------------------- | ---------------------------------------- | --------------------------------------------- |
| **Parse/compile of all route code**     | startup budget          | **still startup budget** (all N)          | deferred, per-module, on first import         |
| **Evaluation of unmatched Route code**  | startup budget          | **not run at all**                        | not run at all                                |
| **Evaluation of the matched Route**     | startup budget          | `enterDynamicImportJs` budget             | request CPU budget                            |

So on the registry v0 will actually run on, **the proposal buys deferred evaluation but
not deferred compilation.** If a Route's cost is mostly top-level work (building
tables, constructing signal graphs, instantiating capnweb stubs) the proposal wins big.
If it is mostly sheer bytes of code to parse, the proposal buys nothing at startup —
the parse still happens for every Route on every cold start.

`[DOCS]` This is not contradicted by the docs, which describe the *bundling* effect
rather than the runtime one:

> a large lazy-imported file (for example, `await import("./large-dep.mjs")`) would be
> bundled directly into your entrypoint, reducing the effectiveness of the lazy
> loading. If matching rule is added to `rules`, then this file would only be loaded
> and executed at runtime when it is actually imported.
>
> — [Bundling](https://developers.cloudflare.com/workers/wrangler/bundling/)

and, on `rules`, that matched files become

> available to be imported when your Worker is invoked
>
> — [Configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)

Both are consistent with "evaluated at runtime"; neither claims compilation is
deferred, and the source says it is not.

---

## 5. workerd's own tests exercise dynamic import inside a handler

`[TEST]` The strongest non-executed evidence. `src/workerd/api/tests/module-test.js`
runs on the **legacy** registry — its
[`.wd-test`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/api/tests/module-test.wd-test)
sets `compatibilityFlags = ["nodejs_compat"]` and nothing else — and its first test is:

```js
export const basics = {
  async test() {
    const assert2 = await import('a/b/c');
```

([`module-test.js:9`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/api/tests/module-test.js#L9))

A `test()` handler runs inside an `IoContext` exactly as `fetch()` does. Note also that
the imported module `a/b/c` is itself
`"import * as assert from 'node:assert'; await import('node:buffer'); export default assert;"`
— a **nested** dynamic import at the imported module's top level, which also works.

`[TEST]` For the new registry,
[`new-module-registry-test.js:279`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/api/tests/new-module-registry-test.js#L279)
carries a comment that settles the "is this an IoContext-legal operation" question in
so many words:

```js
// Verify that a module is unable to perform IO operations at the top level, even if
// the dynamic import is initiated within the scope of an active IoContext.
export const nestedRequireDoesNotCrashSiblingTlaModule = {
  async test() {
    const mod = await import('tla-entry');
```

The restriction that test names is on **I/O at the imported module's top level**, not
on the import itself.

---

## 6. One instance per resolved specifier — the load-bearing question

**Established for both registries.** Shared-module extraction on the server is safe.

### 6.1 Legacy registry

`[SOURCE]` The registry is a `kj::Table` of `Entry` keyed by
`(kj::Path specifier, Type)` — `Type` being `BUNDLE` / `BUILTIN` / `INTERNAL`
([`src/workerd/jsg/modules.h:576`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/jsg/modules.h#L576)).
Each entry's payload starts as source and is **mutated in place** to a compiled
`ModuleInfo` on first access, which is then returned for every subsequent resolve
([`modules.h:626`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/jsg/modules.h#L626)):

```cpp
      KJ_SWITCH_ONEOF(info) {
        KJ_CASE_ONEOF(moduleInfo, ModuleInfo) {
          return kj::Maybe<ModuleInfo&>(moduleInfo);
        }
        KJ_CASE_ONEOF(src, kj::ArrayPtr<const char>) {
          info = ModuleInfo(js, specifier.toString(), src, compileCache,
              ModuleInfoCompileOption::BUILTIN, observer);
          return info.tryGet<ModuleInfo>();
        }
```

`[SOURCE]` `ModuleInfo` holds exactly one `HashableV8Ref<v8::Module>`. Both the static
import path (`ModuleRegistryImpl::resolve`,
[`modules.h:407`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/jsg/modules.h#L407))
and the dynamic path (`resolveDynamicImport`,
[`modules.h:506`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/jsg/modules.h#L506))
go through the **same** `entries` table with the same key. So the same specifier
resolves to the same `v8::Module` no matter who imports it or how.

`[SOURCE]` And evaluation happens at most once: `instantiateModule`
([`src/workerd/jsg/modules.c++:288`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/jsg/modules.c%2B%2B#L288))
short-circuits on V8 module status:

```cpp
  // Nothing to do if the module is already evaluated.
  if (status == v8::Module::Status::kEvaluated || status == v8::Module::Status::kEvaluating) {
    return kj::none;
  }
```

`[SOURCE]` Specifier normalisation is `kj::Path`-based: "Relative imports are resolved
against the referrer's parent path. This means `./foo` from `bar/baz.js` resolves to
`bar/foo`" (legacy-module-registry.md, characteristic #3). Two Route modules at
different depths reaching one shared module by different relative specifiers therefore
land on the **same** normalised path, hence the same entry, hence one instance. This is
the property extraction needs.

### 6.2 New registry

`[SOURCE]` Stated as an explicit guarantee in the architecture doc
([new-module-registry.md](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/docs/reference/detail/new-module-registry.md),
"The two-level split encodes the module-identity rules the registry guarantees"):

> - **Query/fragment-distinct specifiers produce distinct instances**, each with its
>   own `import.meta.url` (`import('./foo?a') !== import('./foo?b')`), per the HTML
>   module-map model.
> - **The same specifier resolved through different context types shares one instance
>   when it resolves to the same definition** … and a builtin imported by both user
>   code and other builtins remains a per-isolate singleton (**module-level state is
>   never duplicated**).
> - **The same specifier resolved to different definitions yields distinct instances**
>   — a worker-bundle module shadowing a builtin name coexists with the real builtin.

`[TEST]` Backed by `queryAndFragment` in
[`new-module-registry-test.js:309`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/api/tests/new-module-registry-test.js#L309),
which asserts that `import('foo?query')` and `import('foo')` give **different
namespace objects** but **identical export values** — i.e. one module instance, two
namespace views.

### 6.3 The one trap in this, and how the emitter avoids it

`[SOURCE]` "One instance per **resolved specifier**" is exact, and the resolution key
is not the file. Under the new registry, `./signals.js` and `./signals.js?v=2` are two
instances of one file — two disjoint reactive graphs, exactly ticket 02's failure.
Under the legacy registry a query string is not stripped either (`kj::Path`, no URL
parsing, characteristic #6: "no query parameter handling"), so `./signals.js?v=2` would
simply fail to resolve rather than duplicate.

**The emitter's obligation is therefore one line: emit exactly one specifier string per
emitted module, and never a query or fragment.** Content-hash the *filename*
(`signals.a1b2c3.js`), never a query (`signals.js?h=a1b2c3`). This is a constraint on
ticket 14, and it is cheap to honour — but it is silent if violated on the new
registry, which is the mode the ticket warned about.

---

## 7. The four sharp edges

### 7.1 A dynamically imported module's top-level code cannot do I/O

`[SOURCE]` **Both registries deliberately evaluate modules with the `IoContext`
suppressed**, even when the `import()` was initiated from inside a request.

Legacy: `handleDynamicImport` takes `takeAsyncLockWithoutRequest(nullptr)` and runs
`runInLockScope` outside the request
([`worker.c++:909–950`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L909));
the comment says it "pop[s] out of it to perform the actual module instantiation."

New: the eval callback asserts it
([`src/workerd/io/worker-modules.h:97`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker-modules.h#L97)):

```cpp
  builder.setEvalCallback(
      [](jsg::Lock& js, const auto& module, auto v8Module, const auto& observer) -> jsg::JsPromise {
    // Creating the SuppressIoContextScope here ensures that the current IoContext,
    // if any, is moved out of the way while we are evaluating.
    SuppressIoContextScope suppressIoContextScope;
    KJ_DASSERT(!IoContext::hasCurrent(), "Module evaluation must not be in an IoContext");
```

`[SOURCE]` A Route module whose top level calls `fetch()`, `setTimeout()`, or
`crypto.getRandomValues()` therefore gets, verbatim
([`io-context.c++:1498`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/io-context.c%2B%2B#L1498)):

> Disallowed operation called within global scope. Asynchronous I/O (ex: fetch() or
> connect()), setting a timeout, and generating random values are not allowed within
> global scope. To fix this error, perform this operation within a handler.

`[TEST]` Exercised as `noTopLevelIo` in
[`new-module-registry-test.js:289`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/api/tests/new-module-registry-test.js#L289).

**This is the same rule that already applies to the single-bundle model** — the whole
bundle is evaluated at startup, where I/O is equally forbidden. So the proposal does
not make it worse. It is listed here because it is easy to assume that "evaluated
during a request" implies "may do request things"; it does not. `[TEST]` One
mitigation exists: `env` from `cloudflare:workers` **is** readable at module top level
(the values are populated), it is only *using* a binding that fails
([`importable-env-test.js:16–26`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/api/tests/importable-env-test.js#L16)).

### 7.2 Top-level await in a dynamically imported module fails on the legacy registry

`[SOURCE]` At evaluation depth 0 — which is where a Route module imported from a
`fetch` handler sits — `instantiateModule` drains the microtask queue once and then
hard-fails if the module's evaluation promise is still pending
([`modules.c++:345–353`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/jsg/modules.c%2B%2B#L345)):

```cpp
  js.runMicrotasks();

  switch (prom->State()) {
    case v8::Promise::kPending:
      // Let's make sure nobody is depending on modules awaiting on pending promises.
      JSG_FAIL_REQUIRE(Error, "Top-level await in module is unsettled.");
```

`[SOURCE]` The new registry does not have this restriction — it returns the real
promise and the `import()` simply stays pending
(new-module-registry.md, "Dynamic Import Flow": "The legacy registry instead throws an
eager `Top-level await in module is unsettled.` error, a deviation tied to its
evaluate-within-one-drain model.").

Combined with 7.1 — no I/O at top level — a TLA that could actually settle would have
to await something non-I/O anyway. In practice: **ursprung's emitted Route modules must
not contain top-level `await`**, and since constraint 8's parser already has a reject
list, this is a candidate for it. Third-party npm modules with TLA are the real risk.

### 7.3 The dynamic import is an async hop, not a synchronous call

`[SOURCE]` The legacy path `co_await kj::yield()`s and re-acquires the isolate async
lock before evaluating ([`worker.c++:913–914`](https://github.com/cloudflare/workerd/blob/22b2a0020044d7a910f4d98d640822de6bb312d6/src/workerd/io/worker.c%2B%2B#L913)).
So even a warm, already-evaluated Route module costs at least one event-loop turn plus
a lock re-acquisition on every `import()`. `[SOURCE]` The evaluation itself is not
repeated (§6.1), so the second request to a Route pays only the hop.

**Design note for ticket 21:** the router should `await import(...)` once and keep the
namespace, rather than re-`import()`ing per request, if that hop ever shows up in a
measurement. It is correct either way.

### 7.4 The Vitest pool does not support it

`[DOCS]` A dev-loop caveat, not a runtime one. From
[Vitest integration — Known issues](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/):

> Dynamic `import()` statements do not work inside `export default { ... }` handlers
> when writing integration tests

with the stated workaround being to "import and call your handlers directly, or use
static `import` statements in the global scope". This affects the `@cloudflare/vitest-pool-workers`
harness, which v0 does not currently use (constraint 11 rules out a dev server, and the
repo tests with `bun test`). Worth recording so it is not rediscovered as a platform
limit later — **it is not one.**

---

## 8. Answers to the ticket's questions, in order

**"Does workerd permit `import()` of an uploaded module from inside a `fetch` handler?"**
Yes, on the default registry, with no compatibility flag. §2, §5.

**"Is the module's evaluation charged to request CPU time or to the startup budget?"**
Neither, on the default registry — a third budget, `enterDynamicImportJs`, whose size
is unpublished (§3.1). On the experimental `new_module_registry`, request CPU (§3.2),
against a 30-second ceiling rather than a 1-second one.

**"Is there any other mechanism that defers evaluation until first use?"** Moot — the
answer above is yes — but for completeness: no, there is not. §4 establishes that a
statically imported module is evaluated as part of the main module's graph under
`enterStartupJs`, and there is no lazy-static mechanism. Dynamic `import()` is the only
deferral.

**"Does the registry give one instance per specifier?"** Yes, on both registries, with
the specifier including query/fragment on the new one. §6. Shared-module extraction on
the server is **safe**, provided the emitter uses one canonical specifier string per
module and hashes filenames rather than query strings (§6.3).

**"If it is not possible, what is the fallback?"** Not needed. Recorded anyway, since
the ticket asked: the fallback would have been the map's original constraint 10 for the
server only — one self-contained Server bundle — with the client half of the pending
amendment standing on its own. That fallback is not required.

---

## Implications for ursprung

**The proposal is possible, and on the default registry it is possible without any
compatibility flag.** Nothing here blocks folding the first pending amendment's server
half in. Ticket 05 already established the upload side; this establishes the runtime
side; together they are the whole platform question.

**But it buys less than the amendment's stated rationale implies, and the shortfall
should be recorded.** The amendment's server-side justification on the map is *upload
size* — "N Route entrypoints each carrying a full copy of renderer, signals and
capnweb, against a total script-size limit." That argument is **untouched and still
correct**: shared extraction genuinely shrinks the upload, and §6 says extraction is
safe. What §4 undercuts is the adjacent, unstated hope that lazy imports also shrink
*startup*: on the legacy registry they do not shrink parse time at all, only evaluation
time. If anyone later writes "lazy Route imports keep startup flat as routes are added"
into the spec, that sentence is wrong for production Workers today.

**Three concrete obligations fall out, all ticket-21/ticket-14 shaped.**

1. **One canonical specifier per emitted module; content-hash the filename, never a
   query string.** §6.3. On the legacy registry a query specifier fails loudly; on the
   new one it duplicates the module silently. Ticket 14 is already deciding module
   naming and content hashing — this is a hard requirement on that decision, not a
   preference.
2. **Emitted Route modules must have side-effect-free, I/O-free, TLA-free top levels.**
   §7.1, §7.2. This is not new (the single-bundle model has the same rule at startup),
   but the failure mode moves: it now surfaces on the *first request to that Route*
   rather than at deploy time, so a dry run will not catch it. That argues for making
   it a build-time check.
3. **The router should hold the imported namespace, not re-`import()` per request.**
   §7.3.

**One thing to tell the maintainer plainly.** The `new_module_registry` flag is
`$experimental` with no enable date and is absent from the public compatibility-flags
page. It is strictly better for this architecture — lazy compilation, no separate
import budget, `import.meta.url`, URL specifiers — and it is the direction workerd is
moving. But v0 must not depend on it. Design for the legacy registry; treat the new
registry as an upside that arrives later.

**Vocabulary.** `CONTEXT.md`'s **Server bundle** and **Route bundle** both survive this
finding as *wrong* rather than *rescued* — the amendment's shape is confirmed, so the
`/domain-modeling` pass the map anticipates ("once ticket 27 reports") is now unblocked.
It needs a term for a shared emitted module, and it needs the server-side unit to stop
being called a bundle.
