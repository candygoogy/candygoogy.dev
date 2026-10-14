// The contact section (Contact.astro, section#contact). Loaded after the
// first paint by Base.astro's motion loader.
import { EASE } from "../motion";

const LABELS: Record<string, string> = {
  online: "Online",
  idle: "Idle",
  dnd: "Do not disturb",
  offline: "Offline",
};

// The pill's fill starts just outside the edge the pointer came through.
const OFF = {
  l: ["-101%", "0%"],
  r: ["101%", "0%"],
  t: ["0%", "-101%"],
  b: ["0%", "101%"],
} as const;

export default function init(root: HTMLElement) {
  // Copy is enabled first, so nothing below can leave it disabled.
  for (const b of root.querySelectorAll("[data-copy]")) {
    b.removeAttribute("aria-disabled");
  }
  const calm = matchMedia("(prefers-reduced-motion: reduce)");

  // Discord presence through our own Worker (/api/presence returns only
  // {status}). Fetched once the page is up and when the tab becomes
  // visible again, at most once a minute. Hidden without JS, on errors and
  // on no status; with JS its line is kept from the start, so the card
  // never grows, and the status rises into it when it arrives.
  const badge = root.querySelector<HTMLElement>("[data-presence]");
  let lastFetch = 0;
  let pinged = false;

  // With no status the name sits centred against the avatar, moved down
  // by half the kept line (CSS, from the first paint). When the status
  // comes, the name glides up into place as the line rises in; if it
  // goes again, the reverse. Transforms only, so nothing is laid out
  // again.
  const name = badge?.parentElement?.querySelector<HTMLElement>(".name");
  // How far the name sits below its own place while there's no status:
  // half the kept line (its height plus its margin), as in the CSS.
  const drop = () =>
    badge
      ? (badge.offsetHeight + parseFloat(getComputedStyle(badge).marginTop)) / 2
      : 0;
  // The name moves between its two places (centred with no status, its own
  // with one); each move ends exactly where the CSS then holds it, so
  // nothing snaps when the animation lets go.
  const glide = (from: number, to: number) =>
    name?.animate(
      [
        { transform: from ? `translateY(${from}px)` : "none" },
        { transform: to ? `translateY(${to}px)` : "none" },
      ],
      { duration: 400, easing: EASE.out },
    );
  const show = (el: HTMLElement) => {
    if (!el.hidden) return;
    const y = drop();
    el.hidden = false;
    if (calm.matches) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
      return;
    }
    glide(y, 0);
    el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 400, easing: EASE.out },
    );
  };
  const hide = (el: HTMLElement) => {
    if (el.hidden) return;
    const y = drop();
    el.hidden = true;
    if (!calm.matches) glide(0, y);
  };

  // A signal that gives up after ms (AbortSignal.timeout is missing on
  // older Safari).
  const timeout = (ms: number) => {
    if (typeof AbortSignal.timeout === "function")
      return AbortSignal.timeout(ms);
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };

  async function refresh() {
    if (!badge || Date.now() - lastFetch < 60_000) return;
    lastFetch = Date.now();
    try {
      const res = await fetch("/api/presence", { signal: timeout(4000) });
      const { status } = res.ok
        ? ((await res.json()) as { status: string | null })
        : { status: null };
      const label = status ? LABELS[status] : undefined;
      if (!status || !label) {
        hide(badge);
        return;
      }
      badge.dataset.status = status;
      const text = badge.querySelector(".state");
      if (text) text.textContent = label;
      show(badge);
      // One ping when online, the first time it shows.
      if (status === "online" && !pinged) {
        pinged = true;
        badge.classList.add("ping");
      }
    } catch {
      hide(badge);
    }
  }

  if (badge) {
    void refresh();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refresh();
    });
  }

  // Hover, on each of the pill's two segments: a soft accent fill slides
  // in from the edge the pointer came through (the nearest of four) and
  // leaves toward the edge it went out by. CSS transitions do the moving,
  // so coming back while it's still leaving, it turns around from where
  // it is. From rest, the fill is first put at the entry edge with its
  // transition off for one frame. Mouse only (by the event's own
  // pointerType); a touch gets a plain fill while pressed.
  for (const seg of root.querySelectorAll<HTMLElement>(".pill .seg")) {
    const fill = seg.querySelector<HTMLElement>(".fill");
    if (!fill) continue;
    const edge = (e: PointerEvent) => {
      const r = seg.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const d = { l: x, r: 1 - x, t: y, b: 1 - y };
      return (Object.keys(d) as (keyof typeof d)[]).reduce((a, k) =>
        d[k] < d[a] ? k : a,
      );
    };
    const at = (side: keyof typeof OFF) => {
      fill.style.setProperty("--fx", OFF[side][0]);
      fill.style.setProperty("--fy", OFF[side][1]);
    };
    seg.classList.add("sweeps");
    seg.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      if (seg.dataset.sweep === "out") {
        seg.dataset.sweep = "in";
        return;
      }
      delete seg.dataset.sweep;
      at(edge(e));
      requestAnimationFrame(() => {
        if (seg.matches(":hover")) seg.dataset.sweep = "in";
      });
    });
    seg.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse") return;
      if (seg.dataset.sweep !== "in") {
        delete seg.dataset.sweep;
        return;
      }
      at(edge(e));
      seg.dataset.sweep = "out";
    });
    fill.addEventListener("transitionend", () => {
      if (seg.dataset.sweep === "out") delete seg.dataset.sweep;
    });
  }

  // Sending: on click (or Enter), the envelope's flap opens, the envelope
  // leaves to the right and a fresh one slides in from the left (~420ms).
  // It runs alongside the mailto navigation and never delays it.
  for (const email of root.querySelectorAll<HTMLElement>(".pill .address")) {
    const leaving = email.querySelector<SVGElement>(".env-out");
    const flap = leaving?.querySelector<SVGElement>(".flap");
    const arriving = email.querySelector<SVGElement>(".env-in");
    let running: Animation[] = [];

    email.addEventListener("click", () => {
      if (calm.matches || !leaving || !flap || !arriving) return;
      for (const a of running) a.cancel();
      running = [
        flap.animate([{ transform: "none" }, { transform: "scaleY(-1)" }], {
          duration: 120,
          easing: EASE.out,
          fill: "forwards",
        }),
        leaving.animate(
          [
            { transform: "none" },
            { transform: "translateX(14px)", opacity: 0 },
          ],
          { duration: 180, delay: 120, easing: EASE.inOut, fill: "forwards" },
        ),
        arriving.animate(
          [{ transform: "translateX(-14px)", opacity: 0 }, { opacity: 1 }],
          { duration: 180, delay: 240, easing: EASE.out, fill: "both" },
        ),
      ];
      // At rest the two copies look the same, so dropping every animation
      // at the end swaps them back without a visible change.
      const set = running;
      Promise.all(set.map((a) => a.finished))
        .then(() => {
          for (const a of set) a.cancel();
        })
        .catch(() => {});
    });
  }

  // iOS Safari only applies :active (the press) when the page listens
  // for touches.
  document.addEventListener("touchstart", () => {}, { passive: true });

  // Copy. On copying, "Copy" leaves upward out of its cell while "Copied"
  // rises in from below, settling from a slight lean; the copy icon gives
  // way and a check draws in with a small spring. Two seconds later it goes
  // back, quicker and calmer: "Copied" drops out downward (an undo, not a
  // next step), "Copy" comes down from above, the check fades as the copy
  // icon rises back. A click mid-way carries on from where things are, so
  // nothing stacks or jumps. The live region says "copied" either way;
  // under reduced motion the words just swap.
  for (const button of root.querySelectorAll<HTMLButtonElement>(
    "[data-copy]",
  )) {
    const status = button
      .closest(".mail")
      ?.querySelector<HTMLElement>("[data-copy-status]");
    const idle = button.querySelector<HTMLElement>(".copy-label .idle");
    const done = button.querySelector<HTMLElement>(".copy-label .done");
    const glyph = button.querySelector<SVGElement>(".glyph");
    const check = button.querySelector<SVGElement>(".check");
    const stroke = check?.querySelector<SVGPathElement>("path");
    let timer: number | undefined;

    // Moves an element to `to`. If it's still moving, it starts from
    // where it is now (read before its animation is dropped); otherwise
    // from `from`.
    const move = (
      el: Element | null | undefined,
      from: Keyframe,
      to: Keyframe,
      options: KeyframeAnimationOptions,
    ) => {
      if (!el) return;
      const moving = el.getAnimations();
      let start = from;
      if (moving.length) {
        const now = getComputedStyle(el);
        start = { transform: now.transform, opacity: now.opacity };
        for (const a of moving) a.cancel();
      }
      el.animate([start, to], { fill: "backwards", ...options });
    };

    const parts = [idle, done, glyph, check, stroke];
    const moving = () =>
      parts.some((el) => el && el.getAnimations().length > 0);

    const forward = () => {
      // Already showing "Copied" and at rest: nothing to play again.
      if (button.dataset.state === "done" && !moving()) return;
      // The check draws only if none of it is showing (no second check
      // over one that's still there, even while it fades out).
      const drawn = check ? getComputedStyle(check).opacity !== "0" : true;
      button.dataset.state = "done";
      if (calm.matches) return;
      move(
        idle,
        { transform: "none", opacity: 1 },
        { transform: "translateY(-100%)", opacity: 1 },
        { duration: 180, easing: EASE.inOut, fill: "none" },
      );
      move(
        done,
        { transform: "translateY(100%) skewY(4deg)", opacity: 1 },
        { transform: "none", opacity: 1 },
        { duration: 280, delay: 80, easing: EASE.out },
      );
      move(
        glyph,
        { transform: "none", opacity: 1 },
        { transform: "scale(0.9)", opacity: 0 },
        { duration: 140, easing: EASE.inOut, fill: "none" },
      );
      move(
        check,
        { transform: "scale(0.9)", opacity: 1 },
        { transform: "none", opacity: 1 },
        { duration: 450, delay: 60, easing: EASE.spring },
      );
      if (stroke && !drawn) {
        for (const a of stroke.getAnimations()) a.cancel();
        stroke.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
          duration: 280,
          delay: 60,
          easing: EASE.out,
          fill: "backwards",
        });
      }
    };

    const back = () => {
      delete button.dataset.state;
      if (status) status.textContent = "";
      if (calm.matches) return;
      move(
        done,
        { transform: "none", opacity: 1 },
        { transform: "translateY(100%)", opacity: 1 },
        { duration: 160, easing: EASE.inOut, fill: "none" },
      );
      move(
        idle,
        { transform: "translateY(-100%)", opacity: 1 },
        { transform: "none", opacity: 1 },
        { duration: 240, delay: 60, easing: EASE.out },
      );
      move(
        check,
        { transform: "none", opacity: 1 },
        { transform: "scale(0.9)", opacity: 0 },
        { duration: 160, easing: EASE.inOut, fill: "none" },
      );
      move(
        glyph,
        { transform: "translateY(30%)", opacity: 0 },
        { transform: "none", opacity: 1 },
        { duration: 240, delay: 40, easing: EASE.out },
      );
    };

    // The clipboard API needs a secure page; elsewhere the older copy
    // command still works on a selection. "Copied" shows only for a real
    // copy; failing both, the address is selected, ready to copy by hand.
    const copy = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // 16px, so iOS doesn't zoom in on it; the range, for iOS's select().
        const was = document.activeElement;
        const area = document.createElement("textarea");
        area.value = text;
        area.readOnly = true;
        area.style.cssText = "position:fixed;top:0;opacity:0;font-size:16px";
        document.body.append(area);
        area.focus({ preventScroll: true });
        area.select();
        area.setSelectionRange(0, text.length);
        let ok: boolean;
        try {
          ok = document.execCommand("copy");
        } catch {
          ok = false;
        }
        area.remove();
        if (was instanceof HTMLElement) was.focus({ preventScroll: true });
        return ok;
      }
    };
    const addr = button.closest(".mail")?.querySelector(".addr");
    // Copying by hand: the keys to press, or none on a phone with no
    // keyboard (iPadOS reports itself as a Mac).
    const ua = navigator.userAgent;
    const hint = /iPhone|iPod/.test(ua)
      ? ", ready to copy."
      : `. Press ${/Mac|iPad/.test(ua) ? "Cmd" : "Ctrl"}+C to copy.`;
    // The live region is emptied first, so the same words twice in a row
    // (a second copy) are still announced.
    const say = (words: string) => {
      if (!status) return;
      status.textContent = "";
      requestAnimationFrame(() => {
        status.textContent = words;
      });
    };

    button.addEventListener("click", async () => {
      const text = button.dataset.copy ?? "";
      if (!(await copy(text))) {
        if (addr) getSelection()?.selectAllChildren(addr);
        say(`${text} selected${hint}`);
        return; // The mailto link still works.
      }
      say(`${text} copied`);
      forward();
      window.clearTimeout(timer);
      timer = window.setTimeout(back, 2000);
    });
  }
}
