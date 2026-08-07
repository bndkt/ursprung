import { name, version } from "ursprung";

// The Worker only ever answers requests that did not match a static asset under
// `public/`, so this is the site's index document. `/posts/` is served from the
// asset store and never reaches here.
//
// The layout is built around one idea taken from the name: an origin axis. A
// single hairline runs the length of the page, the origin is marked at its top,
// and every section hangs off it as a node. `public/posts/index.html` repeats
// the same structure — the two documents share a look but no template, so a
// change here has to be mirrored there by hand.
const index = /* html */ `<!doctype html>
<html lang="en" class="antialiased">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ursprung — everything from first principles</title>
    <meta
      name="description"
      content="ursprung is German for origin. It is also a full-stack TypeScript framework with its own bundler, its own JSX runtime and its own type stripping, targeting Cloudflare Workers."
    />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="min-h-dvh bg-stone-50 font-sans text-stone-700 dark:bg-stone-950 dark:text-stone-300">
    <div class="isolate mx-auto max-w-3xl px-6">
      <header class="relative py-12 sm:py-16">
        <!-- The axis starts at the origin mark and runs down. Nothing precedes the
             origin, so this segment is anchored at the mark rather than the page top;
             the mark sits at the header's vertical centre because its padding is
             symmetric. -->
        <div
          class="absolute top-1/2 bottom-0 left-0 w-px bg-stone-950/10 dark:bg-white/10"
          aria-hidden="true"
        ></div>
        <div class="relative flex items-center justify-between gap-x-4 pl-8 sm:pl-12">
          <span
            class="absolute top-1/2 left-0 flex size-6 -translate-1/2 items-center justify-center rounded-full bg-stone-50 ring-1 ring-amber-600/30 dark:bg-stone-950 dark:ring-amber-500/30"
            aria-hidden="true"
          >
            <span class="size-2 rounded-full bg-amber-600 dark:bg-amber-500"></span>
          </span>
          <a
            href="/"
            aria-label="Homepage"
            class="font-semibold tracking-tight text-stone-900 dark:text-stone-50"
            >${name}</a
          >
          <p class="font-mono text-sm text-stone-500 tabular-nums dark:text-stone-400">
            v${version}
          </p>
        </div>
      </header>

      <div class="relative">
        <div
          class="absolute inset-y-0 left-0 w-px bg-stone-950/10 dark:bg-white/10"
          aria-hidden="true"
        ></div>

        <main>
          <section class="pb-16 sm:pb-24">
            <div class="relative pl-8 sm:pl-12">
              <span
                class="absolute top-2.5 left-0 size-1.5 -translate-1/2 rounded-full bg-stone-950/40 ring-2 ring-stone-50 dark:bg-white/40 dark:ring-stone-950"
                aria-hidden="true"
              ></span>
              <p class="font-mono text-sm tracking-wide text-amber-700 uppercase dark:text-amber-500">
                ur- · sprung
              </p>
              <h1
                class="mt-4 max-w-[30ch] text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-5xl dark:text-stone-50"
              >
                Everything from first principles
              </h1>
              <p class="mt-6 max-w-[48ch] text-lg/8 text-pretty text-stone-600 dark:text-stone-400">
                ursprung is German for origin — the point a thing can be traced back to. It is also a
                full-stack TypeScript framework with its own bundler, its own JSX runtime and its own
                type stripping, targeting Cloudflare Workers.
              </p>

              <div class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 text-sm font-semibold">
                <a
                  href="/posts/"
                  class="inline-flex items-center gap-x-2 rounded-md bg-stone-900 py-2 pr-2 pl-3 text-stone-50 hover:bg-stone-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-stone-50 dark:text-stone-900 dark:hover:bg-stone-300"
                >
                  Read the dev log
                  <svg
                    viewBox="0 0 16 16"
                    class="size-4 h-lh shrink-0 fill-current"
                    aria-hidden="true"
                  >
                    <path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"
                    />
                  </svg>
                </a>
                <a
                  href="https://github.com/bndkt/ursprung"
                  class="text-stone-900 underline decoration-stone-950/25 underline-offset-4 hover:decoration-stone-950/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:text-stone-50 dark:decoration-white/25 dark:hover:decoration-white/60"
                  >Source on GitHub</a
                >
              </div>
            </div>
          </section>

          <section class="pb-16 sm:pb-24">
            <div class="relative pl-8 sm:pl-12">
              <span
                class="absolute top-3.5 left-0 size-1.5 -translate-1/2 rounded-full bg-stone-950/40 ring-2 ring-stone-50 dark:bg-white/40 dark:ring-stone-950"
                aria-hidden="true"
              ></span>
              <h2
                class="max-w-[40ch] text-2xl font-semibold tracking-tight text-balance text-stone-900 dark:text-stone-50"
              >
                The word
              </h2>
              <dl class="mt-8 divide-y divide-stone-950/10 dark:divide-white/10">
                <div class="grid grid-cols-1 gap-x-8 gap-y-2 pb-6 sm:grid-cols-[8rem_1fr]">
                  <dt class="font-mono text-base font-medium text-stone-900 sm:text-sm dark:text-stone-50">
                    ur-
                  </dt>
                  <dd
                    class="text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                  >
                    Primordial. The earliest form a thing took, before anything was layered on top of
                    it.
                  </dd>
                </div>
                <div class="grid grid-cols-1 gap-x-8 gap-y-2 pt-6 sm:grid-cols-[8rem_1fr]">
                  <dt class="font-mono text-base font-medium text-stone-900 sm:text-sm dark:text-stone-50">
                    sprung
                  </dt>
                  <dd
                    class="text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                  >
                    A leap. Also a crack — the place where something breaks open and begins.
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section class="pb-16 sm:pb-24">
            <div class="relative pl-8 sm:pl-12">
              <span
                class="absolute top-3.5 left-0 size-1.5 -translate-1/2 rounded-full bg-stone-950/40 ring-2 ring-stone-50 dark:bg-white/40 dark:ring-stone-950"
                aria-hidden="true"
              ></span>
              <h2
                class="max-w-[40ch] text-2xl font-semibold tracking-tight text-balance text-stone-900 dark:text-stone-50"
              >
                What it is
              </h2>
              <dl class="mt-8 divide-y divide-stone-950/10 dark:divide-white/10">
                <div class="grid grid-cols-1 gap-x-8 gap-y-2 pb-6 sm:grid-cols-[8rem_1fr]">
                  <dt class="font-mono text-base font-medium text-stone-900 sm:text-sm dark:text-stone-50">
                    from scratch
                  </dt>
                  <dd
                    class="text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                  >
                    Its own bundler, its own JSX runtime, its own type stripping. Nothing borrowed
                    that could be understood instead.
                  </dd>
                </div>
                <div class="grid grid-cols-1 gap-x-8 gap-y-2 py-6 sm:grid-cols-[8rem_1fr]">
                  <dt class="font-mono text-base font-medium text-stone-900 sm:text-sm dark:text-stone-50">
                    one target
                  </dt>
                  <dd
                    class="text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                  >
                    Cloudflare Workers is the deployment target, not one adapter among several.
                  </dd>
                </div>
                <div class="grid grid-cols-1 gap-x-8 gap-y-2 pt-6 sm:grid-cols-[8rem_1fr]">
                  <dt class="font-mono text-base font-medium text-stone-900 sm:text-sm dark:text-stone-50">
                    for agents
                  </dt>
                  <dd
                    class="text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                  >
                    AI agents are the primary users, which licenses decisions a human developer would
                    not accept.
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </main>

        <footer class="py-12">
          <div
            class="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pl-8 text-base/7 text-stone-500 sm:pl-12 sm:text-sm/6"
          >
            <span
              class="absolute top-1/2 left-0 size-1.5 -translate-1/2 rounded-full bg-stone-950/40 ring-2 ring-stone-50 dark:bg-white/40 dark:ring-stone-950"
              aria-hidden="true"
            ></span>
            <p>ursprung is open source and built in the open.</p>
            <p>
              <a
                href="https://github.com/bndkt/ursprung"
                class="underline decoration-stone-950/25 underline-offset-4 hover:decoration-stone-950/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:decoration-white/25 dark:hover:decoration-white/60"
                >GitHub</a
              >
            </p>
          </div>
        </footer>
      </div>
    </div>
  </body>
</html>
`;

export default {
  fetch() {
    return new Response(index, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
} satisfies ExportedHandler<Env>;
