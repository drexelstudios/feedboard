import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm } from "fs/promises";

async function buildVercel() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building api/index.js for Vercel (fully bundled)...");
  await esbuild({
    entryPoints: ["api/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "api/index.js",
    // Bundle everything inline — no external dependencies needed at runtime
    external: [],
    minify: false,
    logLevel: "info",
    // Handle native modules that can't be bundled
    loader: { ".node": "file" },
  });

  console.log("Vercel build complete!");
}

buildVercel().catch((err) => {
  console.error(err);
  process.exit(1);
});
