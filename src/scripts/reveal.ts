// Scroll reveals, on the platform: IntersectionObserver (inView) and Web
// Animations (el.animate). Every .rv, .rv-mask, .rv-line, .line-title
// and .heat-draw plays once as it scrolls into view and is marked .is-in,
// which other code listens for. Siblings that arrive
// together rise in turn, in reading order.
//
//   .rv          rises 40px (32px on phones) and fades in; headings and
//                large text also come into focus (a short blur)
//   .rv-mask     its child rises out of the clip, settling from a slight
//                skew
//   .rv-line     a hairline draws from the left (a row that also rises
//                draws once it's on its way)
//   .line-title  its words rise out of their clips in turn
//   data-i       order within a group (when the whole group arrives at once)
//   data-d       extra delay for a whole group, in ms (as --d, motion.css),
//                counted from the earliest group that arrives with it
//
// The Fettle band opens as one overlapping sequence: the panel, its
// wordmark letter by letter, the lede, then the screenshot unrolling. The
// hero isn't handled here: it enters on load with CSS alone (motion.css).
//
// Each element arrives as its own top crosses its line (see line, below).
// A box brings its contents: when a block, the band or anything in a
// data-box section arrives, whatever inside it is still waiting and
// already in the window arrives with it, and the rest as soon as it
// scrolls into the window, so an open box never shows an empty part. A
// group delay counts from the earliest one in the batch, so a section
// arriving together keeps its order and a lone late arrival starts at
// once. Once scrolling has stopped for 500ms, whatever is still waiting
// in the window arrives anyway, and whatever a fast scroll carried past,
// above the window, is marked as arrived unplayed (it never rises from
// below on the way back up).
//
// Content never depends on this script. Hidden start states apply only
// under html.motion-ready, which is set after everything already on screen
// has been marked as arrived (so nothing that was seen disappears). If the
// script never runs, nothing is hidden. With reduced motion nothing is
// hidden either, and elements are only marked .is-in.
//
// While the intro curtain is up (html.intro-hold), arrivals wait and play
// together as it lifts, marked .from-intro. Once html has .intro-late (the
// curtain's script never ran), the intro counts as over.

import { EASE, inView, phone, RISE, STAGGER_MS, visible } from "./motion";

const root = document.documentElement;
const BLOCKS = ".rv, .rv-mask, .rv-line, .heat-draw";
const TITLES = ".line-title";
const BAND = ".rv-band";
// A section that arrives as one box (Contact.astro).
const BOX = "[data-box]";
// The band's head and screenshot are part of its own sequence.
const IN_BAND = ".rv-band .band-head, .rv-band .stage";
// A block still at its start state, risen RISE() below where it rests
// (motion.css; the hero and the band's screenshot never are).
const LOW = ".rv:not(.is-in, .hero, .hero *, .band .stage)";
// Headings and large text come into focus as they rise; small text, and
// many elements at once, never blur (it costs too much in Safari).
const SOFT = "h1, h2, h3, .lede";
const BLUR = "blur(6px)";
// Animating a hairline drawn by ::before needs pseudo-element support in
// Web Animations; without it the line is simply there.
const PSEUDO = "pseudoElement" in KeyframeEffect.prototype;

// Reduced motion, as it is now (it can be switched on while the page is
// open).
const calm = matchMedia("(prefers-reduced-motion: reduce)");

// Every animation here, kept until it ends, so they can all be ended at
// once. Under reduced motion none starts (the classes still mark arrival).
const moving = new Set<Animation>();
const go = (
  el: Element,
  frames: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
) => {
  if (calm.matches) return;
  const a = el.animate(frames, options);
  moving.add(a);
  const done = () => moving.delete(a);
  a.finished.then(done, done);
};

// Milliseconds from a CSS time ("420ms", "0.4s"); 0 when unset.
const ms = (value: string) => {
  const n = parseFloat(value);
  if (Number.isNaN(n)) return 0;
  return value.trim().endsWith("ms") ? n : n * 1000;
};

// An element's --d, halved while the intro is on (--d-k, motion.css).
const groupDelay = (el: Element) => {
  const style = getComputedStyle(el);
  const k = parseFloat(style.getPropertyValue("--d-k"));
  return ms(style.getPropertyValue("--d")) * (Number.isNaN(k) ? 1 : k);
};

const order = (a: Element, b: Element) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

// Where an element's box will rest: the observer sees a waiting block, and
// everything inside one, lower by the rise still ahead of it.
const resting = (el: Element) => {
  const r = el.getBoundingClientRect();
  let lift = 0;
  if (root.classList.contains("motion-ready")) {
    const step = RISE();
    for (let a: Element | null = el; a; a = a.parentElement) {
      if (a.matches(LOW)) lift += step;
    }
  }
  return { top: r.top - lift, bottom: r.bottom - lift };
};

// Elements marked data-decode (the band's screenshot) wait until their
// visible images have decoded, at most 300ms, so they never reveal a blank
// or half-painted image.
const decoded = (el: Element) => {
  if (!el.hasAttribute("data-decode")) return Promise.resolve();
  const imgs = [...el.querySelectorAll("img")].filter(visible);
  for (const img of imgs) img.loading = "eager";
  return Promise.race([
    Promise.allSettled(
      imgs.map((img) => img.decode().then(() => void ready.add(img))),
    ),
    new Promise((resolve) => setTimeout(resolve, 300)),
  ]).then(() => undefined);
};

// Whether everything decoded() waited for really loaded and decoded, not
// just ran out of time. Decoded ones are remembered as it goes.
const ready = new WeakSet<HTMLImageElement>();
const allReady = (el: Element) =>
  [...el.querySelectorAll("img")]
    .filter(visible)
    .every((img) => ready.has(img));

// Already shown by something else (a page arriving through a transition
// shows what's in view settled, Base.astro): nothing to play.
const settled = (el: Element) => el.classList.contains("is-in");

// Rise and fade, with a short blur-in on headings and large text (gone by
// 60% of the move).
function rise(el: HTMLElement, delay: number) {
  const from = `translateY(${RISE()}px)`;
  const frames: Keyframe[] = el.matches(SOFT)
    ? [
        { transform: from, opacity: 0, filter: BLUR },
        { filter: "blur(0px)", offset: 0.6 },
        { transform: "none", opacity: 1, filter: "blur(0px)" },
      ]
    : [
        { transform: from, opacity: 0 },
        { transform: "none", opacity: 1 },
      ];
  go(el, frames, {
    duration: 900,
    easing: EASE.out,
    delay,
    fill: "backwards",
  });
}

function reveal(el: HTMLElement, delay: number) {
  if (el.matches(".rv")) {
    rise(el, delay);
    // Logo chips pop in after their row, on the spring.
    for (const chip of el.querySelectorAll<HTMLElement>(".chip")) {
      go(chip, [{ transform: "scale(0.9)" }, { transform: "none" }], {
        duration: 650,
        easing: EASE.spring,
        delay: delay + 160,
        fill: "backwards",
      });
    }
  }
  if (el.matches(".rv-mask")) {
    for (const span of el.querySelectorAll<HTMLElement>(":scope > span")) {
      go(
        span,
        [
          { transform: "translateY(110%) skewY(4deg)", filter: BLUR },
          { filter: "blur(0px)", offset: 0.6 },
          { transform: "none", filter: "blur(0px)" },
        ],
        { duration: 1000, easing: EASE.out, delay, fill: "backwards" },
      );
    }
  }
  if (el.matches(".rv-line") && PSEUDO) {
    // On a row that also rises, the line draws once the row is visible.
    go(el, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      pseudoElement: "::before",
      duration: 900,
      easing: EASE.out,
      delay: delay + (el.matches(".rv") ? 250 : 0),
      fill: "backwards",
    });
  }
  el.classList.add("is-in");
}

// A statement's words rise out of their clips in turn, settling from a
// slight skew (no blur: there are many of them).
function words(el: HTMLElement, delay: number) {
  el.querySelectorAll<HTMLElement>(".w > span").forEach((word, i) => {
    go(
      word,
      [{ transform: "translateY(110%) skewY(4deg)" }, { transform: "none" }],
      {
        duration: 1000,
        easing: EASE.out,
        delay: delay + i * 35,
        fill: "backwards",
      },
    );
  });
  el.classList.add("is-in");
}

// Plays a batch of blocks that arrived together, each group from start(el).
// Siblings rise 80ms apart: by their --i when the whole group arrived at
// once, otherwise in the order they arrived (a group split across two
// arrivals doesn't wait for the half that's already on screen). The steps
// count from the batch's first, so a block arriving alone (a list's
// closing row, indexed after the rows above it) never waits for a turn.
function blocks(batch: HTMLElement[], start: (el: HTMLElement) => number) {
  const groups = new Map<Element | null, HTMLElement[]>();
  for (const el of batch) {
    const group = groups.get(el.parentElement) ?? [];
    group.push(el);
    groups.set(el.parentElement, group);
  }
  const steps = new Map<HTMLElement, number>();
  for (const [parent, group] of groups) {
    const siblings = parent
      ? [...parent.children].filter((c) => c.matches(BLOCKS))
      : group;
    const indexed =
      group.length === siblings.length &&
      group.every((el) => el.dataset.i !== undefined);
    group.forEach((el, n) => {
      steps.set(el, indexed ? Number(el.dataset.i) || 0 : n);
    });
  }
  const first = Math.min(...steps.values());
  for (const [el, i] of steps) {
    const delay = start(el) + (i - first) * STAGGER_MS;
    if (el.hasAttribute("data-decode")) {
      void decoded(el).then(() => reveal(el, delay));
    } else {
      reveal(el, delay);
    }
  }
}

// The band, as one sequence of overlapping steps from one start time. From
// the intro the panel rises from its bottom edge, quicker, and the
// wordmark comes with it as one block (the curtain just spelled one out).
function band(el: HTMLElement) {
  const intro = el.classList.contains("from-intro");
  const r = getComputedStyle(el).getPropertyValue("--band-r").trim() || "0px";
  const letters = el.querySelector(".letters");
  const lede = [...el.querySelectorAll<HTMLElement>(".band-head .rv")];
  const stage = el.querySelector<HTMLElement>(".stage");
  const tilt = stage?.querySelector<HTMLElement>(".tilt");
  const start = performance.now();

  // 1. The panel opens.
  go(
    el,
    [
      {
        clipPath: intro
          ? `inset(100% 0% 0% 0% round ${r})`
          : "inset(10% 6% 10% 6% round 48px)",
      },
      { clipPath: `inset(0% 0% 0% 0% round ${r})` },
    ],
    { duration: intro ? 600 : 1100, easing: EASE.out, fill: "backwards" },
  );
  // 2. The wordmark's letters rise in turn, from 200ms.
  if (letters && !intro) {
    letters.querySelectorAll<HTMLElement>(".l > span").forEach((ch, i) => {
      go(ch, [{ transform: "translateY(130%)" }, { transform: "none" }], {
        duration: 900,
        easing: EASE.out,
        delay: 200 + i * 40,
        fill: "backwards",
      });
    });
  }
  letters?.classList.add("is-in");
  // 3. The lede, from 300ms (100ms from the intro).
  lede.forEach((x, i) => {
    rise(x, (intro ? 100 : 300) + i * STAGGER_MS);
    x.classList.add("is-in");
  });
  el.classList.add("is-in");

  // 4. The screenshot unrolls top-down at full opacity from 450ms (150ms
  //    from the intro), once its image has decoded. The clip reaches past
  //    the image to keep its shadow, and is gone at the end, so the hover
  //    tilt is never clipped.
  //    (5. Its story and facts, arriving with it, follow from 600ms, 300ms
  //    from the intro: play, below.)
  //    From the intro, a screenshot that's ready (it decoded under the
  //    curtain) comes with the panel instead, uncovered by its rising edge:
  //    unrolled after it, the quick panel showed empty first and the image
  //    then popped in, a flicker.
  if (!stage || !tilt) return;
  void decoded(stage).then(() => {
    if (intro && performance.now() - start < 50 && allReady(stage)) {
      stage.classList.add("is-in");
      return;
    }
    const at = (intro ? 150 : 450) - (performance.now() - start);
    go(
      tilt,
      [
        { clipPath: "inset(-12% -8% 100% -8%)" },
        { clipPath: "inset(-12% -8% -12% -8%)" },
      ],
      {
        duration: intro ? 600 : 900,
        easing: EASE.out,
        delay: Math.max(at, 0),
        fill: "backwards",
      },
    );
    stage.classList.add("is-in");
  });
}

// Marks an element as arrived with no animation: it was already on screen.
function arrived(el: Element) {
  el.classList.add("is-in");
  if (el.matches(BAND)) {
    for (const x of el.querySelectorAll(".letters, .band-head .rv, .stage")) {
      x.classList.add("is-in");
    }
  }
}

// Everything that arrived in one go, in reading order. A box brings its
// contents: whatever inside it is still waiting and would rest in the
// window joins the batch; the rest is watched again, to arrive as soon as
// it would rest in the window. A section marked data-box is one box: its
// group delays were written for it arriving as one sequence.
function play(batch: Element[]) {
  const list = [...new Set(batch)].filter((el) => !settled(el));
  // (The list grows as it goes: what a box brings can bring its own.)
  for (const item of list) {
    if (!watching.size) break;
    const box = item.closest(BOX) ?? item;
    for (const el of [...watching.keys()]) {
      if (el === box || !box.contains(el)) continue;
      unwatch(el);
      if (resting(el).top < innerHeight) list.push(el);
      else watch(el, true);
    }
  }
  const sorted = list.sort(order) as HTMLElement[];
  const bands = new Set<Element>(sorted.filter((el) => el.matches(BAND)));
  const delays = new Map(
    sorted.map((el) => [el, bands.has(el) ? 0 : groupDelay(el)]),
  );
  const first = Math.min(...delays.values());
  const from = (el: HTMLElement) => (delays.get(el) ?? first) - first;
  const plain: HTMLElement[] = [];
  const story: HTMLElement[] = [];
  for (const el of sorted) {
    const host = el.closest(BAND);
    if (bands.has(el)) band(el);
    else if (el.matches(TITLES)) words(el, from(el));
    else if (host && bands.has(host)) story.push(el);
    else plain.push(el);
  }
  blocks(plain, from);
  blocks(story, (el) =>
    el.closest(BAND)?.classList.contains("from-intro") ? 300 : 600,
  );
}

const motion = !calm.matches;
const waiting = new Set<Element>();
let pending: Element[] = [];
// The intro holds arrivals for 2.6s at most: if the curtain's script never
// releases them (it failed to load), they play anyway, like the hero.
let held = root.classList.contains("intro-hold");
// The intro is on until the curtain finishes, or until .intro-late if it
// never does.
const intro = () =>
  root.classList.contains("intro-on") && !root.classList.contains("intro-late");

const flush = () => {
  const batch = pending;
  pending = [];
  if (!motion) {
    for (const el of batch) el.classList.add("is-in");
    return;
  }
  // Arriving while the intro is still on (the band's children, which only
  // come into view as the band unclips after the release, on large
  // windows) counts as released by it.
  if (intro()) {
    for (const el of batch) el.classList.add("from-intro");
  }
  if (held && root.classList.contains("intro-hold")) {
    for (const el of batch) waiting.add(el);
  } else {
    play(batch);
  }
};

// Elements that come into view in the same moment play as one batch.
const arrive = (el: Element) => {
  if (!pending.length) queueMicrotask(flush);
  pending.push(el);
};

const release = () => {
  held = false;
  if (intro()) for (const el of waiting) el.classList.add("from-intro");
  play([...waiting]);
  waiting.clear();
};
addEventListener("intro:release", release);
if (held) setTimeout(release, Math.max(0, 2600 - performance.now()));
// The band's screenshot decodes while the curtain is up, so it's ready to
// come in with the band (band(), above).
if (held && motion) {
  for (const el of document.querySelectorAll(".rv-band .stage")) {
    void decoded(el);
  }
}

// Where each kind arrives: 15% up from the bottom of the window (8% on
// phones, where screens are short). The band waits until a good part of it
// is in view, so it opens where it's seen. The footer is the page's last
// thing, so it reveals as soon as it shows. (Anything else that a tall
// window never brings above its line is caught at the end of the page,
// below.) For the window as it is now: a phone turned can cross the line.
const line = (el: Element) =>
  el.matches(BAND)
    ? phone()
      ? 0.8
      : 0.7
    : el.closest("footer")
      ? 1
      : phone()
        ? 0.92
        : 0.85;

// What's measured for an element, and its line. The heatmap is watched by
// its grid, not its heading, so its charge-up starts as the grid itself
// crosses the line. Where the grid is hidden (phones), the section is
// measured.
const aim = (el: Element): [Element, number] => {
  const grid = el.matches(".heat-draw") && el.querySelector(".grid-wrap");
  return [grid && visible(grid) ? grid : el, line(el)];
};

// Elements still waiting to arrive, with the function that stops watching,
// and those of them inside a box that has arrived (near), which arrive as
// soon as they'd rest in the window.
const watching = new Map<Element, () => void>();
const near = new Set<Element>();

const watch = (el: Element, close = false) => {
  let target = el;
  let margin = `0px 0px ${RISE()}px 0px`;
  if (close) near.add(el);
  else {
    const [probe, at] = aim(el);
    target = probe;
    margin = `0px 0px -${Math.round((1 - at) * 100)}% 0px`;
  }
  const stop = inView(
    target,
    () => {
      watching.delete(el);
      near.delete(el);
      arrive(el);
    },
    { margin },
  );
  watching.set(el, stop);
  listen();
};

const unwatch = (el: Element) => {
  watching.get(el)?.();
  watching.delete(el);
  near.delete(el);
};

// A resize (a phone or tablet turned, a window resized) moves things with
// no scroll, and the observer misses some of them: it measures the band
// inside its start clip, 10% of its height below its real top. So on a
// resize, whatever a load at the new size would have shown arrives now,
// measured as on load; the rest are watched again if the lines changed.
// Once a frame at most, and only until everything has arrived.
let narrow = phone();
let sizing = 0;
function resized() {
  if (!watching.size) return quiet();
  if (sizing) return;
  sizing = requestAnimationFrame(() => {
    sizing = 0;
    const turned = phone() !== narrow;
    narrow = phone();
    for (const el of [...watching.keys()]) {
      const close = near.has(el);
      const [probe, at] = aim(el);
      const below = close
        ? resting(el).top >= innerHeight
        : probe.getBoundingClientRect().top >= at * innerHeight;
      if (below && !turned) continue;
      unwatch(el);
      if (below) watch(el, close);
      else arrive(el);
    }
    if (!watching.size) quiet();
  });
}

// At rest (no scroll for 500ms, and once 500ms after the start), whatever
// is still waiting and would rest in the window arrives: the last few
// pixels of a page, a block left just under its line, a find-in-page jump.
// Whatever a fast scroll or a scrollbar drag carried past, above the
// window, is marked as arrived unplayed. A scroll only notes the time; the
// check runs in the timer.
let moved = performance.now();
let still = 0;
const settle = () => {
  const wait = moved + 500 - performance.now();
  if (wait > 0) {
    still = window.setTimeout(settle, wait);
    return;
  }
  still = 0;
  for (const el of [...watching.keys()]) {
    const box = resting(aim(el)[0]);
    if (box.bottom <= 0) {
      unwatch(el);
      arrived(el);
    } else if (box.top < innerHeight - 8) {
      unwatch(el);
      arrive(el);
    }
  }
  if (!watching.size) quiet();
};
function scrolled() {
  moved = performance.now();
  if (!still) still = window.setTimeout(settle, 500);
}

// Both listeners stay only while something is waiting.
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  addEventListener("resize", resized, { passive: true });
  addEventListener("scroll", scrolled, { passive: true });
}
function quiet() {
  listening = false;
  removeEventListener("resize", resized);
  removeEventListener("scroll", scrolled);
}

const all = [
  ...document.querySelectorAll<HTMLElement>(`${BLOCKS}, ${TITLES}, ${BAND}`),
].filter((el) => !el.closest(IN_BAND) && !el.closest(".hero"));

// What's already on screen is marked as arrived first. Before the first
// paint (or under the intro's curtain) nothing has been seen yet, so only
// what's above its line counts; after it, everything visible does, so
// nothing that was seen disappears. Whatever waits inside a box already
// shown (the band open on a tall window, a data-box section partly on
// screen) arrives as soon as it would rest in the window, as if the box
// had just brought it.
const seen =
  performance.getEntriesByType("paint").length > 0 &&
  !root.classList.contains("intro-hold");
for (const el of all) {
  const [probe, at] = aim(el);
  const top = probe.getBoundingClientRect().top;
  const box = el.parentElement?.closest(`${BLOCKS}, ${BAND}`);
  const shown =
    (!!box && settled(box)) || !!el.closest(BOX)?.querySelector(".is-in");
  if (top >= (seen ? 1 : at) * innerHeight) watch(el, shown);
  // On a tall window the band is already above its line under the
  // curtain: it waits to rise with the lift (motion.css), not shown
  // settled where the lifting curtain would uncover it.
  else if (held && el.matches(BAND)) arrive(el);
  else arrived(el);
}
if (motion) root.classList.add("motion-ready");
if (watching.size) scrolled();

// At the end of the page (the footer's bottom edge in the window),
// whatever is in the window and still waiting arrives: on a tall window,
// the last blocks can stay inside the bottom margin even at full scroll
// and would never reveal. Checked once a frame while scrolling, only while
// the footer is on screen; at any zoom (no exact ratio to reach).
const end = document.querySelector("footer");
if (end) {
  let frame = 0;
  const check = () => {
    frame = 0;
    if (end.getBoundingClientRect().bottom > innerHeight + 1) return;
    for (const el of [...watching.keys()]) {
      if (el.getBoundingClientRect().top >= innerHeight) continue;
      unwatch(el);
      arrive(el);
    }
  };
  const queue = () => {
    if (!frame && watching.size) frame = requestAnimationFrame(check);
  };
  inView(
    end,
    (entry) => {
      if (entry.isIntersecting) {
        queue();
        addEventListener("scroll", queue, { passive: true });
      } else {
        removeEventListener("scroll", queue);
      }
    },
    { margin: "0px", once: false },
  );
}

// Keyboard focus inside something still waiting to arrive, or still
// arriving: it shows at once, so focus never lands on something unseen.
document.addEventListener("focusin", (e) => {
  if (!(e.target instanceof Node)) return;
  for (const el of all) {
    if (!el.contains(e.target)) continue;
    unwatch(el);
    waiting.delete(el);
    arrived(el);
    for (const a of moving) {
      const target = (a.effect as KeyframeEffect | null)?.target;
      if (target && el.contains(target)) a.finish();
    }
  }
});

// Reduced motion switched on: everything arriving lands at once.
calm.addEventListener("change", () => {
  if (calm.matches) for (const a of moving) a.finish();
});
