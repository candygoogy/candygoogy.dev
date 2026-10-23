import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// The footer's slots as the build wrote them (DESIGN.md, Footer): the
// notes (©, the privacy claim, the build stamp), then the property's own
// links, then Back to top, which the 404 leaves out. It reads dist/, so it
// runs after `npm run build`; without a build it's skipped.

const DIST = new URL("../../dist/", import.meta.url);
const skip =
  !existsSync(new URL("404.html", DIST)) && "no dist/: run `npm run build`";

const footer = (page) => {
  const html = readFileSync(new URL(page, DIST), "utf8");
  const match = /<footer[\s\S]*?<\/footer>/.exec(html);
  assert.ok(match, `${page} has a footer`);
  return match[0];
};

// Each slot's first appearance, in the order the footer gives them.
const order = (html, slots) =>
  slots.map((s) => [s, html.indexOf(s)]).filter(([, i]) => i !== -1);

const SLOTS = [
  "©",
  "No trackers, no cookies",
  "Built",
  ">Colophon<",
  ">Uses<",
  'href="#top"',
];

for (const page of ["index.html", "colophon.html", "uses.html"]) {
  test(
    `${page}: the footer's slots, in order, Back to top last`,
    { skip },
    () => {
      const found = order(footer(page), SLOTS);
      assert.deepEqual(
        found.map(([s]) => s),
        SLOTS,
      );
      const at = found.map(([, i]) => i);
      assert.deepEqual(
        at,
        [...at].sort((a, b) => a - b),
      );
    },
  );
}

test("404.html: the same footer without Back to top", { skip }, () => {
  const html = footer("404.html");
  assert.equal(html.includes('href="#top"'), false);
  const found = order(html, SLOTS.slice(0, -1));
  assert.deepEqual(
    found.map(([s]) => s),
    SLOTS.slice(0, -1),
  );
});
