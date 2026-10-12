// Text links' marker (base.css): it sweeps in from the side the pointer
// came in by and leaves toward the side it went out by. This only sets
// which side the marker is anchored to (data-mk, l or r); CSS does the
// motion. Mouse only; without this, the marker always grows from the left.

const fine = matchMedia("(hover: hover) and (pointer: fine)");
// The same links base.css leaves out of the marker.
const SKIP = ".brand, .skip, .shift, .seg, .row, .get, .mention, .org, nav a";

function link(e: PointerEvent): HTMLAnchorElement | null {
  if (e.pointerType !== "mouse" || !fine.matches) return null;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || a.matches(SKIP)) return null;
  // Moving between the link's own children isn't entering or leaving it.
  if (e.relatedTarget instanceof Node && a.contains(e.relatedTarget)) {
    return null;
  }
  return a;
}

// Left or right of the link's centre: horizontal only, also for a link
// that wraps across lines.
function side(a: Element, e: PointerEvent) {
  const r = a.getBoundingClientRect();
  return e.clientX < r.left + r.width / 2 ? "l" : "r";
}

// When each link's fill started. Leaving before it has finished (a flick)
// keeps the anchor, so a half-done fill retracts the way it came instead
// of jumping to the other side.
const FILL = 320; // base.css: the marker's background-size transition.
const entered = new WeakMap<Element, number>();

document.addEventListener("pointerover", (e) => {
  const a = link(e);
  if (!a) return;
  a.dataset.mk = side(a, e);
  entered.set(a, performance.now());
});

document.addEventListener("pointerout", (e) => {
  const a = link(e);
  if (!a) return;
  if (performance.now() - (entered.get(a) ?? 0) < FILL) return;
  a.dataset.mk = side(a, e);
});

// A module, so its names stay its own.
export {};
