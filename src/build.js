import { resolve } from "node:path";
export async function buildApp(outdir) {
  const result = await Bun.build({
    entrypoints: ["./src/main.js"],
    target: "browser",
    format: "esm",
    ...(outdir ? { outdir, minify: true } : {}),
    plugins: [
      {
        name: "tone-browser-bundle",
        setup(build) {
          // Retain the project's workaround for Tone 15's extensionless ESM graph.
          build.onResolve({ filter: /^tone$/ }, () => ({
            path: resolve("node_modules/tone/build/Tone.js"),
          }));
        },
      },
    ],
  });
  if (!result.success)
    throw new Error(result.logs.map(String).join("\n") || "Build failed");
  return result.outputs[0];
}
