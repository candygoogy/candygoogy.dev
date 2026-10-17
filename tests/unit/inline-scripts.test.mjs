import assert from "node:assert/strict";
import test from "node:test";
import { inlineScripts } from "../../scripts/inline-scripts.mjs";

const logs = [];
const logger = { info: (message) => logs.push(message) };

// Base.astro's three plain inline scripts, each a self-contained function
// with comments, as written in the source.
const THEME = `(() => {
  // The saved theme, before first paint.
  const saved = localStorage.getItem("theme");
  if (saved) document.documentElement.dataset.theme = saved;
})();`;
const NAV = `(() => {
  /* Navigations between pages. */
  const links = document.querySelectorAll("a");
  console.log(links.length);
})();`;
const START = `(() => {
  // Starts the motion loader after first paint.
  requestAnimationFrame(() => console.log("start"));
})();`;
const JSON_LD = '<script type="application/ld+json">{"name":"x"}</script>';
const MODULE = '<script type="module" src="/_astro/page.js"></script>';

const page = (extra = "") =>
  `<head><script>${THEME}</script>${JSON_LD}</head>` +
  `<body><script>${NAV}</script><script>${START}</script>${MODULE}${extra}</body>`;

test("the plain inline scripts are minified once each, and nothing else is touched", () => {
  logs.length = 0;
  const out = inlineScripts(
    [
      { page: "index.html", html: page() },
      { page: "uses/index.html", html: page() },
    ],
    logger,
  );
  assert.deepEqual(
    out.map((p) => p.page),
    ["index.html", "uses/index.html"],
  );
  // The same three scripts on both pages, written the same way.
  assert.equal(out[0].html, out[1].html);
  const html = out[0].html;
  assert.ok(html.length < page().length);
  for (const comment of ["The saved theme", "Navigations", "Starts the"]) {
    assert.ok(!html.includes(comment), `"${comment}" is gone`);
  }
  assert.equal(html.match(/<script>/g)?.length, 3);
  // Still the same code, with its local names shortened.
  assert.ok(html.includes("localStorage.getItem("));
  assert.ok(!html.includes("saved"));
  // JSON-LD and the module with a src are left exactly as they were.
  assert.ok(html.includes(JSON_LD));
  assert.ok(html.includes(MODULE));
  // Three distinct scripts, each minified once for both pages.
  assert.match(logs[0], /^3 inline scripts minified on 2 pages/);
});

test("a page without exactly three plain scripts fails the build", () => {
  // One that gained an attribute would be skipped, so it's an error.
  const html = page().replace(`<script>${START}`, `<script defer>${START}`);
  assert.throws(
    () =>
      inlineScripts(
        [
          { page: "index.html", html: page() },
          { page: "about.html", html },
        ],
        logger,
      ),
    /about\.html has 2 plain inline scripts, not 3/,
  );
  assert.throws(() => inlineScripts([], logger), /no pages were built/);
});

test("an inline module that still has a comment fails the build", () => {
  // Inline modules aren't minified here (the build already did), but no
  // page ships one with a comment left in it.
  const html = page('<script type="module">// a note\nrun();</script>');
  assert.throws(
    () => inlineScripts([{ page: "index.html", html }], logger),
    /index\.html ships a module script with comments/,
  );
});
