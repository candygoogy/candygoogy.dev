import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// Below one width the header swaps its nav for the menu and starts to
// follow the page. CSS can't share a media query with a script, so the
// same query is written in each place that needs it; this keeps them one
// value. A new place that needs it is added here too.
test("the header's narrow breakpoint is one value everywhere", () => {
  const header = read("src/components/Header.astro");
  const query = /const narrow = matchMedia\("([^"]+)"\)/.exec(header)?.[1];
  assert.ok(query, "Header.astro's script has the narrow query");
  const uses = (text) => text.split(`@media ${query} {`).length - 1;
  assert.equal(uses(header), 2, `Header.astro's CSS uses ${query} twice`);
  assert.equal(uses(read("src/styles/base.css")), 1, `base.css uses ${query}`);
});
