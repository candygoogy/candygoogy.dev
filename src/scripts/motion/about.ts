// About's timeline (About.astro, the .tl element). Loaded after the first
// paint by Base.astro's motion loader.
//
// The line runs from the first role's dot to the last one's, measured
// here from layout (not the screen, so rows still rising don't skew it)
// to meet them exactly whatever the text wraps to; CSS has a close guess
// for the first paint and for no JS.
//
// Reading it: the line fills with ink as it passes the reading line,
// 60% down the window, following the scroll smoothly (one read per frame,
// only while it's on screen), and each dot pops full as the ink reaches
// it, emptying again above it. The top tail flows only while the timeline
// is on screen (one of the site's two perpetual motions, on purpose).
import { EASE, inView, reduced, scrub } from "../motion";

// The ink's progress for where the line is now (as scrub() measures it).
const progress = (line: HTMLElement) => {
  const r = line.getBoundingClientRect();
  return Math.min(
    Math.max((innerHeight * 0.6 - r.top) / (r.height || 1), 0),
    1,
  );
};

export default function init(tl: HTMLElement) {
  const line = tl.querySelector<HTMLElement>(".line");
  const ink = tl.querySelector<HTMLElement>(".ink");
  const roles = [...tl.querySelectorAll<HTMLElement>(".role")];

  // Each dot's distance down the line, and the line's length.
  let marks: number[] = [];
  let length = 1;
  const centre = (role: HTMLElement) => {
    const dot = role.querySelector<HTMLElement>(".dot");
    return dot ? role.offsetTop + dot.offsetTop + dot.offsetHeight / 2 : 0;
  };
  const place = () => {
    const first = roles[0];
    const last = roles.at(-1);
    if (!first || !last) return;
    const top = centre(first);
    marks = roles.map((r) => centre(r) - top);
    length = Math.max(1, centre(last) - top);
    tl.style.setProperty("--line-top", `${top}px`);
    tl.style.setProperty(
      "--line-bottom",
      `${tl.offsetHeight - centre(last)}px`,
    );
  };
  place();
  new ResizeObserver(place).observe(tl);

  inView(tl, (entry) => tl.toggleAttribute("data-live", entry.isIntersecting), {
    margin: "0px",
    once: false,
  });

  // A dot pops full (a spring from 0.6) and empties quicker.
  const fill = (dot: HTMLElement) => {
    dot.classList.add("on");
    dot.firstElementChild?.animate(
      [{ transform: "scale(0.6)", opacity: 0 }, { transform: "none" }],
      { duration: 650, easing: EASE.spring },
    );
  };
  const empty = (dot: HTMLElement) => {
    dot.classList.remove("on");
    dot.firstElementChild?.animate(
      [{ transform: "none" }, { transform: "scale(0)" }],
      { duration: 220, easing: EASE.inOut },
    );
  };

  if (!line || !ink || reduced()) return;
  const dots = roles.map((r) => r.querySelector<HTMLElement>(".dot"));
  const passed = (i: number, p: number) =>
    (marks[i] ?? 0) <= p * length + 0.5 && p > 0;

  // Until the reading starts the timeline shows complete (the CSS rest
  // state: full line and the current job's dot). Starting it puts
  // every part where the scroll says, with no animation, and switches on
  // the reading state (.scrubbing) in the same frame. A timeline already
  // on screen stays complete until it has left the screen, so nothing
  // seen ever changes on its own; one arriving from the cache keeps the
  // state it was left in.
  let stop: (() => void) | undefined;
  const begin = () => {
    if (tl.classList.contains("scrubbing") || reduced()) return;
    const p = progress(line);
    ink.style.transform = `scaleY(${p})`;
    dots.forEach((dot, i) => dot?.classList.toggle("on", passed(i, p)));
    tl.classList.add("scrubbing");
    stop = scrub(line, (q) => {
      ink.style.transform = `scaleY(${q})`;
      dots.forEach((dot, i) => {
        if (!dot) return;
        const on = passed(i, q);
        if (on && !dot.classList.contains("on")) fill(dot);
        else if (!on && dot.classList.contains("on")) empty(dot);
      });
    });
  };
  const box = tl.getBoundingClientRect();
  if (box.top < innerHeight && box.bottom > 0) {
    const wait = inView(
      tl,
      (entry) => {
        if (entry.isIntersecting) return;
        wait();
        begin();
      },
      { margin: "0px", once: false },
    );
  } else {
    begin();
  }

  // Reduced motion switched on: the reading stops and the timeline shows
  // complete again (the CSS rest state), any dot mid-pop settled.
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    () => {
      if (!reduced()) return;
      stop?.();
      stop = undefined;
      tl.classList.remove("scrubbing");
      ink.style.transform = "";
      for (const a of tl.getAnimations({ subtree: true })) {
        if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
      }
    },
  );
}
