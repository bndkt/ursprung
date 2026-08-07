# 02 — TC39 Signals and signal-polyfill

Research findings for [issue 02](../issues/02-tc39-signals-and-polyfill.md).
Map: [ursprung v0](../map.md).

## Method and provenance

Everything below is from primary sources, retrieved **2026-08-07**:

| Source                             | Identity at retrieval                                 |
| ---------------------------------- | ----------------------------------------------------- |
| `tc39/proposal-signals`            | cloned at `9124ed9` (2025-08-11), the tip of `main`   |
| `proposal-signals/signal-polyfill` | cloned at `1c33f91` (2025-02-13), the tip of `main`   |
| `signal-polyfill` on npm           | `0.2.2`, published 2025-01-17, tarball sha `722e2cd…` |
| `tc39/proposals` stage lists       | `main`, fetched raw                                   |
| `tc39/notes`                       | shallow clone of `main`                               |
| `@lit-labs/signals` on npm         | `0.3.0`, published 2026-05-14                         |

Claims marked **[verified]** were reproduced by running scripts against the published
`signal-polyfill@0.2.2` tarball (`dist/index.js`) under Node and Bun. The exact snippets
are inlined so they can be re-run.

`git diff v0.2.2-signal-polyfill..HEAD -- src/` is empty, so the polyfill sources cited
here are byte-identical to what npm ships as 0.2.2.

Two gaps up front, stated rather than papered over:

- **GitHub issue comment threads were not retrievable.** The API is blocked for this
  session and the HTML pages render comments client-side. I can cite issue numbers,
  titles, states and opening posts, but not discussion. Where an issue's _discussion_
  would have been the evidence, I say so.
- The proposal has **no spec text**. `spec.emu` in the repo is a nine-line ecmarkup stub
  reading `stage: 0` with no algorithm steps in it. The README's "Signal algorithms"
  section is the whole proto-specification.

---

## 1. Status and stability

**Stage 1, and static since mid-2024.**

- `tc39/proposals/stage-1-proposals.md` lists Signals under Stage 1, champions Ehrenberg /
  Katz / Ramanathan / Lewis / Garrett / Gannaway / Sego / M / Eisenberg. `proposal-signals`
  appears in **no** other stage list (checked stage-0, 2, 2.7, 3, 4, finished, inactive).
- The proposal has been on a TC39 plenary agenda exactly **twice**: 2024-04 ("Signals for
  Stage 1") and 2024-06 ("Algorithms for Signals"). Grepping every meeting from `2024-07`
  through `2026-05` in `tc39/notes` finds no agenda heading and no reference to
  `proposal-signals`. There has been no committee update in roughly two years.
- June 2024 notes, Daniel Ehrenberg verbatim: _"Signals are at Stage 1. […] I don't
  expect it to be proposed for Stage 2 within the next 12 months, because there's just a
  lot of work to do to prove this out."_ and the summary line _"Signals are at stage one.
  They have been integrated experimentally into a number of frameworks and libraries, but
  there is still significantly more experimentation and iteration to do."_
  (`tc39/notes/meetings/2024-06/june-13.md`, "Algorithms for Signals".)
- README self-description: _"This document describes an early common direction […] This
  proposal does include a fully concrete API, but the API is not targeted to most
  application developers."_ and _"it is expected to take at least 2-3 years at an absolute
  minimum for Signals to be natively available across all browsers."_

**What changed most recently.** `git log -- README.md` on the proposal repo: the last
change with any semantic content is `f75805d` (2024-08-09), a fix to the `Watcher.watch`
pseudocode. Everything in 2025 (`a82505a`, `2253e0b`, `357456d`, `eaa4824`, `0a5f315`) is
typo and contributing-guide edits. The substantive 2024 churn was:

- `ebc7149` (2024-05-28) "Generalise the `notifying` semantics to `freezing`" — the global
  that forbids reads/writes is now `frozen`, covering `watched`/`unwatched` callbacks too,
  not just `notify`.
- `c4fa34c` (2024-05-13) added the explicit `Computed` and `Watcher` state machines.
- `b6e8adf` (2024-08-06) dropped the "recalculating" flag; `3490f52` made `computing`
  `null` rather than `undefined`; `1aca4a4` removed `state` from `Signal.State`;
  `ac1f6bd` narrowed `getPending` to computed signals only.

**What is still contested.** From the open-issue list (105 open issues; titles and states
are citable, discussion is not):

| #   | Title                                                                     | Opened     |
| --- | ------------------------------------------------------------------------- | ---------- |
| 274 | Let's keep things clean and simple: `new Signal(initialValue)`            | 2025-12-11 |
| 272 | Consider renaming "Signal" to avoid collision with existing AbortSignal   | 2025-12-06 |
| 273 | Retrieving signal values can result in leaky abstractions                 | 2025-12-07 |
| 277 | Writable `Signal.Computed`                                                | 2026-02-07 |
| 282 | Why does a Watcher need a "pending" state?                                | 2026-05-01 |
| 281 | Provided context vs global, fully pull async computed (async lessons)     | 2026-04-27 |
| 279 | Inconsistency between algorithm and a test                                | 2026-04-22 |
| 254 | Consumers can unexpectedly hold unused memory in dependencies             | 2025-01-22 |
| 255 | Computed signals should expose a callback invoked when a value is dropped | 2025-01-22 |
| 152 | Can we use `accessor` instead of `get`/`set` methods?                     | 2024-04-07 |
| 151 | Uncached Computed?                                                        | 2024-04-07 |
| 104 | Support creating Signals for leaf node data that doesn't exist yet        | 2024-04-01 |

Issues open in 2026 are still questioning the class name, the constructor shape, the
accessor form, whether `Computed` should be writable, and whether `Watcher` needs its
`pending` state. **The names `Signal.State`, `Signal.Computed`, `.get()`, `.set()` are not
settled**, and the README's own "Omitted for now" section names two whole feature areas
still absent: async / loading state (issue #30) and transactions / graph forking (#73).

---

## 2. `Signal.State` and `Signal.Computed` — exact surface

The proposal's `.d.ts` sketch (README, "API sketch") and the polyfill agree on shape:

```ts
class State<T> {
  constructor(t: T, options?: SignalOptions<T>);
  get(): T;
  set(t: T): void;
}
class Computed<T> {
  constructor(cb: (this: Computed<T>) => T, options?: SignalOptions<T>);
  get(): T;
}

interface SignalOptions<T> {
  equals?: (this: Signal<T>, t: T, t2: T) => boolean; // default Object.is
  [Signal.subtle.watched]?: (this: Signal<T>) => void;
  [Signal.subtle.unwatched]?: (this: Signal<T>) => void;
}
```

Detail, from `signal-polyfill/src/wrapper.ts`, `src/signal.ts`, `src/computed.ts`:

- **Equality.** `defaultEquals` is `Object.is` (`src/equality.ts`). A custom `equals` is
  called as `node.equal.call(node.wrapper, oldValue, newValue)` — `this` is the signal
  wrapper, arguments are `(old, new)`. It is consulted **on write** for `State` and **on
  recompute** for `Computed` (README: _"Caching is 'on the way out'"_ — June 2024 notes).
  If it returns true the write is a no-op: no version bump, no invalidation, no notify.
  **[verified]** a custom `equals` that returns true for `{v:1}` vs `{v:1}` leaves
  downstream computeds untouched; the comparator is called exactly once per `set`.
- **`Computed` callback `this`.** `node.computation.call(node.wrapper)` — `this` is the
  `Signal.Computed` instance (`src/computed.ts:124`). **[verified]**, including for
  subclasses.
- **Subclassing works.** `State` and `Computed` use private-method brands
  (`#brand`) plus `static { isState = s => #brand in s }`, so subclasses pass the brand
  check and can add public and private fields. **[verified]**: `class MyState extends
Signal.State { #meta; … }` gets/sets normally, participates in the graph, and
  `Signal.isState` returns true for it. This matters — the README lists subclassing as a
  design goal precisely so frameworks can hang their own state off a signal without a
  second allocation.
- **Errors are cached.** If a computed's callback throws, the error is stored and rethrown
  on every subsequent `get()` until a dependency changes (`ERRORED` sentinel,
  `src/computed.ts:55-59, 127-129`). **[verified]**.
- **Reading a computed recursively throws** `Error("Detected cycle in computations.")`
  (`src/computed.ts:112-114`). **[verified]**, including for indirect cycles built through
  a registry, and the error is cached and rethrown on the next read too.
- **`new Signal.State()` with no argument does not throw** in the polyfill; the value is
  `undefined`. TypeScript's signature requires the argument. **[verified]** — a mismatch
  between the type surface and the runtime, worth not relying on.

### Writing inside a computation

The README is explicit that this is **allowed and not enforced against**: _"Computed
Signals can write to other Signals, synchronously within their callback"_, and under
Soundness: _"This proposal does allow signals to be both read and written from computed
and effect signals […] despite the soundness risk. This decision was taken to preserve
flexibility and compatibility in integration with frameworks."_

The polyfill implements this by setting `node.consumerAllowSignalWrites = true` on every
`Signal.Computed` (`src/wrapper.ts:95`). **[verified]**: a computed whose callback calls
`dest.set(dest.get() + 1)` returns normally and the write lands.

The polyfill's own test records the trap
(`tests/behaviors/prohibited-contexts.test.ts`, comment verbatim):

> `// Note: c is marked clean in this case, even though re-evaluating it`
> `// would cause it to change value (due to the set inside of it).`

So a computed that writes to a signal it also reads settles into a stale-but-clean state.
Writes inside computations are legal, silently self-inconsistent, and should be treated as
a defect in application code rather than a supported pattern.

Writes are forbidden in exactly one place: inside a `Watcher`'s `notify` callback — see §3.

---

## 3. `Signal.subtle`

The whole namespace exists to mark the framework-author line: _"Put subtle APIs in a
`subtle` namespace, similar to `crypto.subtle`, to mark the line between APIs which are
necessary for more advanced usage like implementing a framework or building dev tools
versus more everyday application development usage"_ (README, Surface API).

The polyfill exports exactly these nine members plus three type guards not in the
proposal — verified against the package's own type test
(`src/public-api-types.ts`, which asserts `keyof typeof Signal.subtle` equals
`untrack | currentComputed | introspectSources | introspectSinks | hasSinks | hasSources |
Watcher | watched | unwatched`, and `keyof typeof Signal` equals
`State | Computed | subtle | isState | isComputed | isWatcher`).

### `Watcher`

```ts
class Watcher {
  constructor(notify: (this: Watcher) => void);
  watch(...s: Signal[]): void;
  unwatch(...s: Signal[]): void;
  getPending(): Signal[];
}
```

Contract, from the README's algorithm section plus `src/wrapper.ts:174-263` and
`src/graph.ts`:

- **`notify` is synchronous, inside `.set()`.** README: _"The `notify` callback in
  Watchers […] runs synchronously, during the `.set()` call which triggered it (but after
  graph coloring has completed)."_ In the polyfill, `signalValueChanged` →
  `producerNotifyConsumers` → `consumerMarkDirty` → `consumerMarkedDirty.call(wrapper)`.
- **`notify` may neither read nor write signals.** `producerNotifyConsumers` sets the
  module-global `inNotificationPhase = true` around the loop (`src/graph.ts:309-319`);
  `producerAccessed` throws if it is set (`src/graph.ts:215-221`), and
  `State.prototype.set` throws `Error("Writes to signals not permitted during Watcher
callback")` (`src/wrapper.ts:72-74`). **[verified]** for both.
  **Gotcha:** the _read_ guard throws `new Error("")` — an Error with an **empty
  message** — in the published bundle, because the descriptive text is behind
  `typeof ngDevMode !== "undefined" && ngDevMode`, an Angular build flag that is never
  defined in the shipped artifact (`dist/index.js:79-81`). **[verified]**. A framework
  that accidentally reads a signal in `notify` gets a blank error.
- **`notify` fires once per arming.** The watcher is armed by `watch()` (which sets
  `node.dirty = false`) and disarmed by the first notification. **[verified]**: two
  consecutive `set()`s produce **one** `notify`; calling `w.watch()` with no arguments
  re-arms it. This is the documented use of the zero-argument form: _"Can be called with
  no arguments just to reset the 'notified' state."_
- **`watch(...)` is incremental and repeatable.** It appends to the watcher's set; the
  same watcher can watch signals created long after it. **[verified]**.
- **`unwatch(...)` is the disposal primitive.** README FAQ: _"The relevant teardown
  operation here is `Signal.subtle.Watcher.prototype.unwatch`. Only watched Signals need
  to be cleaned up […] while unwatched Signals can be garbage-collected automatically."_
  Passing a signal the watcher is not watching throws.
- **`getPending()` returns only dirty _computed_ signals** the watcher directly watches
  (`src/wrapper.ts:262`: `node.producerNode.filter(n => n.dirty).map(n => n.wrapper)`).
  **[verified]:** a `Watcher` watching a `Signal.State` **directly** does receive `notify`
  but `getPending()` returns `[]` for it, because a State never becomes `dirty` in its
  consumer capacity. Any effect loop written as `for (const s of w.getPending()) s.get()`
  therefore silently ignores directly-watched States. Watch computeds, not states.
- **Watchers retain the graph.** README: _"Any Signals which are watched by a Watcher will
  be held alive as long as any of the underlying states are reachable […] For this reason,
  remember to call `Watcher.prototype.unwatch` to clean up effects."_

### `untrack(cb)`

Runs `cb` with the active consumer set to `null`, restoring it in a `finally`
(`src/wrapper.ts:123-133`). Reads inside are not recorded as dependencies.
**[verified]:** a computed reading `t1.get() + untrack(() => t2.get())` records **one**
source and never invalidates when `t2` changes. The README labels it _"An unsound escape
hatch"_: _"it allows the creation of computed Signals whose value depends on other
Signals, but which aren't updated when those Signals change."_

Note the polyfill's `untrack` does **not** clear `inNotificationPhase`, matching the
README's _"untrack doesn't get you out of the `frozen` state, which is maintained
strictly."_ **[verified]** — reads inside `untrack` inside `notify` still throw.

### `currentComputed()`

Returns the innermost computed currently evaluating. **Divergence:** the README specifies
`Computed | null`; the polyfill returns `getActiveConsumer()?.wrapper`, i.e. **`undefined`**
outside any computation and inside `untrack`. **[verified]**. Do not test against `null`.

### `introspectSources(s)` / `introspectSinks(s)`

- `introspectSources(Computed | Watcher)` returns the **ordered** list of signals read
  during the last evaluation (for a Watcher: the set it watches). Reading order is
  observable and load-bearing — README: _"The order of reads of Signals within a computed
  is significant, and is observable."_ **[verified]** on the polyfill's own
  `tests/behaviors/dynamic-dependencies.test.ts`, which asserts exact ordered equality
  after the dependency set changes shape twice.
- `introspectSinks(State | Computed)` returns `liveConsumerNode` only
  (`src/wrapper.ts:151`) — i.e. **only consumers that are recursively watched**.
  **[verified]:** a State read by an unwatched computed reports zero sinks; the same State
  reports one sink once a Watcher watches that computed. This is by design (README:
  _"Returns the Watchers that this signal is contained in, plus any Computed signals which
  read this signal last time they were evaluated, if that computed signal is (recursively)
  watched"_), but it means **you cannot walk the graph downward to discover unwatched
  dependents.** Upward walks via `introspectSources` are complete; downward walks are not.
- `hasSinks` / `hasSources` are the boolean forms. `hasSources(c) === false` means, per
  the README, _"A Computed where hasSources is false will always return the same
  constant."_ That sentence is the single most important line in the proposal for
  ursprung — see §7.

### `watched` / `unwatched`

Two symbols used as option keys. Contract: called when the signal's live-consumer count
goes 0→1 and 1→0 respectively (`producerAddLiveConsumer` / `producerRemoveLiveConsumerAtIndex`,
`src/graph.ts:453-459, 477-485`). They run with `frozen` true, so they may not touch the
graph.

The firing point is subtler than the name suggests. **[verified]**, and matching
`tests/behaviors/liveness.test.ts`:

- `watcher.watch(computed)` fires `watched` on the computed immediately, but fires
  `watched` on a **State beneath** that computed only once the computed has actually been
  evaluated — because liveness propagates along _recorded_ producer edges, and an
  unevaluated computed has none.
- With two watchers on the same computed, `watched` fires once (on the first) and
  `unwatched` once (on the last).

So `watched` is "somebody is now observing me", where _observing_ means an evaluated path
to a Watcher exists — not "somebody called `watch`".

---

## 4. There is no `effect`. How one is built.

README, FAQ: _"Effects inherently tie into scheduling and disposal, which are managed by
frameworks and outside the scope of this proposal. Instead, this proposal includes the
basis for implementing effects through the more low-level `Signal.subtle.Watcher` API."_

The canonical recipe appears twice — in the proposal README ("Implementing effects",
carrying the comment `// NOTE: This scheduling logic is too basic to be useful. Do not
copy/paste.`) and in the polyfill README. The polyfill's version:

```js
let needsEnqueue = true;

const w = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    queueMicrotask(processPending);
  }
});

function processPending() {
  needsEnqueue = true;
  for (const s of w.getPending()) s.get(); // pull — this is what re-runs the effects
  w.watch(); // re-arm
}

export function effect(callback) {
  let cleanup;
  const computed = new Signal.Computed(() => {
    typeof cleanup === "function" && cleanup();
    cleanup = callback();
  });
  w.watch(computed);
  computed.get(); // prime: run once, record dependencies
  return () => {
    // dispose
    w.unwatch(computed);
    typeof cleanup === "function" && cleanup();
    cleanup = undefined;
  };
}
```

The five moving parts, each load-bearing:

1. **The effect body is a `Signal.Computed`.** There is no other node type. Its value is
   discarded; what matters is that it is a consumer, so it auto-tracks.
2. **Priming with `computed.get()` is mandatory.** Without it the computed has recorded no
   sources, and a computed with no sources never invalidates (§7). It is also what makes
   the effect run its first time.
3. **`notify` may do nothing but set a flag and schedule.** No reads, no writes. The
   microtask is the framework's scheduling seam — this is where a batch/frame/priority
   scheduler goes.
4. **The flush is a pull.** `for (const s of w.getPending()) s.get()` — reading is what
   re-evaluates. Glitch-freedom comes free because the read walks a consistent graph.
5. **Disposal is `unwatch` plus the user cleanup.** Nothing else releases the retention;
   the Watcher is the only thing holding the graph alive.

**Real-world variant.** `@lit-labs/signals@0.3.0` (`lib/signal-watcher.js`, BSD-3-Clause,
Google) is the same recipe hardened, and its deviations are the interesting part:

- A **module-scoped** `effectWatcher` singleton with the same `queueMicrotask` flag dance.
- A `WeakMap` from watcher → element plus a `FinalizationRegistry` whose callback does
  `watcher.unwatch(...Signal.subtle.introspectSources(watcher))`, with the comment: _"We
  need to ensure that we don't leak memory by creating a reference cycle between an
  element and its watcher, which then is kept alive by the signals it watches."_ The
  `notify` closure is written to capture only `this` and module globals for the same
  reason.
- A dummy `__forceUpdateSignal = new Signal.State(0)` that is incremented purely to force
  a cached computed to re-run, with the comment: _"Used to force an uncached read of the
  `__performUpdateSignal` […] If https://github.com/tc39/proposal-signals/issues/151 is
  resolved, we won't need this."_ **There is no API to invalidate a computed.**
- A fresh `Signal.Computed` created per watch cycle rather than reused, _"because of
  https://github.com/proposal-signals/signal-polyfill/issues/27"_.
- `Signal.subtle.untrack(() => signal.get())` to prime an effect without the priming read
  being attributed to an enclosing computation.

Both the proposal README and Lit note that effects can trivially reproduce React
antipatterns: README, _"Work which is queued by a Watcher's `notify` callback may read or
write signals, making it possible to replicate classic React antipatterns"_; polyfill
README shows `effect(() => counter.set(counter.get() + 1))` and asks _"Infinite loop???"_,
answering that it depends entirely on the framework's scheduler.

---

## 5. Evaluation model and glitch-freedom

**Push–pull.** README FAQ: _"Evaluation of computed Signals is pull-based […] At the same
time, changing a State signal may immediately trigger a Watcher's callback, 'pushing' the
notification. So Signals may be thought of as a 'push-pull' construction."_ Invalidation
is pushed synchronously; evaluation is pulled lazily.

**Nothing is scheduled.** _"It isn't scheduled! The computed Signal will recalculate itself
the next time someone reads it."_ Writes take effect immediately with no built-in
batching: _"Writes to state Signals are reflected immediately."_

**Glitch-freedom.** Defined in the README's core features: _"Computation is
'glitch-free', meaning no unnecessary calculations are ever performed. This implies that,
when an application reads a computed Signal, there is a topological sorting of the
potentially dirty parts of the graph to run, to eliminate any duplicates."_ The June 2024
presentation gives the canonical counterexample — `t = seconds + 1`, `g = t > seconds`,
which a naive push implementation can transiently evaluate to `false`.

**Can an observer see an inconsistent intermediate state?** Three separate mechanisms say
no, and one caveat says "not through the signal API":

- Reads are pull, so a consumer only ever observes a graph that has just been brought to a
  consistent state by its own read.
- `notify` — the only synchronous callback fired mid-write — is forbidden from reading any
  signal at all, so it cannot observe anything.
- **[verified]** on a diamond (`base`, `dbl = base*2`, `sum = base + dbl`): after
  `base.set(2)` and `base.set(3)` the observed tuples are `[2,4,6]` and `[3,6,9]` — always
  internally consistent, never a torn `[3,4,7]`.
- **Caveat:** the _order_ in which callbacks run during a pull is observable and is not
  strictly topological-looking. **[verified]** on the same diamond with side-effecting
  callbacks, the recompute order after one `set` is `l, j, r` — the join's callback runs
  between its two inputs' callbacks, because `j` is recomputed as soon as its first polled
  source reports a change, and pulls `r` from inside its own body. Values are still
  correct; a callback that logs or counts will see this order. Do not put ordering-sensitive
  side effects in computed callbacks.

**Pruning / equality cut-off.** `tests/behaviors/pruning.test.ts` shows a three-deep chain
where an intermediate computed returns a constant: after `s.set(1)`, reading the tip
re-evaluates the first two links and **not** the third, because the second's value compared
equal. This is the "caching on the way out" behaviour Ehrenberg described in June 2024.

**Lossiness.** README: _"if you write to a state Signal twice in a row, without doing
anything else, the first write is 'lost' and never seen by any computed Signals or
effects. This is understood to be a feature rather than a bug."_

**Implementation note that matters.** The polyfill does **not** implement the README's
`~clean~`/`~checked~`/`~dirty~` graph-colouring algorithm. Its source files carry
`Copyright Google LLC […] angular.io/license` headers and it uses Angular's global-epoch +
per-node-version scheme (`src/graph.ts:26, 262, 277-298, 390-416`). Comparing exported
symbols against `angular/angular` `packages/core/primitives/signals/src/graph.ts` on
`main`, 18 are identical (`producerAccessed`, `producerUpdateValueVersion`,
`consumerPollProducersForChange`, `consumerBeforeComputation`, `REACTIVE_NODE`, …); the
polyfill adds `assertConsumerNode`, `assertProducerNode`,
`producerRemoveLiveConsumerAtIndex`, and Angular has since moved on (linked-list
`producersTail`, `knownValidAtEpoch`). **The polyfill is a fork of Angular's reactive
graph wrapped in the proposal's class surface, not an independent implementation of the
README's algorithm.** Open proposal issue #279, "Inconsistency between algorithm and a
test" (2026-04-22), suggests this gap is live.

---

## 6. The published polyfill

| Field                | Value                                                                                                                                                                                                                                                                                                                             |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name / version       | `signal-polyfill@0.2.2`                                                                                                                                                                                                                                                                                                           |
| Published            | 2025-01-17 (`registry.npmjs.org/signal-polyfill`, `time`)                                                                                                                                                                                                                                                                         |
| Licence              | **Apache-2.0** (manifest). Sources carry mixed headers: `wrapper.ts` is Apache-2.0 / Bloomberg Finance L.P.; `graph.ts`, `signal.ts`, `computed.ts`, `equality.ts`, `errors.ts` are **MIT / Google LLC** (Angular). `LICENSE` in the repo is Apache-2.0. Contributors listed: Google LLC, Bloomberg Finance L.P., EisenbergEffect |
| Runtime dependencies | **none** (`dependencies` and `peerDependencies` both absent)                                                                                                                                                                                                                                                                      |
| `type`               | `"module"`                                                                                                                                                                                                                                                                                                                        |
| `main` / `types`     | `dist/index.js` / `dist/index.d.ts`                                                                                                                                                                                                                                                                                               |
| `exports`            | **absent** — no exports map, no conditions, no subpaths                                                                                                                                                                                                                                                                           |
| `files`              | absent; the tarball is 54 files / 142 KB unpacked, including `src/`, `tests/`, `.github/` and `tsconfig.json`                                                                                                                                                                                                                     |
| Entry bundle         | `dist/index.js`, **583 lines, 19.8 KB, unminified** (`minify: false` is deliberate — polyfill PR #21)                                                                                                                                                                                                                             |
| Module format        | **ESM only.** Single `export { Signal }`. Zero `require(`, zero `import` statements in the bundle                                                                                                                                                                                                                                 |
| Node APIs            | **none.** No `process`, `Buffer`, `node:*`, `__dirname`, `globalThis`. The only global identifiers referenced anywhere in the bundle are `Object`, `Symbol`, `Error`, `TypeError`, `WeakSet`                                                                                                                                      |
| Syntax level         | Downlevelled: private class fields are compiled to `WeakSet` + `__privateAdd` helpers; no `static {}` blocks, no `#` syntax. Built by Vite `lib` mode, `formats: ['es']`                                                                                                                                                          |
| Repo state           | Last commit 2025-02-13. **No release in ~19 months.**                                                                                                                                                                                                                                                                             |

The polyfill README leads with: **"⚠️ This polyfill is a preview of an in-progress
proposal and could change at any time. Do not use this in production. ⚠️"**

Two consequences worth naming for a bundler:

- **No `exports` field** means resolution must fall back to `main`. A resolver that only
  implements `exports` will fail on this package. It also means deep imports
  (`signal-polyfill/dist/index.js`, `signal-polyfill/src/wrapper.ts`) are all legal.
- **The tarball ships `src/*.ts` and `tests/*.ts`.** A build that pulls package files into
  a virtual filesystem will see TypeScript sources sitting next to the ESM `dist`. Only
  `dist/index.js` is reachable from `main`.

Known open defect: **signal-polyfill#27**, _"Computed breaks if dependency is set after
being unwatched by a Watcher"_ (justinfagnani, 2024-07-31, still open). Lit works around
it by allocating a fresh `Signal.Computed` per watch cycle. **I could not reproduce it**
against 0.2.2 in three sequences (watch→get→set→unwatch→rewatch→get;
watch→get→unwatch→set→watch→get; two watchers with a partial unwatch) — all returned
correct values. The issue predates 0.2.1 and 0.2.2 and its StackBlitz repro was not
retrievable, so I cannot say whether it was fixed incidentally or whether my sequences
miss it. **Treat it as unresolved.**

---

## 7. Can the graph be built incrementally and out of order?

This is the decisive question for Resumption, so it gets the long answer.

### Short answer

**Yes — with one sharp edge that will silently corrupt a resumed page if it is missed.**

Construction order is completely free, because a `Signal.Computed`'s callback is not run
at construction. What is _not_ free is **first-evaluation** order: a computed that is
evaluated at a moment when it reads no signals records zero sources, and **a computed with
zero sources never invalidates again, forever.** No error, no warning; it just returns a
frozen constant for the life of the page.

### What the proposal says

The README's own design goals promise the dynamic half:

> Computed Signals track their dependencies **dynamically** — each time they are run, they
> may end up depending on different things, and that precise dependency set is kept fresh
> in the Signal graph.

and the FAQ addresses resumability head-on:

> **Q**: Do Signals work with SSR? Hydration? Resumability?
> **A**: Yes. Qwik uses Signals to good effect with both of these properties […] **We
> think that it is possible to model Qwik's resumable Signals using a State and Computed
> signal hooked together, and plan to prove this out in code.**

That is a _belief with an intention_, not a demonstration. And the README contains a
commented-out, never-written section that is exactly this ticket:

```
<!--
### Introspection for SSR
TODO: Show how serializing the signal graph works
TODO: Show how you can "hydrate" a signal from state to computed later, using a few signals.
-->
```

Those three TODO lines have been in the README, unwritten, since the file's early history
and survive at `main` today. **The proposal has not documented signal-graph serialisation
or deferred hydration, and by its own admission has not proved it out.** Adjacent open
issue #104, _"Support creating Signals for leaf node data that doesn't exist yet"_
(2024-04-01), is still open with no resolution visible; #164, _"Should Signal.State /
Signal.Computed have toJSON?"_, was **closed** — there is no `toJSON`, and **[verified]**
`JSON.stringify(new Signal.State(1))` yields `{}`.

### What the runtime actually does

All of the following was run against `signal-polyfill@0.2.2`.

**Out-of-order construction works, unconditionally, as long as first evaluation is
ordered.**

```js
// Downstream built before upstream exists
let upstream;
const downstream = new Signal.Computed(() => upstream.get() * 2);
upstream = new Signal.State(5);
downstream.get(); // 10
upstream.set(7);
downstream.get(); // 14   ✔

// Two levels out of order: top -> mid -> leaf, built top-first
let mid;
const leaf = new Signal.State(1);
const top = new Signal.Computed(() => mid.get() + 100); // built first
mid = new Signal.Computed(() => leaf.get() * 10); // built second
top.get(); // 110
leaf.set(2);
top.get(); // 120  ✔

// Identity handed to a registry, sources registered later
const registry = new Map();
const total = new Signal.Computed(() => registry.get("a").get() + registry.get("b").get());
registry.set("a", new Signal.State(1));
registry.set("b", new Signal.State(2));
total.get(); // 3    ✔  (2 sources recorded)
```

A `Signal.State`'s identity is a plain object with no id, no serialisation and no
registration anywhere; it can be created, stored in a map, closed over, subclassed and
handed around freely. **[verified]** its only own property is one internal symbol.
Watchers can be attached to signals created long after the watcher, and a **live**
computed picks up brand-new sources on re-evaluation, correctly acquiring the live edge:

```js
const flag = new Signal.State(false);
let extra = null;
const dyn = new Signal.Computed(() => (flag.get() && extra ? extra.get() : "off"));
const w = new Signal.subtle.Watcher(() => {});
w.watch(dyn);
dyn.get();
extra = new Signal.State("on");
Signal.subtle.hasSinks(extra); // false
flag.set(true);
w.watch();
dyn.get();
Signal.subtle.hasSinks(extra); // true    ✔ the new source became live
extra.set("changed"); // notifies, getPending() lists dyn   ✔
```

**The sharp edge.**

```js
const empty = new Signal.Computed(() => (late ? late.get() : "none"));
empty.get(); // "none"   — 0 sources recorded
late = new Signal.State("late!");
empty.get(); // "none"   ✗ still stale
late.set("changed");
empty.get(); // "none"   ✗ still stale, forever
```

The mechanism is in `src/graph.ts:277-291`: `producerUpdateValueVersion` calls
`consumerPollProducersForChange`, which iterates an **empty** producer array and returns
`false`, so the node is marked clean at the current epoch and never recomputes. This is the
README's own `hasSources` note — _"A Computed where hasSources is false will always return
the same constant"_ — stated as a fact about the data model rather than as a warning.

**Two constructions that defeat it**, both verified:

_(a) Tripwire._ Read a dedicated generation `Signal.State` unconditionally, so the computed
always has at least one source, and bump it when the graph is extended:

```js
const gen = new Signal.State(0);
const guarded = new Signal.Computed(() => {
  gen.get();
  return late ? late.get() : "none";
});
guarded.get(); // "none", 1 source
late = new Signal.State("late!");
gen.set(1);
guarded.get(); // "late!", 2 sources  ✔
late.set("changed");
guarded.get(); // "changed"           ✔
```

_(b) Indirection cell — the "state and computed hooked together" the FAQ gestures at._
Give out a stable `Signal.Computed` identity whose backing producer lives inside a
`Signal.State`, then swap the producer later. This is the resumability shape:

```js
// Server-rendered: the cell's value came from the HTML, no derivation known yet.
const backing = new Signal.State({ kind: "literal", value: "from HTML" });
const cell = new Signal.Computed(() => {
  const b = backing.get();
  return b.kind === "literal" ? b.value : b.signal.get();
});
// A dependent wired before we know how `cell` will be produced.
const dependent = new Signal.Computed(() => `[${cell.get()}]`);
dependent.get(); // "[from HTML]"

// Resumption: the real derivation arrives when its code loads.
const price = new Signal.State(10),
  qty = new Signal.State(3);
backing.set({ kind: "derived", signal: new Signal.Computed(() => price.get() * qty.get()) });
dependent.get(); // "[30]"   ✔ identity preserved, no re-render
qty.set(4);
dependent.get(); // "[40]"   ✔ fully reactive through the swap
```

`cell`'s object identity never changes, so anything that captured it — an event handler, a
`Host` binding, a slot in the Resumability payload — keeps working across the swap. The
`backing.get()` read guarantees `cell` always has ≥1 source, so the frozen-constant trap
cannot fire. The polyfill's own `tests/behaviors/dynamic-dependencies.test.ts` is the same
shape at library level: a `Signal.State` holding an _array_ of signals, read by a computed,
with the array replaced three times and the ordered source set asserted each time.

### What the API does **not** give you

- **No serialisation.** No `toJSON` (issue #164, closed), no id, no way to name a signal.
  A framework must own the id ↔ signal map itself; nothing in the proposal helps.
- **No way to enumerate the graph downward from a state.** `introspectSinks` reports live
  (watched) consumers only, **[verified]**. So a Resumability payload cannot be produced by
  walking the graph after server rendering unless every node is watched — and watching
  every node on the server means retaining the whole graph and defeats laziness.
- **No way to attach a source to a computed explicitly.** Dependencies are _only_ ever
  discovered by running the callback. There is no `computed.addSource(s)`, no way to hand a
  computed a pre-computed source list from serialised data.
- **No way to invalidate a computed** (proposal issue #151, open; Lit's
  `__forceUpdateSignal` workaround exists solely because of this).
- **No way to replace a computed's callback** after construction. **[verified]** the
  instance exposes only `get` and one internal symbol.
- **No `Signal.State` without an initial value** in the type surface. A sentinel value plus
  a computed that maps it (`PENDING → "loading"`) is the pattern; **[verified]** it works.

### The duplicate-instance hazard

**[verified], and this is the one that will bite hardest.** Two module instances of
signal-polyfill do not share a graph, and one of the two failure modes is _silent_:

```js
const m1 = await import("./dist/index.js");
const m2 = await import("./dist/index.js?copy=2"); // second instance

const s = new m1.Signal.State(1);
const c = new m2.Signal.Computed(() => s.get() + 1);
c.get(); // 2
m2.Signal.subtle.hasSources(c); // false   ← no dependency recorded
s.set(2);
c.get(); // 2       ✗ frozen forever, no error
```

`activeConsumer`, `epoch` and `inNotificationPhase` are module-level `let`s in
`src/graph.ts:18-26`. Instance 2 sets _its_ `activeConsumer`; instance 1's
`producerAccessed` reads _its own_, sees `null`, and records nothing. The read succeeds and
returns the right value once — then the computed is a constant.

The loud failures (which are the good case) are the brand checks:
`m1.Signal.subtle.introspectSources(c)` throws _"Called introspectSources without a
Computed or Watcher argument"_, `m2Watcher.watch(m1State)` throws _"Called watch/unwatch
without a Computed or State argument"_, and `m2.Signal.isState(m1State)` is `false`.

**Exactly one instance of signal-polyfill may exist per JavaScript realm.** This is a hard
architectural requirement, not a nice-to-have — see §9.

---

## 8. Framework integrations

What can be established from primary artefacts:

- **Angular.** The polyfill's engine _is_ Angular's. `src/graph.ts`, `signal.ts`,
  `computed.ts`, `equality.ts`, `errors.ts` all carry `Copyright Google LLC All Rights
Reserved / MIT-style license […] angular.io/license`, and 18 exported symbols match
  `angular/angular` `packages/core/primitives/signals/src/graph.ts` on `main` today.
  Angular's shipped `@angular/core@22.1.0` does **not** depend on `signal-polyfill`
  (`dependencies` is `{tslib}`); the relationship runs the other way — Angular donated the
  algorithm, and its own copy has since evolved past the fork.
- **Lit.** `@lit-labs/signals@0.3.0` (2026-05-14) has a hard `dependencies` entry on
  `signal-polyfill: ^0.2.2` and re-exports `Signal.State`/`Signal.Computed` as
  `signal()`/`computed()` and `State`/`Computed`. It is the most complete public example of
  a framework building on the actual proposal API, and its source comments are the clearest
  first-party statement of what is missing (see §4).
- **Ember / Glimmer.** `signal-utils@0.21.1` (NullVoxPopuli) peer-depends on
  `signal-polyfill: ^0.2.0`; the proposal README cites it as the reference for reactive
  data structures built on the proposal. The README also notes Glimmer's alternative:
  _"it is perfectly possible to use Signals effectively without `Signal.subtle.Watcher` by
  scheduling polling of computed Signals, as Glimmer does."_
- **Solid, Preact, Vue** are validating by **test port**, not adoption. The polyfill
  carries `tests/behaviors/graph.test.ts` ("SolidJS graph tests",
  citing `solidjs/signals/tests/graph.test.ts`), `tests/Signal/ported/preact.test.ts`
  (citing `preactjs/signals/packages/core/test/signal.test.tsx`) and
  `tests/Signal/ported/vue.test.ts` (citing
  `vuejs/core/packages/reactivity/__tests__/computed.spec.ts`). None of
  `solid-js@1.9.14`, `@solidjs/signals@0.13.13` or `@preact/signals-core@1.14.4` depends on
  `signal-polyfill`. A `js-reactivity-benchmark` adapter registers the polyfill under the
  name `"TC39 Signals Polyfill"` (`tests/benchmarks/adapter.ts`).
- **The README's design-input list** names Angular, Bubble, Ember, FAST, MobX, Preact,
  Qwik, RxJS, Solid, Starbeam, Svelte, Vue and Wiz.

**What they found missing** — only first-party statements, no inference:

- No `effect`, by design (README FAQ).
- No ownership / disposal model. README FAQ: _"The parts which are more framework-specific
  tend to be in the area of effects, scheduling, and ownership/disposal, which this
  proposal does not attempt to solve."_
- No async / loading state (README "Omitted for now", issue #30; and open issue #281,
  2026-04, is a report from someone implementing a fully async signal library).
- No transactions / graph forking for view transitions (README "Omitted for now", #73).
- No uncached computed and no way to invalidate one (issue #151, open; Lit's
  `__forceUpdateSignal` hack).
- Memory: watchers retain the graph; Lit needs `FinalizationRegistry` + `WeakMap` +
  careful closure hygiene to avoid leaking a DOM element. Open issues #254 (_"Consumers can
  unexpectedly hold unused memory in dependencies"_) and #255 (_"Computed signals should
  expose a callback that is invoked when a value is dropped"_) are the proposal-side
  version of the same complaint.
- The README hedges its own memory goal: _"If it is too expensive to execute with these
  semantics, then we should add explicit disposal (or 'unlinking') of computed Signals to
  the API below, **which currently lacks it**."_

**Not established:** issue #116 _"Integration Stories"_ (EisenbergEffect, 2024-04-01, 10
comments) is the canonical place where frameworks reported their experience. Its comment
thread was not retrievable in this session. Someone with GitHub access should read it
before ticket 17 locks the reactivity API.

---

## 9. Implications for ursprung

Checked against the **Locked constraints** on the [map](../map.md). Three genuine
conflicts, three requirements the spec must absorb, one thing that is fine.

### Conflict — constraint 10 (one self-contained ESM file per bundle, duplication accepted)

> _"One self-contained ESM file per bundle. No chunks, no shared extraction, no runtime
> loader. Duplication across route bundles is accepted."_

signal-polyfill's graph lives in three module-level `let`s. **Two copies of it in one realm
are two disjoint graphs, and the cross-copy failure is silent** (§7): a computed from copy B
reading a state from copy A returns a correct value once and then freezes as a constant, with
no error. Constraint 10 explicitly accepts duplicating a dependency across Route bundles.

That is survivable only if **at most one Route bundle is ever live in a document**. Two
places on the map put that in doubt:

- _"The client runtime […] how a resumed page fetches the code for an interaction that
  hasn't loaded yet"_ (Not yet specified). If that code arrives as a second self-contained
  bundle, it carries a second polyfill, and every signal it creates is severed from the
  resumed graph — silently.
- _"Client-side navigation. Whether v0 has it at all"_ (Not yet specified). If it exists
  and loads a second Route bundle without a full document load, the same applies.

**The spec needs a rule.** Either (a) v0 guarantees exactly one Route bundle per document
and every lazily-fetched fragment is a plain module that imports the _already-loaded_
polyfill instance rather than embedding its own, or (b) signal-polyfill is the one module
exempt from the no-shared-extraction rule and is emitted once, or (c) the client runtime
publishes the `Signal` namespace on a well-known global and later fragments consume that.
Whichever it is, it belongs in the spec explicitly, because the failure mode gives no
diagnostic at all.

### Conflict — constraint 6 (dependencies are exactly three, real npm deps, not vendored)

signal-polyfill is `0.2.2`, last published 2025-01-17, last commit 2025-02-13, and its own
README says **"Do not use this in production."** The proposal it polyfills is Stage 1, has
not been to committee since June 2024, and still has open issues questioning the class
name (#272), the constructor shape (#274), the accessor form (#152) and whether `Computed`
should be writable (#277).

Nothing here forces a change to constraint 6 — but the spec should record that ursprung's
fine-grained reactivity rests on an unreleased, explicitly-not-production dependency whose
API names are unsettled, and it should keep the proposal surface behind ursprung's own
reactivity API (ticket 17) so a rename or a swap for a different implementation is a
one-module change. `Signal.State`/`Signal.Computed`/`.get()`/`.set()` should not leak into
the application-facing API or the Resumability payload's vocabulary.

Also: the shipped tarball is Apache-2.0 in the manifest but the majority of the source is
MIT/Google. Worth a line in whatever licence notice ursprung ships.

### Conflict — constraint 12 (streaming SSR, in-order) meets module-global effect scheduling

Every effect recipe in the primary sources — the proposal README, the polyfill README,
`@lit-labs/signals`, the benchmark adapter — uses a **module-scoped** `Signal.subtle.Watcher`
singleton plus `queueMicrotask`. In a Cloudflare Worker, module scope is **per isolate, not
per request**, and one isolate serves many concurrent requests. A module-level Watcher would
be shared across every in-flight Server rendering, and its `queueMicrotask` flush would run
outside any request's context.

The good news: `activeConsumer` cannot leak across an `await`, because computed callbacks are
synchronous by construction (`.get()` returns `T`, and `consumerBeforeComputation` /
`consumerAfterComputation` bracket a synchronous call). So Server rendering that reads
signals is safe from cross-request tracking bleed. The hazard is confined to any _watcher or
scheduler_ ursprung declares at module scope.

**Rule for the spec:** on the server, Server rendering reads signals but installs no Watcher
and schedules no effects — it is a pull, and it should be an untracked one
(`Signal.subtle.untrack`) so nothing is retained. Effects and Watchers exist only in the
client runtime, and any Watcher must be owned by something request- or document-scoped,
never a module-level `let`.

### Requirement — the Resumability payload must carry the graph, and ursprung must own identity

Constraint: _"Resumption: the client continuing an application that was rendered on the
server, without executing the component tree again."_

Signals give ursprung nothing toward this beyond a data structure that tolerates being built
in any order:

- No `toJSON`, no id, no serialisation of any kind (§7). **ursprung must own the id ↔ signal
  map**; the Resumability payload's node ids are ursprung's invention, and the client runtime
  reconstructs the map before any computed is first read.
- `introspectSinks` cannot enumerate unwatched dependents, so **the payload cannot be
  produced by walking the graph after Server rendering.** It must be recorded as the graph is
  built, or derived from the build's static knowledge. Ticket 19 should assume the writer
  side is ursprung's bookkeeping, not introspection.
- **The frozen-constant trap is the single rule the wire format must enforce.** Any
  `Signal.Computed` that is evaluated before its sources are reconstructed becomes a constant
  for the life of the page, silently. Two safe shapes, both verified in §7: a _tripwire_
  generation state, or an _indirection cell_ (`Signal.State` holding the current producer,
  wrapped in a stable `Signal.Computed`). The indirection cell is the better fit — it
  preserves the identity handed to event handlers and `Host` bindings across the moment a
  Client component's code arrives, needs no global generation counter, and is what the
  proposal's own FAQ means by _"a State and Computed signal hooked together"_. It costs one
  extra `Signal.State` and one extra graph edge per resumable cell.
- Corollary: **the client runtime must never `.get()` a resumed computed before the payload
  is fully installed**, or it must use the indirection shape everywhere so that early reads
  are harmless. This is worth stating as an invariant in the spec, not left to discipline.

### Requirement — the bundler must resolve `main`, not just `exports`

`signal-polyfill` has **no `exports` field** (§6). A resolver implementing only the modern
`exports` algorithm cannot resolve it. Constraint 13 says the caller populates the Virtual
filesystem with package files and ursprung only reads it — so ursprung's resolver needs the
`main` fallback path. Constraint 14 (ESM only) is satisfied: `"type": "module"`, `dist/index.js`
is pure ESM with a single named export.

Note also that the tarball ships `src/*.ts` and `tests/*.ts` alongside `dist/`. Constraint 16
says third-party modules are uncoloured and inferred from reachability — only `dist/index.js`
is reachable from `main`, so the TypeScript sources should never enter the graph. Worth a test.

### Fine — constraints 2, 4, 15

- **Constraint 2 (host-agnostic renderer).** Signals are entirely host-agnostic. The README
  is explicit: _"Signals don't need to depend on any DOM APIs"_, _"Signals are independent of
  rendering technology."_ The bundle references only `Object`, `Symbol`, `Error`, `TypeError`,
  `WeakSet`. Nothing about the reactivity layer constrains a future native `Host`.
- **Constraint 4 / 15 (no Node API, `node:*` a hard client error).** Verified by grep over the
  published bundle: no `require(`, no `process`, no `Buffer`, no `node:`, no `__dirname`.
  signal-polyfill is a runtime dependency, not a build module, and touches nothing Node-ish
  either way.
- **Subclassing is available and cheap**, and works with private fields **[verified]**. If
  ursprung wants to hang a node id, a `Host` binding or a payload slot off a signal, extending
  `Signal.State` / `Signal.Computed` costs no extra allocation — the proposal lists this as an
  explicit design goal. That is probably a better answer than a parallel `WeakMap`.

### One thing to decide early

The proposal's `equals` default is `Object.is`, and equality is evaluated **on the way out**
of a computed. ursprung's fine-grained bindings will therefore re-run only when a value
actually changes identity — which is the desired behaviour for text and attribute bindings,
and the wrong behaviour for anything holding a mutated object. Ticket 17 should decide whether
ursprung's application-facing API exposes `equals` at all, or whether it takes the position
that signal values are immutable.
