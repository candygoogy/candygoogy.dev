// The page's motion and pointer details. Started after the page's first
// paint (Base.astro), so the first paint never waits for it and nothing on
// screen at load depends on it (the hero is CSS). On every page: the scroll
// reveals (scripts/reveal.ts), the rounded selection and the link marker's
// side (fine pointers; without them the browser's own selection shows and
// the marker grows from the left). Where there are hover previews,
// scripts/previews.ts. Each element marked data-motion="<name>" gets
// scripts/motion/<name>.ts, imported once per page, whose default export is
// called with it (it may return a cleanup; nothing calls it yet). Each is
// its own file, cached from page to page.

type Init = (root: HTMLElement) => unknown;
const modules = import.meta.glob<{ default: Init }>("./motion/*.ts");

// Each module is on its own: one that fails to load or to start is
// reported and skipped, and never stops the others.
const report = (what: string) => (error: unknown) =>
  console.error(`Motion: ${what} didn't start.`, error);

import("./reveal").catch(report("the scroll reveals"));
import("./selection").catch(report("the selection"));
import("./marker").catch(report("the link marker"));
if (document.querySelector("[data-preview]")) {
  import("./previews").catch(report("the hover previews"));
}

// The motion setting changed during the visit (either way): the one-time
// CSS entrances are done for good, so turning reduced motion off never
// plays them again (motion.css, html.motion-settled).
matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
  "change",
  () => document.documentElement.classList.add("motion-settled"),
  { once: true },
);

// iOS Safari only applies :active (every press: a row's in Rows.astro, the
// contact and 404 buttons) when the page listens for touches.
document.addEventListener("touchstart", () => {}, { passive: true });

// For the curious, once per page.
console.info(
  "Hi. Curious how this works? The source is at github.com/candygoogy/candygoogy.dev",
);

// A row jumped to by a link on the page takes a brief tint, so the eye
// finds it (ProjectRows.astro). A load, a reload or back/forward doesn't
// replay it, as a CSS :target would.
// A plain click or Enter only: one with a modifier or another button opens
// a new tab or window, and the row stays where it is. The tint plays once
// and is gone (ended, or cut short by reduced motion), so turning reduced
// motion off and on again, or printing, can't play it a second time.
document.addEventListener("click", (event) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const href = (event.target as Element).closest("a")?.getAttribute("href");
  const row = href?.startsWith("#") && document.getElementById(href.slice(1));
  if (!row || !row.hasAttribute("data-arrive")) return;
  row.classList.remove("arrived");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  void row.offsetWidth; // Restarts it on a second jump to the same row.
  row.classList.add("arrived");
});
const arrived = (event: AnimationEvent) => {
  if (
    event.target instanceof Element &&
    event.target.matches("[data-arrive]")
  ) {
    event.target.classList.remove("arrived");
  }
};
document.addEventListener("animationend", arrived);
document.addEventListener("animationcancel", arrived);

const roots = new Map<string, HTMLElement[]>();
for (const el of document.querySelectorAll<HTMLElement>("[data-motion]")) {
  const name = el.dataset.motion ?? "";
  roots.set(name, [...(roots.get(name) ?? []), el]);
}
for (const [name, els] of roots) {
  const load = modules[`./motion/${name}.ts`];
  if (!load) continue;
  load()
    .then(({ default: init }) => {
      for (const el of els) {
        try {
          init(el);
        } catch (error) {
          report(`"${name}"`)(error);
        }
      }
    })
    .catch(report(`"${name}"`));
}
