# 28 — workerd's new module registry (`new_module_registry`)

Research findings. Map: [ursprung v0](../map.md).

Builds on [`27-dynamic-import.md`](./27-dynamic-import.md) (2026-08-07, read against workerd
`22b2a002`) and does **not** repeat it. Where this file contradicts or sharpens ticket 27, it
says so under the heading **Correction to ticket 27**. Two of those corrections are material.

## What this was established against

| Source                                | Version / revision                                                     |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `cloudflare/workerd` source           | commit `a955a8773323f34c37bbeb62dfd6d5ac3de2c45a`, 2026-08-08 (`main`) |
| `@cloudflare/workerd-linux-64` (run)  | `1.20260730.1`, reports `workerd 2026-07-30`                           |
| `wrangler` (run)                      | `4.118.0`                                                              |
| developers.cloudflare.com             | fetched 2026-08-08                                                     |

Unlike ticket 27, **this file contains executed evidence.** The repo's own workerd binary was
run under `wrangler dev` with and without the flag, against purpose-built test Workers. Every
`[RUN]` claim below is an observed output, pasted verbatim, not a reading of source.

**Claims are tagged.** `[SOURCE]` = read from workerd's C++/JS source or its in-repo
architecture docs at the pinned SHA. `[DOCS]` = developers.cloudflare.com. `[TEST]` = workerd's
committed test suite. `[RUN]` = executed here against the local workerd binary. `[INFERENCE]` =
reasoned, not established.

The workerd tree was cloned to a scratch directory; the test Workers were built in a scratch
directory outside the repo. **No deploy was attempted.**

---

## 1. Status of the flag: unchanged, but visibly being prepared for release

### 1.1 The declaration has not moved

`[SOURCE]` Verbatim, at
[`src/workerd/io/compatibility-date.capnp:514`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/compatibility-date.capnp#L514):

```capnp
  newModuleRegistry @52 :Bool
      $compatEnableFlag("new_module_registry")
      $compatDisableFlag("legacy_module_registry")
      $experimental;
```

**Still `$experimental`. Still no `$compatEnableDate`.** The three annotation lines are
byte-identical to what ticket 27 recorded at `22b2a002`. `git log -L` over that range shows the
only changes since are to the *doc comment* below the declaration — `2f9f41af` (2026-08-04)
expanded a one-line comment into the seven-line description now present, and `a52035a1`
(2026-08-06) renamed one flag inside it. Neither touched the annotations.

`[SOURCE]` The expanded comment is itself useful, because it is workerd's own summary of what
the flag buys:

> Enables the new module registry implementation, which handles module specifiers as URLs,
> implements import.meta (url/main/resolve), supports import attributes, and allows a registry
> to be shared across isolate replicas. […] Several flags describe legacy-registry behavior only
> and are not consulted by the new registry: exportCommonJsDefaultNamespace,
> requireReturnsDefaultExport, throwOnUnrecognizedImportAssertion, and noTopLevelAwaitInRequire.

### 1.2 The direction of travel is unmistakable, the date is not

`[SOURCE]` 70 commits landed on `main` between `22b2a002` and `a955a877`. The registry-relevant
history since 2026-07 is dense and two commits name the intent outright:

- `4484d8b7` (2026-08-04, jasnell) — **"Make module tests registry-agnostic ahead of NMR
  enablement"**
- `632da98c` (2026-08-05) — merge of branch **`jsnell/nmr-ga-review`** ("GA")
- `e2109d7e` (2026-08-04) — "Disable new module registry under python workers"
- plus a run of correctness fixes through July: `import.meta.resolve` Node parity, specifier
  double-encoding, `node:process` query/fragment handling, memory-safety fixes, compile-cache
  fixes.

`[SOURCE]` And the comment on `isNewModuleRegistryEnabled`
([`src/workerd/io/features.h:37`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/features.h#L37))
now says, in a parenthesis that did not have to be written:

> the `new_module_registry` flag is ignored for them, whether it was listed explicitly or
> **(once the flag gains an enable date)** implied by the worker's compatibility date

**The honest reading: Cloudflare is clearly working toward turning this on, and equally clearly
has not.** `[INFERENCE]` A `$compatEnableDate` is the single observable that would change the
answer, and it is not there today.

### 1.3 Nothing in public tracking

`[SOURCE]` A GitHub search of `cloudflare/workerd` issues for `new_module_registry` returns
**three** results, two of which are closed fallback-service protocol bugs
([#6474](https://github.com/cloudflare/workerd/issues/6474),
[#6475](https://github.com/cloudflare/workerd/issues/6475), both closed 2026-04-03) and one an
unrelated 2023 `import.meta` feature request
([#2963](https://github.com/cloudflare/workerd/issues/2963), still open — and note it would be
closed by this flag). A PR search for the term returns **zero**. There is no public rollout
issue, no tracking milestone, no announced date.

`[DOCS]` Re-checked 2026-08-08: neither `new_module_registry` nor `legacy_module_registry`
appears anywhere on
[the compatibility flags page](https://developers.cloudflare.com/workers/configuration/compatibility-flags/).
Ticket 27's finding stands verbatim.

---

## 2. Availability — the crux, and it is now settled from source and by running it

**Verdict: no. An `$experimental` flag cannot be set on a production Worker deployed to
Cloudflare. It is not merely undocumented; it is refused by name, by code that ships in this
very repository.**

### 2.1 workerd states the rule in the annotation's own documentation

`[SOURCE]` [`compatibility-date.capnp:66`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/compatibility-date.capnp#L66),
verbatim — this is the definition of the `$experimental` annotation itself:

```capnp
  annotation experimental @0xe3e5a63e76284d88 (field):Void;
  # Flags with this annotation can only be used when workerd is run with the --experimental flag.
  # These flags may be subject to change or even removal in the future with no warning -- they are
  # not covered by Workers' usual backwards-compatibility promise. Experimental flags cannot be
  # used in Workers deployed on Cloudflare except by test accounts belonging to Cloudflare team
  # members.
```

The last sentence is the answer to the ticket's question, written by the runtime's own authors.

### 2.2 And enforces it in the validator Cloudflare itself runs

`[SOURCE]` `compileCompatibilityFlags`
([`src/workerd/io/compatibility-date.c++:238`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/compatibility-date.c%2B%2B#L238)):

```cpp
    if (enableByFlag && isExperimental && !allowExperimentalFeatures) {
      // Check whether this experimental flag is individually permitted via the allowlist.
      bool experimentalFlagAllowlisted = false;
      for (auto& allowed: allowedExperimentalFlags) {
        if (allowed == enableFlagName) { experimentalFlagAllowlisted = true; break; }
      }
      if (!experimentalFlagAllowlisted) {
        if (dateValidation == CompatibilityDateValidation::CURRENT_DATE_FOR_CLOUDFLARE) {
          errorReporter.addError(kj::str("The compatibility flag ", enableFlagName,
              " is experimental and cannot yet be used in Workers deployed to Cloudflare."));
        } else {
          errorReporter.addError(kj::str("The compatibility flag ", enableFlagName,
              " is experimental and may break or be removed in a future version of workerd. To use "
              "this flag, you must pass --experimental on the command line."));
        }
      }
    }
```

Three things this pins down that were previously only inferred:

- **`CURRENT_DATE_FOR_CLOUDFLARE` is documented as Cloudflare-only.**
  [`compatibility-date.h:21`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/compatibility-date.h#L21):
  "This should ONLY be used by Cloudflare." So the branch producing *"cannot yet be used in
  Workers deployed to Cloudflare"* exists because **the Cloudflare upload path runs this
  function**. It is not a workerd-local courtesy message.
- **There is an allowlist escape hatch, `allowedExperimentalFlags`** — a per-flag,
  per-caller list. That is the mechanism behind "except by test accounts belonging to Cloudflare
  team members". It is not reachable from a `compatibility_flags` array; it is a parameter to
  the validator, supplied by the caller.
- **workerd's own server passes `nullptr` for it.**
  [`server.c++:5508`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/server/server.c%2B%2B#L5508):
  `compileCompatibilityFlags(..., experimental, CompatibilityDateValidation::CODE_VERSION, nullptr)`.
  Locally the only route is the `--experimental` CLI switch.

### 2.3 Wrangler does not validate the flag, so a dry run tells you nothing

`[RUN]` This is the practically important half, because it is a trap. A dry-run deploy of a
Worker whose `compatibility_flags` include `new_module_registry`:

```
$ wrangler deploy --dry-run --outdir=./dist
 ⛅️ wrangler 4.118.0
Attaching additional modules:  dep.js  esm  0.08 KiB
Total Upload: 0.46 KiB / gzip: 0.23 KiB
No bindings found.
--dry-run: exiting now.
```

**No warning, no error.** Wrangler does not carry the flag table and does not validate
compatibility flags client-side; it forwards them. The rejection in §2.2 happens on Cloudflare's
side at upload. So `--dry-run` — which CLAUDE.md correctly recommends as the cheap way to
validate a config change — is **silent on this class of error**, and a real deploy is the first
thing that would fail. That is exactly why this was worth establishing rather than assuming.

### 2.4 Locally it just works, which is the second half of the trap

`[RUN]` `wrangler dev` with `"compatibility_flags": ["nodejs_compat", "new_module_registry"]`
starts and serves normally against workerd `1.20260730.1`. Miniflare/Wrangler evidently run
workerd in a mode where experimental flags are permitted; nothing had to be passed by hand.

**So the flag is a local-succeeds / remote-fails pair with no build-time or dry-run signal
between them.** An ursprung application that adopted it would have a working dev loop and a
deploy that fails at the API. That asymmetry is worth more than the flag.

### 2.5 One incidental finding worth a glance

`[RUN]` The first `wrangler dev` attempt failed with:

> service core:user:…: This Worker requires compatibility date "2026-08-07", but the newest date
> supported by this server binary is "2026-08-06".

`apps/web/cloudflare.config.ts` pins `compatibilityDate: "2026-08-07"` while the installed
`@cloudflare/workerd-linux-64` is `1.20260730.1`, whose ceiling is `2026-08-06`. **`bun run dev`
in this repo will not start until the workerd binary is bumped** (or the date lowered). Not a
finding about the registry; noticed while setting up and cheap to report.

---

## 3. What the new registry actually is

`[SOURCE]` The design doc ticket 27 cited exists and was read in full:
[`docs/reference/detail/new-module-registry.md`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/docs/reference/detail/new-module-registry.md)
(879 lines), with its sibling
[`legacy-module-registry.md`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/docs/reference/detail/legacy-module-registry.md)
(576 lines). Both are in-repo architecture references maintained alongside the code, not
marketing.

### 3.1 The shape: a two-layer split

The one structural idea worth carrying, because every behavioural difference in §4 falls out of
it. The legacy registry is a single per-isolate `kj::Table` keyed by `(kj::Path, Type)`. The new
one splits **definition** from **instantiation**:

```
ModuleRegistry            shared, kj::AtomicRefcounted, MutexGuarded, keyed by jsg::Url
  bundles[4]              kBundle | kBuiltin | kBuiltinOnly | kFallback
    -> Module             an isolate-independent *definition* (source bytes + how to compile)

IsolateModuleRegistry     per-isolate, lives with the JsContext
  resolutions             (context type, specifier URL incl. query/fragment) -> const Module*
  instantiations          kj::Table<Entry>, indexed by v8 handle AND by (specifier URL, definition)
    Entry { HashableV8Ref<v8::Module> key;  Url id;  const Module& module; }
```

`[SOURCE]` `Entry`
([`modules-new.c++:621`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/jsg/modules-new.c%2B%2B#L621)),
comment verbatim: *"The specifier URL for this instantiation, including any query/fragment. This
is the instance's `import.meta.url`."*

`[SOURCE]` And the load-bearing asymmetry, in `resolveWithCaching`
([`modules-new.c++:1161`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/jsg/modules-new.c%2B%2B#L1161)):

```cpp
      // The inner registry should ignore all URL query parameters and fragments
      .normalizedSpecifier = context.normalizedSpecifier.clone(
          Url::EquivalenceOption::IGNORE_FRAGMENTS | Url::EquivalenceOption::IGNORE_SEARCH),
```

**Read those two together and §4.1 is inevitable:** the *definition* lookup strips query and
fragment, so `./x.js` and `./x.js?v=2` find the same source; the *instantiation* table keys on
the full URL, so they get two `v8::Module`s, two evaluations, two copies of module state. This
is deliberate — it is the HTML module-map model — and it is the single most consequential fact
in this file for ursprung.

### 3.2 Module bundles, resolution order, builtins

`[SOURCE]` Four bundle groups searched in an order fixed by the *referrer's* type:

| `ResolveContext::Type` | Search order                     | Reached from                    |
| ---------------------- | -------------------------------- | ------------------------------- |
| `BUNDLE`               | kBundle → kBuiltin → kFallback   | user code                       |
| `BUILTIN`              | kBuiltin → kBuiltinOnly          | builtin code importing builtins |
| `BUILTIN_ONLY`         | kBuiltinOnly                     | internal modules                |
| `PUBLIC_BUILTIN`       | kBuiltin                         | `process.getBuiltinModule()`    |

Consequences the doc states: user code can import builtins but not internal-only modules; a
worker-bundle module **shadows** a builtin of the same name (kBundle is searched first); a
builtin remains a per-isolate singleton no matter who imports it. The legacy registry has the
same shadowing rule via `Type` being part of its key (legacy doc, characteristic #7), so this is
continuity, not change.

`[SOURCE]` **Synthetic modules** — everything non-ESM (CJS, JSON, Text, Data, Wasm, capnp) — are
one class, `SyntheticModule`, whose exports are set by an `EvaluateCallback` through V8's
`SetSyntheticModuleExport`. Both registries have this; the new one dispatches V8's evaluation
steps through an O(1) hash lookup rather than the legacy O(n) linear scan.

`[SOURCE]` **Bundle names are normalised against a `bundleBase`**, typically `file:///bundle/`:
parsed as a URL relative to the base, dot-segments removed, percent-encoding normalised,
query/fragment **stripped**, then validated as subordinate to the base with `cloudflare:`,
`workerd:` and `data:` protocols forbidden. Builtins conversely must be absolute non-`file:`
URLs.

### 3.3 The module fallback service — irrelevant to ursprung, recorded so it is not chased

`[SOURCE]` `FallbackModuleBundle` is the fourth bundle group: a `ResolveCallback` that asks an
external HTTP service for a module the static bundles did not contain, caching results and
aliases. It exists on **both** registries. It is local-development-only, is configured by
`moduleFallback` in workerd's own capnp config, and workerd gates it behind `--experimental`
([`server.c++:5700`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/server/server.c%2B%2B#L5700)):
*"The module fallback service is an experimental feature. You must run workerd with
`--experimental`…"*. **It is not a deployment mechanism and cannot be one.** It is not a route to
lazy Route loading and ursprung should not model it.

### 3.4 There are no import maps

`[SOURCE]` Searched `modules-new.{h,c++}` and both architecture docs: no import-map support of
any kind, on either registry. The nearest thing is the **alias** mechanism — a bundle lookup may
return a string instead of a module, which restarts resolution at the new specifier. Aliases are
internal (the fallback service and `node:process` redirection use them); nothing in a worker
bundle can declare one. Recorded because "import maps if any" was asked and the answer is a
clean no.

---

## 4. Every behavioural difference, with the ones ursprung cares about first

The table is the summary; the numbered subsections carry the evidence. `[RUN]` rows were
produced by one test Worker (17 probes) served twice from the same source, once with
`["nodejs_compat"]` and once with `["nodejs_compat", "new_module_registry"]`.

The probe module is:

```js
let n = 0;
export const counter = () => ++n;
export const meta = typeof import.meta === "object" ? import.meta.url : "(no import.meta)";
```

so a **fresh `counter()` of 1 proves a fresh copy of module state**, and a continuing count
proves the same instance. Numbers below are the returned counter values in probe order.

| # | Probe | Legacy | New registry |
| --- | --- | --- | --- |
| A | `./dep.js` imported twice | same namespace, `1` then `2` | same namespace, `1` then `2` |
| B | `./dep.js?v=2` | **throws** `No such module "dep.js?v=2".` | **resolves, counter `1`** — new instance |
| C | `./dep.js#frag` | **throws** `No such module "dep.js#frag".` | **resolves, counter `1`** — new instance |
| D | `./sub/../dep.js` | same instance (`3`) | same instance (`3`) |
| E | `../dep.js` from `sub/nested.js` | same instance (`4`) | same instance (`4`) |
| F | `./de%70.js` (percent-encoded `p`) | **throws** `No such module "de%70.js".` | decoded → **same instance** (`5`) |
| G | `import.meta.url` | `undefined` | `file:///bundle/index.js` |
| H | `import.meta.resolve("./dep.js")` | absent | `file:///bundle/dep.js` |
| I | TLA settling on a microtask | works | works |
| J | TLA awaiting a timer | disallowed-operation error | disallowed-operation error |
| K | missing module | `No such module "nope.js".` | `Module not found: file:///bundle/nope.js` |
| L | `node:buffer` | works | works |
| M | bare `buffer` (nodejs_compat) | works | works |
| N | `cloudflare:workers` | works | works |
| O | `with { type: "json" }` on a `.js` | `Unrecognized import attributes specified` | `Module "./dep.js" is not of type "json"` |
| P | `with { bogus: "x" }` | `Unrecognized import attributes specified` | `Unsupported import attribute: "bogus"` |
| Q | `with { type: "css" }` | `Unrecognized import attributes specified` | `Unsupported import attribute type: "css"` |
| R | `/dep.js` (root-absolute) | **resolves**, same instance (`5`/`6`) | **throws** `Module not found: file:///dep.js` |
| S | bare `dep.js` | resolves, same instance | resolves, same instance |
| T | `.//dep.js` (double slash) | **resolves**, same instance | **throws** `Module not found: file:///bundle//dep.js` |
| U | `./DEP.js` (wrong case) | throws | throws |

### 4.1 Query and fragment mint a real second instance, with duplicated module state

**This is the finding that matters most, and it sharpens ticket 27 rather than repeating it.**

`[RUN]` First request:

```
A bare-import twice shares state => same=true c1=1 c2=2
B query string => meta=file:///bundle/dep.js?v=2 counter=1
C fragment     => meta=file:///bundle/dep.js#frag counter=1
```

Second request to the same isolate:

```
A bare-import twice shares state => same=true c1=7 c2=8
B query string => meta=file:///bundle/dep.js?v=2 counter=2
C fragment     => meta=file:///bundle/dep.js#frag counter=2
```

Three durable, disjoint copies of one module's state, each with its own `import.meta.url`, each
surviving across requests. Not "two namespace views of one instance" — **two instances.**

> **Correction to ticket 27.** §6.2 of `27-dynamic-import.md` summarised workerd's
> `queryAndFragment` test as asserting *"different namespace objects but identical export values
> — i.e. one module instance, two namespace views."* That reading is wrong, and the reason it
> looked right is that the fixture only exports **constants**
> ([`new-module-registry-test.js:309`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/api/tests/new-module-registry-test.js#L309)
> — `export const foo = 1`, `export default 2`), so equal values prove nothing about shared
> state. The test's own comment says the opposite of the summary: *"Each resolves the same
> underlying module but **creates a new instance**."* The design doc says it too — *"Query/
> fragment-distinct specifiers produce distinct instances, each with its own
> `import.meta.url`"*. The counter probe above settles it by execution.
>
> The *conclusion* ticket 27 drew from the misreading was nonetheless the right one, so nothing
> downstream is wrong — but it was right for a weaker reason than it needed. **The emitter rule
> is not a tidiness preference; a violation duplicates live module state.** For ursprung that is
> two signal graphs, two capnweb sessions, and ticket 02's silent cross-copy freeze.

`[SOURCE]` The mechanism is §3.1: definition lookup strips query/fragment, instantiation keys on
the full URL.

### 4.2 Compilation really is lazy — and this is executed, not read

`[RUN]` A module `broken.js` containing `export const x = ((((;` was added to the bundle and
**imported by nothing**.

- **Legacy** — the Worker **refuses to start**:

  ```
  ✘ [ERROR] service core:user:nmr-test: Uncaught SyntaxError: Unexpected token ';'
      at file:///…/src/broken.js:1:21
  ✘ [ERROR] The Workers runtime failed to start.
  ```

- **New registry** — the Worker starts and serves normally; all 17 probes return as before.

This converts ticket 27 §4's strongest claim from `[SOURCE]` to `[RUN]`. Eager compilation on
the legacy registry is real and observable; full laziness on the new one is real and observable.
`[SOURCE]` The doc's design goal #3 is therefore accurate: *"No modules are compiled during
`ModuleRegistry` construction. Both ESM compilation and synthetic module evaluation happen on
first import."*

`[SOURCE]` The new registry adds a second, related win the legacy one cannot have: a
**cross-isolate compile cache**. `EsModule::cachedData` is a `kj::MutexGuarded` field on the
shared `Module` definition, so a second isolate replica consumes V8 bytecode instead of
recompiling. The legacy registry is per-isolate with no sharing (legacy doc, characteristic #1).

### 4.3 Top-level await: the failure mode degrades from a throw to a hang

`[RUN]` A module whose top level is `await new Promise(() => {})`, dynamically imported from a
`fetch` handler, raced against a 2-second timer:

| Registry | Result |
| --- | --- |
| Legacy | `IMPORT REJECTED: Top-level await in module is unsettled.` |
| New    | `IMPORT STILL PENDING after 2s` |

`[RUN]` A TLA that settles within one microtask (`await Promise.resolve()`) works on **both**.
`[RUN]` A TLA awaiting a timer (`await scheduler.wait(1)`) fails on **both**, with the
disallowed-operation error — because module evaluation runs with the `IoContext` suppressed on
both registries (ticket 27 §7.1, unchanged and re-confirmed).

`[SOURCE]` The legacy mechanism is `instantiateModule`
([`modules.c++:288`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/jsg/modules.c%2B%2B#L288)).
Note a subtlety ticket 27 did not have room for: `resolveDynamicImport` passes
`ALLOW_PENDING_EVALUATION`
([`modules.h:541`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/jsg/modules.h#L541)),
which suppresses the throw **only when nested inside another module's evaluation**. At evaluation
depth 0 — which is where an `import()` from a `fetch` handler sits — the microtask queue is
drained once and a still-pending promise is fatal, `options` notwithstanding
([`modules.c++:348–353`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/jsg/modules.c%2B%2B#L348)).
So ticket 27 §7.2's conclusion is exactly right for ursprung's case.

`[SOURCE]` The new registry's dynamic path has **no TLA check at all**: `dynamicResolve`
([`modules-new.c++:678`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/jsg/modules-new.c%2B%2B#L678))
returns the real evaluation promise chained to the namespace. The design doc states the
consequence: *"a dynamically imported module whose top-level await never settles leaves the
`import()` promise pending indefinitely (standard ESM semantics, subject to normal request hang
detection)."*

**The `require()` path still throws on both** — `NO_TOP_LEVEL_AWAIT`, matching Node's
`require(esm)` — but that path is irrelevant to ursprung, which emits ESM only.

### 4.4 Specifier shape: the new registry is stricter about paths, looser about URL syntax

`[RUN]` The R/T/F rows are the surprise, and they cut in the opposite direction from the
"URL parsing is more permissive" intuition:

- **Root-absolute `/dep.js` works on legacy and fails on the new registry.** `kj::Path` treats
  it as the same normalised path; WHATWG URL resolution takes it to `file:///dep.js`, which
  escapes `bundleBase` (`file:///bundle/`) and is not in the bundle.
- **`.//dep.js` works on legacy and fails on the new registry** — `file:///bundle//dep.js`,
  empty segments preserved.
- **Percent-encoding is decoded and normalised on the new registry** (`./de%70.js` → the same
  instance as `./dep.js`) and is a hard error on legacy.

`[INFERENCE]` The general rule: legacy normalises *paths* aggressively and rejects anything
URL-shaped; the new registry parses *URLs* strictly and rejects anything that leaves the bundle
base. **The intersection — the set of specifier forms valid under both — is narrow, and
`./<sibling>.js` sits squarely inside it.** Ticket 14 §6 chose exactly that form; it turns out
to be the only shape that is safe on both, which is a stronger justification than the one
recorded there.

### 4.5 Import attributes and JSON modules

`[RUN]` Legacy collapses every attribute problem into one string, `Unrecognized import
attributes specified`. The new registry validates properly: unknown *keys* (`Unsupported import
attribute: "bogus"`), unsupported *values* (`Unsupported import attribute type: "css"`), and a
genuine type mismatch (`Module "./dep.js" is not of type "json"`).

`[SOURCE]` Only `type: 'json'` passes validation. `type: 'text'` (TC39 Stage 3) and
`type: 'bytes'` (Stage 2.7) are recognised and rejected as "not yet supported", with the
`ContentType` plumbing already in place.

`[RUN]` Incidental but worth recording for ticket 21: **Wrangler's `rules` does not accept a
`Json` module type.** A `{ "type": "Json", … }` rule is rejected — *"bindings should have a
string `type` field, which contains one of `ESModule`, `CommonJS`, `CompiledWasm`, `Text`, or
`Data`"*. ursprung is unaffected, because ticket 13/14 emit JSON as a `.js` data module
(`export default JSON.parse(…)`) and strip the attribute — but the alternative design, shipping
`.json` files and importing them with `with { type: "json" }`, is **not expressible through
Wrangler today**, on either registry. That is a second, independent reason ticket 13's choice was
right.

### 4.6 Error messages

`[RUN]` Every message changes. `No such module "nope.js".` becomes `Module not found:
file:///bundle/nope.js`. Anything in ursprung that pattern-matches a workerd module error — a
test assertion, a diagnostic remedy quoting the runtime — is registry-specific. Nothing in the
tickets does today; worth not starting.

### 4.7 `import.meta`

`[RUN]` On legacy, `import.meta` is an object but `import.meta.url` is `undefined` and
`import.meta.resolve` does not exist. On the new registry both work, with `url` naming the
emitted module and `resolve` performing WHATWG resolution against it.

`[SOURCE]` `import.meta.resolve` *"Does **not** check if the resolved URL matches a module in the
registry"* — it is pure URL arithmetic.

**This is the one place the new registry would make an ursprung sharp edge sharper rather than
duller.** Ticket 14 §9 records that `new URL("./data.json", import.meta.url)` "silently yields a
URL to nothing" because the flat emitted directory has no such file. On legacy that is doubly
broken — `import.meta.url` is `undefined`, so the `new URL(...)` call **throws**, loudly, at
runtime. On the new registry it succeeds and yields a well-formed URL to a file that does not
exist. §4.1's shape again: the new registry converts a loud failure into a quiet one. The static
assets fog patch should know this.

### 4.8 Differences with no consequence for ursprung

Recorded for completeness, briefly. Thread-safety and registry sharing across isolate replicas;
O(1) versus O(n) reverse lookup; alias chains now followed to any depth with cycle detection
(changed since `22b2a002` — was single-level); `require()` return-value semantics under
`UNWRAP_DEFAULT`, including that `export_commonjs_default`, `require_returns_default_export`,
`throw_on_unrecognized_import_assertion` and `no_top_level_await_in_require` are **not consulted**
by the new registry; source-phase imports (`import source x from`) for Wasm only; UTF-8 source
encoding chosen per module; Python Workers force the legacy registry regardless of the flag
([`features.h:37`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/features.h#L37)).

---

## 5. CPU accounting, and what a first request would actually cost

### 5.1 Ticket 27's finding is verbatim correct and unchanged

`[SOURCE]` Both comments ticket 27 quoted survive at the pinned SHA, with the legacy assertion
now at [`worker.c++:903`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/worker.c%2B%2B#L903)
and the callback comment at
[`modules-new.c++:1339`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/jsg/modules-new.c%2B%2B#L1339):

> This means no per-import CPU limit (`enterDynamicImportJs`) is applied; instead, the import
> charges against the ambient request or startup CPU budget. This is intentional: the new
> registry's lazy compilation model means dynamic imports do not trigger eager compilation of all
> transitive dependencies, so the per-import limit that protected against that in the legacy path
> is unnecessary.

`[SOURCE]` `enterDynamicImportJs` still exists as a peer of `enterStartupJs`
([`limit-enforcer.h:57`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/limit-enforcer.h#L57))
and is still entered only from the legacy path
([`worker.c++:926`](https://github.com/cloudflare/workerd/blob/a955a8773323f34c37bbeb62dfd6d5ac3de2c45a/src/workerd/io/worker.c%2B%2B#L926)),
which is guarded by `KJ_ASSERT(!isNewModuleRegistryEnabled(...))`. Its size remains unpublished
and unestablishable — workerd's open-source enforcer is a no-op stub.

### 5.2 Quantifying it — and ticket 27 quoted the wrong number

`[DOCS]` From [Limits](https://developers.cloudflare.com/workers/platform/limits/), fetched
2026-08-08:

| Budget | Value |
| --- | --- |
| Worker startup | **1 second**, error `10021` "Script startup exceeded CPU time limit" |
| Request CPU, **Free plan** | **10 ms per HTTP request** |
| Request CPU, Paid plan | 30 s default, configurable to 5 min |
| Waiting on I/O | does **not** count toward CPU time |

> **Correction to ticket 27.** §3.2 quantified the new registry's request-CPU charge against
> *"a 30 s ceiling rather than a 1 s one"* and concluded the latency cliff was *"a real shape but
> a small one."* That is true on the **Paid** plan only. On the **Free** plan the request CPU
> budget is **10 ms**, which is a hundred times *smaller* than the 1-second startup budget the
> charge moves off. Under `new_module_registry`, on Free, the first request to a Route pays that
> Route's compilation **and** evaluation **and** its own rendering out of 10 ms. That is not a
> small cliff; it is a plausible hard failure for any non-trivial Route, and it inverts ticket
> 27's conclusion for that plan tier.

`[INFERENCE]` Two things soften it and neither rescues it: laziness means only the matched
Route's subgraph is compiled, not all of them; and the cost is paid once per isolate, not per
request. `[INFERENCE]` But the *first* request to each Route on each cold isolate pays it, and
Workers isolates are evicted routinely, so on a low-traffic site a large share of requests are
first requests. Not measurable from here — measuring it needs a deployed Worker with the flag,
which §2 says is not possible.

**Net:** the legacy registry's separate `enterDynamicImportJs` budget, whose size ursprung cannot
learn, is still the safer place for this cost to land than a 10 ms request budget whose size
ursprung knows exactly.

---

## 6. What this means for ursprung, against the resolved decisions

### 6.1 Ticket 14 §8 — top-level await stays a build error, and the case is stronger

**The rule is still valid, and the reason recorded for it needs one word changed.**

Ticket 14 §8 keeps TLA a build error on the server traversal, reasoning that *"the rule is valid
under both, because the new registry is strictly more permissive. Nothing changes if the flag
ever ships."* §4.3 shows the first clause is true and the second is **too generous**:

- Legacy: unsettleable TLA → `import()` **rejects** with `Top-level await in module is
  unsettled.` A loud, immediate, greppable error naming the failure.
- New: unsettleable TLA → `import()` **stays pending forever**. The request hangs until the
  platform's hang detection kills it, with no message naming the module.

"More permissive" is accurate in the narrow sense that no error is thrown. But for a Route
entrypoint that a router awaits, "more permissive" **is** "hangs instead of failing". So the new
registry does not make ticket 14 §8's build error redundant — it makes the error the *only*
place the problem is reported legibly.

**Recommended edit to ticket 14 §8:** replace "Nothing changes if the flag ever ships" with
something like *"and if the flag ever ships the rule matters more, not less: the new registry
leaves an unsettleable top-level await pending rather than throwing, so the build error becomes
the only legible report of it."* No decision changes; only its stated reason.

`[RUN]` The narrow band §8 already rejects with eyes open — an `await` settling within one
microtask drain — behaves identically on both registries. That part of §8 needs nothing.

### 6.2 Ticket 14 §2/§6 and ticket 27 — the no-query-string rule is now load-bearing, not prudent

**Yes. A query string silently mints a second instance with duplicated module state.** §4.1
proves it by execution rather than by reading a test fixture.

Ticket 14 §6's third bullet already says the right thing. What changes is its weight and one
inaccuracy: it says *"The legacy registry does not strip one, so `./x.js?v=2` mints a second
module instance."* `[RUN]` On the legacy registry `./x.js?v=2` **throws** `No such module
"x.js?v=2".` — it cannot mint anything, because `kj::Path` has no notion of a query and no such
path exists. The silent duplication is a **new-registry-only** hazard. The sentence conflates the
two registries' failure modes and should name them separately:

> Never a query string. On the legacy registry `./x.js?v=2` fails to resolve at all
> (`No such module`). On the new registry it resolves to the same *definition* but a distinct
> *instantiation* — a second `v8::Module`, a second evaluation, a second copy of module state,
> with its own `import.meta.url` — which is ticket 02's silent cross-copy freeze arriving through
> the emitter.

**And the rule is cheap because it is already satisfied by construction.** ADR-0010 hashes into
the **filename**, and ticket 14 §6 emits `./<filename>` and nothing else. There is no code path
in the recorded design that could emit a query. `[INFERENCE]` The remaining risk is not the
emitter but **application code**: a hand-written `import("./thing.js?raw")` in a first-party
module. Ticket 12 §3 makes a dynamic `import()` with a literal specifier an ordinary edge whose
specifier is rewritten — so it would be resolved and rewritten to a clean `./<hash>.js`, and the
query would vanish. Worth confirming that is intended rather than accidental; if a query-bearing
specifier should instead be a build error, that is a one-line addition to ticket 13's rules and
this is the moment to notice it.

### 6.3 ADR-0010's content hashing — untouched

`[INFERENCE]`, argued from §3–§4. The hash is over emitted bytes and real paths and produces a
filename; the registry never sees it. Nothing in the transitive-hash-over-the-condensation-graph
scheme depends on which registry links the output, because the output is ordinary ESM either way.
The Root entrypoint's unhashed stable name (§7) is a Wrangler-facing constraint, not a registry
one. **No change.**

One point of contact, and it is favourable: §4.4's finding that `./<sibling>.js` is the only
specifier form valid on both registries means ADR-0010's flat-directory-plus-relative-specifier
pairing is registry-independent by luck as well as by reasoning.

### 6.4 Ticket 13's resolution rules — untouched, with one clarification

`[INFERENCE]` Ticket 13 resolves specifiers **at build time**, in ursprung's own resolver, and
emits already-resolved relative specifiers. workerd's registry never runs Node resolution; it
only maps a specifier string to a module in the uploaded set. So `ESM_RESOLVE`, condition sets,
the `node:*` date-keyed table, CJS verdicts and JSON handling are all upstream of the registry
and unaffected by which one links the result.

`[RUN]` One clarification worth having on record because it looks like a counterexample and is
not: bare specifiers resolve on **both** registries (probe S — `import("dep.js")` returned the
same instance as `./dep.js`). That is not package resolution; there is no `node_modules` walk in
either registry. It is simply URL/path resolution treating a bare name as relative to the
referrer. ursprung never emits a bare first-party specifier, so this is inert — but nobody should
read it as workerd doing node resolution at runtime.

### 6.5 Ticket 12's one-instance-per-specifier reasoning — holds, and gains an exactness

`[SOURCE]` Both registries guarantee one instance per **resolved specifier**, so ticket 12's
Common-module reasoning — a module reached from several entrypoints is emitted once and shared —
is safe on both. §4.1 sharpens what "specifier" means on the new registry: the full URL including
query and fragment, not the file. Ticket 12 §1 interns **one graph node per realpathed path** and
ticket 14 §2 proves filename uniqueness from that; together they guarantee one specifier string
per emitted module, which is precisely the precondition. **The chain closes.** No change to
ticket 12.

`[RUN]` Probes D and E confirm the property that extraction actually needs, on both registries:
two importers reaching one module by *different* relative specifiers (`./sub/../dep.js` from the
entry, `../dep.js` from `sub/nested.js`) land on the same instance.

### 6.6 What the new registry would enable that ursprung cannot do today

Four things, honestly ranked.

1. **Lazy compilation, which is the only one that changes an architectural claim.** §4.2. Ticket
   27's unanticipated finding — *"lazy import defers evaluation only; every uploaded module is
   V8-compiled at startup regardless, so splitting by Route does not keep startup flat"* — is a
   **legacy-registry** fact. On the new registry, splitting by Route *does* keep startup flat,
   for parse cost as well as top-level work. Constraint 10's closing sentence is registry-scoped
   and would become false. **This is the single real prize**, and it is what would make the
   Route-per-module architecture scale to a large route tree.
2. **`import.meta.url` that is defined.** §4.7. It would not fix ticket 14 §9's
   `new URL(spec, import.meta.url)` hole — it would make it quieter — but it is a precondition
   for ever addressing that hole inside the module system rather than in the asset pipeline.
3. **Real import attributes.** §4.5. If ticket 13 ever wanted to ship `.json` as a JSON module
   rather than transform it to `.js`, the new registry validates properly. Blocked anyway by
   Wrangler's `rules` not accepting a `Json` type, so this is theoretical.
4. **Cross-isolate compile caching.** §4.2. A cold-start win ursprung neither controls nor
   measures. Free.

Against those: §4.1's silent state duplication, §4.3's hang-instead-of-throw, §5.2's 10 ms Free
request budget, and §2's undeployability.

---

## 7. The bottom line

**Yes — ursprung v0 should keep designing for the legacy registry.** Not as a compromise; the
legacy-safe rule set is the strictly safer one, and it is also valid on the new registry.

The three grounds ticket 14 §8 recorded for rejecting the new registry all survive, and two got
stronger:

- **Undeployability is now established rather than inferred.** §2. `$experimental` flags are
  refused by name on Cloudflare, by code in workerd itself: *"Experimental flags cannot be used in
  Workers deployed on Cloudflare except by test accounts belonging to Cloudflare team members."*
  Targeting it means the canonical demo app does not deploy, which collides with constraint 3.
  Worse than ticket 14 knew: **neither `wrangler deploy --dry-run` nor `wrangler dev` gives any
  signal** — both succeed. The failure arrives only at a real deploy.
- **The trade is worse than §8 recorded, on two of its three axes.** Request-CPU charging is 10 ms
  on the Free plan, not the 30 s ticket 27 quoted (§5.2). The query-string bug does not merely
  become "URL-parsed rather than loudly fatal" — it duplicates live module state across requests
  (§4.1). And a third cost §8 did not know about: unsettleable TLA hangs instead of throwing
  (§4.3).
- **The rule sets are still asymmetric, and §4.4 gives the sharpest version of that.** Legacy
  tolerates `/x.js` and `.//x.js` and refuses percent-encoding and queries; the new registry does
  the reverse. `./<sibling>.js` — ticket 14 §6's choice — is the only form safe on both.

**What would have to become true to revisit.** Exactly one observable, and it is cheap to check:
**`newModuleRegistry` gains a `$compatEnableDate` in `src/workerd/io/compatibility-date.capnp`,
or the flag loses `$experimental`.** Either would mean it is deployable. Everything else —
`nmr-ga-review`, "ahead of NMR enablement", the density of July/August fixes — is evidence the
maintainers intend to get there, and evidence is not availability. This is the same shape as the
`nodeJsCompat` `$compatEnableDate("2026-08-04")` finding the map already carries a warning about:
**landed in workerd ≠ shipped on Cloudflare.** Do not build on it.

**What ursprung should do now to stay cheap to migrate later — the good news is: almost nothing,
and that is a result rather than an absence.** Every rule already recorded is valid under both
registries, so migration is a no-op for the emitter. Three small things:

1. **Keep the no-query-string rule and restate its reason per registry** (§6.2). Ticket 14 §6's
   current wording describes a legacy failure mode that does not exist. One sentence.
2. **Amend ticket 14 §8's stated reason, not its decision** (§6.1). "Nothing changes if the flag
   ever ships" should become "the rule matters more if it ships".
3. **Never pattern-match a workerd module-error string** (§4.6). Every message differs between
   registries. Nothing does this today; the cost of the discipline is zero and the cost of
   discovering it later is a broken test suite on the day the flag flips.

And one thing **not** to do: do not add a `new_module_registry` escape hatch, a config toggle, or
a second emission mode "for later". The whole point of the legacy-safe rule set is that it needs
no second mode — the output is identical either way, and the day the flag ships ursprung's
emitted modules run unchanged and simply get lazy compilation for free.

**One sentence for the maintainer.** The flag is closer than it was — workerd's own commit
messages say "GA review" and "ahead of NMR enablement" — but it is still `$experimental`, still
undeployable, and it now demonstrably converts two of ursprung's loud failures into silent ones;
design for legacy, change nothing, and watch one line of `compatibility-date.capnp`.

---

## Appendix: reproducing the executed evidence

The test Workers were built outside the repo and are not committed. To reproduce:

- A Worker with `"no_bundle": true` and `"rules": [{ "type": "ESModule", "globs": ["**/*.js"] }]`,
  served by `wrangler dev`, twice — once with `"compatibility_flags": ["nodejs_compat"]` and once
  with `["nodejs_compat", "new_module_registry"]`.
- The probe module in §4 (`counter()` over a module-scoped `let n = 0`) is what distinguishes a
  second instance from a second namespace view. **A fixture exporting only constants cannot**,
  which is how ticket 27 §6.2's reading went wrong.
- `compatibility_date` must be no later than the installed workerd binary's ceiling — `2026-08-06`
  for `1.20260730.1` (§2.5).
