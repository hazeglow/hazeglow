import { defineConfig } from "tsup";
import { readFileSync, readdirSync } from "node:fs";

const SIBLINGS: Record<string, string> = {
  "./Afterglow": "./afterglow.mjs",
  "./core": "./core.mjs",
};

function read(file: string): string {
  return readFileSync(`dist/${file}`, "utf8");
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    afterglow: "src/Afterglow.tsx",
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
        build.onResolve({ filter: /^\.\/(Afterglow|core)$/ }, ({ path, kind }) =>
          kind === "entry-point" ? undefined : { path: SIBLINGS[path], external: true },
        );
      },
    },
  ],
  async onSuccess() {
    const scripts = readdirSync("dist").filter((file) => file.endsWith(".mjs")).sort();
    if (scripts.join() !== "afterglow.mjs,core.mjs,index.mjs") throw new Error(`unexpected output: ${scripts.join()}`);
    const component = read("afterglow.mjs");
    const core = read("core.mjs");
    const index = read("index.mjs");
    if (!/^["']use client["'];/.test(component)) throw new Error('afterglow.mjs lost its "use client" directive');
    if (!component.includes("forwardRef")) throw new Error("afterglow.mjs does not hold the component");
    if (/use client/.test(core + index)) throw new Error("the engine must stay usable on the server");
    if (/from\s*["']react/.test(core + index)) throw new Error("only afterglow.mjs may import react");
    if (/from\s*["']\./.test(core)) throw new Error("core.mjs must stand alone");
    if (!index.includes('from"./afterglow.mjs"') || !index.includes('from"./core.mjs"')) {
      throw new Error("index.mjs must re-export the component and the engine from their own files");
    }
  },
});
