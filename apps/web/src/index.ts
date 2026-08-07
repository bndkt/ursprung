import { name, version } from "ursprung";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": () => new Response(`${name} v${version}`),
    "/health": () => Response.json({ name, version, ok: true }),
  },
});

console.log(`ursprung-web listening on ${server.url}`);
