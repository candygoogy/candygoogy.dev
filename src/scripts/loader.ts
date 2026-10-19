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

// A module whose file couldn't be fetched (Chrome and Firefox; Safari):
// most likely a deploy since this page loaded removed it. Tested in
// tests/unit/loader.test.mjs.
const MISSING = /dynamically imported module|Importing a module script failed/;

// Each module is on its own: one that fails to load or to start is
// reported and skipped, and never stops the others. One whose file is gone
// reloads the page instead, for the current files: once, so it can never
// loop, and never offline, where a reload would lose the page. Once every
// module this page asks for has loaded (and so this file, which Base.astro
// guards the same way), the files are current again and the next deploy
// may reload it once more; a page where any of them failed keeps the flag.
const report = (what: string) => (error: unknown) => {
  try {
    if (
      MISSING.test(String(error)) &&
      navigator.onLine &&
      !sessionStorage.getItem("stale-reload")
    ) {
      sessionStorage.setItem("stale-reload", "1");
      location.reload();
      return;
    }
  } catch {
    // No sessionStorage (blocked): reported below.
  }
  console.error(`Motion: ${what} didn't start.`, error);
};

// Every module's file as it's asked for, to clear the flag once all of
// them have loaded (at the end).
const loading: Promise<unknown>[] = [];
const track = <T>(file: Promise<T>) => {
  loading.push(file);
  return file;
};

track(import("./reveal")).catch(report("the scroll reveals"));
track(import("./selection")).catch(report("the selection"));
track(import("./marker")).catch(report("the link marker"));
if (document.querySelector("[data-preview]")) {
  track(import("./previews")).catch(report("the hover previews"));
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
  track(load())
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

Promise.all(loading).then(
  () => {
    try {
      sessionStorage.removeItem("stale-reload");
    } catch {
      // No sessionStorage: there's no flag to clear.
    }
  },
  () => {
    // One failed: reported above, and the flag stays.
  },
);
