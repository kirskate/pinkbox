import { readdir } from "node:fs/promises";
const parser = new Bun.Transpiler({ loader: "js" });
for (const directory of ["src", "scripts", "tests"]) {
  for (const filename of await readdir(directory)) {
    if (!/\.m?js$/.test(filename)) continue;
    const path = `${directory}/${filename}`;
    try {
      parser.transformSync(await Bun.file(path).text());
    } catch (error) {
      console.error(`Syntax error in ${path}:`, error);
      process.exit(1);
    }
  }
}
console.log("JavaScript syntax checks passed");
