// THROWAWAY PROTOTYPE — see ../README.md. Nothing here runs.

// The root route's Server component. Renders the document shell and wraps
// whichever child route matched.

import { type ComponentProps } from "ursprung";

// VARIANT — how a parent route renders its matched child. Genuinely contested,
// so both shapes are written out. See NOTES.md #5.
//
//   (i)  `props.children`, below — the child is passed in, so the parent is an
//        ordinary component and the router does the composing. Familiar, and it
//        keeps the component signature honest: everything it renders is an input.
//
//   (ii) an `<Outlet />` imported from `ursprung`:
//
//          import { Outlet } from "ursprung";
//          export default function RootLayout() {
//            return <html>...<main><Outlet /></main>...</html>;
//          }
//
//        which needs ambient per-request state to know what to render — awkward
//        under Resumption, and awkward on Workers where module scope is
//        per-isolate. (i) is written as the default for that reason.

export default function RootLayout(props: ComponentProps) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>ursprung build log</title>
      </head>
      <body>
        <header>
          <a href="/">ursprung</a>
          <nav>
            <a href="/builds">Builds</a>
          </nav>
        </header>
        <main>{props.children}</main>
      </body>
    </html>
  );
}
