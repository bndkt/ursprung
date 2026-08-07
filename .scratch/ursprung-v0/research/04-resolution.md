# 04 — ESM resolution and export conditions on workerd and in the browser

Research findings for [issue 04](../issues/04-esm-resolution-and-export-conditions.md).
Map: [Ursprung v0](../map.md). Written 2026-08-07.

Vocabulary follows [`CONTEXT.md`](../../../CONTEXT.md): **module**, **side**, **the
graph**, **virtual filesystem**, **server bundle**, **route bundle**.

---

## 0. Sources and method

Every factual claim below is tagged with `[Sn]`.

| Tag | Source                                                                                                                                                                               | How read                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| S1  | Node.js `doc/api/esm.md` @ `nodejs/node` `main` — "Resolution Algorithm Specification". Published as <https://nodejs.org/api/esm.html#resolution-algorithm-specification>            | raw.githubusercontent, read in full                   |
| S2  | Node.js `doc/api/packages.md` @ `nodejs/node` `main`. Published as <https://nodejs.org/api/packages.html>                                                                            | raw.githubusercontent, read in full                   |
| S3  | Node.js `doc/api/esm.md` @ `nodejs/node` `v24.x`                                                                                                                                     | diffed against S1                                     |
| S4  | Node.js `lib/internal/modules/esm/utils.js` @ `main` (`initializeDefaultConditions`)                                                                                                 | raw.githubusercontent                                 |
| S5  | WinterTC55 Runtime Keys registry, `runtime-keys.json` @ `WinterTC55/runtime-keys` `main` (`version` 1.0.0, `lastModified` 2026-01-20)                                                | raw.githubusercontent, parsed                         |
| S6  | WinterTC55 Runtime Keys Technical Report source, `spec.html` @ same repo (`date: 2026-04-28`, `status: draft-tr`, Ecma TC55)                                                         | raw.githubusercontent, read in full                   |
| S7  | `cloudflare/workers-sdk` `packages/wrangler/src/deployment-bundle/bundle.ts` @ `main` (`getBuildConditions`)                                                                         | raw.githubusercontent                                 |
| S8  | `cloudflare/workers-sdk` `packages/deploy-helpers/src/deploy/helpers/node-compat.ts` and `packages/wrangler/src/deployment-bundle/{no-bundle-worker,maybe-build-worker}.ts` @ `main` | raw.githubusercontent                                 |
| S9  | `cloudflare/workers-sdk` `packages/unenv-preset/src/index.ts` @ `main` (`nonPrefixedNodeModules`)                                                                                    | raw.githubusercontent                                 |
| S10 | `cloudflare/workerd` `src/workerd/io/compatibility-date.capnp` @ `main` **and** at release tags `v1.20260804.1`, `v1.20260801.1`                                                     | raw.githubusercontent, compared                       |
| S11 | Cloudflare docs, `workers/runtime-apis/nodejs/index.mdx` + partial `nodejs-compat-stub-modules.mdx` @ `cloudflare/cloudflare-docs` `production`                                      | raw.githubusercontent, read in full                   |
| S12 | Cloudflare docs, `workers/configuration/compatibility-flags.mdx` @ same, plus the rendered page                                                                                      | raw.githubusercontent + HTML                          |
| S13 | Cloudflare docs, <https://developers.cloudflare.com/workers/platform/limits/>                                                                                                        | cloudflare-docs MCP                                   |
| S14 | esbuild docs, <https://esbuild.github.io/api/> — "Conditions", "How conditions work", "Main fields", "Platform"                                                                      | fetched HTML, read in full                            |
| S15 | Vite docs, `docs/config/ssr-options.md` @ `vitejs/vite` `main`, and `vite.dev/config/shared-options.html`                                                                            | raw.githubusercontent + WebFetch                      |
| S16 | Real published `package.json` files, extracted from **npm tarballs** (see §5)                                                                                                        | `registry.npmjs.org/<pkg>/-/<pkg>-<v>.tgz`, `tar -xO` |
| S17 | This repo: `node_modules/`, `node_modules/.bun/`, `apps/web/node_modules/wrangler/wrangler-dist/experimental-config.d.mts`, `packages/ursprung/package.json`                         | local filesystem                                      |

**Methodological warning that affects any future research on this topic.** The npm
registry's `https://registry.npmjs.org/<pkg>/latest` endpoint returns a `package.json`
whose **object keys have been reordered** (empirically: sorted by key length). Since
condition matching is defined over _insertion order_ (§2.8), reading conditional exports
from that endpoint gives the wrong answer. Example: `capnweb@0.10.0` via `/latest` shows
`{bun, types, import, require, workerd}` — under which `workerd` is unreachable — but the
real tarball ships `{workerd, bun, types, import, require}`. All `package.json` evidence
in §5 is extracted from tarballs `[S16]`.

**Version stability.** The "Resolution Algorithm Specification" section of `esm.md` is
**byte-identical** between `nodejs/node` `main` and the `v24.x` release branch
`[S1][S3]`. The algorithm is stable; implement against it with confidence.

---

## 1. What the resolver is and is not

Node's ESM resolver is a pure function

```
ESM_RESOLVE(specifier: string, parentURL: URL, conditions: Set<string>)
  -> { resolved: URL, format: "module" | "commonjs" | "json" | "wasm" | undefined }
```

over three primitive filesystem reads `[S1]`:

1. does a file exist at URL `u`?
2. does a **directory** exist at URL `u`?
3. read the bytes at `u` (only ever `package.json`, and — in Node — the module source
   for `DETECT_MODULE_SYNTAX`).

Plus one operation Ursprung must decide about explicitly: **realpath** (`ESM_RESOLVE`
step 7.4, "Set `resolved` to the real path of `resolved`") `[S1]`. See §8.1.

Everything else is string and URL manipulation. This is compatible with constraint 13
(the caller populates the virtual filesystem; Ursprung only reads) — with the two caveats
in §8.1 and §8.2.

---

## 2. The resolution algorithm, in implementable form

Transcribed from `[S1]` with Ursprung decisions marked. Notation follows Node's:
**bold** names are subroutines, `→ SKIP` marks a step that exists only for CommonJS,
legacy packages, or Node-only features, and can be omitted from Ursprung's resolver
without breaking any correct ESM-only package.

### 2.1 ESM_RESOLVE(specifier, parentURL)

```
1. resolved := undefined
2. if specifier is a valid absolute URL:
     resolved := reserialize(specifier)          # covers file:, data:, node:, http:
3. else if specifier starts with "/", "./", or "../":
     resolved := URL-resolve(specifier, parentURL)
4. else if specifier starts with "#":
     resolved := PACKAGE_IMPORTS_RESOLVE(specifier, parentURL, conditions)
5. else:
     # specifier is a bare specifier
     resolved := PACKAGE_RESOLVE(specifier, parentURL)
6. format := undefined
7. if resolved is a "file:" URL:
     a. if resolved contains "%2F" or "%5C" (any case): throw Invalid Module Specifier
     b. if resolved is a directory:      throw Unsupported Directory Import
     c. if resolved does not exist:      throw Module Not Found
     d. resolved := realpath(resolved), preserving ?query and #fragment
     e. format := ESM_FILE_FORMAT(resolved)
8. else:
     format := format implied by the URL's content type
9. return (format, resolved)
```

Notes for Ursprung:

- Step 2 fires **before** the `#` and bare-specifier branches. `node:fs` is a valid URL,
  so it lands here, not in `PACKAGE_RESOLVE` step 3. Both paths reach the same place;
  Node has the redundant check in `PACKAGE_RESOLVE` for the CJS entry point.
- Step 7b/7c mean **no extension probing and no directory index**. `import "./foo"` when
  only `./foo.ts` exists is an error, and `import "./dir"` when `./dir/index.js` exists is
  an error. This is stated twice in the docs: "The resolution of `import`/`import()` does
  not support folders as modules, directory indexes (e.g. `'./startup/index.js'`) must be
  fully specified. It does not perform extension searching." `[S2 §"Module resolution and
loading"]`, and in the resolver feature list: "No default extensions / No folder mains"
  `[S1 §Features]`. Extension probing (`.js`, `.json`, `.node`) and folders-as-modules
  belong exclusively to `require()` `[S2]`. **→ SKIP both.**
- Step 7d (realpath) — see §8.1. This is the single step where a real filesystem gives
  Node something a `Map`-backed virtual filesystem does not.
- Ursprung will want an extra step between 7c and 7e: apply its own **externals** rule
  (`node:*` external on the server, hard error on the client — constraint 15) and its own
  extension policy (`.ts`/`.tsx` are first-party; third-party packages ship `.js`/`.mjs`).

### 2.2 PACKAGE_RESOLVE(packageSpecifier, parentURL)

```
 1. packageName := undefined
 2. if packageSpecifier == "": throw Invalid Module Specifier
 3. if packageSpecifier is a Node builtin name: return "node:" + packageSpecifier   # → SKIP*
 4. if packageSpecifier does not start with "@":
      packageName := substring up to the first "/" (or the whole string)
 5. else:
      if packageSpecifier contains no "/": throw Invalid Module Specifier
      packageName := substring up to the SECOND "/" (or the whole string)
 6. if packageName starts with "." or contains "\" or "%": throw Invalid Module Specifier
 7. packageSubpath := "." + packageSpecifier.slice(packageName.length)
      # "lodash"        -> packageName "lodash",     packageSubpath "."
      # "lodash/fp"     -> packageName "lodash",     packageSubpath "./fp"
      # "@scope/a/b"    -> packageName "@scope/a",   packageSubpath "./b"
 8. selfUrl := PACKAGE_SELF_RESOLVE(packageName, packageSubpath, parentURL)
 9. if selfUrl is not undefined: return selfUrl
10. while parentURL is not the filesystem root:
      a. packageURL := URL-resolve("node_modules/" + packageName, parentURL)
      b. parentURL  := parent folder of parentURL
      c. if the FOLDER at packageURL does not exist: continue
      d. pjson := READ_PACKAGE_JSON(packageURL)
      e. if pjson != null and pjson.exports is neither null nor undefined:
           return PACKAGE_EXPORTS_RESOLVE(packageURL, packageSubpath, pjson.exports, conditions)
      f. else if packageSubpath == ".":
           if pjson.main is a string: return URL-resolve(pjson.main, packageURL)
      g. else:
           return URL-resolve(packageSubpath, packageURL)
11. throw Module Not Found
```

`→ SKIP*` — step 3 is redundant given `ESM_RESOLVE` step 2 for _prefixed_ specifiers, but
it is what makes **unprefixed** builtins (`import "fs"`) resolve in Node. Ursprung should
keep an equivalent check, but keyed on its own externals policy rather than Node's builtin
list. See §7.4 for why unprefixed builtins matter on workerd.

Three steps in this routine are **not** skippable even though they look legacy:

- **10e is `!= null && != undefined`, not truthiness.** An `"exports": null` or
  `"exports": {}` still takes the `exports` branch and then fails with _Package Path Not
  Exported_ — it does **not** fall through to `main`. `exports` is an on/off switch for
  encapsulation `[S2 §"Package entry points"]`.
- **10f (`main`) is load-bearing for real ESM-only packages.** `signal-polyfill@0.2.2` —
  one of Ursprung's three locked dependencies (constraint 6) — has no `exports` field at
  all: `{"type": "module", "main": "dist/index.js", "types": "dist/index.d.ts"}` `[S16]`.
  So does `node-fetch@3.3.2` `[S16]`. **Do not skip `main`.**
- **10g (bare subpath, no `exports`) is load-bearing too.** With `signal-polyfill`,
  `import "signal-polyfill/dist/wrapper.js"` resolves as a plain relative path inside the
  package directory. Cheap to implement, and the only way subpaths work for
  `exports`-less packages.

There is **no `module` field** in this algorithm. `module` is a bundler convention, not
part of Node resolution; Node's `package.json` field list is exactly `name`, `main`,
`type`, `exports`, `imports` `[S2 §"Node.js package.json field definitions"]`. esbuild
and Vite consult `module` through their `mainFields` setting `[S14][S15]`. See §4.6.

### 2.3 PACKAGE_SELF_RESOLVE(packageName, packageSubpath, parentURL) — **keep**

```
1. packageURL := LOOKUP_PACKAGE_SCOPE(parentURL)
2. if packageURL is null: return undefined
3. pjson := READ_PACKAGE_JSON(packageURL)
4. if pjson is null or pjson.exports is null/undefined: return undefined
5. if pjson.name == packageName:
     return PACKAGE_EXPORTS_RESOLVE(packageURL, packageSubpath, pjson.exports, conditions)
6. return undefined
```

Self-referencing "is available only if `package.json` has `exports`, and will allow
importing only what that `exports` allows" `[S2]`. It is ~15 lines and it matters
immediately: `packages/ursprung/package.json` has `"exports": {".": "./src/index.ts"}`
`[S17]`, so a module inside `packages/ursprung` writing `import { … } from "ursprung"`
depends on this. Under constraint 5 the published surface grows to
`ursprung/jsx-runtime`, `ursprung/client`, `ursprung/server`, `ursprung/build` — all of
which the framework's own modules will reference by name.

### 2.4 PACKAGE_EXPORTS_RESOLVE(packageURL, subpath, exports, conditions)

```
1. if exports is an Object with BOTH a key starting with "." and a key not starting with ".":
     throw Invalid Package Configuration
2. if subpath == ".":
     mainExport := undefined
     if exports is a String or Array, or an Object with no keys starting with ".":
       mainExport := exports                       # the "exports sugar" / bare-conditions form
     else if exports is an Object with a "." property:
       mainExport := exports["."]
     if mainExport is not undefined:
       resolved := PACKAGE_TARGET_RESOLVE(packageURL, mainExport, null, false, conditions)
       if resolved is neither null nor undefined: return resolved
3. else if exports is an Object and ALL keys start with ".":
     assert subpath starts with "./"
     resolved := PACKAGE_IMPORTS_EXPORTS_RESOLVE(subpath, exports, packageURL, false, conditions)
     if resolved is neither null nor undefined: return resolved
4. throw Package Path Not Exported
```

Step 1 is the rule that makes `{"." : "./a.js", "import": "./b.js"}` a hard error. Step 2's
"Object with no keys starting with `.`" is what makes the **bare-conditions** form work:

```json
"exports": { "types": "./index.d.ts", "default": "./index.js" }
```

which is what `chalk@6.0.0`, `execa@10.0.1`, `p-limit@7.3.1` and `globby@16.2.2` ship
`[S16]`. `strip-ansi@7.2.0` uses the string form, `"exports": "./index.js"` `[S16]`. Both
forms are common in modern ESM-only packages; neither is skippable.

Note what step 3 implies: for a subpath, an `exports` object **must** have all-dot keys.
An `exports` that is a bare-conditions object (no `.` keys) exposes _only_ `"."`, so
`import "chalk/foo"` is _Package Path Not Exported_ by construction.

### 2.5 PACKAGE_IMPORTS_RESOLVE(specifier, parentURL, conditions) — **keep**

```
1. assert specifier starts with "#"
2. if specifier == "#": throw Invalid Module Specifier
3. packageURL := LOOKUP_PACKAGE_SCOPE(parentURL)
4. if packageURL is not null:
     pjson := READ_PACKAGE_JSON(packageURL)
     if pjson.imports is a non-null Object:
       resolved := PACKAGE_IMPORTS_EXPORTS_RESOLVE(specifier, pjson.imports, packageURL,
                                                   isImports = true, conditions)
       if resolved is neither null nor undefined: return resolved
5. throw Package Import Not Defined
```

`imports` is live in current ESM-only packages, not a curiosity. `chalk@6.0.0` `[S16]`:

```json
"imports": {
  "#ansi-styles": "./source/vendor/ansi-styles/index.js",
  "#supports-color": {
    "node": "./source/vendor/supports-color/index.js",
    "default": "./source/vendor/supports-color/browser.js"
  }
}
```

Two rules differ from `exports` `[S2 §"Subpath imports"]`:

- keys **must** start with `#` (Node ≥ v25.4.0/v24.14.0 additionally allows `#/…` — a
  recent relaxation, unimportant for us);
- **`imports` targets may be bare specifiers of external packages**, unlike `exports`.
  That is the `isImports = true` branch in §2.8 step 1a. A resolver that forgets this
  throws _Invalid Package Target_ on `{"#dep": {"node": "dep-node-native", …}}`.

### 2.6 PACKAGE_IMPORTS_EXPORTS_RESOLVE(matchKey, matchObj, packageURL, isImports, conditions)

```
1. if matchKey ends with "/": throw Invalid Module Specifier   # trailing-slash form is dead
2. if matchKey is a key of matchObj and contains no "*":
     return PACKAGE_TARGET_RESOLVE(packageURL, matchObj[matchKey], null, isImports, conditions)
3. expansionKeys := keys of matchObj containing exactly one "*",
                    sorted by PATTERN_KEY_COMPARE (descending specificity)
4. for each expansionKey in expansionKeys:
     patternBase := expansionKey up to (excluding) the first "*"
     if matchKey starts with patternBase AND matchKey != patternBase:
       patternTrailer := expansionKey after the first "*"
       if patternTrailer == "" OR (matchKey ends with patternTrailer
                                   AND matchKey.length >= expansionKey.length):
         target       := matchObj[expansionKey]
         patternMatch := matchKey.slice(patternBase.length,
                                        matchKey.length - patternTrailer.length)
         return PACKAGE_TARGET_RESOLVE(packageURL, target, patternMatch, isImports, conditions)
5. return null
```

```
PATTERN_KEY_COMPARE(keyA, keyB):
  baseLengthA := index of "*" in keyA;  baseLengthB := index of "*" in keyB
  if baseLengthA > baseLengthB: return -1
  if baseLengthB > baseLengthA: return  1
  if keyA.length > keyB.length: return -1
  if keyB.length > keyA.length: return  1
  return 0
```

Exact keys beat patterns (step 2 runs before step 3). Among patterns, the longest prefix
before `*` wins; ties broken by total key length. Both comparisons are on **UTF-16 code
unit length**, not code points — matching JS `String.prototype.length`.

Subpath patterns are "a direct static matching and replacement without any special
handling for file extensions", and "**All instances of `*` on the right hand side will
then be replaced with this value, including if it contains any `/` separators**"
`[S2 §"Subpath patterns"]`. So `"./features/*.js": "./src/features/*.js"` maps
`pkg/features/y/y.js` → `./src/features/y/y.js`.

`null` targets exclude subpaths from a pattern: `"./features/private-internal/*": null`
`[S2]`. Cheap; keep it (see §2.8 step 4).

### 2.7 Wildcard evidence from real packages `[S16]`

| Package             | Pattern                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `solid-js@1.9.14`   | `"./dist/*": "./dist/*"`, `"./types/*": "./types/*"`, `"./store/dist/*"`, `"./web/dist/*"` … |
| `unenv@2.0.0-rc.24` | `"./*": { "types": "./dist/runtime/*.d.mts", "default": "./dist/runtime/*.mjs" }`            |
| `zod@4.4.3`         | `"./v4/locales/*": { "types": "./v4/locales/*", "import": "./v4/locales/*", … }`             |
| `tslib@2.8.1`       | `"./": "./"` **and** `"./*": "./*"`                                                          |

`tslib`'s `"./"` key is the deprecated trailing-slash folder mapping; §2.6 step 1 throws
_Invalid Module Specifier_ only when the **matchKey** ends in `/`, so a `"./"` _key_ is
simply never matched by any valid subpath — harmless dead weight. `"./*": "./*"` is the
live one.

### 2.8 PACKAGE_TARGET_RESOLVE(packageURL, target, patternMatch, isImports, conditions) — the core

```
1. if target is a String:
     a. if target does not start with "./":
          i.   if isImports is false, OR target starts with "../" or "/", OR target is a valid URL:
                 throw Invalid Package Target
          ii.  if patternMatch is a String:
                 return PACKAGE_RESOLVE(target with every "*" replaced by patternMatch,
                                        packageURL + "/")
          iii. return PACKAGE_RESOLVE(target, packageURL + "/")
     b. if target, split on "/" or "\", contains any "", ".", "..", or "node_modules"
        segment after the first "." segment — case-insensitive, including percent-encoded
        variants — throw Invalid Package Target
     c. resolvedTarget := URL-resolve(target, packageURL)
     d. assert packageURL is a prefix of resolvedTarget
     e. if patternMatch is null: return resolvedTarget
     f. if patternMatch, split on "/" or "\", contains any "", ".", "..", or "node_modules"
        segment — case-insensitive, including percent-encoded variants —
        throw Invalid Module Specifier
     g. return URL-resolve(resolvedTarget with every "*" replaced by patternMatch)

2. else if target is a non-null Object:
     a. if target has any "array index" property keys (ECMA-262 6.1.7):
          throw Invalid Package Configuration
     b. FOR EACH property p OF target, IN OBJECT INSERTION ORDER:
          if p == "default" OR conditions contains p:
            resolved := PACKAGE_TARGET_RESOLVE(packageURL, target[p], patternMatch,
                                               isImports, conditions)
            if resolved is undefined: CONTINUE the loop      # fall through to next condition
            return resolved
     c. return undefined

3. else if target is an Array:
     a. if target.length == 0: return null
     b. for each targetValue in target:
          resolved := PACKAGE_TARGET_RESOLVE(...); on Invalid Package Target, CONTINUE
          if resolved is undefined: CONTINUE
          return resolved
     c. return or throw the last fallback's null return or error

4. else if target is null: return null

5. else: throw Invalid Package Target
```

Five things here are the whole ballgame, and each is a common implementation bug:

1. **Conditions are matched in the order the keys appear _in the package's JSON_, not in
   the order of our condition list** (step 2b). Node's condition set is literally a
   `SafeSet` `[S4]`; esbuild agrees — "Conditions are checked in the order that they
   appear within the JSON file" `[S14]`. **Our "ordered condition list" is therefore
   documentation only; its order has no effect on resolution.** The docs say the _package
   author_ is responsible for ordering "from most specific to least specific"
   `[S2 §"Conditional exports"]`.
2. **`"default"` always matches**, even if it is not in our condition set (step 2b).
3. **Nested conditions fall through** (step 2b `CONTINUE`): "If a nested condition does
   not have any mapping it will continue checking the remaining conditions of the parent
   condition. In this way nested conditions behave analogously to nested JavaScript `if`
   statements." `[S2 §"Nested conditions"]`.
4. **`null` (step 4) and `undefined` (step 2c) are different from throwing.** `null`
   propagates up and ends in _Package Path Not Exported_; `undefined` means "keep
   looking".
5. **`isImports` gates external-package targets** (step 1a). This is the only place the
   `imports`/`exports` asymmetry lives.

Implementation trap that is not in the spec because the spec is written over abstract
objects: **do a own-property lookup, not a prototype-chain lookup**, when matching
condition keys and subpath keys. `JSON.parse` produces objects with `Object.prototype` on
the chain, so a naive `if (target[p] !== undefined)` treats `toString`, `constructor`,
`valueOf` etc. as present conditions. Use `Object.hasOwn`, or reparse with
`JSON.parse(text, reviver)` into null-prototype objects. Step 2a's "array index property
keys" check exists for a related reason (JS objects order integer-like keys first, which
would silently reorder conditions).

### 2.9 ESM_FILE_FORMAT(url)

```
 1. assert url exists
 2. if url ends ".mjs":  return "module"
 3. if url ends ".cjs":  return "commonjs"
 4. if url ends ".json": return "json"
 5. if url ends ".wasm": return "wasm"                                    # → SKIP
 6. if --experimental-addon-modules and url ends ".node": return "addon"  # → SKIP
 7. packageURL  := LOOKUP_PACKAGE_SCOPE(url)
 8. pjson       := READ_PACKAGE_JSON(packageURL)
 9. packageType := null
10. if pjson?.type is "module" or "commonjs": packageType := pjson.type
11. if url ends ".js":
      if packageType is not null: return packageType
      if DETECT_MODULE_SYNTAX(source): return "module"                    # → SKIP (see §6)
      return "commonjs"
12. if url has no extension:
      … (wasm content-type sniff, then packageType, then syntax detection)  # → SKIP
13. return undefined                                                       # → load-phase throw
```

```
LOOKUP_PACKAGE_SCOPE(url):
  scopeURL := url
  while scopeURL is not the filesystem root:
    scopeURL := parent of scopeURL
    if scopeURL ends in a "node_modules" path segment: return null   # ← the boundary
    if <scopeURL>/package.json exists: return scopeURL
  return null

READ_PACKAGE_JSON(packageURL):
  if <packageURL>/package.json does not exist: return null
  if it does not parse as valid JSON: throw Invalid Package Configuration
  return the parsed JSON
```

`LOOKUP_PACKAGE_SCOPE` returning `null` on a `node_modules` segment is what stops
`type` from leaking across the package boundary. Note the loop starts by moving to the
**parent** — a file's own directory is checked, a directory URL's own `package.json` is
not. Nested `package.json` files inside a package _do_ count: this is how a package ships
a `{"type":"commonjs"}` marker in a `dist/cjs/` subdirectory `[S2 §"`type`"]`.

`"type"`'s full role, from `[S2]`:

- `.mjs` → always ESM, `.cjs` → always CJS, **regardless of `type`**;
- `.js` → ESM iff the nearest parent `package.json` has `"type": "module"`;
- "If the nearest parent `package.json` lacks a `type` field, or contains
  `"type": "commonjs"`, `.js` files are treated as CommonJS."

### 2.10 The skip list, consolidated

| Feature                                                                | Why it exists          | Verdict for Ursprung v0                                      |
| ---------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| Extension probing (`.js`/`.json`/`.node`)                              | `require()` only       | **skip** `[S1][S2]`                                          |
| Directory index / folders-as-modules (`./dir` → `./dir/index.js`)      | `require()` only       | **skip** `[S1][S2]`                                          |
| `require` condition                                                    | CJS                    | **skip** (never in the set)                                  |
| `node-addons` condition, `.node` addons, `--no-addons`                 | native addons          | **skip**                                                     |
| `module-sync` condition                                                | `require(esm)`         | **skip** — Node only adds it under `--require-module` `[S4]` |
| `DETECT_MODULE_SYNTAX` for extensionless / `type`-less `.js`           | ambiguity fallback     | **skip**, but see §6                                         |
| `.wasm` / addon module formats                                         | Node features          | **skip**                                                     |
| `data:` URL specifiers                                                 | Node feature           | **skip** (or hard-error)                                     |
| `--experimental-package-map` (Node `main` only) `[S2 §"Package maps"]` | unreleased Node        | **skip**                                                     |
| `PACKAGE_RESOLVE` step 3 builtin check                                 | unprefixed `node:`     | **replace** with Ursprung's externals rule (§7.4)            |
| `main` field (step 10f)                                                | pre-`exports` packages | **KEEP** — `signal-polyfill` needs it                        |
| Bare subpath without `exports` (step 10g)                              | pre-`exports` packages | **KEEP** — cheap, same reason                                |
| `imports` / `#` specifiers                                             | live ESM feature       | **KEEP** — `chalk`                                           |
| Self-reference                                                         | live ESM feature       | **KEEP** — `ursprung` itself                                 |
| Array fallback targets                                                 | rare but spec'd        | **KEEP** — ~10 lines                                         |
| `null` targets                                                         | subpath blocking       | **KEEP** — ~2 lines                                          |
| `*` subpath patterns                                                   | very common            | **KEEP** — `solid-js`, `unenv`, `zod`, `tslib`               |
| Encapsulation errors (_Package Path Not Exported_)                     | correctness            | **KEEP** — required to produce constraint-14-shaped errors   |

The kept set is roughly 250–350 lines of TypeScript. There is no smaller correct subset:
every "KEEP" above is exercised by a package Ursprung already depends on or by one in the
top tier of npm.

---

## 3. Interlude — what the algorithm does _not_ give us

Not asked in the ticket but consequential for ticket 13:

- **Version selection.** `PACKAGE_RESOLVE` step 10's walk up `node_modules` is the whole
  of it. There is no manifest, no lockfile, no dedupe. Two copies of a package at
  different depths are two different modules. Under constraint 13 this is entirely
  determined by how the caller lays out the virtual filesystem.
- **A file/directory distinction is required.** Step 10c tests for a _folder_, step 7b
  tests for a _directory_. A virtual filesystem that is a flat `Map<string, string>` has
  no directories; "directory exists at `p`" must be defined as "some key starts with
  `p + "/"`". This must be pinned down in the virtual filesystem interface, not left to
  each call site.

---

## 4. Conditions

### 4.1 Node core conditions — the complete set

From `[S2 §"Conditional exports"]`, verbatim in Node's own most-specific-first order:

| Condition     | Definition                                                                                                                                                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-addons` | "similar to `node` and matches for any Node.js environment… provide an entry point which uses native C++ addons". Disabled by `--no-addons`.                                                                                                               |
| `node`        | "matches for any Node.js environment. Can be a CommonJS or ES module file."                                                                                                                                                                                |
| `import`      | "matches when the package is loaded via `import` or `import()`, or via any top-level import or resolve operation by the ECMAScript module loader. Applies regardless of the module format of the target file. _Always mutually exclusive with `require`._" |
| `require`     | "matches when the package is loaded via `require()`… _Always mutually exclusive with `import`._"                                                                                                                                                           |
| `module-sync` | "matches no matter the package is loaded via `import`, `import()` or `require()`. The format is expected to be ES modules that does not contain top-level await in its module graph".                                                                      |
| `default`     | "the generic fallback that always matches… _This condition should always come last._"                                                                                                                                                                      |

Node's **actual** default ESM condition array is `["node", "import"]`, plus
`"module-sync"` only under `--require-module`, plus `"node-addons"` unless `--no-addons`,
plus anything from `--conditions` `[S1 §"Resolution algorithm"][S4]`.

### 4.2 Node "community conditions"

From `[S2 §"Community Conditions Definitions"]` — these are **not implemented by Node
core** ("Condition strings other than… are ignored by default"):

| Condition     | Definition (verbatim)                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `types`       | "can be used by typing systems to resolve the typing file for the given export. _This condition should always be included first._" |
| `browser`     | "any web browser environment."                                                                                                     |
| `development` | "can be used to define a development-only environment entry point… _Must always be mutually exclusive with `production`._"         |
| `production`  | "can be used to define a production environment entry point… _Must always be mutually exclusive with `development`._"              |

Node's naming rules for custom conditions `[S2 §"Resolving user conditions"]`: at least
one character; may not start with `.`; may not contain `,`; may not be an integer property
key like `"10"`. "Typical conditions should only contain alphanumerical characters, using
`:`, `-`, or `=` as separators if necessary."

### 4.3 The WinterTC55 Runtime Keys registry — complete, as of `lastModified` 2026-01-20

The registry moved from WinterCG to **Ecma TC55** (WinterTC55). The canonical
machine-readable source is `runtime-keys.json` in `WinterTC55/runtime-keys`; the human
report is an Ecma Technical Report, `status: draft-tr`, published semi-annually
`[S5][S6]`. Note the registry's own scope note: "These keys are not intended to be used
in web browsers, which should be referenced by other mechanisms such as the browserslist
project." `[S6 §Scope]`

All 23 registered keys, none currently deprecated `[S5]`:

`andromeda`, `arvancloud`, `azion`, `bun`, `convex`, `deno`, `edge-light` (Vercel),
`edge-routine` (Alibaba Cloud), `electron`, `fastly`, `kiesel`, `lagon`, `moddable`,
`netlify`, `node`, `quickjs`, `quickjs-ng`, `pythonmonkey`, `react-native`,
`react-server` (React — Server Components), `rhino`, `wasmer`, **`workerd` (Cloudflare)**.

Facts worth carrying into the spec:

- **`workerd` is the registered key for Cloudflare Workers** `[S5]`, and the report's own
  worked example uses it: `"exports": { "node": …, "deno": …, "bun": …, "workerd": … }`
  `[S6 §"package.json example"]`.
- **`worker` is _not_ in the registry.** It is a de-facto bundler condition. It is
  nonetheless what `react-dom` and `solid-js` branch on `[S16]` and what wrangler sets
  `[S7]`.
- Keys in the registry are **immutable** once accepted `[S6 §"Key immutability"]`, so
  `workerd` is safe to hard-code.

### 4.4 What Cloudflare's own toolchain uses

`wrangler` sets, for every Worker build `[S7]`:

```ts
export function getBuildConditions() {
  const envVar = getBuildConditionsFromEnv();
  if (envVar !== undefined) return envVar.split(",");
  else return ["workerd", "worker", "browser"];
}
```

with the accompanying comment: "Whether or not we set custom conditions the `default`
condition will always be active. If the Worker is using ESM syntax, then the `import`
condition will also be active. Moreover the following applies: if the platform is set to
`browser` (the default) then the `browser` condition will be active" `[S7]`. Wrangler's
esbuild `platform` defaults to esbuild's own default, `browser`, and is overridable only
via `WRANGLER_BUILD_PLATFORM` `[S7]`.

So the effective wrangler condition set for an ESM Worker is:

```
{ workerd, worker, browser, import, default }
```

and — because esbuild only auto-includes `module` "when no custom conditions are
configured. If there are any custom conditions configured (even an empty list) then this
condition will no longer be automatically included" `[S14]` — **`module` is _not_ active
in wrangler builds**. `mainFields` is not set by wrangler `[S7]`, so esbuild's
`platform: browser` default applies: `browser, module, main` `[S14 §Platform]`.

I could **not** find any evidence that `workerd` itself performs `package.json`/`exports`
resolution. Everything I read points the other way: a deployed Worker is a flat set of
named modules, and all `node_modules` resolution happens in wrangler's esbuild pass
`[S7][S8]`. Treat "does workerd resolve packages?" as **unestablished but almost certainly
no** — and irrelevant under constraint 10, since Ursprung emits one self-contained file.

### 4.5 What browsers and bundlers conventionally use

- **esbuild**, `platform: browser` (the default): conditions `{browser, module*, default,
import|require}`; main fields `browser, module, main` with the special rule that "if a
  package provides `module` and `main` entry points but not a `browser` entry point then
  `main` is used instead of `module` if that package is ever imported using `require()`"
  `[S14]`. `*module` only when no custom conditions are set.
- **Vite** client: `resolve.conditions` defaults to
  `['module', 'browser', 'development|production']` (`defaultClientConditions`);
  `resolve.mainFields` defaults to `['browser', 'module', 'jsnext:main', 'jsnext']`
  `[S15]`.
- **Vite** server/SSR: `ssr.resolve.conditions` defaults to
  `['module', 'node', 'development|production']` (`defaultServerConditions`) — **except**
  that for `ssr.target === 'webworker'` it uses the _client_ list,
  `['module', 'browser', 'development|production']` `[S15]`. That is a direct precedent
  for Ursprung's server target using `browser` rather than `node`.
- **Browsers themselves have no condition mechanism.** Import maps have no conditional
  branch; the browser only sees whatever the bundler emitted. `browser` is a bundler
  condition, and the Runtime Keys report explicitly declines to cover browsers `[S6]`.

Vite's `development|production` is a **placeholder that Vite substitutes** by `NODE_ENV`,
not a literal condition name `[S15]`.

### 4.6 `module` — the awkward one

`module` is not in Node's core list, not in Node's community list, and not in the Runtime
Keys registry. The only first-party definition I found is esbuild's `[S14]`:

> This condition can be used to tell esbuild to pick the ESM variant for a given import
> path to provide better tree-shaking when bundling. This condition is not active when you
> run your code natively in node. It is specific to bundlers, and originated from Webpack.
> … unlike `import`, the `module` condition is always active even if the import path was
> loaded using a `require` call.

For Ursprung — which only ever imports, never requires — `module` is nearly redundant with
`import`. The one case it buys us is a package that offers `{"module": <esm>, "default":
<cjs>}` with no `import` key; without `module` we would land on `default` → CJS → hard
error under constraint 14, even though an ESM build exists on disk. `tslib@2.8.1` is close
to that shape (`{import: {…}, module: {…}, default: "./tslib.js"}` `[S16]`) but is saved
by having `import` first.

**Judgement, not fact:** include `module` on both targets. Cost: a package that (per
esbuild's warning) misuses `module` to mean "browser code" could give the server bundle a
browser build — but our server condition set already prefers `browser` anyway (§4.7), so
the exposure is close to nil. This is reversible and low-stakes; note it as a decision,
not a finding.

### 4.7 Recommended condition sets

**Restating the crucial precision point:** Node's algorithm consumes conditions as a
**set** (`SafeSet` `[S4]`; membership test in §2.8 step 2b). The order below is
presentation only — it is the conventional most-specific-first order and is what should
be written in docs and diagnostics, but changing it changes nothing. Precedence is owned
by the package author's key order.

#### Server target (Ursprung server bundle, running on workerd)

```
["workerd", "worker", "browser", "module", "production", "import"]
   + "default", which is always active and must not be listed
```

Rationale, per entry:

| Condition    | Why                                                                                                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workerd`    | The registered Runtime Key for our host `[S5]`. Immutable `[S6]`. `capnweb` (a locked dependency) and `react-dom` both branch on it `[S16]`.                                                                              |
| `worker`     | Unregistered but load-bearing: `react-dom`'s `./server` and every `solid-js` entry branch on `worker` and not on `workerd` `[S16]`. Wrangler sets it `[S7]`.                                                              |
| `browser`    | Workers expose web APIs, not Node APIs. Wrangler sets it `[S7]`; Vite's `ssr.target: 'webworker'` does the same `[S15]`. It is what makes `nanoid` pick `index.browser.js` (Web Crypto) instead of `node:crypto` `[S16]`. |
| `module`     | See §4.6. Judgement call.                                                                                                                                                                                                 |
| `production` | Constraint 11 says there is no dev server, so every build is a production build. Node requires the pair be mutually exclusive `[S2]`; pick exactly one.                                                                   |
| `import`     | We are an ESM-only importer (constraint 14).                                                                                                                                                                              |

Deliberately **excluded**, each for a reason worth recording:

- `require` — constraint 14. Including it would silently resolve CJS instead of erroring.
- `node` — resolving a package's `node` branch pulls in `node:*` builtins that constraint 15
  leaves external and that `nodejs_compat` covers only partially (§7). `workerd`/`worker`/
  `browser` branches are the ones package authors write _for us_. This matches wrangler
  `[S7]`. Reversible if a real package forces it.
- `types` — would resolve to `.d.ts` files. Note that `types` is conventionally the
  **first** key in most conditional exports objects (`chalk`, `preact`, `zod`, `hono`,
  `kleur`, `pathe`, `date-fns` `[S16]`), so including it by accident is catastrophic and
  silent. Worth an assertion in the resolver.
- `development` — mutually exclusive with `production` `[S2]`.
- `react-server` — would resolve `react-dom` to React Server Components builds `[S16]`.
- `default` — never listed; it always matches (§2.8 step 2b).
- `edge-light`, `deno`, `bun`, `node-addons`, `module-sync`, `umd` — other runtimes /
  other module systems. `edge-light` is tempting (Vercel Edge is also workerd-shaped, and
  `react-dom` maps `edge-light` and `workerd` to the same file `[S16]`) but it is a
  _different_ registered runtime key `[S5]` and claiming it is a lie about our identity.

#### Client target (Ursprung route bundle, running in a browser)

```
["browser", "module", "production", "import"]
   + "default", always active
```

Same exclusions as above, plus `workerd` and `worker`. Note that `worker` on the client is
wrong even though route bundles could conceivably run in a Web Worker — `worker` in
practice means "non-DOM JS environment" to package authors (`solid-js` maps `worker` to
its **server** build `[S16]`), which is the opposite of what a route bundle wants.

#### The `development`/`production` interaction, precisely

- Node core implements neither; both are "community conditions" `[S2 §"Community
Conditions Definitions"]`, reachable only via `--conditions`/`-C`.
- The only normative rule is mutual exclusivity: each "must always be mutually exclusive
  with" the other `[S2]`.
- Real usage nests them _under_ an environment branch and always leaves a fall-through:
  `@lit/reactive-element@2.1.2` has `{node: {default, development}, types, browser:
{default, development}, default, development}` and `solid-js@1.9.14` has
  `browser: {development: {…}, types, import, require}` `[S16]`. Because §2.8 step 2b
  matches in **file order** and `default` always matches, `@lit/reactive-element`'s
  `development` key sits _after_ `default` inside each branch and is therefore
  **unreachable** — its dev builds are effectively dead in a spec-conformant resolver.
  `solid-js` puts `development` first and it works. Do not assume packages get this right.
- Vite's convention is to always set exactly one of the two `[S15]`. Ursprung should do
  the same, and since constraint 11 rules out a dev mode, that one is `production`.

---

## 5. How real ESM-only packages actually declare themselves

All manifests below were extracted from published tarballs, preserving key order `[S16]`.

### 5.1 The five shapes that cover most of it

**(a) Bare-conditions object, no subpaths** — `chalk@6.0.0`, `execa@10.0.1`,
`p-limit@7.3.1`, `globby@16.2.2`:

```json
{
  "type": "module",
  "exports": { "types": "./index.d.ts", "default": "./index.js" },
  "sideEffects": false
}
```

**(b) String sugar** — `strip-ansi@7.2.0`: `{"type": "module", "exports": "./index.js"}`.

**(c) No `exports` at all** — `signal-polyfill@0.2.2` (**Ursprung's own dependency**) and
`node-fetch@3.3.2`:

```json
{ "type": "module", "main": "dist/index.js", "types": "dist/index.d.ts" }
```

This is the case that kills a resolver which implements only `exports`.

**(d) Dual `import`/`require` with nested `types`** — `pathe@2.0.3`, `date-fns@4.4.0`,
`remeda@2.39.0`, `hono@4.13.1`, `kleur@4.1.5`, `itty-router@5.0.24`:

```json
"exports": { ".": { "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
                    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" } } }
```

Under an ESM-only condition set these are ESM-resolvable; the CJS half is simply never
reached. **They are not CJS-only packages** and must not be rejected.

**(e) `imports` with `#` specifiers** — `chalk@6.0.0` (quoted in §2.5).

### 5.2 The awkward ones

**`capnweb@0.10.0` — a locked Ursprung dependency `[S16]`:**

```json
"main": "dist/index.js",
"type": "module",
"exports": { ".": {
  "workerd": { "types": "./dist/index.d.ts", "import": "./dist/index-workers.js",
               "require": "./dist/index-workers.cjs" },
  "bun":     { "types": "./dist/index-bun.d.ts", "import": "./dist/index-bun.js",
               "require": "./dist/index-bun.cjs" },
  "types":   "./dist/index.d.ts",
  "import":  "./dist/index.js",
  "require": "./dist/index.cjs" } }
```

Correctly ordered: `workerd` first. **Ursprung must send `workerd` on the server target or
it silently gets the generic build.** Note `capnweb` also exercises nested conditions and
the `types`-first convention.

**`react-dom@19.2.8` — the widest condition fan-out in the wild `[S16]`:**

```json
"./server": { "react-server": "./server.react-server.js",
              "workerd":  "./server.edge.js",
              "bun":      "./server.bun.js",
              "deno":     "./server.browser.js",
              "worker":   "./server.browser.js",
              "node":     "./server.node.js",
              "edge-light": "./server.edge.js",
              "browser":  "./server.browser.js",
              "default":  "./server.node.js" }
```

Nine sibling conditions, no nesting, `default` last, `workerd` second. Also carries a
**legacy `browser` map field** alongside: `"browser": {"./server.js":
"./server.browser.js", "./static.js": "./static.browser.js"}` — the bundler-only
file-substitution form documented by esbuild `[S14]`, entirely outside Node's algorithm.

**`solid-js@1.9.14` — conditions × environment × dev/prod, five levels wide `[S16]`:**

```json
".": { "worker":  { "types": …, "import": "./dist/server.js",  "require": "./dist/server.cjs" },
       "browser": { "development": { "types": …, "import": "./dist/dev.js", "require": "./dist/dev.cjs" },
                    "types": …, "import": "./dist/solid.js", "require": "./dist/solid.cjs" },
       "deno":    { … server … }, "node": { … server … },
       "development": { … dev … },
       "types": …, "import": "./dist/solid.js", "require": "./dist/solid.cjs" }
```

No `workerd` key, only `worker` — which is exactly why `worker` belongs in the server set.
Note that `solid-js` is a `"type": "module"` package whose `main` points at a `.cjs`.

**`preact@10.29.8` `[S16]`** — has **no `default`** in `"."`:

```json
".": { "types@<=5.0": { "types": "./src/index-5.d.ts" },
       "types": "./src/index.d.ts",
       "browser": "./dist/preact.module.js",
       "umd": "./dist/preact.umd.js",
       "import": "./dist/preact.mjs",
       "require": "./dist/preact.js" }
```

Two lessons: (i) an `exports` object with no `default` is legal and _will_ throw _Package
Path Not Exported_ for an unrecognised environment — our diagnostics must say which
conditions we sent; (ii) `types@<=5.0` is a real condition key containing `@` and `<=`,
i.e. characters outside Node's "typical" guidance `[S2]`. A resolver must treat condition
keys as opaque strings and simply not match them.

**`nanoid@6.0.1` `[S16]`** — `browser`/`react-native` split plus the legacy `browser` map:

```json
"browser": { "./index.js": "./index.browser.js" },
"react-native": { "./index.js": "./index.browser.js" },
"exports": { ".": { "types": "./index.d.ts", "browser": "./index.browser.js",
                    "react-native": "./index.browser.js", "default": "./index.js" },
             "./non-secure": { … }, "./package.json": "./package.json" }
```

`"./package.json": "./package.json"` is a widespread idiom (`nanoid`, `preact`, `unenv`,
`zod`, `mime`, `ws` `[S16]`) — tooling wants to read the manifest through the package's
own encapsulation.

**`zod@4.4.3` `[S16]`** — a **vendor-private condition**, `@zod/source`, mapping to raw
`.ts`:

```json
".": { "types": "./index.d.cts", "import": "./index.js", "require": "./index.cjs",
       "@zod/source": "./src/index.ts" }
```

Placed after `import`, so it is inert unless deliberately requested. Evidence that private
conditions exist in the top tier of npm and that our resolver must not choke on unknown
keys.

**`ws@8.21.0` `[S16]`** — `{"browser": "./browser.js", "import": "./wrapper.mjs",
"require": "./index.js"}` with `browser` **first**. With `browser` in the server set, a
Worker importing `ws` gets `browser.js`, which throws "ws does not work in the browser".
Correct behaviour, unhelpful message. Real cost of the `browser`-in-server-set decision.

### 5.3 Packages that are CJS-only, from this repo's own `node_modules` `[S17]`

| Package                | Manifest                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `esbuild@0.28.1`       | `{"main": "lib/main.js"}` — no `type`, no `exports`                                                        |
| `semver@7.8.5`         | `{"main": "index.js"}`                                                                                     |
| `cookie@1.1.1`         | `{"main": "dist/index.js"}`                                                                                |
| `undici@7.28.0`        | `{"main": "index.js"}`                                                                                     |
| `miniflare@5.x`        | `{"main": "./dist/src/index.js"}`                                                                          |
| `path-to-regexp@6.3.0` | `{"main": "dist/index.js", "module": "dist.es2015/index.js"}` — CJS `main`, ESM `module`, **no `exports`** |

`path-to-regexp` is the interesting one: it is not CJS-only, but the _only_ pointer to its
ESM build is the bundler-convention `module` **field**, which Node's algorithm never
reads (§2.2). Ursprung would classify it CJS-only and hard-error — correctly, per its own
rules, but a user will find that surprising.

---

## 6. Detecting a CJS-only package, cheaply and reliably

Constraint 14 wants a hard error. The reliable answer is: **you cannot classify a
_package_; you classify the _module_ the resolution actually landed on.** Resolve first,
then decide. A package can be CJS at one subpath and ESM at another (`hono`, `zod`,
`date-fns` all are), and a "CJS package" check on the manifest would reject them wrongly.

### 6.1 The decision procedure

Run it on the resolved file URL, after §2.1 step 7d:

```
classify(fileURL):
  1. if fileURL ends ".mjs": return ESM                          # spec, unconditional
  2. if fileURL ends ".cjs": return CJS                          # spec, unconditional
  3. if fileURL ends ".json" / ".wasm" / ".node": return NOT-JS  # separate error class
  4. if fileURL ends ".js":
       scope := LOOKUP_PACKAGE_SCOPE(fileURL)
       type  := READ_PACKAGE_JSON(scope)?.type
       if type == "module":   return ESM
       if type == "commonjs": return CJS
       return AMBIGUOUS                                          # no type field
  5. return UNKNOWN-EXTENSION                                    # ESM_FILE_FORMAT step 13
```

Steps 1, 2 and 4-with-a-`type` are **exact**, from `ESM_FILE_FORMAT` `[S1]` and
`[S2 §"package.json and file extensions"]`. Only `AMBIGUOUS` requires a policy.

### 6.2 What to do with AMBIGUOUS

Node's answer is `DETECT_MODULE_SYNTAX` — parse the source as ESM and check for
`import`/`export` statements, `import.meta`, top-level `await`, or a top-level lexical
redeclaration of `require`/`module`/`exports`/`__filename`/`__dirname` `[S1][S2 §"Syntax
detection"]`. Its stability index is "1.2 — Release candidate" `[S2]`, and it has been on
by default since v22.7.0/v20.19.0.

Two options for Ursprung:

- **Conservative (recommended for v0):** `AMBIGUOUS` ⇒ CJS ⇒ hard error. This is Node's
  own _documented_ default for `.js` ("If the nearest parent `package.json` lacks a `type`
  field, or contains `"type": "commonjs"`, `.js` files are treated as CommonJS" `[S2]`)
  and needs zero parsing. Cost: a well-formed ESM `.js` in a package that forgot `"type":
"module"` is rejected. Node's own guidance backs the rejection: "package authors should
  always include the `type` field in their `package.json` files, even in packages where
  all sources are CommonJS" `[S2]`.
- **Permissive:** run syntax detection. Ursprung already has a parser (constraint 8), so
  the marginal cost is one parse of a file that will be parsed anyway. But constraint 8's
  parser has no scope model, and the "top-level lexical redeclaration of `require`" clause
  needs one. Partial detection would be _silently_ wrong on exactly the ambiguous cases.

**Recommendation:** conservative in v0; state the rule in the error message and name the
missing `"type": "module"` explicitly, since that is the fix the user must ask the package
author for (or work around in their virtual filesystem).

### 6.3 Two cheap pre-flight checks worth adding

Neither is a substitute for §6.1, but both let us fail _earlier and better_:

1. **`exports` with a `require` branch and no reachable ESM branch.** If, after evaluating
   the subpath with our condition set, the only key that would have matched under any set
   is `require`, the package has no ESM entry for that subpath. Report "package `X` exposes
   subpath `Y` only via the `require` condition".
2. **Resolution landed via `main` and `main` ends in `.cjs`, or the package has no
   `"type"` and `main` is `.js`.** Report the manifest field that produced it.

Both are pure manifest reads — no source, no parse.

---

## 7. `nodejs_compat` on Workers today

### 7.1 How it is enabled

Add the compatibility flag and a compatibility date of **2024-09-23 or later** `[S11]`:

```jsonc
{ "compatibility_flags": ["nodejs_compat"], "compatibility_date": "2026-08-07" }
```

In this repo's experimental TypeScript config format, that is `compatibilityFlags` /
`compatibilityDate` in `apps/web/cloudflare.config.ts`.

`nodejs_compat` implies `nodejs_compat_v2` when the compatibility date is ≥ 2024-09-23
`[S12]`. The v2 delta, verbatim from workerd's flag definition `[S10]`:

> Implies nodeJSCompat with the following additional modifications:
>
> - Node.js Compat built-ins may be imported/required with or without the `node:` prefix
> - Node.js Compat the globals `Buffer` and `process` are available everywhere

`no_nodejs_compat_v2` opts back out; `nodejs_compat` and `nodejs_compat_v2` together are a
hard error in wrangler `[S8]`. `nodejs_als` enables `AsyncLocalStorage` alone `[S11]`.

### 7.2 Which `node:*` modules workerd provides natively

Verbatim from `[S11]` — 🟢 fully supported, 🟡 partially supported:

🟢 Assertion testing · Asynchronous context tracking · Buffer · Crypto · Debugger (via
Chrome DevTools) · Diagnostics Channel · Errors · Events · File system · Globals · HTTP ·
HTTPS · Net · Path · Process · Punycode (deprecated) · Query strings · Stream · String
decoder · Timers · URL · Utilities · Web Crypto API · Web Streams API · Zlib

🟡 Console · DNS · Module · OS · Performance hooks · Test runner · TLS/SSL

Some of these arrived on dates that matter `[S12]`: `node:http`/`node:https` from
2025-08-15, `http.server` from 2025-09-01, `process.env` auto-population from 2025-04-01,
top-level-await-in-`require()` disabled from 2024-12-02.

**Non-functional stubs** — importable, but no working implementation. Enabled
automatically with `nodejs_compat` on or after the date shown `[S11]`:

| Module              | On/after   | Module                | On/after   |
| ------------------- | ---------- | --------------------- | ---------- |
| `node:http2`        | 2025-09-01 | `node:dgram`          | 2026-01-29 |
| `node:vm`           | 2025-10-01 | `node:inspector`      | 2026-01-29 |
| `node:cluster`      | 2025-12-04 | `node:sqlite`         | 2026-01-29 |
| `node:domain`       | 2025-12-04 | `node:child_process`  | 2026-03-17 |
| `node:trace_events` | 2025-12-04 | `node:readline`       | 2026-03-17 |
| `node:wasi`         | 2025-12-04 | `node:repl`           | 2026-03-17 |
| `node:_stream_wrap` | 2026-01-29 | `node:tty`            | 2026-03-17 |
|                     |            | `node:v8`             | 2026-03-17 |
|                     |            | `node:worker_threads` | 2026-03-17 |

Each has a matching `enable_nodejs_<name>_module` / `disable_nodejs_<name>_module` flag
`[S11]`.

Anything outside both tables is served — **if at all** — by unenv polyfills injected by
wrangler's bundler (§7.3). The docs list _API names_, not module specifiers; the mapping
above from e.g. "Utilities" → `node:util` is mine, not Cloudflare's, so treat individual
specifier availability as worth a runtime smoke test rather than a settled fact.

### 7.3 The polyfills are wrangler's, not workerd's — and `--no-bundle` turns them off

"Node.js APIs that are not yet supported in the Workers runtime are polyfilled via
Wrangler, which uses unenv… Wrangler will automatically inject polyfills into your
Worker's code" `[S11]`. Mechanically this is an **esbuild plugin**,
`nodejsHybridPlugin`, applying `@cloudflare/unenv-preset` `[S8]`.

`--no-bundle` (config key `noBundle` in `wrangler.config.ts` `[S17]`) routes the build
through `noBundleWorker`, which runs **no esbuild at all** — it only collects additional
modules and returns the entry file `[S8]`. And wrangler warns explicitly `[S8]`:

> "`nodejs_compat_v2` compatibility flag and `--no-bundle` can't be used together. If you
> want to polyfill Node.js built-ins and disable Wrangler's bundling, please polyfill as
> part of your own bundling process."

**Consequence for Ursprung.** The map's destination says the demo app "deploys to
Cloudflare through Wrangler with bundling disabled". Under that setup the _only_ `node:*`
modules that resolve at runtime are the natively-implemented ones and the stubs in §7.2.
Anything unenv-only fails at Worker startup, not at build time. Constraint 15's parenthesis
— "`nodejs_compat` serves them" — is therefore true only of the §7.2 set.

### 7.4 The `node:` prefix

With `nodejs_compat` alone the prefix is required; with v2 (implied at compat date
≥ 2024-09-23) built-ins resolve "with or without the `node:` prefix" `[S10]`. The
canonical unprefixed list ships as `nonPrefixedNodeModules` in
`@cloudflare/unenv-preset`, "Generated using `module.builtinModules` in Node.js 24.11.1"
— 76 entries including subpaths like `fs/promises`, `stream/web`, `util/types`,
`path/posix` `[S9]`.

**Ursprung's externals rule must cover both spellings.** Matching only `/^node:/` misses
`import fs from "fs"`, which is legal under v2 and which many published packages still
write. Recommend: treat a specifier as a Node builtin if it starts with `node:` **or** is
an exact member of the `nonPrefixedNodeModules` list, and — for the server target —
rewrite the bare form to the prefixed form on emit, so the output does not depend on v2
being on. Careful: the unprefixed check must run _after_ the `node_modules` walk would
have found a real package of that name, or it will shadow a legitimately-installed
`events` or `punycode` package. Node's own ordering puts the builtin check _first_
(§2.2 step 3), which is a deliberate, documented shadowing.

### 7.5 An unreleased change worth watching

On `cloudflare/workerd` `main`, both `nodeJsCompat` and `nodeJsCompatV2` now carry
`$compatEnableDate("2026-08-04")` — i.e. **Node.js compatibility becomes on-by-default for
compatibility dates ≥ 2026-08-04** `[S10]`. I verified this is **not** in the released
runtime: at tags `v1.20260804.1` (current `latest` on npm) and `v1.20260801.1` the
annotation is absent `[S10]`. And Cloudflare's docs still say the opposite — "Unlike most
other compatibility flags, we do not expect the `nodejs_compat` to become active by
default at a future date" `[S12]`.

**Status: landed on `main`, not shipped, docs not updated.** Do not build on it; do not
assume `nodejs_compat` is off either. Re-check before locking the demo app's
compatibility date.

---

## 8. Traps for a resolver that runs inside a Worker

### 8.1 Symlinks and `realpath` — the sharpest one

`ESM_RESOLVE` step 7.4 says "Set `resolved` to the real path of `resolved`, maintaining
the same URL querystring and fragment components" `[S1]`. That single step is doing real
work, because **modern package managers build `node_modules` out of symlinks**. This repo
is direct evidence `[S17]`:

```
node_modules/husky        -> .bun/husky@9.1.7/node_modules/husky
node_modules/lint-staged  -> .bun/lint-staged@17.3.0/node_modules/lint-staged

node_modules/.bun/lint-staged@17.3.0/node_modules/
  ├── lint-staged/            (the real files)
  ├── picomatch   -> ../../picomatch@4.0.5/node_modules/picomatch
  ├── string-argv -> ../../string-argv@0.3.2/node_modules/string-argv
  └── tinyexec    -> ../../tinyexec@1.3.0/node_modules/tinyexec
```

pnpm's layout is the same idea. The consequence is not subtle: a module inside
`lint-staged` importing `picomatch` resolves **from its realpath**, so
`PACKAGE_RESOLVE`'s walk finds `.bun/lint-staged@17.3.0/node_modules/picomatch`. Walking
from the _link_ path `node_modules/lint-staged/` instead goes straight up to the top-level
`node_modules/`, where `picomatch` is not present at all. Same for
`LOOKUP_PACKAGE_SCOPE`, and therefore for `"type"`.

Constraint 13 says the caller populates the virtual filesystem. That makes this a
**contract question the virtual filesystem interface must answer**, not something the
resolver can paper over. The three options:

1. **Virtual filesystem paths are already real** — the caller flattens or resolves links
   before populating. Simplest; the resolver never realpaths; must be written down as a
   precondition, because a caller that mirrors a Bun/pnpm `node_modules` naively gets a
   build that fails in ways that look like missing dependencies.
2. **Virtual filesystem exposes a `realpath`** — one extra method, resolver calls it at
   step 7d. Faithful to Node; pushes the work to whoever knows about links.
3. **Preserve-symlinks semantics** — skip 7d entirely. Node has `--preserve-symlinks` for
   this. Wrong for the isolated layouts above.

Recommend (1) with an explicit precondition, and a note that (2) is the escape hatch if a
caller genuinely needs link semantics.

### 8.2 Case sensitivity and Unicode normalisation

Nothing about workerd forces an answer here — the virtual filesystem's key comparison _is_
the answer. But the failure mode is asymmetric and worth deciding deliberately:

- A `Map<string, …>` compares keys by exact UTF-16 code units. That is stricter than macOS
  (case-insensitive by default) and than Windows, and matches Linux.
- So `import "./Button.tsx"` against a file named `button.tsx` succeeds on a developer's
  Mac and fails in CI/production. This is a classic, and the strict behaviour is the
  correct one.
- macOS additionally normalises filenames toward NFD, so a filename containing a
  non-ASCII character can round-trip through a Mac and stop matching a specifier written
  in NFC.

Recommend: exact-match only, and — because the diagnostic is otherwise baffling — when a
lookup misses, do one case-insensitive scan purely to produce a better error ("no file at
`./Button.tsx`; did you mean `./button.tsx`?"). This is diagnostics, not resolution.

### 8.3 Percent-encoding and URL-vs-path

Node's algorithm is specified over **URLs**, not strings. Ursprung will almost certainly
key the virtual filesystem by path strings, which loses:

- `ESM_RESOLVE` step 7a's rejection of `%2F`/`%5C` `[S1]` — keep it, as a specifier-level
  check;
- the "including percent encoded variants, case insensitive" clauses in
  `PACKAGE_TARGET_RESOLVE` steps 1b and 1f `[S1]` — these are what stop
  `"./%2E%2E/secret.js"` from escaping the package. If we work in raw paths, decode before
  the segment check or reject any specifier/target containing `%`.
- `?query` and `#fragment` — meaningful in Node (step 7d preserves them). Ursprung should
  reject them on third-party specifiers rather than half-support them.

### 8.4 Things a real filesystem gives you that a virtual one does not

- **`stat`** — file vs directory. §2.1 step 7b and §2.2 step 10c both need it. Must be
  defined in the virtual filesystem interface (see §3).
- **Directory existence as a cheap negative.** §2.2 step 10c lets Node skip a
  `node_modules` level in one `stat`. Over a flat map, "does folder `p` exist" is a prefix
  scan — O(n) per level, per specifier, per module. With `k` `node_modules` levels and `m`
  bare specifiers this is `O(k·m·n)`. **Build a directory index once** when the virtual
  filesystem is handed over.
- **An OS page cache.** Every `READ_PACKAGE_JSON` re-parses JSON unless we memoise. Node
  caches manifests internally. Memoise `READ_PACKAGE_JSON` and `LOOKUP_PACKAGE_SCOPE` by
  URL; both are pure and both are called many times per module.
- **A defined filesystem root.** §2.2 step 10 and `LOOKUP_PACKAGE_SCOPE` both loop "while
  not the filesystem root". A virtual filesystem has no root unless we declare one; an
  undeclared root is an infinite loop or an off-by-one that silently escapes the project.

### 8.5 Worker execution limits (relevant to the build-in-a-Worker constraint, §4 of the map)

`[S13]`: memory **128 MB per isolate** (heap + Wasm, per-isolate not per-invocation); CPU
time **10 ms** free / **5 min** paid (`limits.cpu_ms`, default 30 s); Worker size **3 MB
free / 10 MB paid after gzip, 64 MB before**; Worker startup time **1 second**.

For resolution specifically: the virtual filesystem for a real app's `node_modules` can be
tens of megabytes of source, and it all lives in the same 128 MB as the graph, the ASTs
and the output. Nothing about resolution is CPU-heavy, but _holding every package.json
parsed_ is memory the build cannot spend twice. Path length is **not** a constraint on
workerd (no OS path limits apply to an in-memory map) — unlike Windows' 260-character
`MAX_PATH`, which is what bites real-filesystem resolvers on deep `node_modules`.

### 8.6 Non-issues, stated so they are not re-investigated

- **`workerd` does not need to resolve packages.** Constraint 10 emits one self-contained
  ESM file; only `node:*` externals cross the boundary (§4.4, §7.4).
- **`node:fs` in Workers is real but irrelevant.** Since compat date 2025-09-01,
  `nodejs_compat` provides an ephemeral, per-request virtual filesystem via `node:fs`
  `[S11]`. Constraint 4 forbids touching a Node API in build modules, so this is not an
  implementation route for the virtual filesystem — noting it only so the option is
  visibly rejected rather than overlooked.

---

## 9. What I could not establish

- **Whether `workerd` itself implements any `package.json`/`exports` resolution.** I found
  no evidence that it does, and every path I traced put resolution in wrangler's esbuild
  pass `[S7][S8]`. I did not read workerd's module-registry C++ to confirm the negative.
- **The exact `node:` specifier list workerd serves natively.** Cloudflare's table lists
  _API names_ (e.g. "Utilities", "Query strings"), not module specifiers `[S11]`. My
  mapping to `node:util` / `node:querystring` is inference. The stub table _is_ specifier-
  exact.
- **Which modules in `nonPrefixedNodeModules` `[S9]` are unenv-polyfill-only.** Derivable
  by subtracting the two docs tables, but only as inference, and the inference depends on
  the name mapping above.
- **Whether `$compatEnableDate("2026-08-04")` on `nodeJsCompat` will ship, or on what
  date.** It exists on `main`, not in `v1.20260804.1`, and contradicts the docs (§7.5).
- **Any primary, normative definition of the `module` condition.** esbuild's docs `[S14]`
  are the best I found; it appears in neither Node's lists nor the Runtime Keys registry.
- **Whether `worker` will ever be registered as a Runtime Key.** It is not in `[S5]`, yet
  it is what `react-dom` and `solid-js` branch on `[S16]`.
- **`https://runtime-keys.proposal.wintercg.org/`** — Node's docs still link there
  `[S2]`, but the host is blocked by this session's egress policy (502 on CONNECT). I
  read the registry from its GitHub source instead `[S5][S6]`, which the report itself
  designates as authoritative.

---

## Implications for Ursprung

Ordered by how much they bite. Items 1–3 are conflicts or gaps against the locked
constraints; the rest are decisions the spec needs to state.

**1. Constraint 15's parenthesis is too optimistic under bundling-disabled deployment.**
Constraint 15 says `node:*` imports are "external on the server (`nodejs_compat` serves
them)". But the unenv polyfills that make most of npm's Node usage work are injected by
**wrangler's esbuild pass** `[S8][S11]`, and the map's destination deploys "with bundling
disabled", which skips esbuild entirely `[S8]`. Wrangler even warns about the combination
in so many words `[S8]`. Under Ursprung's intended deployment, the only `node:*` that
resolve are the natively-implemented modules and stubs in §7.2 — a _much_ smaller set than
"`nodejs_compat`". This does not break the constraint, but the spec must say which set it
means, and the build should probably validate server-side `node:*` externals against the
§7.2 list and error at build time rather than letting the Worker fail at startup.

**2. Constraint 15 must cover unprefixed builtins.** `nodejs_compat_v2` — implied at any
compat date ≥ 2024-09-23 — makes `import fs from "fs"` legal `[S10]`, and 76 such names
exist `[S9]`. A rule written as "specifiers matching `/^node:/`" leaks: on the client an
unprefixed `"fs"` would fall through to a `node_modules` walk and produce _Module Not
Found_ instead of constraint 15's hard error; on the server it would be bundled or missed
rather than externalised. §7.4 has the fix, including the shadowing-order subtlety.

**3. Constraint 13's virtual filesystem contract has an unaddressed hole: symlinks.**
`ESM_RESOLVE` step 7.4 realpaths `[S1]`, and Bun — this repo's own toolchain — lays out
`node_modules` as symlinks into `.bun/<name>@<version>/node_modules/` `[S17]`. A caller
who mirrors that layout into the virtual filesystem without resolving links gets wrong
dependency resolution _and_ wrong `"type"` inheritance, presenting as phantom missing
packages. The virtual filesystem interface must either promise real paths or expose
`realpath`. §8.1. Related and smaller: the interface also needs an explicit
directory-existence primitive and a declared root (§3, §8.4) — a pure `readFile` is not
enough to implement the algorithm.

**4. Constraint 14's "hard error" is a per-module verdict, not a per-package one.**
Packages like `hono`, `zod`, `date-fns` and `pathe` ship both formats and are perfectly
usable `[S16]`; a manifest-level "is this a CJS package" check would reject them. Resolve
first, classify the resolved file (§6.1), error there. And the ambiguous case — `.js` with
no `"type"` — needs an explicit policy in the spec; §6.2 recommends the conservative one,
which will reject a real package like `path-to-regexp@6.3.0` that ships ESM only behind
the `module` field `[S17]`.

**5. The recommended condition sets, for the spec to lock (§4.7):**
server `["workerd", "worker", "browser", "module", "production", "import"]`,
client `["browser", "module", "production", "import"]`, `default` always active and never
listed, and `types`/`require`/`node`/`development`/`react-server` explicitly excluded. The
server set is deliberately wrangler's `["workerd", "worker", "browser"]` `[S7]` plus
`import`, `module` and `production`. `capnweb` — a locked dependency under constraint 6 —
needs `workerd` specifically or it silently resolves to the generic build `[S16]`.

**6. The condition list's _order_ does not affect resolution, and the spec should say so
loudly.** Conditions are a set `[S4]`; precedence belongs to the package author's key
order `[S1 §PACKAGE_TARGET_RESOLVE][S14]`. Anyone reading "ordered condition list" will
assume otherwise and write a resolver that sorts by our preference. Corollary for
diagnostics: when resolution fails with _Package Path Not Exported_, the error must print
the condition set we sent and the keys the package offered — `preact` has no `default` at
all `[S16]`, so this is a real failure mode, not a hypothetical.

**7. Self-referencing is not optional for us.** Constraint 5's subpath exports mean
Ursprung's own modules will import `ursprung/client` and friends by name; that path runs
through `PACKAGE_SELF_RESOLVE` `[S1][S17]`. Also worth flagging against constraint 5: the
published `ursprung` package points `exports` at `./src/index.ts` `[S17]`, so _Ursprung's
own resolver would classify Ursprung as an unknown extension_ under §6.1 step 5. Whatever
`.ts`-handling rule the resolver gets for first-party modules must also apply to the
`ursprung` package itself when the demo app resolves it.

**8. No conflict found with constraints 8, 10, 11, 12 or 16.** Resolution needs no scope
model (constraint 8) and no source parsing at all, _provided_ §6.2 takes the conservative
branch — the permissive branch would need a scope model constraint 8 rules out, which is a
second reason to prefer conservative. Nothing here bears on chunking, dev servers,
streaming or colouring.
