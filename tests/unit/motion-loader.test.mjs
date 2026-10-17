import assert from "node:assert/strict";
import test from "node:test";
import { motionLoader } from "../../scripts/motion-loader.mjs";

const logger = { info: () => {} };
const FILE = "_astro/loader.Ab12_x.js";
const TAG = `<script type="module" src="/${FILE}"></script>`;
const INERT = `<script type="text/motion-loader" data-src="/${FILE}"></script>`;

// What the plugin's generateBundle sees: the loader's chunk (its module
// id as Vite gives it on Windows, with a query), another chunk and an
// asset.
const bundle = {
  [FILE]: {
    type: "chunk",
    fileName: FILE,
    moduleIds: [String.raw`C:\site\src\scripts\loader.ts?astro&type=script`],
  },
  "_astro/page.js": {
    type: "chunk",
    fileName: "_astro/page.js",
    moduleIds: ["/site/src/pages/index.astro"],
  },
  "_astro/site.css": { type: "asset", fileName: "_astro/site.css" },
};
const context = {
  error: (message) => {
    throw new Error(message);
  },
};

test("the loader's tag becomes the inert one on every page, and only it", () => {
  const { plugin, transform } = motionLoader();
  plugin.generateBundle.call(context, {}, bundle);
  const other = '<script type="module" src="/_astro/page.js"></script>';
  const out = transform(
    [
      { page: "index.html", html: `<body>${TAG}${other}</body>` },
      { page: "uses/index.html", html: `<body>${TAG}</body>` },
    ],
    logger,
  );
  assert.deepEqual(out, [
    { page: "index.html", html: `<body>${INERT}${other}</body>` },
    { page: "uses/index.html", html: `<body>${INERT}</body>` },
  ]);
});

test("the build fails if the loader's file or its tag can't be found", () => {
  // No chunk contains the loader: nothing to look for.
  const unfound = motionLoader();
  unfound.plugin.generateBundle.call(context, {}, {});
  assert.throws(
    () => unfound.transform([{ page: "index.html", html: TAG }], logger),
    /no built file contains \/src\/scripts\/loader\.ts/,
  );
  // A page without the tag, or with it twice.
  const { plugin, transform } = motionLoader();
  plugin.generateBundle.call(context, {}, bundle);
  assert.throws(
    () =>
      transform(
        [
          { page: "index.html", html: TAG },
          { page: "404.html", html: "<body></body>" },
          { page: "uses/index.html", html: TAG + TAG },
        ],
        logger,
      ),
    /not so on: 404\.html \(0\), uses\/index\.html \(2\)/,
  );
});
