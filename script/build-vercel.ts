import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, mkdir, writeFile, cp } from "fs/promises";
import path from "path";

async function buildVercel() {
  // Clean previous output
  await rm(".vercel/output", { recursive: true, force: true });

  // Step 1: Build Vite frontend to .vercel/output/static
  console.log("building client...");
  process.env.VITE_OUTPUT_DIR = ".vercel/output/static";
  await viteBuild({
    build: {
      outDir: path.resolve(".vercel/output/static"),
    },
  });

  // Step 2: Build API handler to .vercel/output/functions/api/index.func/
  const funcDir = ".vercel/output/functions/api/index.func";
  await mkdir(funcDir, { recursive: true });

  console.log("building api function for Vercel Build Output API...");

  // Plugin: replace require.resolve("./xhr-sync-worker.js") with __filename.
  // jsdom uses this to locate its XHR sync worker at runtime. When bundled,
  // the file path is baked in as a string literal which breaks in Vercel's
  // /var/task environment. We replace it with __filename (the bundle itself)
  // which is a no-op for our usage — we never use synchronous XHR.
  const patchXhrWorker = {
    name: "patch-xhr-sync-worker",
    setup(build: any) {
      build.onLoad({ filter: /XMLHttpRequest-impl\.js$/ }, async (args: any) => {
        const fs = await import("fs");
        let contents = fs.readFileSync(args.path, "utf8");
        contents = contents.replace(
          /require\.resolve\(['"]\.\/xhr-sync-worker\.js['"]\)/g,
          "__filename"
        );
        return { contents, loader: "js" };
      });
    },
  };

  await esbuild({
    entryPoints: ["server/vercel-handler.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: `${funcDir}/index.js`,
    // Bundle everything inline — includeFiles is unreliable with Build Output API
    external: [],
    plugins: [patchXhrWorker],
    minify: false,
    logLevel: "info",
    loader: { ".node": "file" },
  });

  // Write .vc-config.json for the function
  await writeFile(
    `${funcDir}/.vc-config.json`,
    JSON.stringify({
      runtime: "nodejs20.x",
      handler: "index.js",
      launcherType: "Nodejs",
      maxDuration: 30,
    }, null, 2)
  );

  // Step 3: Write .vercel/output/config.json with routing rules
  const config = {
    version: 3,
    routes: [
      // API requests go to the serverless function
      {
        src: "/api/(.*)",
        dest: "/api/index",
      },
      // Static file handling
      { handle: "filesystem" },
      // SPA fallback
      {
        src: "/(.*)",
        dest: "/index.html",
      },
    ],
  };

  await writeFile(".vercel/output/config.json", JSON.stringify(config, null, 2));

  console.log("Vercel build complete!");
  console.log("Output structure:");
  console.log("  .vercel/output/static/ — frontend");
  console.log("  .vercel/output/functions/api/index.func/ — API serverless function");
  console.log("  .vercel/output/config.json — routing config");
}

buildVercel().catch((err) => {
  console.error(err);
  process.exit(1);
});
