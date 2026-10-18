// The GitHub contributions block (components/Heatmap.astro), once the page
// has first painted. Everything here adds to markup that is already
// complete without it:
// - the grid: one tab stop with arrow-key movement (Home/End along the
//   row), a tooltip for pointer and keyboard, and a crosshair through the
//   marked day;
// - the total rolls into place once, like an odometer;
// - on phones, the weekly strip: drawn here from its data, its bars grow
//   in with the total, and a tap or a drag reads a week.
import { EASE, inView, reduced, stagger } from "../motion";

// Where the total starts rolling (a share of the window's height from the
// top) and its curve: a gentle ease-out, so the digits are still visibly
// moving when the eye gets there (the site's expo-out spends most of its
// change in the first quarter).
const ROLL_LINE = 0.65;
const ROLL_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

type Week = { range: string; total: number; level: number };

const fmtTip = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const plural = (n: number) =>
  `${n.toLocaleString("en-US")} contribution${n === 1 ? "" : "s"}`;
const NS = "http://www.w3.org/2000/svg";

export default function init(root: HTMLElement) {
  const wrap = root.querySelector<HTMLElement>(".grid-wrap");
  const table = wrap?.querySelector("table");
  const tbody = table?.tBodies[0];
  if (!wrap || !table || !tbody) return;
  const monthRow = table.tHead?.rows[0];

  // The grid's charge-up (motion.css) plays only for a heatmap still off
  // screen now; one already on screen stays as it was first painted.
  const section = root.closest(".heat-draw");
  const sbox = root.getBoundingClientRect();
  if (
    section &&
    !section.classList.contains("is-in") &&
    !(sbox.top < innerHeight && sbox.bottom > 0) &&
    !reduced()
  ) {
    section.classList.add("charging");
  }
  const weekCount = (tbody.rows[0]?.cells.length ?? 1) - 1;
  const start = Date.parse(`${root.dataset.start}T00:00:00Z`);
  const offset = new Date(start).getUTCDay();

  // Cells are found by position: row d, column w (after the day label).
  const cellAt = (w: number, d: number) => {
    const cell = tbody.rows[d]?.cells[w + 1];
    return cell?.getAttribute("role") === "gridcell" ? cell : null;
  };
  // On phones CSS hides the whole grid; nothing there to point at.
  const visible = (el: HTMLElement | null): el is HTMLTableCellElement =>
    !!el && el.offsetParent !== null;

  // The crosshair: the marked day's whole row and column take a quiet
  // tint (a band through the grid, always inside it), its weekday and
  // month labels ink in, and the day itself is raised and ringed. The
  // classes go straight onto the cells and labels involved, so nothing
  // is measured or positioned.
  let hot: Element[] = [];
  let band: Element[] = [];
  const unmark = () => {
    for (const h of hot) h.classList.remove("hot");
    for (const c of band) c.classList.remove("band");
    hot = [];
    band = [];
  };
  const mark = (el: HTMLTableCellElement) => {
    unmark();
    const row = el.parentElement as HTMLTableRowElement;
    const col = el.cellIndex;
    band = [
      ...[...row.cells].slice(1),
      ...[...tbody.rows].map((r) => r.cells[col]),
    ].filter((c): c is HTMLTableCellElement => !!c && c !== el);
    for (const c of band) c.classList.add("band");
    // Its month: the label over this week, or the nearest one before it.
    let m = col;
    while (m > 1 && !monthRow?.cells[m]?.textContent?.trim()) m--;
    hot = [el, row.cells[0], monthRow?.cells[m]].filter(
      (x): x is HTMLTableCellElement => !!x,
    );
    for (const h of hot) h.classList.add("hot");
  };

  // The tooltip: the day's count and a shorter date, so it fits on a
  // phone, kept inside the grid's width.
  let tip: HTMLDivElement | null = null;
  const hide = () => {
    tip?.remove();
    tip = null;
    unmark();
  };
  const show = (el: HTMLElement) => {
    if (
      !(el instanceof HTMLTableCellElement) ||
      el.getAttribute("role") !== "gridcell"
    )
      return;
    mark(el);
    const w = el.cellIndex - 1;
    const d = (el.parentElement as HTMLTableRowElement).sectionRowIndex;
    const date = new Date(start + (w * 7 + d - offset) * 86_400_000);
    const count = Number(
      (el.getAttribute("aria-label") ?? "")
        .match(/^[\d,]+/)?.[0]
        ?.replace(/,/g, "") ?? 0,
    );
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "tip";
      tip.setAttribute("aria-hidden", "true");
      wrap.append(tip);
    }
    tip.textContent = `${count ? plural(count) : "No contributions"} on ${fmtTip.format(date)}`;
    const box = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const x = r.left - box.left + r.width / 2;
    tip.style.left = `${Math.min(Math.max(x, half), Math.max(half, wrap.clientWidth - half))}px`;
    tip.style.top = `${r.top - box.top}px`;
  };

  // Roving focus: exactly one cell is tabbable.
  let focused = table.querySelector<HTMLTableCellElement>('[tabindex="0"]');
  const move = (w: number, d: number) => {
    const el = cellAt(w, d);
    if (!visible(el)) return;
    focused?.setAttribute("tabindex", "-1");
    el.setAttribute("tabindex", "0");
    focused = el;
    el.focus();
  };
  wrap.addEventListener("keydown", (e) => {
    const el = e.target as HTMLElement;
    if (
      !(el instanceof HTMLTableCellElement) ||
      el.getAttribute("role") !== "gridcell"
    )
      return;
    const w = el.cellIndex - 1;
    const d = (el.parentElement as HTMLTableRowElement).sectionRowIndex;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = steps[e.key];
    if (step) {
      move(w + step[0], d + step[1]);
    } else if (e.key === "Home" || e.key === "End") {
      const order = [...Array(weekCount).keys()];
      if (e.key === "End") order.reverse();
      const to = order.find((x) => visible(cellAt(x, d)));
      if (to !== undefined) move(to, d);
    } else {
      return;
    }
    e.preventDefault();
  });
  wrap.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement;
    if (
      el instanceof HTMLTableCellElement &&
      el.getAttribute("role") === "gridcell"
    ) {
      focused?.setAttribute("tabindex", "-1");
      el.setAttribute("tabindex", "0");
      focused = el;
      show(el);
    }
  });
  wrap.addEventListener("focusout", hide);
  wrap.addEventListener("pointerover", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      '[role="gridcell"]',
    );
    if (el) show(el);
  });
  wrap.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hide();
  });

  // A tap shows the crosshair and the tooltip until the next tap elsewhere
  // (a mouse clears them on leaving the grid); the strip's reading too.
  const strip = root.querySelector<HTMLElement>(".strip");
  const readout = root.querySelector<HTMLElement>(".readout");
  let pick: (i: number | null) => void = () => {};
  let picked: number | null = null;
  addEventListener("pointerdown", (e) => {
    const target = e.target as Node;
    if (e.pointerType !== "mouse" && !wrap.contains(target)) hide();
    if (strip && !strip.contains(target)) pick(null);
  });

  // The strip (phones), drawn once it has a width. Reduced motion is read
  // each time, so switching it on mid-visit is honoured.
  let drawn: SVGSVGElement | null = null;
  let growWhenDrawn = false;
  const weeks: Week[] = JSON.parse(strip?.dataset.weeks ?? "[]");
  const peak = weeks.reduce(
    (best, w, i) => (w.total > (weeks[best]?.total ?? 0) ? i : best),
    0,
  );
  const peakTotal = weeks[peak]?.total ?? 0;
  // The strip, top to bottom: the busiest week's dates, 56px of bars, the
  // 1px baseline, and the first and last month under it.
  const LABEL = 16;
  const TALL = 56;
  const AXIS = 17;
  const BASE = LABEL + TALL;
  const STRIP = BASE + 1 + AXIS;
  let pitch = 0;
  // The strip's left edge, read once per touch or hover (not on every
  // move) and again after a redraw.
  let left: number | null = null;

  // A bar with a 1px round on its top corners.
  const barPath = (x: number, y: number, w: number, h: number) => {
    const r = Math.min(1, w / 2, h);
    return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`;
  };
  const svgEl = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    attrs: Record<string, string | number>,
  ) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };

  const grow = () => {
    strip?.classList.add("grown");
    if (!drawn || reduced()) return;
    const bars = [...drawn.querySelectorAll<SVGPathElement>(".bar")];
    let last = 0;
    bars.forEach((bar, i) => {
      const delay = stagger(i, bars.length, { each: 12, from: "start" });
      last = Math.max(last, delay);
      bar.animate([{ transform: "scaleY(0.02)" }, { transform: "none" }], {
        duration: 600,
        delay,
        easing: EASE.out,
        fill: "backwards",
      });
    });
    drawn
      .querySelector(".peak-date")
      ?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 300,
        delay: last + 600,
        fill: "backwards",
      });
  };

  const draw = (width: number) => {
    if (!strip || !weeks.length || width <= 0) return;
    pitch = width / weeks.length;
    const gap = Math.max(1, Math.round(pitch * 0.4));
    const bw = Math.max(1, pitch - gap);
    const svg = svgEl("svg", {
      width,
      height: STRIP,
      viewBox: `0 0 ${width} ${STRIP}`,
      "aria-hidden": "true",
    });
    svg.append(
      svgEl("line", {
        class: "base",
        x1: 0,
        x2: width,
        y1: BASE + 0.5,
        y2: BASE + 0.5,
      }),
    );
    // When the strip starts and ends, under the baseline at each end.
    for (const [key, x, anchor] of [
      ["from", 0, "start"],
      ["to", width, "end"],
    ] as const) {
      const text = strip.dataset[key];
      if (!text) continue;
      const end = svgEl("text", {
        class: "axis",
        x,
        y: BASE + 1 + 13,
        "text-anchor": anchor,
      });
      end.textContent = text;
      svg.append(end);
    }
    weeks.forEach((week, i) => {
      const h =
        week.total === 0
          ? 1
          : Math.max(3, Math.round(Math.sqrt(week.total / peakTotal) * TALL));
      const path = svgEl("path", {
        class: i === peak ? "bar peak" : "bar",
        "data-level": week.total ? week.level : 0,
        d: barPath(i * pitch + gap / 2, BASE - h, bw, h),
      });
      svg.append(path);
    });
    // The busiest week's dates sit over its bar, kept inside the strip.
    const px = (peak + 0.5) * pitch;
    const [x, anchor] =
      px < 40
        ? [peak * pitch, "start"]
        : px > width - 40
          ? [(peak + 1) * pitch, "end"]
          : [px, "middle"];
    const label = svgEl("text", {
      class: "peak-date",
      x,
      y: LABEL - 5,
      "text-anchor": anchor,
    });
    label.textContent = weeks[peak]?.range ?? "";
    svg.append(
      label,
      svgEl("line", {
        class: "marker",
        x1: 0,
        x2: 0,
        y1: LABEL - 2,
        y2: BASE,
      }),
    );
    drawn?.remove();
    strip.append(svg);
    drawn = svg;
    left = null;
    // A redraw (a resize, a phone turned) keeps the week being read.
    if (picked !== null) pick(picked);
    if (growWhenDrawn) {
      growWhenDrawn = false;
      grow();
    }
  };
  if (strip) {
    let lastWidth = 0;
    new ResizeObserver(() => {
      const width = strip.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      draw(width);
    }).observe(strip);
  }

  // Reading a week: a tap, a drag across the strip, or a hover (mouse).
  // The reading stays after the finger lifts; a tap anywhere else clears
  // it. A touch that turns into a scroll puts back what was there. The
  // marker slides between weeks (a CSS transition, so it turns around
  // mid-way) and jumps when it first appears.
  pick = (i) => {
    picked = i;
    const week = i === null ? undefined : weeks[i];
    if (readout) {
      readout.textContent = week
        ? `${week.range}: ${week.total ? plural(week.total) : "No contributions"}`
        : "";
    }
    const marker = drawn?.querySelector<SVGLineElement>(".marker");
    if (!marker) return;
    if (i === null) {
      marker.classList.remove("on");
      return;
    }
    const x = `translateX(${Math.round((i + 0.5) * pitch) + 0.5}px)`;
    if (!marker.classList.contains("on")) {
      marker.style.transition = "none";
      marker.style.transform = x;
      marker.classList.add("on");
      requestAnimationFrame(() => marker.style.removeProperty("transition"));
    } else {
      marker.style.transform = x;
    }
  };
  if (strip) {
    const weekAt = (e: PointerEvent) => {
      if (!pitch) return null;
      left ??= strip.getBoundingClientRect().left;
      const i = Math.floor((e.clientX - left) / pitch);
      return Math.min(weeks.length - 1, Math.max(0, i));
    };
    let dragging = false;
    let before: number | null = null;
    strip.addEventListener("pointerenter", () => {
      left = null;
    });
    strip.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      left = null;
      before = picked;
      dragging = true;
      try {
        strip.setPointerCapture(e.pointerId);
      } catch {
        // A pointer the browser no longer tracks: reading still works.
      }
      pick(weekAt(e));
    });
    strip.addEventListener("pointermove", (e) => {
      if (dragging || e.pointerType === "mouse") pick(weekAt(e));
    });
    strip.addEventListener("pointerup", () => {
      dragging = false;
    });
    strip.addEventListener("pointercancel", () => {
      dragging = false;
      pick(before);
    });
    strip.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse" && !dragging) pick(null);
    });
  }

  // The total rolls into place once, like an odometer, when the number
  // itself is well into view, a third of the way up the window (if it's
  // already there, it stays still), slowly enough to be watched: each digit
  // is a reel of 0–9 rolling straight to its digit; the higher digits
  // finish first, and the last one settles with a little spring (each
  // reel has one more row after its last 9, so the spring's overshoot
  // shows the next digit's edge). The real number stays in the page (all
  // a screen reader hears, and what selecting or copying gives); the reels
  // lie over it, aria-hidden, and go once they've stopped. The strip's
  // bars grow with it.
  const count = root.querySelector<HTMLElement>(".count");
  const real = count?.querySelector(".real");
  // Until it rolls, the real number shows. With forced colors (Windows
  // High Contrast) there is no roll: the colors that hide the real number
  // under the reels can't be relied on there.
  const onScreen =
    !!count && count.getBoundingClientRect().top < innerHeight * ROLL_LINE;
  // Reduced motion switched on mid-visit: whatever is moving (the reels,
  // the bars) jumps to its end, and the real number shows.
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    () => {
      if (!reduced()) return;
      for (const a of root.getAnimations({ subtree: true })) {
        if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish();
      }
      count?.querySelector(".face")?.remove();
      count?.classList.remove("rolling");
    },
  );
  if (
    !count ||
    !real ||
    reduced() ||
    onScreen ||
    matchMedia("(forced-colors: active)").matches
  ) {
    if (drawn) grow();
    else growWhenDrawn = true;
    return;
  }

  return inView(
    count,
    () => {
      if (drawn) grow();
      else growWhenDrawn = true;
      if (reduced()) return;
      const text = real.textContent ?? "";
      const digits = [...text].filter((c) => /\d/.test(c)).length;
      const face = document.createElement("span");
      face.className = "face";
      face.setAttribute("aria-hidden", "true");
      const reels: { reel: HTMLElement; digit: number; j: number }[] = [];
      let j = 0;
      for (const ch of text) {
        if (!/\d/.test(ch)) {
          const sep = document.createElement("span");
          sep.textContent = ch;
          face.append(sep);
          continue;
        }
        const col = document.createElement("span");
        col.className = "col";
        const reel = document.createElement("span");
        reel.className = "reel";
        for (let n = 0; n <= 10; n++) {
          const row = document.createElement("span");
          row.textContent = String(n % 10);
          reel.append(row);
        }
        col.append(reel);
        face.append(col);
        reels.push({ reel, digit: Number(ch), j: j++ });
      }
      count.append(face);
      count.classList.add("rolling");
      const span = Math.max(1, digits - 1);
      const spins = reels.map(({ reel, digit, j: k }) =>
        reel
          .animate(
            [
              { transform: "none" },
              { transform: `translateY(${(-digit / 11) * 100}%)` },
            ],
            {
              duration: 1500 + (k / span) * 700,
              easing: k === digits - 1 ? EASE.spring : ROLL_EASE,
              fill: "forwards",
            },
          )
          .finished.catch(() => undefined),
      );
      void Promise.all(spins).then(() => {
        face.remove();
        count.classList.remove("rolling");
      });
    },
    { margin: `0px 0px -${Math.round((1 - ROLL_LINE) * 100)}% 0px` },
  );
}
