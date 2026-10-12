import { mkdir, copyFile } from "node:fs/promises";
import { buildApp } from "../src/build.js";
await buildApp("./dist");
await mkdir("./dist/src", { recursive: true });
await copyFile("src/style.css", "dist/src/style.css");
const html = (await Bun.file("index.html").text())
  .replace("/src/main.js", "./main.js")
  .replace("/src/style.css", "./src/style.css");
await Bun.write("dist/index.html", html);
console.log("Browser bundle and page built in dist/");
