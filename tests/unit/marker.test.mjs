import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// A selector list as a sorted set, whitespace and line breaks aside.
const set = (list) =>
  list
    .split(",")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .sort();

test("marker.ts skips the same links base.css leaves out of the marker", () => {
  const skip = /const SKIP =\s*"([^"]+)";/.exec(
    read("src/scripts/marker.ts"),
  )?.[1];
  assert.ok(skip, "SKIP is in src/scripts/marker.ts");
  // Each of base.css's copies: the :where() lists that leave out .brand.
  const css = [...read("src/styles/base.css").matchAll(/:where\(([^)]*)\)/g)]
    .map(([, list]) => list)
    .filter((list) => set(list).includes(".brand"));
  assert.ok(css.length > 0, "base.css still leaves links out with :where()");
  for (const list of css) assert.deepEqual(set(list), set(skip));
});
