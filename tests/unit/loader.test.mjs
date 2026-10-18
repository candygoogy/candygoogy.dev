import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
