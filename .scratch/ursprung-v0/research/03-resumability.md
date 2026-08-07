# 03 — Resumability prior art: what Qwik actually puts on the wire

Research note for [issue 03](../issues/03-resumability-prior-art.md). Feeds ticket 19 (wire format).

## Sources and how to read this

Two kinds of primary source were used, and they disagree in places. Where they do, **the
source code wins** and I say so.

| Source                                                                                                                                                        | What it is                                                              | Version pinned     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------ |
| `QwikDev/qwik` `main`                                                                                                                                         | Qwik 2 source, `@qwik.dev/core@2.0.0-beta.38`                           | commit `9bcc0f8b`  |
| `QwikDev/qwik` branch `v1`                                                                                                                                    | Qwik 1 source, `1.19.0-dev`                                             | commit `841d645b`  |
| `https://qwik.dev/` HTML                                                                                                                                      | a real, production, v1-rendered page (`q:version="1.19.0-dev+841d645"`) | fetched 2026-08-07 |
| `qwik.dev/docs/**`                                                                                                                                            | first-party docs, in-repo under `packages/docs`                         | as of `9bcc0f8b`   |
| [Towards Qwik 2.0: Lighter, Faster, Better](https://qwik.dev/blog/qwik-2-coming-soon/) (also at [builder.io](https://www.builder.io/blog/qwik-2-coming-soon)) | Qwik team's own design rationale for the rewrite                        | —                  |
| [GHSA-m6jq-g7gq-5w3c](https://github.com/QwikDev/qwik/security/advisories/GHSA-m6jq-g7gq-5w3c)                                                                | CVE-2026-25148, XSS in the v1 wire format                               | —                  |
| [Resumability, WTF?](https://dev.to/this-is-learning/resumability-wtf-2gcm) — Ryan Carniato, 2022-08-23                                                       | critique from a competing framework author                              | —                  |

Paths below are relative to the Qwik repo root and refer to the pinned commits.

**Explicitly not established** (called out again in context):

- I could **not** capture a real Qwik 2 (`qwik/state` + `qwik/vnode`) payload from a live
  production site. Every Qwik site I probed — `qwik.dev`, `insights.qwik.dev`, `qwikui.com` —
  still serves v1 (`qwik/json`). The v2 examples below are reconstructed from source and from
  the team's own blog post, and are labelled as such.
- I could **not** find a formal Qwik RFC or post-mortem document for the v2 serialization
  redesign. `QwikDev/qwik-evolution` exists as an RFC home but I could not enumerate its
  contents (fetch returned only the README). The closest thing to a written post-mortem is
  the "Towards Qwik 2.0" blog post, which _is_ first-party design rationale.
- I could **not** find primary, quantified numbers for **server-side serialisation time**.
  Qwik measures it (`snapshotTime` in `packages/qwik/src/server/render.ts`, v1) but does not
  publish figures.
- Several first-party docs pages are **stale** — they document v1 mechanisms (`q:obj`,
  `qwik/json`, `[0,1]` capture syntax) while showing v2 attribute names (`q-e:click`). Noted
  inline where it matters.

---

## 1. What a Qwik server response contains besides HTML

### 1.1 Qwik 2 — the current design

Five distinct things, in this order of appearance:

1. **Container attributes** on one element (usually `<html>`).
2. **Per-element attributes** — a `:` marker on every Qwik-rendered element, plus event
   attributes on elements that have handlers.
3. **`<script type="qwik/state">`** — the serialised application state, at the end.
4. **`<script type="qwik/vnode">`** — the component/fragment/text structure, at the end.
5. **Bootstrap scripts** — Qwikloader, the event-name registration array, optionally a
   `q:func` script for `sync$()` bodies and a `qwik/backpatch` script.

#### Container attributes

`packages/qwik/src/server/ssr-container.ts:634-655` (`openContainer`):

```ts
containerAttributes[QContainerAttr] = QContainerValue.PAUSED; // q:container="paused"
containerAttributes[QRuntimeAttr] = "2"; // q:runtime="2"
containerAttributes[QVersionAttr] = this.$version$ ?? "dev"; // q:version
containerAttributes[QRenderAttr] = (qRender ? qRender + "-" : "") + (isDev ? "ssr-dev" : "ssr");
containerAttributes[QBaseAttr] = this.$buildBase$ || ""; // q:base
containerAttributes[QLocaleAttr] = this.$locale$; // q:locale
containerAttributes[QManifestHashAttr] = this.resolvedManifest.manifest.manifestHash;
containerAttributes[QInstanceAttr] = this.$instanceHash$; // q:instance
// optional: q:prewarm="<root count threshold>"
```

Each attribute's job:

- `q:container` — `"paused"` or `"resumed"`. The client uses it to find containers and to know
  whether resumption has happened. Values `"html"` and `"text"` mark _opaque_ subtrees
  (`dangerouslySetInnerHTML`, `<textarea>`) that the client walk must skip
  (`packages/qwik/src/core/shared/utils/markers.ts:55-60`).
- `q:base` — the base URL against which every QRL chunk path is resolved.
- `q:instance` — a per-render hash. It scopes the state script to its own container
  (`script[type="qwik/state"][q:instance="<hash>"]`) so nested containers don't steal each
  other's state, and it namespaces the `document["qFuncs_<hash>"]` array.
- `q:manifest-hash` — identifies the build manifest, used by the preloader/bundle graph.
- `q:version`, `q:render`, `q:locale` — diagnostics and locale.
- `q:prewarm` — optional eager-deserialisation threshold, see §7.3.

#### Per-element attributes

Every element Qwik emits gets a bare `:` attribute, or `:="<key>"` if it has a key
(`ssr-container.ts:732-738`):

```ts
this.write(" " + Q_PROPS_SEPARATOR); // Q_PROPS_SEPARATOR = ':'
if (key !== null) {
  this.write('="');
  this.write(escapeHTML(key));
  this.write('"');
}
```

This is load-bearing and easy to underrate. The client's DOM walk classifies a node as a
countable element **only** if it has `:` (`packages/qwik/src/core/client/process-vnode-data.ts:376`):

```ts
return hasAttribute.call(node, Q_PROPS_SEPARATOR) ? NodeType.ELEMENT : NodeType.OTHER;
```

The `qwik/vnode` payload addresses elements _by depth-first index_, so the client's count must
match the server's exactly. The `:` marker is how third-party-injected DOM (analytics, browser
extensions) is excluded from the numbering.

Event handlers become attributes named `q-<scope>:<kebab-event>`
(`packages/qwik/src/core/shared/utils/event-names.ts:19-26`):

| JSX                 | HTML attribute | Listener installed on                             |
| ------------------- | -------------- | ------------------------------------------------- |
| `onClick$`          | `q-e:click`    | each root (document / shadow root), capture phase |
| passive `on…$`      | `q-ep:click`   | same, `passive: true`                             |
| `window:onScroll$`  | `q-w:scroll`   | `window`                                          |
| `document:onQinit$` | `q-d:qinit`    | document, broadcast by selector                   |

Plus `preventdefault:<event>` and `stoppropagation:<event>` boolean attributes, read
synchronously by the loader before any code is fetched (`packages/qwik/src/qwikloader.ts:260-267`).

> **v1 used `on:click`, not `q-e:click`.** The rename happened in v2. The first-party docs are
> inconsistent about this: `docs/(qwik)/advanced/qwikloader/index.mdx` shows `q-e:click`
> (v2 name) but `docs/(qwik)/advanced/qrl/index.mdx` shows `q-e:click` alongside `q:obj` and
> `<script type="qwik/json">`, which are v1-only. The live v1 page confirms `on:click`.

#### The tail scripts, and their order

`ssr-container.ts:1043-1073` (`emitContainerData` / `emitRestStateData`), fired when the
container element (or `<body>` for full-document renders) closes:

```ts
this.streamHandler.flush();          // flush the HTML shell first
this.resolvePromiseAttributes();
this.$containerState$ = SSRContainerState.DataStreamStarted;
this.emitStateData();                // <script type="qwik/state" q:instance="…">
  this.$noMoreRoots$ = true;
  this.emitVNodeData();              // <script type="qwik/vnode">
  preloaderPost(...);                // preload hints / bundle graph
  this.emitSyncFnsData();            // <script q:func="qwik/json">
  this.emitPatchDataIfNeeded();      // <script type="qwik/backpatch">
  this.emitExecutorIfNeeded();
  this.emitQwikLoaderAtBottomIfNeeded();  // loader (if not already inlined) + _qwikEv push
```

So: **state first, structure second, code-shaped scripts last.** All of it after the visible
HTML. This ordering is the single most important architectural fact in this document; see §7.

#### Reconstructed v2 example

The Qwik team's own before/after, from
[Towards Qwik 2.0](https://qwik.dev/blog/qwik-2-coming-soon/) — v1 on the left, v2 on the right:

```html
<!-- Qwik 1 -->
<main>
  <!--qv q:s q:sref=5 q:key=-->
  <!--qv q:id=7 q:key=xYL1:zl_0-->
  <!--qv q:key=H1_0-->
  Count:
  <!--t=8-->123<!----!>
  <button on:click="..." q:id="9">+1</button>
  <!--/qv-->
  <!--/qv-->
  <!--/qv-->
</main>
```

```html
<!-- Qwik 2 -->
<main>
  Count: 123!
  <button on:click="...">+1</button>
</main>
<script type="qwik/state">
  [...]
</script>
<script type="qwik/vnode">
  !{{HDB1}}
</script>
```

(The blog still writes `on:click` in the v2 snippet; the shipped v2 source emits `q-e:click`.
I could not verify a byte-exact decode of `!{{HDB1}}` against a real v2 render — see the
character tables in §5 for what each class of character means.)

A real v2 fragment, from the test suite
(`packages/qwik/src/core/tests/container.spec.tsx:195-201`), showing the `:` markers, the
instance scoping, and the raw state encoding:

```html
<div q:container="paused" q:locale="" q:base="" q:manifest-hash="" q:instance="root" :>
  <section :>
    <container q:container="paused" q:locale="" q:base="" q:manifest-hash="" q:instance="nested" :>
      <script type="qwik/state" q:instance="nested" :>
        [0,"nested"]
      </script>
    </container>
  </section>
  <script type="qwik/state" q:instance="root" :>
    [0,"root"]
  </script>
</div>
```

`[0,"root"]` is a complete state payload: type id `0` (`TypeIds.Plain`) followed by the value.

### 1.2 Qwik 1 — measured, from a real page

This matters because it is the only version I could observe in production, and because the
v1→v2 delta _is_ the failure-mode list.

The v1 payload is a single `<script type="qwik/json">` holding one JSON object with exactly
four keys (`packages/qwik/src/core/container/pause.ts:544-552`, v1 branch):

```ts
return { state: { refs, ctx: meta, objs: convertedObjs, subs }, ... };
```

Live capture from `https://qwik.dev/` (truncated):

```json
{
  "refs": { "2": "b! 23", "3": "b! 23", "7": "p! 2z", "8": "p! 2z" },
  "ctx":  { "1": { "h": "30 q!", "s": "b! 31" },
            "6": { "h": "32 r!", "s": "p! 33" } },
  "objs": [ {}, {"path":"t","query":"0"},
            {"orange":"u","pink":"v","green":"w", ...},
            ["4","5","6","7","8","9"], "large", "rgba(239, 108, 65, 1)", ... ],
  "subs": [ ["_1"], ["_1"],
            ["_1","0 #1 link","0 #1 strokeSize","0 #1 performanceScore"], ... ]
}
```

- `objs` — the flat object heap. Every value is at an index; every _reference_ is that index
  in **base36** as a string. `"b! 23"` = object `b` (with a `!` suffix meaning "unwrap the
  store proxy to its target") and object `23`.
- `refs` — element id → space-separated object ids, the `$refMap$` that `useLexicalScope()`
  indexes into.
- `ctx` — element id → `{h, w, s, c}`: `h` = render QRL + props id, `w` = tasks, `s` =
  sequential-hook scope (`useSignal`/`useStore` slots), `c` = `useContext` values
  (`pause.ts:477-531`).
- `subs` — parallel array to `objs`; `subs[i]` is the subscription list for `objs[i]`.

And in the DOM, v1's structure lived in **comment nodes**:

```html
<!--qv q:id=0 q:key=w5MY:OG_0-->
<!--qv q:s q:sref=1 q:key=-->
<!--qv q:key=Py_4-->
<!--/qv-->
<button ... on:click="q-B7oAJyOZ.js#s_C1NZ0feBPGA[0]" q:key="nO_1" q:id="i"></button>
```

**Measured overhead on that page** (my own measurement over the fetched HTML — this is a
primary observation, not a published figure):

| Piece                                                   |      bytes |  % of HTML |
| ------------------------------------------------------- | ---------: | ---------: |
| total HTML                                              |    213,113 |      100 % |
| `qwik/json` state (3 containers)                        |     16,631 |      7.8 % |
| `<!--qv…-->` / `<!--t=…-->` comment nodes (178 of them) |      3,376 |      1.6 % |
| `on:*` listener attributes                              |      4,661 |      2.2 % |
| `q:id` / `q:key` / `q:sref` / … attributes              |      4,427 |      2.1 % |
| `q:func="qwik/json"` sync-fn bodies                     |      3,891 |      1.8 % |
| **total resumability payload**                          | **32,986** | **15.5 %** |

Gzipped: the page is 48,375 bytes; the `qwik/json` scripts alone are 5,640 bytes gzipped
(≈11.7 % of the compressed page).

---

## 2. QRL — how a reference to code is serialised

A QRL ("Qwik URL") is the framework's only way to name code that is not loaded.

### Encoding

v2 (`packages/qwik/src/core/shared/serdes/qrl-to-string.ts:94-98`):

```
<chunk>#<symbol>[#<capture root-id deltas, space separated>]
```

e.g. `3#1#-3 1` — chunk name is at state root 3, symbol at root 1, and the two captured
values are at roots computed by delta from 0: `0 + (-3)` … which is invalid, so read it as the
delta chain the test asserts (`serdes.unit.ts:425-455`):

```
0 QRL "3#1#-3 1"
1 {number} 123
2 {string} "hello"
3 {string} "mock-chunk"
4 {string} "dump_qrl"
```

Two things worth stealing here:

- **Chunk name and symbol name are themselves state roots.** Repeated chunk names cost one
  small integer per QRL instead of a full path. Inside HTML attributes the QRL is written out
  in full (`q-e:click="chunk.js#symbol#0 1"`), but inside the state payload it is
  index-compressed (`qrlToChunks`, `qrl-to-string.ts:102-130`).
- **Captures are delta-encoded root ids**, not absolute ids
  (`qrl-to-string.ts:83-90`, `rebaseQrlCaptureDeltas$` at `serialize.ts:207-218`). Captures of
  a closure tend to be adjacent roots, so deltas are usually single digits.

v1 used a different shape — `chunk#symbol[<space-separated ids>]` — and multiple handlers on
one attribute were joined with `\n`:

```html
on:click="#1 q-Bhey23lz.js#s_TKzEgE7Qrks q-0T-6xfNR.js#s_F0O80PMYA6Q[0 1 1 1]"
```

v2 joins with `|` instead (`qwikloader.ts:320`, `attrValue.split('|')`).

`#1` with an **empty chunk** is a `sync$()` QRL: the symbol is an index into
`document["qFuncs_<q:instance>"]`, an array of _inlined function sources_ emitted in a
`<script q:func="qwik/json">` (`qwikloader.ts:192-204`, `ssr-container.ts:1351-1378`).

### Resolution at interaction time

`packages/qwik/src/qwikloader.ts:176-242` (`resolveHandler`), v2:

1. Split the attribute value on `|`, then each QRL on `#` → `[chunk, symbol, capturedIds]`.
2. If `chunk` is empty → look up `document['qFuncs_' + container.getAttribute('q:instance')][+symbol]`.
3. Otherwise resolve `new URL(chunk, new URL(container.getAttribute('q:base'), doc.baseURI))`
   and `import()` it. Cache by `` `${symbol}|${qBase}|${chunk}` ``.
4. Call `handler.call(capturedIds, ev, element)` — **the capture-id string is passed as
   `this`**. `useLexicalScope()` (now `_captures`) reads it and pulls the objects out of the
   container's deserialised state.

The framework's own answer to "why not plain `import()`" is in
`docs/(qwik)/advanced/qrl/index.mdx`: dynamic import has no way to name a _symbol_ inside a
chunk, no way to carry captured variables, and its relative paths are relative to the importing
module rather than to the document — which breaks the moment you put the path in HTML.

---

## 3. How application state is serialised

### v2 format

Design doc, verbatim, `packages/qwik/src/core/shared/serdes/serialization.md`:

> The state is stored as an array of values, called "roots". […]
>
> - Even values are always TypeIds, specifying the type of the next value.
> - Odd values are the encoded actual values.
>   - Then encoded values can only be numbers, strings or arrays
>   - Arrays are used to store more complex metadata. Prefer these over encoding data into strings.
>   - If a typeId is `undefined`, that means it's been restored already and the value is "raw"
> - Array encoded values use the same encoding
>
> There are various supported types, but one that is important is the RootRef type. It refers to
> a state root by its index. Because of the encoding, the actual data for the state root will be
> at `(index*2, index*2 + 1)`.

So the whole payload is one flat JSON array of `type, value, type, value, …`. Root _n_ lives at
positions `2n` and `2n+1`. `[0,"root"]` is root 0 of type `Plain` with value `"root"`.

### Type table

`packages/qwik/src/core/shared/serdes/constants.ts:90-139`. The ordering is deliberate — the
first ten are single-digit type ids, and everything from `Error` down needs a two-phase
allocate/inflate:

```
Plain, RootRef, ForwardRef, Constant, Array, Object, URL, Date, Regex, QRL,
  ^ single-digit types ^
VNode, RefVNode, BigInt, URLSearchParams, ForwardRefs,
TemporalDuration, TemporalInstant, TemporalPlainDate, TemporalPlainDateTime,
TemporalPlainMonthDay, TemporalPlainTime, TemporalPlainYearMonth, TemporalZonedDateTime,
  // All types below will be inflate()d
Error, Promise, Set, Map, Uint8Array, Task, Component,
Signal, WrappedSignal, ComputedSignal, AsyncSignal, SerializerSignal, Store,
FormData, JSXNode, PropsProxy,
SubscriptionData, EffectSubscription, SubscriptionPatch,
SubscriptionDataConstTrue, SubscriptionDataConstFalse, EffectSubscriptionNoData
```

`Constant` is a second-level table of interned values (`constants.ts:12-62`) —
`undefined, null, true, false, '', EMPTY_ARRAY, EMPTY_OBJ, NaN, ±Infinity, MAX_SAFE_INTEGER,
MIN_SAFE_INTEGER, Slot, Fragment, ':', '.', 'id', 'ref'`. Note that four _strings_ (`':'`,
`'.'`, `'id'`, `'ref'`) earned constant slots purely because they recur constantly in
subscription records and refs.

Note also `EffectSubscriptionNoData`, `SubscriptionDataConstTrue`, `SubscriptionDataConstFalse`
— three separate type ids that exist only to avoid emitting a `null` or a boolean. This is what
a mature version of this format looks like: **the type table absorbs the common shapes.**

### Identity, cycles, and multi-referenced values

`serialization.md`, verbatim:

> The root values are serialized by walking the object graph depth-first. Each emitted object is
> remembered in a map, so that if the same object is encountered again, it can be referenced.
> When referencing an object that is not a root, we emit a RootRef with a string path to the
> encoded object. Before deserializing an object, we scan the encoded roots and change these back
> references by moving the referenced object to the root level and putting a RootRef in its
> original place.
>
> When encountering Promises, we emit a ForwardRef, which will be filled in later when the promise
> resolves. At the end of the serialization, we emit the RootRefs for all the ForwardRefs.

Concretely, from `serdes.unit.ts:923-950` — a store with two cycles plus an alias:

```
0 Array [
  Object [
    {string} "a"
    Object [ {string} "b"  Constant true
             {string} "c"  Store [ RootRef 1  {number} 1 ] ]
    {string} "orig"  RootRef 1
    {string} "c"     RootRef 1
  ]
  RootRef 2
]
1 RootRef "0 0"
2 RootRef "1 1 3"
```

`RootRef "0 0"` is a **path**: root 0, index 0, index 0. So a root can be a _pointer into
another root's interior_ rather than a hoisted copy. That is how they avoid promoting every
shared subobject to the root array while still keeping the payload a flat list.

Restore is two-phase (`serialization.md`):

> - Allocate: The value is created, but not filled in. It is stored and can be referenced.
> - Inflate: The value is filled in using its serialized data. Reference cycles will find the
>   value as it is being inflated.

…and lazy:

> To avoid blocking the main thread on wake, we lazily restore the roots, with caching. The
> serialized text is first parsed to get an array of encoded root data. Then, a proxy gets the raw
> data and returns an array that deserializes properties on demand and caches them.

`packages/qwik/src/core/shared/serdes/deser-proxy.ts` implements that proxy.

### What can and cannot be serialised

`packages/qwik/src/core/shared/serdes/can-serialize.ts` is the authoritative list. Serialisable:
primitives, BigInt, plain objects (prototype must be exactly `Object.prototype`), dense arrays
(a sparse hole makes it **fail**, line 51), `Task`, props proxies, `Promise`, JSX nodes, `Error`,
`URL`, `Date`, all eight `Temporal` types, `RegExp`, `URLSearchParams`, `FormData`, `Set`, `Map`,
`Uint8Array`, `SubscriptionData`, DOM refs, and functions **only** if they are a QRL, a Qwik
component, `Slot` or `Fragment`.

Not serialisable: any class instance (`instanceof`/prototype is lost), streams, arbitrary
functions. The first-party doc says this outright
(`docs/(qwik)/concepts/resumable/index.mdx`):

> Limitations of JSON that Qwik does not solve:
>
> - Serialization of classes (`instanceof` and prototype) […]
> - Serialization of Streams.

Two escape hatches:

- **`noSerialize(value)`** — marks the value as skipped. On the client it comes back as
  `undefined`. From the first-party tutorial: _"When the application is paused, non-serializable
  properties are discarded."_ This is a silent-data-loss hatch, not a preservation hatch.
- **`useSerializer$` / `createSerializer$` (v2 only)** — the user supplies
  `{ serialize, deserialize, initial, update }`, so a third-party object round-trips through a
  representation the user chose (`packages/qwik/src/core/use/use-serializer.ts`). Crucially it is
  _lazy_: _"the `fn` is called lazily, so it won't impact container resume."_

`<` in serialised strings is escaped as `<\/` inside the JSON, so a `</script>` in user data
cannot break out (`packages/qwik/src/core/shared/ssr-const.ts:4-5`,
`serialize.ts:239-249`). v1 used `\x3C` and un-escaped it in the loader
(`qwikloader.ts:109-111`, v1).

---

## 4. Reconstructing the reactive graph without executing components

This is the part that makes resumability more than "serialise your store".

### Where subscriptions come from

Subscriptions are recorded **on the server, during the render that produced the HTML**. Every
read of a signal inside a component body, inside a JSX attribute, or as a JSX child creates an
`EffectSubscription`, and that object is serialised as part of the signal.

`packages/qwik/src/core/reactive-primitives/types.ts:208-223`:

```ts
export class EffectSubscription {
  constructor(
    public consumer: Consumer, // Task | VNode | SignalImpl | ISsrNode
    public property: EffectProperty | string, // ':' component, '.' vnode, or an attribute name
    public backRef: Set<EffectBackRef> | null = null,
    public data: SubscriptionData | null = null,
  ) {}
}
export const enum EffectProperty {
  COMPONENT = ":",
  VNODE = ".",
}
```

A signal serialises as `Signal [ value, ...effects ]` (`serialize.ts:695-701`), so the
subscription list travels _with the signal_, not in a separate table. Compare v1, which had a
separate `subs` array parallel to `objs` and a stringly-typed record format
(`packages/qwik/src/core/state/common.ts:240-270`, v1):

```
"<type> <hostId> [<signalId> <elmId>] [<prop>]"   e.g.  "0 #1 link"
```

### How a signal names a DOM node

Three cases, all resolved without running component code:

1. **Attribute binding** (`class={sig.value}`). `ssr-container.ts:1739-1749`: the SSR container
   calls `trackSignalValue(signal, lastNode, key, signalData)` where `key` is the attribute name.
   The resulting `EffectSubscription` has `consumer = <the SSR node>` and `property = "class"`.
   The node serialises as `TypeIds.VNode` with its depth-first id (`serialize.ts:717-721`), and
   the node is flagged `VNodeDataFlag.SERIALIZE` so the `qwik/vnode` script will emit a `~`
   reference marker for it.

2. **Text interpolation** (`{count.value}`). `packages/qwik/src/core/ssr/ssr-render-jsx.ts:150-159`:
   a signal appearing as a JSX child opens a **virtual fragment** in the vnode data, and the
   subscription's consumer is that fragment with `property = EffectProperty.VNODE` (`'.'`). The
   text itself is emitted as ordinary text; the fragment boundary in `qwik/vnode` is what tells
   the client which character range of which text node the signal owns. (Qwik 2 keeps a _single_
   text node and only splits it when the signal actually writes — per the team's blog post.)

3. **Component re-render** (`props.foo` read in a component body).
   `packages/qwik/src/core/shared/component-execution.ts:72` sets the effect subscriber to
   `getSubscriber(subscriptionHost, EffectProperty.COMPONENT)` (`':'`). On the client, a change
   schedules a re-render of _that host vnode only_ — and only then is the component's QRL fetched.

The reverse direction — "which producers does this effect currently depend on" — is the
`backRef` set, emitted into the vnode data under the `` ` `` character (`q:brefs`,
`vnode-data-types.ts:76-77`). It exists purely so a re-running effect can clear its old
subscriptions, which is the classic problem with `signalA.value ? signalB.value : 'default'`
(documented at length in `types.ts:161-207`).

### The vnode data is materialised lazily

`packages/qwik/src/core/client/process-vnode-data.ts:28-38`: the `qwik/vnode` script is parsed
into a `WeakMap<Element, string>` (`document.qVNodeData`) plus a `Map<number, Element>`
(`container.qVNodeRefs`) for the `~`-marked nodes. **No VNode objects are constructed.** They
are built on demand, so the tree stays sparse. The team's stated reason: memory allocation.

---

## 5. The `qwik/vnode` encoding

Two character tables, both in `packages/qwik/src/core/shared/vnode-data-types.ts`.

**Separators** — how many elements to skip before the next record. ASCII `!` through `.`, each a
power of two, combined bitwise (`ssr-container.ts:1567-1594`):

| char | `!` | `"` | `#` | `$` | `%` | `&` | `'` | `(` | `)` | `*` | `+` | `,`  | `-`  | `.`  |
| ---- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---- | ---- | ---- |
| skip | 0   | 1   | 2   | 4   | 8   | 16  | 32  | 64  | 128 | 256 | 512 | 1024 | 2048 | 4096 |

Plus `~` = "store this element in the ref map" (`VNodeDataSeparator.REFERENCE_CH`).

**Content characters** (`VNodeDataChar`):

| char            | meaning                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{` / `}`       | open / close a virtual node (component or fragment boundary)                                                                                              |
| `A`–`Z`, `aA`–… | a text node, length base-26-encoded, last letter uppercase so no separator is needed (`server/vnode-data.ts:136-166`: `0→A`, `25→Z`, `26→bA`, `1000→bmM`) |
| digits          | a count of consecutive plain elements to consume                                                                                                          |
| `;`             | `q:sstyle` — scoped style                                                                                                                                 |
| `<`             | `q:renderFn` — the component's render QRL                                                                                                                 |
| `=`             | `q:id`                                                                                                                                                    |
| `>`             | `q:props`                                                                                                                                                 |
| `?`             | `q:sparent` — slot parent                                                                                                                                 |
| `@`             | `q:key`                                                                                                                                                   |
| `[`             | `q:seq` — `useSequentialScope()` slots                                                                                                                    |
| `]`             | `q:ctx` — context values                                                                                                                                  |
| `^`             | `q:seqIdx`                                                                                                                                                |
| `` ` ``         | `q:brefs` — effect back-references                                                                                                                        |
| `~`             | `q:slot` name                                                                                                                                             |
| `\|`            | key/value separator for arbitrary pairs                                                                                                                   |
| `\`             | reserved (escape character)                                                                                                                               |

So every `q:*` attribute that v1 wrote into an HTML comment is, in v2, **one character in a
tail-emitted string**. That is where the "up to 30 % smaller HTML" claim
(`docs/upgrade/index.mdx`) comes from.

The out-of-order-suspense variant needs vnode ids that cannot collide across segments, and they
solved it with a Cantor pairing function producing negative ids (`vnode-data-types.ts:84-102`).
Worth noting only as evidence of how much complexity out-of-order streaming adds.

---

## 6. Event delegation

`packages/qwik/src/qwikloader.ts`, ~635 lines of source, ~1 kB minified per the first-party doc
(`docs/(qwik)/advanced/qwikloader/index.mdx`: _"Small: about 1 kb minified. Fast: it executes in
less than 5ms even on mobile devices."_).

**What gets installed.** Not "one listener for every event". The loader reads
`window._qwikEv`, an array the server pushes into:

```html
<script>
  (window._qwikEv || (window._qwikEv = [])).push("e:click", "e:input");
</script>
```

For each scoped event name it adds **one capture-phase listener per root** (document, plus each
shadow root) — or on `window` for `w:`/`wp:` scopes (`qwikloader.ts:537-614`). If no
`_qwikEv` array exists yet it guesses `e:click` and `e:input`. The array is then replaced by an
object with a `push` method, so later containers streamed into the page register their events by
calling `push` (`qwikloader.ts:616-634`). Delegation is therefore **demand-driven by what the
page actually rendered**, not a fixed list.

**Dispatch path** (`processElementEvent`, `qwikloader.ts:383-426`):

1. Kebab-case the event type; build `scopedKebabName = "e:" + kebabName`.
2. Walk from `ev.target` up to the root collecting elements, noting which have
   `capture:<event>`.
3. Run capture-phase handlers root-first, then bubble-phase handlers target-first, honouring
   `ev.cancelBubble` and `ev.bubbles`.
4. For each element, `dispatch()` reads `preventdefault:<event>` / `stoppropagation:<event>`
   **synchronously** (before any import), then either calls an already-attached
   `element._qDispatch[scopedKebabName]` (the fast path once the runtime is awake) or reads the
   `q-e:<event>` attribute and resolves the QRLs.
5. Handlers that return promises are pushed onto a serialised task queue so that ordering is
   preserved across lazy loads (`queueTasks`, `qwikloader.ts:96-101`).

**The synchronous-event hole.** Because handler code is fetched with `import()`, anything that
must run synchronously in the event — `preventDefault()`, `stopPropagation()` — cannot be in the
lazily-loaded handler. Qwik's answers are (a) the declarative `preventdefault:` /
`stoppropagation:` attributes, and (b) `sync$()`, whose function body is **stringified into the
HTML** and evaluated from `document["qFuncs_<hash>"]`. The documented caveats
(`docs/(qwik)/advanced/sync-events/index.mdx`) are severe:

> 1. `sync$()` can't close over any state.
> 2. `sync$()` can't call other functions which are declared in scope or imported.
> 3. `sync$()` is serialized into HTML and therefore we should be conscious of the size of the function.

On the page I measured, `q:func` bodies were 3,891 bytes — larger than all the structural
comment nodes combined.

---

## 7. Resumability × streaming — the decisive section for us

### 7.1 State is a whole-document post-pass

**In v1 this is unambiguous.** `packages/qwik/src/server/render.ts:189-206` (v1 branch): the
entire `qwik/json` payload is produced in a `beforeClose` callback that receives _every_
component context in the container and walks the finished graph:

```ts
beforeClose: async (contexts, containerState, _dynamic, textNodes) => {
  renderTime = renderTimer();
  const snapshotTimer = createTimer();
  snapshotResult = await _pauseFromContexts(contexts, containerState, undefined, textNodes);
  …
  const jsonData = JSON.stringify(snapshotResult.state, …);
  children.push(jsx('script', { type: 'qwik/json', dangerouslySetInnerHTML: escapeText(jsonData) }));
```

HTML streams; state does not. It is computed once, at the end, from complete knowledge.

**In v2 it is subtler but the same in outline.** `emitContainerData` (§1.1) runs at container
close and _streams the state string directly to the writer_ as it walks the root array
(`Serializer.$writer$`), so the state is not buffered as one giant JSON string — but the
_decision_ about what is a root, and every `RootRef` back-pointer, still requires the whole
render to be finished. `this.$noMoreRoots$ = true` is set only after `emitStateData()` returns.

### 7.2 The Qwik team names streaming as the source of two v1 design errors

From [Towards Qwik 2.0](https://qwik.dev/blog/qwik-2-coming-soon/), first-party:

- **The ID problem.** _"Since HTML streams during rendering, Qwik couldn't know whether
  serialized data would be referenced later, forcing it to generate IDs 'just-in-case.'"_ In v1
  every candidate element got a `q:id` while the HTML was being written, because by the time you
  know whether the id is needed, the bytes are gone. On the page I measured, `q:id`/`q:key`/etc.
  cost 4,427 bytes — 2.1 % of the document.
- **The pruning problem.** _"Components that would never execute on the client still generated
  virtual node markup unnecessarily, simply because Qwik couldn't determine statically whether
  they'd be needed."_

**The v2 fix is the single most important lesson in this document: move all identity and
structure metadata to the _tail_ of the stream, where the answer is already known.** The
`qwik/vnode` script addresses elements by depth-first index and marks the ones that need
identity with `~`. Nothing about identity is written while the element itself is being written.

### 7.3 Consequences the client has to absorb

Because the state arrives after the HTML, a user can click a button whose handler needs state
that is not on the page yet. v2 handles this explicitly:

- `waitForContainerReady` (`qwikloader.ts:124-139`) returns a promise if the container is
  `paused`, `document.readyState === 'loading'`, and the container's instance hash has not been
  marked ready. The dispatch then defers the handler onto the task queue
  (`qwikloader.ts:349-355`).
- The server pushes a ready marker **after** the state script:
  `(window._qwikEv||…).push(0, "<q:instance>")` (`ssr-container.ts:1537-1548`, `QwikEvContainerReady = 0`).

**v1 had no such gate.** Its `resolveContainer` (`qwikloader.ts:56-70`, v1) simply scans
backwards from `parentJSON.lastElementChild` for the `qwik/json` script; if it isn't there yet,
`_qwikjson_` stays `undefined` and the lookup fails. This is a real bug class that the rewrite
fixed.

Two more streaming-driven mechanisms in v2:

- **Backpatching** (`docs/(qwik)/advanced/backpatching/index.mdx`) — an element that has already
  streamed cannot have its attributes changed, so Qwik records `(elementIndex, attrName, value)`
  triples into a `<script type="qwik/backpatch">` at the end plus a tiny executor that applies
  them "without waking up the Qwik runtime". The doc is explicit about the limitation:
  _"Backpatching is currently limited to updating attributes. It does not change element
  children/text/structure."_ The motivating case is `aria-describedby` on an `<input>` that
  streams before the `<div id="description">` it points at.
- **Subscription patches** for out-of-order suspense
  (`packages/qwik/src/server/ooos-utils.ts`, `serdes/subscription-patch.ts`) — a later
  `<script type="qwik/state" q:patch q:r="<segment>">` that adds subscriptions onto roots that
  were already emitted in the main state script. This exists **only** because out-of-order
  segments can discover new consumers of already-flushed producers.

### 7.4 The eager-resume escape hatches

Two admissions that "fully lazy" doesn't always hold:

- `q-d:qidle` on the state script (`ssr-container.ts:1343-1349`): a QRL `_res` with a capture
  list of state roots that must be resumed on idle. Polling async signals need this
  (`ssr-render-jsx.ts:152`, `maybeAddPollingAsyncSignalToEagerResume`).
- `statePrewarm` (`docs/(qwik)/advanced/state-prewarm/index.mdx`), default `false`. First-party
  text:

  > On very large pages, however, the first read can touch a large connected state graph. In
  > that case the lazy read can turn into one large synchronous task.

  The remedy is to deserialise eagerly during resume, sliced across yielded tasks. It is a
  root-count threshold; the doc suggests starting at 2048. That is the framework telling you
  that a large enough serialised graph re-creates the very long task resumability was supposed
  to eliminate — just later and less predictably.

---

## 8. What the Qwik team got wrong and changed

Ordered roughly by how much it should change our design.

### 8.1 Structure encoded inline, in HTML comments → moved to a tail script

The biggest one. v1 wrote `<!--qv q:id=7 q:key=xYL1:zl_0-->` and `<!--t=8-->` around every
component boundary, slot projection and signal-bound text node. Costs: bytes, DOM nodes the
browser must allocate, and — see 8.2 — a security hole.

v2 moved all of it into `<script type="qwik/vnode">` with the character encoding of §5. The
first-party framing: _"Move all non-human readable data to the end of the HTML stream"_, which
_"enables faster content delivery to users"_ ([Towards Qwik 2.0](https://qwik.dev/blog/qwik-2-coming-soon/)).

### 8.2 The inline format was not escaped — CVE-2026-25148

[GHSA-m6jq-g7gq-5w3c](https://github.com/QwikDev/qwik/security/advisories/GHSA-m6jq-g7gq-5w3c),
moderate severity, fixed in 1.19.0:

> SSR builds comment content for Virtual components by concatenating structural attribute names
> and values without any escaping or quoting.

An attacker-controlled attribute key or value could close the HTML comment early and inject
markup. Impact listed includes _"potential hydration/resumability desynchronization due to broken
comment markers"_ — i.e. the structural channel and the content channel shared an escaping
context, and one could corrupt the other.

The v2 format is not automatically safe either; they had to build escaping for it explicitly.
There is a regression test whose fixture attribute key is literally
`'</script><script>globalThis.__qwik_xss=1</script>'`
(`packages/qwik/src/server/ssr-container.spec.ts:247-271`), asserting the raw key never appears
in the output. **Every value that crosses from application data into the structural channel needs
an escape rule, and it needs a test with a hostile fixture.**

### 8.3 One monolithic `qwik/json` object → a flat typed root array

v1's `{refs, ctx, objs, subs}` had four parallel indexing schemes, base36 string ids, magic
suffix characters (`!` = unwrap proxy, `~` = resolved promise, `_` = pending promise —
`pause.ts:107-131`), and stringly-typed subscription records (`"0 #1 link"`). v2 replaced all
four with one array of `(TypeId, value)` pairs, and the design doc says why in one line:
_"Arrays are used to store more complex metadata. Prefer these over encoding data into strings."_

That is a direct repudiation of v1's approach. Take it.

### 8.4 Eager deserialisation → lazy, then optionally eager again

v1 parsed the whole `qwik/json` with `JSON.parse` on first need. v2 parses to raw root data and
puts a deserialising proxy over it. Then, having made it lazy, they had to add `statePrewarm`
(§7.4) for pages where lazy is worse. Both directions are real; the framework now ships a knob.

### 8.5 `routeLoader$` data serialised by default → not serialised by default

From the v2 release notes ([learn-qwik.com/blog/qwik-2-beta](https://www.learn-qwik.com/blog/qwik-2-beta/),
corroborated by `docs/upgrade/index.mdx`): _"If you use `routeLoader$`, remember that in v2,
loaders are not serialized by default."_ Server-fetched data was, in practice, the largest thing
in most payloads, and it was being shipped to the client whether or not any client code read it.
`useSerializer$` is the opt-in.

This is the most under-discussed change and possibly the most important: **the default should be
"don't ship it".**

### 8.6 Comment-node text markers → single text node, split on first write

v1 wrapped every signal-bound text in `<!--t=8-->…<!---->`. v2 keeps one text node and splits it
only when the signal writes, using the base-26 length encoding to find the boundary.

### 8.7 No gate between "loader is live" and "state has arrived"

§7.3. Fixed in v2 with `q:instance` + the `QwikEvContainerReady` marker.

### 8.8 `on:click` → `q-e:click`, `\n`-separated → `|`-separated

Cosmetic on its own, but it broke every tool that parsed Qwik HTML, and the first-party docs
still have not fully caught up. If a wire format is going to be scraped, version it explicitly —
`q:runtime="2"` is v2's answer (`ssr-container.ts:642`).

---

## 9. Known costs, and what critics say

### Payload

My measurement of a real v1 page (§1.2): **15.5 % of HTML bytes, ~11.7 % of gzipped bytes** are
resumability payload, on a page that is mostly marketing content with modest interactivity. v2's
own claim is "up to 30 % smaller HTML" than v1 (`docs/upgrade/index.mdx`), which would bring
that to roughly 11 % uncompressed if it applied uniformly. I could not verify that number
independently.

Qwik's defence, from its own FAQ (`docs/(qwik)/faq/index.mdx`):

> **Is it true that Qwik serializes too much data in the HTML?**
> False. Qwik serializes only the data that is needed for the current page. If a page has 1000
> components but only one is interactive the amount of data serialized is proportional to the
> amount of interactivity, not the amount of components.

That is true of _listener_ metadata. It is only true of _state_ if the state graph reachable
from interactive code is small — and §7.4's `statePrewarm` documentation is Qwik conceding that
on real pages it often isn't.

### Server cost

v1 times the pause phase separately from render (`snapshotTime` vs `renderTime`,
`server/render.ts`), which tells you it is significant enough to instrument. I found **no
published figures** and could not measure it without building the framework. Structurally it is
a full traversal of the reachable object graph plus a second pass to hoist back-references —
after rendering is done, on every request, on the server. For a Workers-shaped deployment with
CPU-time limits this is the cost line to watch.

### Framework complexity

Observable from source: `serialize.ts` alone is 1,096 lines; `process-vnode-data.ts` 694;
`qrl-class.ts` 633; the type table has 43 entries; the character tables have ~30 reserved
characters with a comment tracking which ASCII ranges are still free
(`vnode-data-types.ts:48`: _"Available character ranges: 59 - 64, 91 - 94, 96, 123 - 126"_).
This is a format that has run out of punctuation.

### The outside critique

Ryan Carniato (SolidJS), [Resumability, WTF?](https://dev.to/this-is-learning/resumability-wtf-2gcm),
2022-08-23, identifies the structural cost:

> we'd need to serialize all the props coming into each component so that they could be woken up
> independently without running the whole component tree up front.

and argues the win over partial hydration is smaller than advertised:

> it largely offsets the cost of Resumability

— his point being that on a multi-page site where most components are non-interactive, islands
already avoid most of the hydration work, so resumability's remaining advantage is narrower than
the framing suggests. He offers no numbers; neither does Qwik.

A related argument appears in an anonymous proposal,
["Resumability without Serialization"](https://hackmd.io/@0u1u3zEAQAO0iYWVAStEvw/Hyu_IZQq2)
(author not identified on the page — treat as secondary): that the serialisation volume is a
consequence of _partial hydration granularity_, not of resumability as such, and that a design
which defers execution until state actually changes could resume with far less serialised data.
I could not attribute this document and have not relied on it.

### Why React Server Components are not the same thing

Worth one paragraph because the comparison comes up. RSC streams a payload describing the
_rendered output_ of server components — React's own docs: _"only the rendered output is sent to
the client"_, and _"the Client Components will see output of the Server Components passed as
props"_ ([react.dev/reference/rsc/server-components](https://react.dev/reference/rsc/server-components)).
Client components in that tree still **hydrate**: their code is downloaded, their render
functions re-execute, listeners are attached by that re-execution, and a mismatch is an error.
RSC removes work by moving components to the server; resumability removes work by making the
client never execute the tree at all. RSC's payload is a _render description_ (what to draw);
Qwik's payload is a _heap plus a subscription graph_ (what to continue). They solve adjacent
problems and their wire formats are not comparable.

---

## 10. Other genuinely resumable systems

I looked and found little. Qwik is effectively the only shipped, general-purpose resumable web
framework. The nearest relatives:

- **Marko 6 / "resumability"** — Marko has shipped work under this banner; I did not verify its
  wire format against primary sources within this ticket's scope, and I will not assert
  anything about it.
- Nothing else surfaced with a documented wire format for resuming a reactive graph without
  re-execution.

Treat this section as **not established**. If ticket 19 wants a second data point, Marko 6's
serialization runtime is the one to read.

---

## 11. What a from-scratch, signals-based, in-order-streaming framework should copy — and refuse to copy

### Copy

1. **Put everything that isn't visible HTML at the tail of the stream.** This is Qwik 2's central
   lesson, arrived at by getting it wrong first. Identity, structure, subscriptions, state — all
   of it emitted after the content, when the answers are known. Constraint 12 (in-order streaming,
   an async component blocks at its position) makes this _easier_ for us than for Qwik, not
   harder: we always reach the end of the document with complete knowledge, and we never need
   backpatching or subscription patches.
2. **Address DOM nodes positionally, by depth-first index, not by a written-in id.** Ids written
   inline must be written speculatively; indices are free. Copy the `~`-style "and remember this
   one" marker so only the nodes that are actually referenced enter the ref map.
3. **Copy the `:` marker.** Positional addressing is only safe if the client counts exactly what
   the server counted. A one-character attribute that means "I emitted this element" is the
   cheapest possible way to exclude analytics scripts, browser extensions and
   `dangerouslySetInnerHTML` subtrees from the count. Qwik also needs `q:container="html"` /
   `"text"` to fence opaque subtrees; we will need the equivalent.
4. **Copy the flat `(TypeId, value)` root array, not a nested JSON object.** Two-phase
   allocate-then-inflate, `RootRef` by index for shared values, and `RootRef` by _path_ for
   interior references so shared subobjects don't all get hoisted. This is v2's design after
   they threw v1's away; start where they finished.
5. **Copy the interned-constant table.** `undefined/null/true/false/''/NaN/±Infinity/EMPTY_OBJ`
   plus the handful of strings that recur in your own metadata. And copy the instinct behind
   `EffectSubscriptionNoData` / `SubscriptionDataConstTrue`: when a shape recurs, give it a type
   id rather than emitting its fields.
6. **Copy delta-encoded, root-indexed closure captures.** Captured values become roots; the QRL
   equivalent stores deltas between consecutive capture ids. Cheap, and it falls out naturally
   from having a root array.
7. **Copy "the subscription travels with the signal".** v1's parallel `subs` array indexed
   alongside `objs` was strictly worse than v2's `Signal [ value, ...effects ]`. Each
   subscription is `(consumer, property, data)` where `property` is either an attribute name, a
   "this is the whole component" sentinel, or a "this is a text position" sentinel. Three cases
   covers attribute bindings, text interpolation and component re-render.
8. **Copy the escape rule and the hostile test.** Escape the close-tag sequence inside serialised
   strings (`<\/`), escape every application-controlled key and value that enters the structural
   channel, and write the regression test with `</script><script>…` as the fixture. CVE-2026-25148
   was exactly this.
9. **Copy the "container ready" gate, and make it unnecessary where you can.** Even with our
   ordering, the loader will be live before the state script lands. A per-render instance hash
   plus a ready marker emitted after the state, with the dispatcher queueing interactions until
   then, is the minimum correct behaviour.
10. **Copy `sync$`-shaped thinking, not necessarily `sync$`.** Anything the browser requires
    synchronously in an event — `preventDefault`, `stopPropagation` — cannot live behind a
    dynamic import. Declarative attributes (`preventdefault:click`) handle the common case
    without serialising code.
11. **Copy the default: don't ship server data unless someone asked for it.** v2's biggest single
    payload win was making route-loader data non-serialised by default.
12. **Copy the escape hatch with a user-supplied representation** (`useSerializer$`), and note
    that it is _lazy_ — it doesn't cost anything at resume unless read.

### Refuse to copy

1. **Refuse comment-node markers.** They cost bytes, they cost DOM nodes, and they share an
   escaping context with content. v2 already abandoned them; don't re-derive the mistake.
2. **Refuse out-of-order streaming in v0** — which constraint 12 already does. Everything
   Qwik built to survive it (backpatching, `SubscriptionPatch`, Cantor-paired negative segment
   vnode ids, `EarlyFinalized` segment states) is complexity that in-order streaming simply does
   not incur. This is the strongest evidence I found _for_ constraint 12.
3. **Refuse stringly-typed metadata.** No `"0 #1 link"`, no base36 ids with magic suffix
   characters, no four parallel index spaces. Qwik's own design doc says prefer arrays.
4. **Refuse to run out of punctuation.** Qwik's vnode format has consumed nearly every safe
   ASCII character and now carries a comment listing what's left. If we adopt a
   character-per-field encoding, reserve an explicit extension escape from day one — Qwik
   reserved `\` for exactly this and then had to mark it `DON_T_USE`.
5. **Refuse an unversioned wire format.** Qwik shipped one and then broke every consumer.
   `q:runtime="2"` came after the fact. Put a format version in the container attributes in v0.
6. **Refuse `noSerialize`-as-silent-`undefined`.** Discarding a value and handing the client
   `undefined` with no diagnostic is the wrong default for a framework whose users are agents.
   Prefer a loud build-time or render-time error, with an explicit opt-in for "this is
   client-only, I know it will be absent".
7. **Refuse to serialise class instances or promise to.** Qwik documents this as a permanent
   limitation. Say so once, in the spec, and give the representation hook instead.
8. **Refuse eager whole-graph deserialisation on the client — but don't assume lazy is free
   either.** Qwik shipped lazy, then had to ship `statePrewarm` because lazy turns into one long
   task on large graphs. Design the client-side restore so the _unit_ of deserialisation is
   small and independently reachable, and measure before adding a prewarm knob.
9. **Refuse to treat "state is proportional to interactivity" as automatic.** It is only true if
   the reachability rules are tight. Qwik's FAQ claims it; Qwik's own `statePrewarm` docs and
   the v2 loader-serialisation change say it wasn't holding in practice. Ours should be a
   property we can point at in the spec, not a slogan.
10. **Refuse to design the payload before deciding what a "root" is.** Everything in Qwik's v2
    format — `RootRef`, `ForwardRef`, capture deltas, the `2n`/`2n+1` addressing, subscription
    patches — is downstream of "the state is an array of roots". Ticket 19 should settle that
    question first; the encoding follows from it almost mechanically.
