# 01 — capnweb: transport, capability model, and what it demands of a bundler

Research notes for [`.scratch/ursprung-v0/issues/01-capnweb-transport-and-capability-model.md`](../issues/01-capnweb-transport-and-capability-model.md).
Map: [ursprung v0](../map.md).

## Sources and how to read the citations

Everything below is from one of four primary sources. Nothing here comes from a
blog post that isn't Cloudflare's own, and nothing from a third-party write-up.

| Tag             | Source                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repo:<path>`   | `github.com/cloudflare/capnweb`, cloned at commit `064b0f352a5928caa91fe8a1fbc1c717c4b1ee09` ("feat: serialize URL objects over RPC (#224)", 2026-08-06) — this is **`main`, ahead of the latest release** |
| `npm:<file>`    | the published tarball `https://registry.npmjs.org/capnweb/-/capnweb-0.10.0.tgz`, and registry metadata at `https://registry.npmjs.org/capnweb`                                                             |
| `cf-docs:<url>` | developers.cloudflare.com                                                                                                                                                                                  |
| `verified`      | I ran the code. Every `verified` claim was executed against the **published 0.10.0 tarball** under Bun; the exact probe is described inline                                                                |

**Read `main` and 0.10.0 as different things.** They differ in ways that matter
(see [Serialisation](#serialisation--what-survives-the-wire)). Where the two
disagree I say which is which.

---

## 1. The published package

| Fact                 | Value                                                                          | Source                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Name                 | `capnweb`                                                                      | `npm:package.json`                                                                                                       |
| Latest version       | **0.10.0**, published **2026-07-07T01:24:08Z**                                 | `https://registry.npmjs.org/capnweb` `dist-tags.latest` + `time`                                                         |
| First publish        | 2025-09-12 (`0.0.1`, a placeholder: `"description": "Coming soon..."`)         | registry `time.created`, `versions["0.0.1"]`                                                                             |
| Licence              | **MIT**, © 2025 Cloudflare, Inc.                                               | `npm:package.json` `license`; `repo:LICENSE.txt`                                                                         |
| Author               | Kenton Varda (`kenton@cloudflare.com`)                                         | `npm:package.json` `author`                                                                                              |
| Runtime dependencies | **none** — no `dependencies`, no `peerDependencies`, no `engines` field at all | `npm:package.json` (verified: the key is absent, not empty)                                                              |
| `type`               | `"module"`                                                                     | `npm:package.json`                                                                                                       |
| Published files      | `dist/` only (`files: ["dist"]`) — **no TypeScript source is shipped**         | `npm:package.json`; tarball contains only `dist/*.{js,cjs,d.ts,d.cts,*.map}`, `README.md`, `LICENSE.txt`, `package.json` |

### It ships a build artifact, not source

The tarball has no `src/`. It ships three independently-bundled entry points,
each in both ESM and CJS, with `.d.ts` + `.d.cts` + source maps
(`npm:` tarball listing). Sizes: `dist/index.js` is 92 KB unminified;
gzipped-but-unminified it is **20,090 bytes** (`verified`: `gzip -9`). The
README's "under 10kB minify+gzip" (`repo:README.md` line 11) is a claim about
minified output, which the package does not ship — `tsdown.config.ts` sets
`minify: false` "Keep readable for debugging" (`repo:tsdown.config.ts`).

### The `exports` map is conditional, and the conditions are load-bearing

```jsonc
// npm:package.json
"exports": {
  ".": {
    "workerd": { "types": "./dist/index.d.ts",     "import": "./dist/index-workers.js", "require": "./dist/index-workers.cjs" },
    "bun":     { "types": "./dist/index-bun.d.ts", "import": "./dist/index-bun.js",     "require": "./dist/index-bun.cjs" },
    "types":   "./dist/index.d.ts",
    "import":  "./dist/index.js",
    "require": "./dist/index.cjs"
  }
}
```

This is not cosmetic. `dist/index-workers.js` begins with a bare
`import * as cfw from "cloudflare:workers"` and nothing else does
(`verified`: grepped all three ESM entries — `index.js` and `index-bun.js`
contain **zero** import statements; `index-workers.js` contains exactly that
one). The source explains why: `repo:src/inject-workers-module.ts` stashes the
`cloudflare:workers` namespace on a global symbol _before_ the rest of the
library loads, and `repo:src/core.ts:36` reads it:

```ts
export let RpcTarget = workersModule ? workersModule.RpcTarget : class {};
```

So on Workers, `capnweb`'s `RpcTarget` **is** the built-in
`cloudflare:workers` `RpcTarget`; elsewhere it is a bare marker class. The
0.2.0 changelog records that this design replaced a top-level `await` for the
conditional import specifically to fix "incompatibility with bundlers that
don't support top-level await" (`repo:CHANGELOG.md`, 0.2.0, PR #105).

Wrangler applies the `workerd` condition when bundling: "When bundling,
Wrangler will try to load the workerd key"
(`cf-docs:https://developers.cloudflare.com/workers/wrangler/bundling/`).
`cloudflare:workers` and its `RpcTarget` require a compatibility date of
`2024-04-03` or later, or the `rpc` compatibility flag
(`cf-docs:https://developers.cloudflare.com/workers/runtime-apis/rpc/`).

### CJS is present but not required

`capnweb` ships `.cjs` builds, but every ESM condition resolves to a `.js`
ESM file. An ESM-only resolver that honours `import` never touches the CJS.
**This does not conflict with locked constraint 14.**

### `node:` imports

There is exactly one `node:` reference in the whole source tree:

```ts
// repo:src/batch.ts:7
import type {
  IncomingMessage,
  ServerResponse,
  OutgoingHttpHeader,
  OutgoingHttpHeaders,
} from "node:http";
```

It is a **type-only import**, used for `nodeHttpBatchRpcResponse()`. It is
erased at build time: `verified` — `grep -c "node:"` over
`dist/index.js` and `dist/index-workers.js` returns **0** for both. It survives
only into `dist/index.d.ts` line 1.

The library also touches Node's `Buffer` global, always behind
`typeof Buffer !== "undefined"` guards (`repo:src/core.ts:48-49`,
`repo:src/serialize.ts:365,854`), so it degrades cleanly where `Buffer` is
absent. No other Node API appears.

`nodeHttpBatchRpcResponse` is exported from the same entry point as everything
else, so a browser bundle will contain its (unreachable) body. That is dead
weight, not a failure.

---

## 2. Transport

capnweb defines a protocol over "a bidirectional stream of discrete messages"
and explicitly does **not** define framing — that is the transport's job
(`repo:protocol.md`, "Transport and Framing"). Four transports ship:

| Transport       | Entry point                                                                                                 | Shape                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **HTTP batch**  | `newHttpBatchRpcSession(urlOrRequest)` / `newHttpBatchRpcResponse(request, localMain)`                      | one `POST`, newline-delimited JSON lines in body and response body |
| **WebSocket**   | `newWebSocketRpcSession(webSocketOrUrl, localMain?)` / `newWorkersWebSocketRpcResponse(request, localMain)` | persistent, one WS message per RPC message                         |
| **MessagePort** | `newMessagePortRpcSession(port, localMain?)`                                                                | for iframes / web workers                                          |
| **Custom**      | `new RpcSession(transport, localMain?)` over an `RpcTransport`                                              | `send(message)` / `receive()` / optional `abort(reason)`           |

(`repo:src/index.ts`; `repo:README.md` "Setting up a session")

`newWorkersRpcResponse(request, localMain)` multiplexes the first two on one
Worker route: `POST` → HTTP batch, `Upgrade: websocket` → WebSocket, anything
else → `400` (`repo:src/index.ts`, the function body).

### Batching and pipelining

Pipelining is the core feature, and it is real. The client sends a `push`
expression; it may reference the not-yet-resolved result of an earlier `push`
in a later one, and the server substitutes the resolution server-side before
delivering the call (`repo:protocol.md`, "Push and pull").

`verified` — three dependent calls (`authenticate(tok)` → `.getUserId()` →
`getUserProfile(uid)`) wired through an in-process `fetch` shim to
`newHttpBatchRpcResponse` produced the correct result in **one HTTP POST**.

### HTTP batch is a one-shot session

`repo:src/batch.ts` `BatchClientTransport` waits one macrotask
(`setImmediate`, falling back to `setTimeout(…, 0)`), then sends everything
queued as a single `POST` with `body: batch.join("\n")`. After that, `send()`
silently drops further messages and `receive()` throws
`"Batch RPC request ended."`.

`verified` — after awaiting the first result on a batch session, subsequent
calls on the same stub reject with `Error: Batch RPC request ended.` The
README states this too: "at this point, the `api` and `authedApi` stubs no
longer work, because the batch is done. You must start a new batch"
(`repo:README.md`).

**A persistent connection is not required** — HTTP batch works with plain
`fetch`. But each batch is a fresh session with a fresh capability graph.

### Server→client calls do not work over HTTP batch

`repo:src/batch.ts` carries a `TODO` admitting that a client waiting on a
server→client call will hang: "it's the app's responsibility to not wait on any
server -> client calls since they will never complete."

`verified` — an API method that receives a client function as a parameter and
`await`s it never resolves over HTTP batch (raced against a 1 s timer: timed
out). Passing a callback the server does _not_ await returns normally.
**Bidirectional calling requires WebSocket or MessagePort.**

### The batch response is buffered, not streamed

`newHttpBatchRpcResponse` awaits `transport.whenAllReceived()` then
`rpc.drain()`, and only then constructs
`new Response(transport.getResponseBody())` from a joined string
(`repo:src/batch.ts`). The HTTP response body is not incrementally flushed.
(`ReadableStream`s passed _as values_ are a separate mechanism and are
multiplexed inside the message stream — `repo:README.md`, "Streaming with flow
control".)

---

## 3. The object / capability model

### There is a root capability, and it is `localMain`

Every session is symmetric — "The protocol does not have a 'client' or a
'server'; it is fully bidirectional" (`repo:protocol.md`). Each side may expose
one **main interface**, the `localMain` argument. It is assigned import/export
**ID zero** ("ID zero is automatically assigned to the 'main' interface",
`repo:protocol.md`, "Imports and Exports"). The peer obtains it via
`session.getRemoteMain()`, which is what all four `new*RpcSession` helpers
return (`repo:src/index.ts`).

**A client's entire reachable surface starts at that one object.** Everything
else is derived: returned from a call, or passed as an argument.

### How something becomes callable

Two ways, and only two (`repo:README.md` "RpcTarget" / "Functions",
`repo:src/core.ts` `typeForRpc`):

1. **`class X extends RpcTarget`** — instances are pass-by-reference. The peer
   receives an `RpcStub<X>`.
2. **A plain function** — passed by reference, the peer receives a stub that
   calls back.

Anything else that isn't a recognised pass-by-value type is a serialisation
error.

### Capabilities pass freely as arguments and return values

Yes, in both directions, and across sessions: "If Alice is connected to Bob and
Carol, and Alice receives a stub from Bob, Alice can pass the stub in an RPC to
Carol, thus allowing Carol to call Bob. (As of this writing, any such calls will
be proxied through Alice…)" (`repo:README.md`).

### Ownership and disposal

This is the part that will bite. The rule is **the caller disposes**
(`repo:README.md`, "Automatic disposal"):

- Stubs in **params** stay the caller's property and are **implicitly disposed
  on the callee side when the call completes**. A server that wants to keep a
  client callback past the call must `.dup()` it.
- Stubs in **results** transfer to the caller, who must dispose them.
- Stubs integrate with explicit resource management (`Symbol.dispose`,
  `using`). Disposing the root WebSocket stub closes the connection.
- There is deliberately **no GC-based reclamation**: "garbage collection does
  not work well when remote resources are involved… We make no attempt to solve
  it in this library." `FinalizationRegistry` is floated as a future
  possibility that "should not be relied upon."
- HTTP batch sidesteps most of this: "when using HTTP batch request, there's
  generally no need to dispose stubs."

Workers' built-in RPC used the _opposite_ params convention until the
`rpc_params_dup_stubs` flag, whose enable-date is **2026-01-20**
(`cf-docs:https://developers.cloudflare.com/workers/configuration/compatibility-flags/`).
ursprung's `apps/web/cloudflare.config.ts` sets `compatibilityDate: "2026-08-07"`,
so the flag is already on by default.

### `map()` — remote transformation without a round trip

`promise.map(fn)` runs `fn` once locally in "recording" mode against a
placeholder stub, ships the recording plus captured stubs, and replays it on
the peer (`repo:README.md`, "The magic `map()` method"). Restrictions: the
callback must be synchronous and side-effect-free apart from RPC, and — the
warning worth carrying forward — "a malicious peer can use these stubs for
anything, not just calling your callback."

---

## 4. Serialisation — what survives the wire

The base format is **JSON**, with non-JSON types encoded as tagged arrays:
`["date", 1749342170815]`, and a literal array wrapped one level deeper,
`[["just","an","array"]]` (`repo:protocol.md`, "Serialization"). Messages are
serialised **strictly as trees** — cycles and aliases are not representable.

Type dispatch is by **exact prototype identity**, not `instanceof`:
"we generally don't support serializing _subclasses_ of serializable types, so
we switch on the exact prototype" (`repo:src/core.ts`, `typeForRpc`). The
exceptions are `RpcTarget` and `Error`, which use `instanceof`.

### Published 0.10.0 — measured

`verified` — called the exported `serialize()` on each value:

| Value                                                          | Result                                                                                                                                   |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| plain object, array, string/number/boolean/null                | ✅                                                                                                                                       |
| `undefined`                                                    | ✅ `["undefined"]`                                                                                                                       |
| `bigint`                                                       | ✅ `["bigint","10"]`                                                                                                                     |
| `Date`                                                         | ✅ `["date",0]`                                                                                                                          |
| `Infinity` / `NaN`                                             | ✅ `["inf"]` / `["nan"]`                                                                                                                 |
| `Uint8Array` (and Node `Buffer`)                               | ✅ `["bytes","AQID"]` (base64)                                                                                                           |
| `Error` incl. own props                                        | ✅ `["error","TypeError","boom",null,{"code":"E"}]`                                                                                      |
| `Headers`                                                      | ✅                                                                                                                                       |
| `Blob`, functions, `ReadableStream`/`WritableStream`           | need a live session (failed with "Cannot create pipes without an RPC session" / "Can't serialize RPC stubs in this context" outside one) |
| **`Int32Array` and every typed array other than `Uint8Array`** | ❌ `TypeError: Cannot serialize value: 1,2`                                                                                              |
| **`ArrayBuffer`, `DataView`**                                  | ❌ `TypeError`                                                                                                                           |
| **`Map`, `Set`**                                               | ❌ `TypeError`                                                                                                                           |
| **`RegExp`**                                                   | ❌ `TypeError`                                                                                                                           |
| **`URL`**                                                      | ❌ `TypeError`                                                                                                                           |
| **class instance not extending `RpcTarget`**                   | ❌ `TypeError: Cannot serialize value: [object Object]`                                                                                  |
| **null-prototype object** (`Object.create(null)`)              | ❌ `TypeError`                                                                                                                           |
| **`Symbol`**                                                   | ❌ `TypeError`                                                                                                                           |
| **cyclic object**                                              | ❌ `Error: Serialization exceeded maximum allowed depth. (Does the message contain cycles?)`                                             |

The 0.10.0 README agrees (`npm:README.md`, "Pass-by-value types"): supported are
primitives, plain objects, arrays, `bigint`, `Date`, `Uint8Array`, `Error` and
well-known subclasses, `Blob`, `ReadableStream`/`WritableStream`, and
`Headers`/`Request`/`Response`; **not** supported are `Map`, `Set`, `RegExp`,
`ArrayBuffer` and typed arrays other than `Uint8Array`.

### `main` has moved ahead of 0.10.0

`repo:README.md` at HEAD additionally lists `ArrayBuffer`, `DataView`, all
typed arrays, and `URL`. Confirmed as post-release: `verified` —
`case URL.prototype` and `case Int32Array.prototype` appear in
`repo:src/core.ts` but **not** in `npm:dist/index.js` for 0.10.0. The
newest commit on `main` is literally "feat: serialize URL objects over RPC
(#224)". GitHub issues #221/#222/#230 (`Set`, `RegExp`, `Map`) are still open.

**Anything ursprung wants beyond the 0.10.0 list requires waiting for a
release.**

### Unserialisable values throw synchronously at the sender

`repo:src/serialize.ts` `devaluateImpl` throws
`TypeError("Cannot serialize value: …")` for kind `"unsupported"`. There is no
silent drop and no `undefined` substitution. Depth overflow throws before that.
On the receive side an oversized or malformed message is rejected and **tears
down the session via `abort()`** (`repo:src/serialize.ts`, comment at line 38).

### TypeScript types are more permissive than the runtime

`RpcCompatible<T>` in `repo:src/types.d.ts` admits `Map<…>` and `Set<…>` as
composites, which the 0.10.0 runtime rejects. Do not treat the type as a
guarantee.

---

## 5. Minimum setup shapes

### Server, in a Worker

```ts
// repo:README.md, "HTTP server on Cloudflare Workers"
import { RpcTarget, newWorkersRpcResponse } from "capnweb";

class MyApiImpl extends RpcTarget {
  greet(name: string): string {
    return `Hello, ${name}!`;
  }
}

export default {
  fetch(request: Request, env, ctx) {
    if (new URL(request.url).pathname === "/api") {
      return newWorkersRpcResponse(request, new MyApiImpl());
    }
    return new Response("Not found", { status: 404 });
  },
};
```

Serves HTTP batch and WebSocket from that one route.

### Client, in a browser

```ts
// HTTP batch — one round trip per session
import { newHttpBatchRpcSession } from "capnweb";
using api = newHttpBatchRpcSession<MyApi>("/api");
let greeting = await api.greet("Alice");

// WebSocket — long-lived, bidirectional
import { newWebSocketRpcSession } from "capnweb";
using api = newWebSocketRpcSession<MyApi>("wss://example.com/api");
```

(`repo:README.md`, "HTTP batch client" / "WebSocket client")

That is the whole surface: one import, one call. No schema, no codegen, no
build step. The canonical browser example in the repo is one line —
`newHttpBatchRpcSession<Api>('/api')`
(`repo:examples/worker-react/client/src/main/App.tsx`).

The full export list of the package is 16 names
(`verified`, from the `export {…}` line of `npm:dist/index.js`):
`DEFAULT_LIMITS`, `DEFAULT_MAX_DEPTH`, `RpcPromise`, `RpcSession`, `RpcStub`,
`RpcTarget`, `WebSocketTransport`, `deserialize`, `newHttpBatchRpcResponse`,
`newHttpBatchRpcSession`, `newMessagePortRpcSession`, `newWebSocketRpcSession`,
`newWorkersRpcResponse`, `newWorkersWebSocketRpcResponse`,
`nodeHttpBatchRpcResponse`, `serialize`.

---

## 6. Security posture

### Reachable by construction — there is no allowlist

This is the single most important finding for the server-boundary transform.

When you hand a peer an `RpcTarget`, **every prototype method and getter on
that class is callable**, with no registration step: "they will be able to call
any class method over RPC, including getters" (`repo:README.md`). The only
exclusions are structural:

- **Instance ("own") properties are not readable** — and probing one _throws_
  rather than returning `undefined`, deliberately (`repo:src/core.ts:1600-1612`;
  `verified` — reading `api.instanceProp` over a real batch session threw
  `TypeError: Attempted to access property 'instanceProp', which is an instance
property of the RpcTarget…`).
- **`#private` members are invisible**, because they are private in JavaScript.
- **`Object.prototype` names are blocked** on the path walker
  (`repo:src/core.ts:1566`), and in practice resolve locally on the client-side
  Proxy anyway (`verified` — `await api.toString()` returned the local
  `"[object RpcStub]"`, never reaching the server).

`private` in TypeScript does **not** hide a method: "declaring a method
`private` does not hide it from RPC, because TypeScript annotations are
'erased' at runtime… To actually make methods private, you must prefix their
names with `#`" (`repo:README.md`).

Plain functions invert the rule: for a function, _only_ own properties are
exposed.

### capnweb assumes the application does authn/authz, and recommends in-band

There is no built-in auth. The documented pattern is a capability handshake:
an unauthenticated root exposes `authenticate(token)`, which returns an
`AuthedApi` capability (`repo:README.md`, "More complicated example"). The
reason is structural, not stylistic: "The WebSocket API in browsers always
permits cross-site connections, and does not permit setting headers. Because of
this, you generally cannot use cookies nor other headers for authentication"
(`repo:README.md`, "Security Considerations").

`newWorkersRpcResponse` sets `Access-Control-Allow-Origin: *` on batch
responses, and the JSDoc calls this out in capitals: "SECURITY WARNING: This
function accepts cross-origin requests. If you do not want this, you should
validate the `Origin` header before calling this" (`repo:src/index.ts`).

### No runtime type checking

"Cap'n Web currently does not provide any runtime type checking… A malicious
client can send types you did not expect" (`repo:README.md`). Cloudflare's
announcement repeats it and points at Zod
(`https://blog.cloudflare.com/capnweb-javascript-rpc-library/`).

The first-party answer is a **separate package**, `capnweb-validate`
(`repo:packages/capnweb-validate/README.md`; npm latest **0.2.2**, published
2026-06-16, `license: MIT`, `dependencies: {"unplugin":"^3.0.0"}`,
`peerDependencies: {"capnweb":">=0.7.0","typescript":">=5.7.0"}`). It works by
putting a **`@validateRpc()` decorator** on the service class and having a
**bundler plugin or CLI** rewrite it using **resolved TypeScript types**.
Adapters ship for Vite, Rollup, webpack, Rspack, esbuild and Farm; Wrangler
gets the CLI because "Wrangler does not expose a bundler plugin hook."

### Receiver-side resource limits

Added in 0.10.0 (`repo:CHANGELOG.md`, PR #185). `RpcSessionOptions.limits`
overrides `DEFAULT_LIMITS` (`repo:src/serialize.ts:68`):
`maxBigIntDigits: 16384`, `maxDepth: DEFAULT_MAX_DEPTH`,
`maxMessageSize: 32 MiB` (UTF-16 code units, checked before `JSON.parse`).
Limits are local and un-negotiated; exceeding one aborts the session. The
README notes capnweb's check runs _after_ the transport has already buffered a
whole message, so transport-level caps remain the first line of defence.

The other session option is `onSendError?: (error: Error) => Error | void`, for
logging or redacting errors before they cross the wire; by default stacks are
omitted (`repo:src/rpc.ts:433-457`).

Pipelining is also a DoS vector by design: "Cap'n Web's pipelining can make it
easy for a malicious client to enqueue a large amount of work to occur on a
server… In stateless Workers (i.e. not Durable Objects), the system considers
an entire WebSocket session to be one 'request' for CPU limits purposes"
(`repo:README.md`).

---

## 7. Browser and runtime requirements

Claimed: "It works in all major browsers, Cloudflare Workers, Node.js, Bun,
Deno, and other modern JavaScript runtimes" (`repo:README.md`).

Tested: `repo:vitest.config.ts` runs a Playwright browser matrix — chromium
with `using` support, and chromium + firefox + webkit in a "browsers-without-using"
mode — plus `@cloudflare/vitest-pool-workers` for workerd and a separate
`bun test` project.

Globals the library requires at module scope: `WritableStream`, `ReadableStream`,
`URL`, `Headers`, `Request`, `Response`, `Blob`, `Symbol`, `Promise`
(`repo:src/core.ts` `typeForRpc`). All present in browsers and workerd.

It **polyfills for you** where it can: `Symbol.dispose`, `Symbol.asyncDispose`
and `Promise.withResolvers` are patched onto the globals at import time if
absent (`npm:dist/index.js` lines 6-19; `repo:src/core.ts:8-18`). Note this is
a **module-level side effect** that mutates globals — capnweb is not
side-effect-free, and no `sideEffects` field is declared in its manifest.

Worker-only globals (`WebSocketPair`) appear only inside
`newWorkersWebSocketRpcResponse`'s body (`repo:src/websocket.ts`), so a browser
bundle carries the dead code but never evaluates it. Node's `Buffer` likewise
appears only behind `typeof` guards.

`verified` — the shipped `dist/index.js` contains **no** `using` declarations,
no static initialisation blocks, and no top-level `await`. It does use `#private`
class fields (114 occurrences), optional chaining, `??=`, and `Symbol.dispose`.

---

## 8. Stability

Cloudflare's own announcement, in its own words: **"Cap'n Web is new and still
highly experimental. There may be bugs to shake out. But, we're already using
it today."** It also says capnweb "is the basis of the recently-launched
'remote bindings' feature in Wrangler" and that Cloudflare has "begun to
experiment with it in various frontend applications"
(`https://blog.cloudflare.com/capnweb-javascript-rpc-library/`).

Evidence for and against betting a framework on it:

**For.** Ten minor releases in ~10 months of real publishing (0.1.0 on
2025-09-21 → 0.10.0 on 2026-07-07, per registry `time`). Changesets-driven
changelog with named external contributors. Cloudflare SECURITY.md and HackerOne
scope (`repo:SECURITY.md`). Zero dependencies. It is the transport under a
shipped Wrangler feature. Kenton Varda — the author of Cap'n Proto and of
Workers' built-in RPC — is the maintainer.

**Against.** Version is `0.x`; nothing promises semver stability. The library
is **not documented on developers.cloudflare.com** — I searched the Cloudflare
docs MCP index and the site; the only hit is a passing reference inside the
`rpc_params_dup_stubs` compatibility-flag entry. The README is the spec. 22 open
issues at time of writing, and the serialisation type set is visibly still
growing release to release. 0.9.0 shipped a **wire-format break** for
`MessagePort` sessions requiring both ends to upgrade together
(`repo:CHANGELOG.md`).

### Known limitations, from the horse's mouth

From `repo:README.md` and `repo:CHANGELOG.md`:

- `Map`, `Set`, `RegExp` unsupported; in 0.10.0 also `ArrayBuffer`/typed arrays
  other than `Uint8Array` and `URL`.
- No cycles, no aliasing — trees only.
- No runtime type checking without `capnweb-validate`.
- No GC of remote references; manual disposal or short sessions.
- Three-party handoff is proxied through the intermediary, not direct.
- Workers-RPC feature parity is incomplete in both directions (Workers RPC lacks
  `map()` and `RpcPromise`-in-params; capnweb lacks some Workers RPC types).
- Server→client calls hang over HTTP batch (`repo:src/batch.ts` TODO).
- Pipelining on `WritableStream`/`ReadableStream` is unimplemented
  (`repo:src/core.ts` TODOs in `followPath`).
- Batch serialisation rollback is incomplete for pipes already pumping
  (`repo:src/serialize.ts:256` TODO).

Open issues sampled from `https://github.com/cloudflare/capnweb/issues`
(22 open): #230 `Map` serialization, #228 "ReadableStream cannot be returned
through a forwarded stub" (bug), #223 `URL`, #222 `RegExp`, #221 `Set`, #210
`onRpcBroken` callbacks retained for the session lifetime, #187 `Response`
with a WebSocket.

---

## 9. What I could not establish

Stated plainly, because these are gaps and not guesses:

- **No stated semver or stability policy.** Nothing in the repo, the manifest,
  or Cloudflare's docs commits to a compatibility window for `0.x`. The only
  stability signal is the blog's "still highly experimental."
- **No wire-protocol version negotiation.** `repo:protocol.md` documents the
  messages but I found no version handshake and no statement about
  forward/backward compatibility between capnweb versions on the two ends of a
  session. The 0.9.0 MessagePort break suggests there is none.
- **I did not verify behaviour inside a real Worker.** Every `verified` claim
  was run under Bun against `dist/index.js` (the non-workerd entry). I did not
  deploy to workerd, so the `cloudflare:workers` interop path
  (`dist/index-workers.js`) is described from source reading, not execution.
- **I could not confirm whether resolving the `import` condition instead of
  `workerd` on the server is supported.** Reading `repo:src/core.ts:36` it
  should work — `RpcTarget` falls back to `class {}` and everything else is
  runtime-agnostic — but the loss is Workers-RPC interop (service bindings,
  DO stubs), and nothing in the docs blesses the configuration.
- **No published guidance on how many concurrent batch sessions are sane**, nor
  on per-request cost of a session. Not measured.
- **GitHub repository metadata (stars, contributor count, issue totals over
  time)** was not retrievable — the API is not reachable from this session and
  the issue list came from the rendered HTML page.

---

## Implications for ursprung

Mapped against the locked constraints on [`map.md`](../map.md).

### Nothing here breaks a locked constraint

- **Constraint 14 (ESM only).** ✅ `capnweb` is `"type": "module"`, and every
  `import` condition resolves to an ESM file. The `.cjs` builds exist but an
  ESM-only resolver never selects them. **No CJS-only dependency problem.**
- **Constraint 15 (`node:*` external on server, hard error on client).** ✅
  The single `node:http` import is type-only and is fully erased from the
  shipped JS. A client bundle containing `capnweb` will contain **no** `node:`
  specifier. Nothing to polyfill.
- **Constraint 10 (one self-contained ESM file, no chunks, cycles are an
  error).** ✅ `dist/index.js` and `dist/index-bun.js` have **zero** import
  statements; `dist/index-workers.js` has exactly one. capnweb's own build
  deliberately keeps entries self-contained "because workerd loads
  dist/index-workers.js directly and cannot resolve generated shared chunks"
  (`repo:tsdown.config.ts`). This matches ursprung's model exactly. Duplicating
  capnweb into the server bundle and each route bundle costs ~92 KB unminified
  (~20 KB gzipped) per bundle, which constraint 10 already accepts.
- **Constraint 6 (exactly three dependencies).** ✅ capnweb has **zero**
  runtime dependencies, so adopting it adds one node to the graph, not a
  subtree.
- **Constraint 16 (third-party modules uncoloured, side inferred from
  reachability).** ✅ works, but see the resolver note below — capnweb is
  reached from _both_ sides and resolves to _different files_ on each.

### Four things the bundler must do that it might not do today

1. **Conditional `exports` resolution is mandatory, and the condition set is
   per-side.** capnweb has no `main`-only fallback path worth using: the server
   bundle must resolve with the `workerd` condition
   (`cf-docs:.../workers/wrangler/bundling/`) to get `dist/index-workers.js`,
   and route bundles must resolve with the default `import` condition to get
   `dist/index.js`. **The same specifier resolves to two different files
   depending on side.** That interacts directly with constraint 16 — colouring
   currently infers a _side_ for a module; here the side has to feed back into
   _resolution_, before the graph node even exists. This is a design point for
   ticket 20 and for whatever ticket owns resolution.

2. **`cloudflare:*` must be externalised on the server.** Constraint 15 names
   `node:*` as external on the server and says nothing about `cloudflare:*`.
   `dist/index-workers.js` starts with `import * as cfw from "cloudflare:workers"`.
   Either constraint 15 grows a `cloudflare:*` clause, or ursprung resolves
   capnweb with the plain `import` condition on the server too — which works
   (per `repo:src/core.ts:36`) at the cost of Workers-RPC interop, but is a
   configuration nobody documents. **This needs a decision, and it is the one
   place the map's constraints are silent on something load-bearing.**

3. **The parser must handle what's in `dist/index.js`.** Per constraint 8 the
   parser builds a real AST for a JS file it does not strip. capnweb's shipped
   output uses `#private` class fields (114 of them), optional chaining, `??=`,
   getters, and computed `[Symbol.dispose]()` methods. No top-level `await`, no
   static blocks, no `using` declarations — but note the README's _recommended
   application patterns_ use `using api = …` throughout, so the demo app and
   any user code will hit explicit-resource-management syntax even though the
   library doesn't.

4. **capnweb mutates globals at import time** (`Symbol.dispose`,
   `Symbol.asyncDispose`, `Promise.withResolvers`) and declares no
   `sideEffects` field. It must not be treated as side-effect-free / droppable.

### What this means for the server-boundary transform (ticket 20)

- **The root capability is the design.** A client module importing from a
  `.server.ts` needs its function reachable from the single `localMain` object
  the Worker hands to `newWorkersRpcResponse`. So the transform has to
  **generate a root `RpcTarget`** whose prototype methods are exactly the
  server functions the graph decided to expose — and no more, because
  **capnweb has no allowlist**: every prototype method on that class is
  callable by anyone who can reach the endpoint. The generated root _is_ the
  allowlist. That is a security-relevant property of a generated artifact, and
  worth an ADR.
- **Instance state on the root is safe by construction** (own properties are
  unreadable and probing throws), but methods are not. Generated names must not
  collide with anything the transform doesn't intend to expose.
- **HTTP batch vs WebSocket is a real fork, not a tuning knob.** HTTP batch:
  no persistent connection, one round trip per session, stub dies after the
  batch, **and server→client calls hang** (verified). WebSocket: persistent,
  bidirectional, but in a stateless Worker the whole session counts as one
  request for CPU limits (`repo:README.md`), which points at Durable Objects for
  anything long-lived — and DOs are not in v0's scope. **For v0's demo app,
  HTTP batch is the fit**, and the transform should assume one session per
  logical batch of calls, minted fresh.
- **No callbacks over the v0 transport.** If the RPC stub API ever wants to
  pass a client function to the server, that forces WebSocket. Worth ruling in
  or out explicitly rather than discovering it later.
- **Serialisation constraints leak into the API contract.** A server function
  returning a `Map`, a `Set`, a `URL`, an `Int32Array`, a class instance, or a
  cyclic object throws a `TypeError` **at the sender** in 0.10.0. ursprung has
  no type model (constraint 8), so it cannot catch this at build time — it will
  be a runtime error. Either document the supported return-type set loudly, or
  own a diagnostic at the boundary.

### Two things to decide deliberately

- **Pin the capnweb version.** The supported type set changed between 0.10.0
  and `main`, and a MessagePort wire break shipped in 0.9.0. Constraint 6 says
  real npm dependencies; a caret range on a `0.x` package with an
  "experimental" self-description is an unbounded risk. Recommend an exact pin.
- **`capnweb-validate` is out of reach, and that's fine to say now.** It is a
  second npm dependency (constraint 6 → needs approval), it works through a
  **decorator** — non-erasable syntax that constraint 8 makes a hard build
  error — and it needs the **TypeScript type checker** at build time, which
  constraint 8 explicitly rules out ("no type model"). ursprung cannot adopt it
  without reopening two locked constraints. The consequence is that ursprung's
  RPC boundary has **no runtime type validation**, and every server function is
  reachable by an untrusted caller with arbitrary argument types. That should
  be written down as a known v0 property, not discovered later.
