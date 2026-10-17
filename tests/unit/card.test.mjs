import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transformWithOxc } from "vite";

const ROOT = new URL("../../", import.meta.url);

// src/lib/card.ts can't be imported under plain node: it pulls in
// astro:content (through ./projects) and an extensionless ./build. wrap
// and columns use neither, so the module is loaded with its types and
// imports removed. productCard and stamp need both, so they aren't tested
// here; the build renders them for every product.
const source = readFileSync(new URL("src/lib/card.ts", ROOT), "utf8");
const { code } = await transformWithOxc(source, "card.ts", {});
const { WIDTH, columns, wrap } = await import(
  `data:text/javascript,${encodeURIComponent(code.replace(/^import\b.*$/gm, ""))}`
);

const words = (n, prefix) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i % 10}`).join(" ");

test("wrap fills each line up to WIDTH, and no further", () => {
  assert.equal(WIDTH, 72);
  // 24 three-letter words: 18 make 71 columns, and a 19th would make 75.
  const text = words(24, "ab");
  const lines = wrap(text).split("\n");
  assert.deepEqual(
    lines.map((line) => line.length),
    [71, 23],
  );
  assert.equal(lines.join(" "), text);
  // Text that fits stays one line.
  assert.equal(wrap("short and sweet"), "short and sweet");
});

test("wrap starts the first line with first and the rest with indent, both counted", () => {
  // As productCard uses it, for the checks: both prefixes two spaces.
  const lines = wrap(words(40, "w"), "  ", "  ").split("\n");
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.match(line, /^ {2}\S/);
    assert.ok(line.length <= WIDTH, `${line.length} columns: ${line}`);
  }
  // A ten-space first prefix fits 21 two-letter words on the first line
  // (10 + 62 = 72 columns); the next line has no prefix at all.
  const [first, second] = wrap(words(40, "w"), "", " ".repeat(10)).split("\n");
  assert.equal(first, " ".repeat(10) + words(21, "w"));
  assert.match(second, /^w1 /);
});

test("wrap keeps a word longer than WIDTH whole, on a line of its own", () => {
  const long = "x".repeat(WIDTH + 8);
  assert.equal(wrap(`see ${long} here`), `see\n${long}\nhere`);
  assert.equal(wrap(`${long} end`, "  "), `${long}\n  end`);
});

test("columns lines the values up three spaces after the longest label", () => {
  assert.equal(
    columns([
      ["Version", "1.0.0"],
      ["Runs on", "Windows"],
      ["Get it", "https://example.com"],
    ]),
    "Version   1.0.0\nRuns on   Windows\nGet it    https://example.com",
  );
});
