import { name, version } from "ursprung";

export default {
  fetch() {
    return new Response(`${name} v${version}`);
  },
} satisfies ExportedHandler<Env>;
