import { buildApp } from "./build.js";
const PORT = Number(process.env.PORT) || 3000;

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
        const output = await buildApp();
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
