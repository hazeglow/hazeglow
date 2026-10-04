import { build } from "esbuild";
import { defineConfig } from "tsup";
import { readFileSync, readdirSync } from "node:fs";

const SIBLINGS: Record<string, string> = {
  "./Hazeglow": "./hazeglow.mjs",
  "./core": "./core.mjs",
};

function read(file: string): string {
  return readFileSync(`dist/${file}`, "utf8");
}

async function bundleFor(imports: string): Promise<string> {
  const result = await build({
    stdin: { contents: `import { ${imports} } from "./dist/core.mjs"; console.log(${imports});`, resolveDir: "." },
    bundle: true,
    write: false,
    format: "esm",
    minify: true,
    logLevel: "silent",
  });
  return result.outputFiles[0]?.text ?? "";
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    hazeglow: "src/Hazeglow.tsx",
  },
  format: ["esm"],
  dts: true,
  sourcemap: false,
  clean: true,
  splitting: false,
  target: "es2020",
  external: ["react", "react-dom"],
  minify: true,
  outExtension: () => ({ js: ".mjs" }),
  esbuildPlugins: [
    {
      name: "keep-entries-separate",
      setup(build) {
        build.onResolve({ filter: /^\.\/(Hazeglow|core)$/ }, ({ path, kind }) =>
          kind === "entry-point" ? undefined : { path: SIBLINGS[path], external: true },
        );
      },
    },
  ],
  async onSuccess() {
    const scripts = readdirSync("dist").filter((file) => file.endsWith(".mjs")).sort();
    if (scripts.join() !== "core.mjs,hazeglow.mjs,index.mjs") throw new Error(`unexpected output: ${scripts.join()}`);
    const component = read("hazeglow.mjs");
    const core = read("core.mjs");
    const index = read("index.mjs");
    if (!/^["']use client["'];/.test(component)) throw new Error('hazeglow.mjs lost its "use client" directive');
    if (!component.includes("forwardRef")) throw new Error("hazeglow.mjs does not hold the component");
    if (/use client/.test(core + index)) throw new Error("the engine must stay usable on the server");
    if (/from\s*["']react/.test(core + index)) throw new Error("only hazeglow.mjs may import react");
    if (/from\s*["']\./.test(core)) throw new Error("core.mjs must stand alone");
    if (!index.includes('from"./hazeglow.mjs"') || !index.includes('from"./core.mjs"')) {
      throw new Error("index.mjs must re-export the component and the engine from their own files");
    }
    const helpers = await bundleFor("parseConfig, encodeConfig");
    const renderer = await bundleFor("createRenderer");
    if (!helpers.includes("btoa") || !renderer.includes("#version 300 es")) throw new Error("the tree-shaking check is not looking at real bundles");
    if (helpers.includes("#version 300 es")) throw new Error("the shader must drop out of a bundle that never creates a renderer");
  },
});
