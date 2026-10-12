// Hover previews for links marked data-preview="<card id>" (Previews.astro).
// A card shows after 250ms of mouse hover, or at once on keyboard focus;
// the pointer can cross onto it (100ms grace); Esc, blur, leaving and
// scrolling hide it (WCAG 1.4.13: dismissible, hoverable, persistent). A
// card opened by focus stays through scrolling while its chip has focus
// (Tab scrolls the page to an off-screen chip) and follows the chip. Its
// images load on the first intent and decode before it shows (or it shows
// without them after 1.5s).
//
// Mouse only, by the event's own pointerType: a media query like (hover:
// hover) is false on touch-screen laptops even when a mouse is in use.

const DELAY = 250;
const GRACE = 100;
const FADE = 200; // The card's fade-out (Previews.astro), then it's hidden.
const GAP = 10; // Between the chip and the card.
const EDGE = 8; // Kept clear of the window's edges.

// The one card that is open or opening, and every pending timer. Each
// change of mind clears the timers it supersedes, so a card being shown
// can never be re-hidden by an older close.
let open: { chip: HTMLElement; card: HTMLElement; focus: boolean } | null =
  null;
let showTimer = 0;
let hideTimer = 0;
let fadeTimer = 0;
let run = 0; // Bumped by every show and hide; a stale wait checks it.
let frame = 0; // A pending re-place while the page scrolls.

const cardFor = (chip: HTMLElement) =>
  document.getElementById(chip.dataset.preview ?? "");

// Unhides the card (still transparent) so its theme's image starts
// loading, then waits for that image to decode (at most 1.5s).
function prepare(card: HTMLElement) {
  card.hidden = false;
  const imgs = [...card.querySelectorAll("img")].filter((img) =>
    img.checkVisibility(),
  );
  for (const img of imgs) img.loading = "eager";
  return Promise.race([
    Promise.allSettled(imgs.map((img) => img.decode())),
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
}

// Above the chip and centred on it; below if there's no room above; never
// past the window's sides.
function place(chip: HTMLElement, card: HTMLElement) {
  const c = chip.getBoundingClientRect();
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  const x = Math.min(
    Math.max(c.left + c.width / 2 - w / 2, EDGE),
    innerWidth - w - EDGE,
  );
  let y = c.top - GAP - h;
  const below = y < EDGE;
  if (below) y = c.bottom + GAP;
  card.style.left = `${Math.round(x)}px`;
  card.style.top = `${Math.round(y)}px`;
  card.toggleAttribute("data-below", below);
}

async function show(chip: HTMLElement, now: boolean, focus = false) {
  const card = cardFor(chip);
  if (!card) return;
  window.clearTimeout(hideTimer);
  // Already open (or opening) for this chip: just keep it.
  if (open?.card === card && open.chip === chip) {
    open.focus ||= focus;
    return;
  }
  if (open) hide(true);
  window.clearTimeout(fadeTimer);
  open = { chip, card, focus };
  const mine = ++run;
  const ready = prepare(card);
  if (!now) {
    await new Promise((resolve) => {
      showTimer = window.setTimeout(resolve, DELAY);
    });
  }
  await ready;
  if (mine !== run) return; // Left, or another took over.
  card.hidden = false;
  place(chip, card);
  card.classList.add("is-open");
}

function hide(now = false) {
  window.clearTimeout(showTimer);
  window.clearTimeout(hideTimer);
  window.clearTimeout(fadeTimer);
  run++;
  if (!open) return;
  const { card } = open;
  open = null;
  card.classList.remove("is-open");
  if (now) card.hidden = true;
  else fadeTimer = window.setTimeout(() => (card.hidden = true), FADE);
}

function hideSoon() {
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hide(), GRACE);
}

for (const chip of document.querySelectorAll<HTMLElement>("[data-preview]")) {
  const card = cardFor(chip);
  if (!card) continue;
  chip.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") show(chip, false);
  });
  chip.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hideSoon();
  });
  chip.addEventListener("focus", () => {
    if (chip.matches(":focus-visible")) show(chip, true, true);
  });
  chip.addEventListener("blur", () => {
    if (open?.chip === chip) hide();
  });
  card.addEventListener("pointerenter", () => window.clearTimeout(hideTimer));
  card.addEventListener("pointerleave", hideSoon);
}

addEventListener("keydown", (e) => {
  if (e.key === "Escape") hide();
});
addEventListener(
  "scroll",
  () => {
    const kept = open?.focus && document.activeElement === open.chip;
    if (!kept) return hide(true);
    // Shown (or once it shows): keep it beside its chip.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (open?.card.classList.contains("is-open")) place(open.chip, open.card);
    });
  },
  { passive: true },
);

// A module, so its names stay its own.
export {};
