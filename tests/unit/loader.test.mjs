import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// The loader runs browser-only code as soon as it's imported, so its check
// is read out of the source.
const [, pattern, flags] =
  /const MISSING = \/(.+)\/([a-z]*);/.exec(read("src/scripts/loader.ts")) ?? [];

test("the loader reloads for a missing module file, in every engine, and only then", () => {
  assert.ok(pattern, "MISSING is in src/scripts/loader.ts");
  const missing = new RegExp(pattern, flags);
  const url = "https://candygoogy.dev/_astro/reveal.Ab12_x.js";
  for (const error of [
    new TypeError(`Failed to fetch dynamically imported module: ${url}`), // Chrome
    new TypeError(`error loading dynamically imported module: ${url}`), // Firefox
    new TypeError("Importing a module script failed."), // Safari
  ]) {
    assert.ok(missing.test(String(error)), error.message);
  }
  for (const error of [
    new TypeError("Cannot read properties of null (reading 'dataset')"),
    new SyntaxError("Unexpected token '<'"),
  ]) {
    assert.ok(!missing.test(String(error)), error.message);
  }
});

// The whole loader, run as the browser would with stand-ins for the page:
// each module given in missing fails as a file gone after a deploy, every
// other one loads. Its TypeScript is compiled to a plain script first, and
// its imports (and Vite's import.meta.glob) go to the stand-ins.
const loaderJs = ts
  .transpileModule(read("src/scripts/loader.ts"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace("import.meta.glob(", "glob(")
  .replace(/\bimport\(/g, "load(")
  .replace(/^export \{\};$/m, "");

async function run({ missing = [], flag } = {}) {
  const stored = new Map(flag ? [["stale-reload", flag]] : []);
  let reloads = 0;
  const errors = [];
  const noop = () => {};
  const load = (file) =>
    missing.includes(file)
      ? Promise.reject(
          new TypeError(
            `Failed to fetch dynamically imported module: https://candygoogy.dev/_astro/${file.slice(2)}.js`,
          ),
        )
      : Promise.resolve({ default: noop });
  vm.runInNewContext(loaderJs, {
    load,
    glob: () => ({ "./motion/about.ts": () => load("./motion/about.ts") }),
    document: {
      querySelector: () => null,
      querySelectorAll: () => [{ dataset: { motion: "about" } }],
      addEventListener: noop,
      documentElement: { classList: { add: noop } },
    },
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    navigator: { onLine: true },
    location: { reload: () => reloads++ },
    sessionStorage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, String(value)),
      removeItem: (key) => stored.delete(key),
    },
    console: { info: noop, error: (...args) => errors.push(args) },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { flag: stored.get("stale-reload") ?? null, reloads, errors };
}

test("a missing module reloads once; the flag clears once a page loads in full", async () => {
  // A deploy removed a file: one reload, flagged.
  assert.deepEqual(await run({ missing: ["./marker"] }), {
    flag: "1",
    reloads: 1,
    errors: [],
  });
  // Still missing after it (one of them, even the last to load): no second
  // reload, and the flag stays, so this can never loop.
  for (const missing of [["./marker"], ["./motion/about.ts"]]) {
    const again = await run({ missing, flag: "1" });
    assert.equal(again.reloads, 0);
    assert.equal(again.flag, "1");
    assert.equal(again.errors.length, 1);
  }
  // Every module loaded: the flag is cleared...
  assert.deepEqual(await run({ flag: "1" }), {
    flag: null,
    reloads: 0,
    errors: [],
  });
  // ...so a tab still open at the next deploy reloads again.
  assert.equal((await run({ missing: ["./reveal"] })).reloads, 1);
});
