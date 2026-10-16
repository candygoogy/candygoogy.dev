import assert from "node:assert/strict";
import test from "node:test";
import { pruneLookups } from "../../scripts/pages.mjs";

test("a lookup rule no element uses goes; one in use, or of another shape, stays", () => {
  const body = '<p data-i="1">x</p><ol data-rows-3="2" data-astro-cid-x></ol>';
  // Sharing a selector, with more in it, the end of a longer selector, a
  // different property, inside @media, and not a lookup at all.
  const others =
    '[data-i="2"],a{--i:2}[data-i="3"]{--i:3;color:red}p[data-i="4"]{--i:4}' +
    '[data-i="5"]{--w:5}@media (width>1px){[data-i="6"]{--i:6}}' +
    "[data-line=line]{--line-color:var(--line)}";
  const { html, found, removed } = pruneLookups(
    `<style>[data-i="0"]{--i:0}[data-i="1"]{--i:1}[data-d="600"]{--d:.6s}` +
      `[data-astro-cid-x][data-rows-3="2"]{--rows-3:2}${others}</style>${body}`,
  );
  assert.equal(
    html,
    `<style>[data-i="1"]{--i:1}[data-astro-cid-x][data-rows-3="2"]{--rows-3:2}${others}</style>${body}`,
  );
  assert.equal(found, 4);
  assert.equal(removed, 2);
});
