import { resolve } from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const TONE_BROWSER_BUNDLE = resolve("node_modules/tone/build/Tone.js");

async function bundleApp() {
  const result = await Bun.build({
    entrypoints: ["./src/main.js"],
    target: "browser",
    format: "esm",
    plugins: [
      {
        name: "tone-browser-bundle",
        setup(build) {
          // Tone's ESM graph pulls automation-events without file extensions,
          // which Bun cannot resolve. Use the prebuilt browser bundle instead.
          build.onResolve({ filter: /^tone$/ }, () => ({
            path: TONE_BROWSER_BUNDLE,
          }));
        },
      },
    ],
  });

  if (!result.success) {
    const message = result.logs.map((log) => String(log)).join("\n");
    throw new Error(message || "Build failed");
  }

  return result.outputs[0];
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/index.html") {
      return new Response(Bun.file("index.html"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (path === "/src/style.css") {
      return new Response(Bun.file("src/style.css"), {
        headers: { "Content-Type": "text/css; charset=utf-8" },
      });
    }

    if (path === "/src/main.js") {
      try {
        const output = await bundleApp();
        return new Response(output, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        console.error(error);
        return new Response(String(error), {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }

    if (path.startsWith("/assets/")) {
      const file = Bun.file(`public${path}`);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Pinkbox → http://localhost:${server.port}`);
