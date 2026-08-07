import { name, version } from "ursprung";

// The Worker only ever answers requests that did not match a static asset under
// `public/`, so this is the site's index document. `/posts/` is served from the
// asset store and never reaches here.
const index = /* html */ `<!doctype html>
<html lang="en" class="scroll-smooth antialiased">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ursprung — a full-stack TypeScript framework written from scratch</title>
    <meta
      name="description"
      content="Ursprung is a full-stack TypeScript framework with its own bundler, its own JSX runtime and its own type stripping, targeting Cloudflare Workers, with AI agents as its first-class users."
    />
    <link rel="preconnect" href="https://rsms.me/" />
    <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="min-h-dvh bg-stone-50 font-sans text-stone-700 dark:bg-stone-950 dark:text-stone-300">
    <div class="isolate">
      <header class="pt-10 sm:pt-14">
        <div class="mx-auto flex max-w-3xl items-center justify-between gap-x-4 px-6">
          <a
            href="/"
            aria-label="Homepage"
            class="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-50"
            >Ursprung</a
          >
          <p
            class="rounded-full bg-stone-950/5 px-2 py-1 font-mono text-sm text-stone-600 tabular-nums dark:bg-white/10 dark:text-stone-400"
          >
            ${name} v${version}
          </p>
        </div>
      </header>

      <main>
        <section class="pt-16 pb-14 sm:pt-24 sm:pb-20">
          <div class="mx-auto max-w-3xl px-6">
            <p class="font-mono text-sm tracking-wide text-amber-700 uppercase dark:text-amber-500">
              Work in progress
            </p>
            <h1
              class="mt-3 max-w-[30ch] text-4xl font-semibold tracking-tight text-balance text-stone-900 sm:text-5xl dark:text-stone-50"
            >
              A framework written from scratch
            </h1>
            <p class="mt-6 max-w-[48ch] text-lg/8 text-pretty text-stone-600 dark:text-stone-400">
              Ursprung is a full-stack TypeScript framework with its own bundler, its own JSX
              runtime and its own type stripping — targeting Cloudflare Workers, with AI agents as
              its first-class users.
            </p>

            <div class="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 text-sm font-semibold">
              <a
                href="/posts/"
                class="inline-flex items-center gap-x-2 rounded-md bg-amber-700 py-2 pr-2 pl-3 text-white hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400"
              >
                Read the dev log
                <svg viewBox="0 0 16 16" class="size-4 h-lh shrink-0 fill-current" aria-hidden="true">
                  <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M8.22 2.97a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06l2.97-2.97H3.75a.75.75 0 0 1 0-1.5h7.44L8.22 4.03a.75.75 0 0 1 0-1.06Z"
                  />
                </svg>
              </a>
              <a
                href="https://github.com/bndkt/ursprung"
                class="text-stone-900 underline decoration-stone-950/25 underline-offset-4 hover:decoration-amber-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:text-stone-50 dark:decoration-white/25 dark:hover:decoration-amber-500"
                >Source on GitHub</a
              >
            </div>
          </div>
        </section>

        <section class="pb-20 sm:pb-28">
          <div class="mx-auto max-w-3xl px-6">
            <h2
              class="max-w-[40ch] text-2xl font-semibold tracking-tight text-balance text-stone-900 dark:text-stone-50"
            >
              What it is
            </h2>
            <dl class="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-3">
              <div class="border-t border-stone-950/10 pt-6 dark:border-white/10">
                <dt class="text-base font-semibold text-stone-900 dark:text-stone-50">
                  Written from scratch
                </dt>
                <dd
                  class="mt-2 text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                >
                  Its own bundler, its own JSX runtime, its own type stripping — no Vite, no esbuild.
                </dd>
              </div>
              <div class="border-t border-stone-950/10 pt-6 dark:border-white/10">
                <dt class="text-base font-semibold text-stone-900 dark:text-stone-50">
                  Workers first
                </dt>
                <dd
                  class="mt-2 text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                >
                  Cloudflare Workers is the deployment target, not one adapter among several.
                </dd>
              </div>
              <div class="border-t border-stone-950/10 pt-6 dark:border-white/10">
                <dt class="text-base font-semibold text-stone-900 dark:text-stone-50">
                  Built for agents
                </dt>
                <dd
                  class="mt-2 text-base/7 text-pretty text-stone-600 sm:text-sm/6 dark:text-stone-400"
                >
                  AI agents are the primary users, which licenses decisions humans would not accept.
                </dd>
              </div>
            </dl>
          </div>
        </section>
      </main>

      <footer class="border-t border-stone-950/10 py-10 dark:border-white/10">
        <div
          class="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 text-base/7 text-stone-500 sm:text-sm/6"
        >
          <p>Ursprung is open source and built in public.</p>
          <p>
            <a
              href="https://github.com/bndkt/ursprung"
              class="underline decoration-stone-950/25 underline-offset-4 hover:decoration-amber-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-600 dark:decoration-white/25 dark:hover:decoration-amber-500"
              >GitHub</a
            >
          </p>
        </div>
      </footer>
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
