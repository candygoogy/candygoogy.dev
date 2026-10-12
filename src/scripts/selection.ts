// Rounded, animated text selection: one pill per line, drawn in a layer
// above the text and blended (multiply in light, screen in dark and in the
// Fettle band) so the text keeps its own color. Fine pointers only: touch,
// inputs and no-JS visitors keep the native selection (styled in base.css).

const MAX_LINES = 120; // Bigger selections fall back to the native highlight.
const PAD_X = 4;
const PAD_Y = 2;
const RADIUS = 6;

interface Line {
  left: number;
  right: number;
  top: number;
  bottom: number;
  band: boolean;
}

const fine = matchMedia("(hover: hover) and (pointer: fine)");
const calm = matchMedia("(prefers-reduced-motion: reduce)");

function editable(node: Node | null): boolean {
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el?.closest("input, textarea, select, [contenteditable]");
}

// Text-node rectangles inside the range (element boxes would draw whole
// blocks), merged into lines by vertical center and horizontal gap.
function measure(range: Range): Line[] | null {
  const rects: { r: DOMRect; band: boolean }[] = [];
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
  if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const part = document.createRange();
  for (let n = walker.currentNode; n; n = walker.nextNode() as Node) {
    if (n.nodeType !== Node.TEXT_NODE || !range.intersectsNode(n)) continue;
    const text = n as Text;
    const start = n === range.startContainer ? range.startOffset : 0;
    const end = n === range.endContainer ? range.endOffset : text.length;
    if (end <= start || !text.data.slice(start, end).trim()) continue;
    part.setStart(text, start);
    part.setEnd(text, end);
    const band = !!text.parentElement?.closest(".band");
    for (const r of part.getClientRects()) {
      if (r.width > 1 && r.height > 1) rects.push({ r, band });
    }
    if (rects.length > MAX_LINES * 8) return null;
  }

  rects.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left);
  const lines: Line[] = [];
  for (const { r, band } of rects) {
    const mid = r.top + r.height / 2;
    const line = lines.find(
      (l) =>
        l.band === band &&
        Math.abs((l.top + l.bottom) / 2 - mid) < r.height / 2 &&
        r.left - l.right <= r.height * 1.5 &&
        l.left - r.right <= r.height * 1.5,
    );
    if (line) {
      line.left = Math.min(line.left, r.left);
      line.right = Math.max(line.right, r.right);
      line.top = Math.min(line.top, r.top);
      line.bottom = Math.max(line.bottom, r.bottom);
    } else {
      lines.push({
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        band,
      });
    }
    if (lines.length > MAX_LINES) return null;
  }

  // Tight display line-heights make glyph boxes overlap: split the overlap
  // so neighbouring pills meet with a hairline gap instead.
  lines.sort((a, b) => a.top - b.top || a.left - b.left);
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    if (!a || !b) continue;
    const overlapX = Math.min(a.right, b.right) > Math.max(a.left, b.left);
    if (overlapX && b.top - PAD_Y < a.bottom + PAD_Y) {
      const cut = (a.bottom + b.top) / 2;
      a.bottom = cut - PAD_Y - 1;
      b.top = cut + PAD_Y + 1;
    }
  }
  return lines;
}

function start() {
  const root = document.documentElement;
  const layer = document.createElement("div");
  layer.className = "sel-layer";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  root.classList.add("sel-fx");

  const pills: HTMLElement[] = [];
  let frame = 0;
  let clearTimer = 0;

  const clear = (fade: boolean) => {
    if (!pills.length) return;
    if (fade && !calm.matches) {
      layer.classList.add("is-clearing");
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => {
        layer.replaceChildren();
        pills.length = 0;
        layer.classList.remove("is-clearing");
      }, 200);
    } else {
      layer.replaceChildren();
      pills.length = 0;
    }
  };

  const draw = () => {
    frame = 0;
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return clear(true);
    if (editable(sel.anchorNode) || editable(sel.focusNode))
      return clear(false);

    const lines = measure(sel.getRangeAt(0));
    if (!lines) {
      // Too big to draw nicely: hand the native highlight back.
      root.classList.remove("sel-fx");
      return clear(false);
    }
    root.classList.add("sel-fx");
    window.clearTimeout(clearTimer);
    layer.classList.remove("is-clearing");

    const sx = window.scrollX;
    const sy = window.scrollY;
    lines.forEach((l, i) => {
      let pill = pills[i];
      const fresh = !pill;
      if (!pill) {
        pill = document.createElement("span");
        pill.className = "sel-pill";
        layer.append(pill);
        pills.push(pill);
      }
      const h = l.bottom - l.top + PAD_Y * 2;
      pill.classList.toggle("in-band", l.band);
      pill.style.width = `${l.right - l.left + PAD_X * 2}px`;
      pill.style.height = `${h}px`;
      pill.style.borderRadius = `${Math.min(RADIUS, h / 2)}px`;
      pill.style.transform = `translate(${l.left - PAD_X + sx}px, ${l.top - PAD_Y + sy}px)`;
      if (fresh && !calm.matches) {
        pill.animate(
          [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
          { duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
      }
    });
    for (const extra of pills.splice(lines.length)) extra.remove();
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  document.addEventListener("selectionchange", schedule);
  addEventListener("resize", schedule);
  addEventListener("scroll", () => pills.length && schedule(), {
    passive: true,
  });
  document.fonts?.ready.then(schedule);
}

if (fine.matches) {
  const idle =
    window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));
  idle(start);
}
