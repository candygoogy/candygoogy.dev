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
//   --i          order within a group (when the whole group arrives at once)
//   --d          extra delay for a whole group
//
// The Fettle band opens as one overlapping sequence: the panel, its
// wordmark letter by letter, the lede, then the screenshot unrolling. The
// hero isn't handled here: it enters on load with CSS alone (motion.css).
//
// Content never depends on this script. Hidden start states apply only
// under html.motion-ready, which is set after everything already on screen
// has been marked as arrived (so nothing that was seen disappears). If the
// script never runs, nothing is hidden. With reduced motion nothing is
// hidden either, and elements are only marked .is-in.
//
// While the intro curtain is up (html.intro-hold), arrivals wait and play
// together as it lifts, marked .from-intro.

import { EASE, inView, phone, RISE, STAGGER_MS, visible } from "./motion";

const root = document.documentElement;
const BLOCKS = ".rv, .rv-mask, .rv-line, .heat-draw";
const TITLES = ".line-title";
const BAND = ".rv-band";
// The band's head and screenshot are part of its own sequence.
const IN_BAND = ".rv-band .band-head, .rv-band .stage";
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

// Elements marked data-decode (the band's screenshot) wait until their
// visible images have decoded, at most 300ms, so they never reveal a blank
// or half-painted image.
const decoded = (el: Element) => {
  if (!el.hasAttribute("data-decode")) return Promise.resolve();
  const imgs = [...el.querySelectorAll("img")].filter(visible);
  for (const img of imgs) img.loading = "eager";
  return Promise.race([
    Promise.allSettled(imgs.map((img) => img.decode())),
    new Promise((resolve) => setTimeout(resolve, 300)),
  ]).then(() => undefined);
};

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
function words(el: HTMLElement) {
  const delay = groupDelay(el);
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

// Plays a batch of blocks that arrived together. Siblings rise 80ms apart:
// by their --i when the whole group arrived at once, otherwise in the
// order they arrived (a group split across two arrivals doesn't wait for
// the half that's already on screen).
function blocks(batch: HTMLElement[]) {
  const groups = new Map<Element | null, HTMLElement[]>();
  for (const el of batch) {
    const group = groups.get(el.parentElement) ?? [];
    group.push(el);
    groups.set(el.parentElement, group);
  }
  for (const [parent, group] of groups) {
    const siblings = parent
      ? [...parent.children].filter((c) => c.matches(BLOCKS))
      : group;
    const indexed =
      group.length === siblings.length &&
      group.every((el) => el.style.getPropertyValue("--i") !== "");
    group.forEach((el, n) => {
      const i = indexed ? Number(el.style.getPropertyValue("--i")) || 0 : n;
      const delay = groupDelay(el) + i * STAGGER_MS;
      if (el.hasAttribute("data-decode")) {
        void decoded(el).then(() => reveal(el, delay));
      } else {
        reveal(el, delay);
      }
    });
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
  if (!stage || !tilt) return;
  void decoded(stage).then(() => {
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

// Everything that arrived in one go, in reading order.
function play(batch: Element[]) {
  const sorted = [...new Set(batch)].sort(order) as HTMLElement[];
  const plain: HTMLElement[] = [];
  for (const el of sorted) {
    if (settled(el)) continue;
    if (el.matches(BAND)) band(el);
    else if (el.matches(TITLES)) words(el);
    else plain.push(el);
  }
  blocks(plain);
}

const motion = !calm.matches;
const waiting = new Set<Element>();
let pending: Element[] = [];
// The intro holds arrivals for 2.6s at most: if the curtain's script never
// releases them (it failed to load), they play anyway, like the hero.
let held = root.classList.contains("intro-hold");

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
  if (root.classList.contains("intro-on")) {
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
  for (const el of waiting) el.classList.add("from-intro");
  play([...waiting]);
  waiting.clear();
};
addEventListener("intro:release", release);
if (held) setTimeout(release, Math.max(0, 2600 - performance.now()));

// Where each kind arrives: 15% up from the bottom of the window (8% on
// phones, where screens are short). The band waits until a good part of it
// is in view, so it opens where it's seen. The footer is the page's last
// thing, so it reveals as soon as it shows. (Anything else that a tall
// window never brings above its line is caught at the end of the page,
// below.)
const lines = {
  rest: phone() ? 0.92 : 0.85,
  band: phone() ? 0.8 : 0.7,
  footer: 1,
};

// Elements still waiting to arrive, with the function that stops watching.
const watching = new Map<Element, () => void>();

const all = [
  ...document.querySelectorAll<HTMLElement>(`${BLOCKS}, ${TITLES}, ${BAND}`),
].filter((el) => !el.closest(IN_BAND) && !el.closest(".hero"));

// What's already on screen is marked as arrived first. Before the first
// paint (or under the intro's curtain) nothing has been seen yet, so only
// what's above its line counts; after it, everything visible does, so
// nothing that was seen disappears.
const seen =
  performance.getEntriesByType("paint").length > 0 &&
  !root.classList.contains("intro-hold");
for (const el of all) {
  const kind = el.matches(BAND)
    ? "band"
    : el.closest("footer")
      ? "footer"
      : "rest";
  const top = el.getBoundingClientRect().top;
  if (top < (seen ? 1 : lines[kind]) * innerHeight) {
    arrived(el);
    continue;
  }
  const margin = `0px 0px -${Math.round((1 - lines[kind]) * 100)}% 0px`;
  const stop = inView(
    el,
    () => {
      watching.delete(el);
      arrive(el);
    },
    { margin },
  );
  watching.set(el, stop);
}
if (motion) root.classList.add("motion-ready");

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
    for (const [el, stop] of watching) {
      if (el.getBoundingClientRect().top >= innerHeight) continue;
      stop();
      watching.delete(el);
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
    watching.get(el)?.();
    watching.delete(el);
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
