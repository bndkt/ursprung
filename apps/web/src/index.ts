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
          <div class="relative flex items-center pl-8 text-stone-500 sm:pl-12">
            <span
              class="absolute top-1/2 left-0 size-1.5 -translate-1/2 rounded-full bg-stone-950/40 ring-2 ring-stone-50 dark:bg-white/40 dark:ring-stone-950"
              aria-hidden="true"
            ></span>
            <!-- The row is the footer's only content, so the div's height is the
                 icons' height and the node lands on their horizontal centre without
                 anything to align by hand.
                 Each mark is the vendor's own artwork, single-colour: GitHub's
                 \`mark-github\` octicon, npm's wordmark, Discord's Clyde symbol. The
                 fill is dropped from every path in favour of \`fill-current\`, so all
                 three inherit the footer's text colour and flip with the rest of the
                 page in dark mode — one asset per icon, never a light/dark pair. The
                 paths are otherwise untouched, which is why the viewBoxes differ;
                 \`w-auto\` lets each keep its own aspect ratio at a shared height. -->
            <ul role="list" class="flex items-center gap-x-5">
              <li>
                <a
                  href="https://github.com/bndkt/ursprung"
                  class="block rounded-sm hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:hover:text-stone-50"
                >
                  <span class="sr-only">ursprung on GitHub</span>
                  <svg viewBox="0 0 16 16" class="size-5 shrink-0 fill-current" aria-hidden="true">
                    <path
                      d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"
                    />
                  </svg>
                </a>
              </li>
              <li>
                <a
                  href="https://www.npmjs.com/package/ursprung"
                  class="block rounded-sm hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:hover:text-stone-50"
                >
                  <span class="sr-only">ursprung on npm</span>
                  <svg
                    viewBox="0 0 780 250"
                    class="h-4 w-auto shrink-0 fill-current"
                    aria-hidden="true"
                  >
                    <path
                      d="M240,250h100v-50h100V0H240V250z M340,50h50v100h-50V50z M480,0v200h100V50h50v150h50V50h50v150h50V0H480z M0,200h100V50h50v150h50V0H0V200z"
                    />
                  </svg>
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/wDmBWQ2fjW"
                  class="block rounded-sm hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:hover:text-stone-50"
                >
                  <span class="sr-only">Join the ursprung Discord</span>
                  <svg
                    viewBox="0 0 64 48"
                    class="h-4 w-auto shrink-0 fill-current"
                    aria-hidden="true"
                  >
                    <path
                      d="M40.575 0C39.9562 1.09866 39.4006 2.2352 38.8954 3.397C34.0967 2.67719 29.2096 2.67719 24.3982 3.397C23.9057 2.2352 23.3374 1.09866 22.7186 0C18.2104 0.770324 13.8157 2.12155 9.64839 4.02841C1.38951 16.2652 -0.845688 28.1863 0.265599 39.9432C5.10222 43.517 10.5197 46.2447 16.2909 47.9874C17.5916 46.2447 18.7407 44.3883 19.7257 42.4562C17.8568 41.7616 16.0509 40.8903 14.3208 39.88C14.7755 39.5517 15.2175 39.2107 15.6468 38.8824C25.7873 43.6559 37.5316 43.6559 47.6847 38.8824C48.1141 39.236 48.5561 39.577 49.0107 39.88C47.2806 40.9029 45.4748 41.7616 43.5931 42.4688C44.5781 44.4009 45.7273 46.2573 47.028 48C52.7991 46.2573 58.2167 43.5422 63.0533 39.9684C64.3666 26.3299 60.8055 14.5099 53.6452 4.04104C49.4905 2.13418 45.0959 0.782952 40.5876 0.0252565L40.575 0ZM21.1401 32.7072C18.0209 32.7072 15.4321 29.8785 15.4321 26.3804C15.4321 22.8824 17.9199 20.041 21.1275 20.041C24.3351 20.041 26.886 22.895 26.8354 26.3804C26.7849 29.8658 24.3224 32.7072 21.1401 32.7072ZM42.1788 32.7072C39.047 32.7072 36.4834 29.8785 36.4834 26.3804C36.4834 22.8824 38.9712 20.041 42.1788 20.041C45.3864 20.041 47.9246 22.895 47.8741 26.3804C47.8236 29.8658 45.3611 32.7072 42.1788 32.7072Z"
                    />
                  </svg>
                </a>
              </li>
            </ul>
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
