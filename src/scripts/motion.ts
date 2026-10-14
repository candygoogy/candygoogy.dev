// The shared motion helpers. Everything moves on the platform: el.animate()
// (Web Animations), IntersectionObserver and CSS, with no library. The
// curves are the tokens in tokens.css, read once, so CSS and scripts share
// them exactly.

const token = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
  fallback;

export const EASE = {
  // Entrances, counters, draws.
  out: token("--ease-out", "cubic-bezier(0.16, 1, 0.3, 1)"),
  // Things moving on screen: shared elements, packets.
  inOut: token("--ease-in-out", "cubic-bezier(0.77, 0, 0.175, 1)"),
  // Hover, press, toggles.
  ui: token("--ease-ui", "cubic-bezier(0.23, 1, 0.32, 1)"),
  // Spreading signals (the antenna's waves).
  sine: token("--ease-sine", "cubic-bezier(0.39, 0.575, 0.565, 1)"),
  // Things that land: pops, dots, pills (a small overshoot, then still).
  spring: ((curve) =>
    CSS.supports("transition-timing-function", curve)
      ? curve
      : "cubic-bezier(0.34, 1.4, 0.64, 1)")(
    token("--ease-spring", "cubic-bezier(0.34, 1.4, 0.64, 1)"),
  ),
};

// Where a curve is at progress p (0 to 1), computed by the browser itself
// from a target-less animation, so it matches CSS exactly, linear() too.
const probes = new Map<string, Animation>();
export function easeAt(easing: string, p: number) {
  let probe = probes.get(easing);
  if (!probe) {
    probe = new Animation(
      new KeyframeEffect(null, null, { duration: 1000, easing, fill: "both" }),
    );
    probe.pause();
    probes.set(easing, probe);
  }
  probe.currentTime = Math.min(Math.max(p, 0), 1) * 1000;
  return probe.effect?.getComputedTiming().progress ?? p;
}

export const reduced = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches;
export const phone = () => matchMedia("(max-width: 40rem)").matches;

// How far a block rises into place (px), and the gap between siblings.
export const RISE = () => (phone() ? 32 : 40);
export const STAGGER_MS = 80;

// checkVisibility() throws on older iOS Safari: a box on the page is the
// same answer there.
export const visible = (el: Element) =>
  typeof el.checkVisibility === "function"
    ? el.checkVisibility()
    : el.getClientRects().length > 0;

// Calls back when the element comes into view: by default once, as its
// top crosses 85% of the window (92% on phones), then it stops watching.
// With once: false it calls back on every change, entering and leaving
// (check entry.isIntersecting). One observer is shared per margin.
// Returns a function that stops watching.
type Watch = (entry: IntersectionObserverEntry) => void;
const observers = new Map<
  string,
  { io: IntersectionObserver; watching: Map<Element, Set<Watch>> }
>();

export function inView(
  el: Element,
  cb: Watch,
  {
    margin = phone() ? "0px 0px -8% 0px" : "0px 0px -15% 0px",
    once = true,
  }: { margin?: string; once?: boolean } = {},
) {
  let shared = observers.get(margin);
  if (!shared) {
    const watching = new Map<Element, Set<Watch>>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          for (const fn of [...(watching.get(entry.target) ?? [])]) fn(entry);
        }
      },
      { rootMargin: margin },
    );
    shared = { io, watching };
    observers.set(margin, shared);
  }
  const { io, watching } = shared;
  const stop = () => {
    const set = watching.get(el);
    set?.delete(watch);
    if (set?.size === 0) {
      watching.delete(el);
      io.unobserve(el);
    }
  };
  const watch: Watch = (entry) => {
    if (!once) return cb(entry);
    if (!entry.isIntersecting) return;
    stop();
    cb(entry);
  };
  const set = watching.get(el) ?? new Set<Watch>();
  set.add(watch);
  if (!watching.has(el)) {
    watching.set(el, set);
    io.observe(el);
  }
  return stop;
}

// The delay (ms) for item i of n, spreading from the start, the end, the
// center or the edges. The spread (each × the farthest item) follows the
// curve, so with `out` the first items leave in quick order and the tail
// settles; pass "linear" for even steps.
export function stagger(
  i: number,
  n: number,
  {
    each = STAGGER_MS,
    from = "start",
    ease = EASE.out,
  }: {
    each?: number;
    from?: "start" | "center" | "end" | "edges";
    ease?: string;
  } = {},
) {
  if (n < 2) return 0;
  const mid = (n - 1) / 2;
  const spread = from === "center" || from === "edges" ? mid : n - 1;
  const distance =
    from === "start"
      ? i
      : from === "end"
        ? n - 1 - i
        : from === "center"
          ? Math.abs(i - mid)
          : mid - Math.abs(i - mid);
  return each * spread * easeAt(ease, distance / spread);
}

// Calls onProgress(0 to 1) as the element passes a reading line (`line`,
// 0.6 = 60% down the window): 0 as its top reaches the line, 1 as its
// bottom does. The value glides toward the scroll position instead of
// stepping with the wheel: `lerp` is the share of the gap closed per 60th
// of a second, scaled by the real time between frames, so the glide takes
// the same time on a 60Hz, 120Hz or 144Hz screen. It runs only while the
// element is on screen, one layout read per frame at most. Under reduced
// motion it follows the scroll exactly. Returns a function that stops it.
export function scrub(
  el: Element,
  onProgress: (p: number) => void,
  { line = 0.6, lerp = 0.14 }: { line?: number; lerp?: number } = {},
) {
  let current = NaN;
  let frame = 0;
  let last = 0;
  let on = false;
  const target = () => {
    const r = el.getBoundingClientRect();
    const p = (innerHeight * line - r.top) / (r.height || 1);
    return Math.min(Math.max(p, 0), 1);
  };
  const tick = (now: number) => {
    frame = 0;
    const goal = target();
    // At most 100ms counted, so a frame after a stall doesn't jump.
    const dt = last ? Math.min(now - last, 100) : 1000 / 60;
    last = now;
    const k = reduced() ? 1 : 1 - (1 - lerp) ** (dt / (1000 / 60));
    current = Number.isNaN(current) ? goal : current + (goal - current) * k;
    if (Math.abs(goal - current) < 0.001) current = goal;
    onProgress(current);
    if (on && current !== goal) frame = requestAnimationFrame(tick);
    else last = 0;
  };
  const kick = () => {
    if (on && !frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  };
  // Whenever it goes on or off screen, it settles at once to exactly where
  // the scroll has put it: a fast scroll or a jump that carries it off
  // screen mid-glide doesn't leave it stuck part-way (1 when it's gone
  // above, 0 below), and one that comes back after a jump starts from its
  // true place instead of gliding across. Off screen nothing is seen.
  const stopView = inView(
    el,
    (entry) => {
      on = entry.isIntersecting;
      cancelAnimationFrame(frame);
      frame = 0;
      current = target();
      onProgress(current);
      kick();
    },
    { margin: "0px", once: false },
  );
  addEventListener("scroll", kick, { passive: true });
  addEventListener("resize", kick, { passive: true });
  return () => {
    stopView();
    removeEventListener("scroll", kick);
    removeEventListener("resize", kick);
    cancelAnimationFrame(frame);
  };
}
