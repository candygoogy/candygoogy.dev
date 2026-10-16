// Starts the page's motion after the page's first paint, in the built site.
//
// Astro ships the motion loader (src/scripts/loader.ts, imported by a
// <script> in Base.astro) as <script type="module" src="…">, which the
// browser requests while the page is still loading. After the build, this
// turns that one tag into an inert <script type="text/motion-loader"
// data-src="…">; an inline script in Base.astro starts it once the page has
// painted (or at the load event). So nothing motion-related is fetched
// before the page is drawn, and without JS nothing changes at all.
//
// The tag is found by the loader's own output file, read from the build's
// bundle (the chunk that contains src/scripts/loader.ts), not by guessing
// its name. If that chunk can't be found, or a page doesn't carry its tag
// exactly once, the build fails: it never ships with the tag left as is.
// Development is untouched (the loader just runs).
const SOURCE = "/src/scripts/loader.ts";

/** The Vite plugin that finds the loader's file in the bundle, and the step
 * that makes its tag inert on every page (run by scripts/pages.mjs). */
export function motionLoader() {
  /** @type {string | undefined} */
  let file;
  /** @type {import("vite").Plugin} */
  const plugin = {
    name: "motion-loader:find",
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const has = chunk.moduleIds.some((id) =>
          id.replaceAll("\\", "/").split("?")[0]?.endsWith(SOURCE),
        );
        if (!has) continue;
        if (file && file !== chunk.fileName) {
          this.error(
            `motion loader: ${SOURCE} ended up in two files (${file}, ${chunk.fileName}); it must stay in one.`,
          );
        }
        file = chunk.fileName;
      }
    },
  };
  /** @type {import("./pages.mjs").Step} */
  const transform = (pages, logger) => {
    if (!file) {
      throw new Error(
        `motion loader: no built file contains ${SOURCE}. Is it still imported by a <script> in Base.astro, and not inlined?`,
      );
    }
    const src = `/${file}`;
    const escaped = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tag = new RegExp(
      `<script\\b[^>]*\\bsrc="${escaped}"[^>]*>\\s*</script>`,
      "g",
    );
    const inert = `<script type="text/motion-loader" data-src="${src}"></script>`;
    // Every page is built on Base.astro, so every page must carry it.
    const wrong = [];
    for (const { page, html } of pages) {
      const found = html.match(tag)?.length ?? 0;
      if (found !== 1) wrong.push(`${page} (${found})`);
    }
    if (wrong.length || !pages.length) {
      throw new Error(
        `motion loader: expected the tag for ${src} exactly once on every page; not so on: ${wrong.join(", ") || "(no pages)"}.`,
      );
    }
    logger.info(`${pages.length} pages start ${src} after first paint`);
    return pages.map(({ page, html }) => ({
      page,
      html: html.replace(tag, inert),
    }));
  };
  return { plugin, transform };
}
