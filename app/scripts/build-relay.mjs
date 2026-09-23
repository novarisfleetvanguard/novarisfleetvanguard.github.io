// Standalone backend bundle for direct Cloudflare API uploads.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = await Bun.build({entrypoints: [resolve(app, "src/relay.ts")], outdir: resolve(app, "dist/relay"), naming: "index.js", target: "browser", format: "esm", external: ["cloudflare:workers"], minify: true, sourcemap: "none"});
if (!result.success) { for (const log of result.logs) console.error(log); throw new Error("relay build failed"); }
console.log("built dist/relay/index.js");
