import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { brotli, kb, weights } from "../../scripts/weights.mjs";

const logger = { info: () => {} };
const context = {
  error: (message) => {
    throw new Error(message);
  },
};

// What the plugin's generateBundle sees: the loader, which imports the
// reveals on every page and a motion module where it's asked for, both of
// which import a shared file.
const bundle = {
  "_astro/loader.js": {
    type: "chunk",
    fileName: "_astro/loader.js",
    moduleIds: [String.raw`C:\site\src\scripts\loader.ts?astro&type=script`],
    imports: [],
    dynamicImports: ["_astro/reveal.js", "_astro/about.js"],
  },
  "_astro/reveal.js": {
    type: "chunk",
    fileName: "_astro/reveal.js",
    moduleIds: [String.raw`C:\site\src\scripts\reveal.ts`],
    facadeModuleId: String.raw`C:\site\src\scripts\reveal.ts`,
    imports: ["_astro/motion.js"],
    dynamicImports: [],
  },
  "_astro/about.js": {
    type: "chunk",
    fileName: "_astro/about.js",
    moduleIds: ["/site/src/scripts/motion/about.ts"],
    facadeModuleId: "/site/src/scripts/motion/about.ts",
    imports: ["_astro/motion.js"],
    dynamicImports: [],
  },
  "_astro/motion.js": {
    type: "chunk",
    fileName: "_astro/motion.js",
    moduleIds: ["/site/src/scripts/motion.ts"],
    imports: [],
    dynamicImports: [],
  },
};
// Text that hardly compresses, the same on every run.
const noise = (seed, length) => {
  let out = "";
  for (let i = 0; out.length < length; i++) {
    out += createHash("sha256").update(`${seed}${i}`).digest("hex");
  }
  return out.slice(0, length);
};
const FILES = {
  "_astro/loader.js": noise("loader", 1500),
  "_astro/reveal.js": noise("reveal", 1500),
  "_astro/about.js": noise("about", 1500),
  "_astro/motion.js": noise("motion", 1500),
  "_astro/fonts/a.woff2": "a".repeat(3000),
  "_astro/fonts/b.woff2": "b".repeat(2200),
};
const FONT = '<link rel="preload" href="/_astro/fonts/a.woff2">';

// A built site in a folder of its own, and the weights step for it.
const site = (t) => {
  const root = mkdtempSync(join(tmpdir(), "weights-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "_astro/fonts"), { recursive: true });
  for (const [file, text] of Object.entries(FILES)) {
    writeFileSync(join(root, file), text);
  }
  const { plugin, transform } = weights();
  plugin.generateBundle.call(context, {}, bundle);
  return transform(root);
};

test("a placeholder takes its page's weight, with the scripts it fetches, and the fonts theirs", (t) => {
  const step = site(t);
  const home = `<body>${FONT}<div data-motion="about">${noise("home", 2000)}</div></body>`;
  const colophon =
    '<p><data value data-weight="index.html" data-astro-cid-x>–</data> KB</p>' +
    '<p><data value="" data-weight="fonts">–</data> KB</p>' +
    '<link href="/_astro/fonts/b.woff2">';
  const [, out] = step(
    [
      { page: "index.html", html: home },
      { page: "colophon.html", html: colophon },
    ],
    logger,
  );
  // The page, the loader, the reveals, the about motion and their shared
  // file, once.
  const scripts = Object.entries(FILES)
    .filter(([file]) => file.endsWith(".js"))
    .reduce((sum, [, text]) => sum + brotli(text), 0);
  const weight = kb(brotli(home) + scripts);
  assert.notEqual(weight, kb(brotli(home)));
  assert.equal(
    out.html,
    `<p><data value="${weight}" data-weight="index.html" data-astro-cid-x>${weight}</data> KB</p>` +
      `<p><data value="5" data-weight="fonts">5</data> KB</p>` +
      '<link href="/_astro/fonts/b.woff2">',
  );
});

test("the build fails on a placeholder it can't fill, or without fonts", (t) => {
  const step = site(t);
  const page = (html) => [{ page: "colophon.html", html: FONT + html }];
  // A page that doesn't exist.
  assert.throws(
    () => step(page('<data value="" data-weight="nope.html">–</data>'), logger),
    /1 of 1 placeholders can't be filled \(nope\.html\)/,
  );
  // One in a shape it doesn't know, so it would stay unfilled.
  assert.throws(
    () => step(page("<data data-weight='colophon.html'>–</data>"), logger),
    /1 of 1 placeholders can't be filled/,
  );
  assert.throws(
    () =>
      step(
        [{ page: "colophon.html", html: '<data value data-weight="fonts">' }],
        logger,
      ),
    /no page links a font/,
  );
});
