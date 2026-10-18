// The homelab tree (HomelabTree.astro, div.net). Loaded after the first
// paint by Base.astro's motion loader.
//
// As the tree reaches the reveal line, its wires draw from the Internet
// down, in the list's order: each dot lands on a spring as its wire
// reaches it, and its row rises in. Then the Wi-Fi has traffic, on a calm
// rhythm (1.8 to 3.2s between beats): the laptop talks, one of the crowd
// is swapped for another, someone in the crowd talks, another swap.
//   talk   the access point's ring breathes, a packet runs down the dotted
//          wire and across to the device, which lands (a brief fill and a
//          spring); a beat later the reply comes back up.
//   swap   a device sends a packet back up and drifts off as it fades,
//          and the others close the gap; once the access point has it, it
//          sends a packet to the free place at the end, which becomes the
//          new device there.
// The crowd is always four at rest. While the tree is off screen or
// the tab is hidden, everything stops, timers too, and every animation is
// dropped, so nothing is left part-way; it starts afresh when it's back. A
// tree already on screen when this runs keeps the wires it was shown with.
// Reduced motion: none of it. Without JS: the tree as drawn.
import { EASE, inView, reduced, RISE, STAGGER_MS, visible } from "../motion";

type Point = [number, number];

export default function init(net: HTMLElement) {
  const layer = net.querySelector(".packets");
  const ap = net.querySelector<HTMLElement>(".ring");
  const laptop = net.querySelector(".wifi:not(.crowd) .dot");
  const crowd = net.querySelector(".dots");
  // The wires are pseudo-elements: without animating those, no motion.
  if (reduced() || !("pseudoElement" in KeyframeEffect.prototype)) return;
  if (!layer || !ap || !laptop || !crowd) return;

  // The arrival's own animations, so focus can finish them (below).
  const arriving: Animation[] = [];
  // Arrival. Each device lands 240ms after the one it's connected to (its
  // siblings 60ms apart); its wire starts 200ms before, the stub across
  // 110ms before, and the wire down to its own devices just after.
  const arrive = () => {
    net.classList.add("is-in");
    if (reduced()) return;
    const lands = new Map<Element, number>();
    const draw = (el: Element, pseudo: string, from: string, at: number) =>
      arriving.push(
        el.animate(
          { transform: [from, "none"] },
          {
            pseudoElement: pseudo,
            delay: at,
            duration: 400,
            easing: EASE.out,
            fill: "backwards",
          },
        ),
      );
    for (const li of net.querySelectorAll("li")) {
      const list = li.parentElement;
      const up = list?.closest("li");
      const t = up
        ? (lands.get(up) ?? 0) +
          240 +
          60 * [...(list?.children ?? [])].indexOf(li)
        : 150;
      lands.set(li, t);
      const row = li.firstElementChild;
      if (!row) continue;
      if (up) {
        draw(li, "::before", "scaleY(0)", t - 200);
        draw(li, "::after", "scaleX(0)", t - 110);
      }
      if (row.classList.contains("kids")) {
        draw(row, "::after", "scaleY(0)", t + 40);
      }
      row.querySelectorAll(".dot").forEach((dot, i) =>
        arriving.push(
          dot.animate(
            { transform: ["scale(0.6)", "none"], opacity: [0, 1] },
            {
              delay: t + i * 60,
              duration: 600,
              easing: EASE.spring,
              fill: "backwards",
            },
          ),
        ),
      );
      row.querySelectorAll(".lab, .val").forEach((el, i) =>
        arriving.push(
          el.animate(
            { transform: [`translateY(${RISE()}px)`, "none"], opacity: [0, 1] },
            {
              delay: t - 40 + i * STAGGER_MS,
              duration: 900,
              easing: EASE.out,
              fill: "backwards",
            },
          ),
        ),
      );
      const lead = row.querySelector(".lead");
      if (lead) {
        arriving.push(
          lead.animate(
            { opacity: [0, 1] },
            { delay: t, duration: 600, easing: EASE.out, fill: "backwards" },
          ),
        );
      }
    }
  };

  // Where an element's middle is, from the tree's top left.
  const at = (el: Element): Point => {
    const a = el.getBoundingClientRect();
    const b = net.getBoundingClientRect();
    return [a.left - b.left + a.width / 2, a.top - b.top + a.height / 2];
  };

  // How long a packet takes between the access point and a point: 0.6s,
  // plus 2.6ms for each pixel of wire.
  const trip = ([x, y]: Point) => {
    const [ax, ay] = at(ap);
    return 600 + (Math.abs(y - ay) + Math.abs(x - ax)) * 2.6;
  };

  // One packet from the access point down its wire and across to a
  // point, or back. It fades in leaving and is taken in arriving (what it
  // reaches lands, or it becomes the new device there). Measured as it
  // leaves, so the tree can have moved or rewrapped since.
  const send = async ([x, y]: Point, back = false) => {
    const [ax, ay] = at(ap);
    const path: [Point, Point, Point] = back
      ? [
          [x, y],
          [ax, y],
          [ax, ay],
        ]
      : [
          [ax, ay],
          [ax, y],
          [x, y],
        ];
    const down = Math.abs(y - ay);
    const across = Math.abs(x - ax);
    const corner = (back ? across : down) / (down + across || 1);
    const to = ([px, py]: Point) => `translate(${px}px, ${py}px)`;
    const packet = layer.appendChild(document.createElement("i"));
    try {
      await packet.animate(
        [
          { transform: to(path[0]), opacity: 0 },
          { transform: to(path[0]), opacity: 1, offset: 0.05 },
          {
            transform: to(path[1]),
            offset: Math.min(Math.max(corner, 0.05), 0.95),
          },
          { transform: to(path[2]), opacity: 1 },
        ],
        { duration: trip([x, y]), easing: EASE.inOut },
      ).finished;
    } finally {
      packet.remove();
    }
  };

  const breathe = () =>
    ap.animate(
      { transform: ["none", "scale(1.4)", "none"], opacity: [1, 0.4, 1] },
      { duration: 900, easing: EASE.sine, pseudoElement: "::before" },
    );
  // A packet lands: the dot takes it in filled, swells, and springs back
  // to itself as the fill goes.
  const land = (dot: Element) =>
    dot.animate(
      [
        {
          transform: "none",
          backgroundColor: "currentColor",
          easing: EASE.out,
        },
        {
          transform: "scale(1.45)",
          backgroundColor: "currentColor",
          offset: 0.3,
          easing: EASE.spring,
        },
        { transform: "none" },
      ],
      700,
    );

  let timer = 0;
  const wait = (ms: number) =>
    new Promise((done) => (timer = window.setTimeout(done, ms)));
  const dots = () => [...crowd.children] as HTMLElement[];
  const size = dots().length;
  const any = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];

  const talk = async (dot?: Element) => {
    if (!dot) return;
    breathe();
    await send(at(dot));
    land(dot);
    await wait(500);
    await send(at(dot), true);
    land(ap);
  };

  // The middle of place i in the row of dots, from layout: the row's own
  // box and the dots' size and gap (the dots may still be sliding over,
  // and their boxes on screen with them).
  const place = (i: number): Point => {
    const box = crowd.getBoundingClientRect();
    const b = net.getBoundingClientRect();
    const dot = getComputedStyle(crowd.firstElementChild ?? crowd);
    const w = parseFloat(dot.width);
    const gap = parseFloat(getComputedStyle(crowd).columnGap) || 0;
    return [
      box.left - b.left + i * (w + gap) + w / 2,
      box.top - b.top + parseFloat(dot.marginTop) + parseFloat(dot.height) / 2,
    ];
  };

  // The new device takes the free place at the end of the row: the packet,
  // drawn at its size, swells into it on a spring and lets go of its fill.
  const join = async () => {
    const last = dots().at(-1);
    if (!last) return;
    breathe();
    await send(place(dots().length));
    const dot = last.cloneNode() as HTMLElement;
    crowd.append(dot);
    dot.animate(
      [
        { transform: "scale(0.86)", backgroundColor: "currentColor" },
        { transform: "none" },
      ],
      { duration: 600, easing: EASE.spring },
    );
  };

  // The device leaving says goodbye up the wire, then drifts 6px off as
  // it shrinks and fades, gone just as the access point takes the
  // goodbye (so the row is a dot short no longer than it must be). The
  // dots after it slide over into the gap (FLIP: their places are read
  // before it goes and after, and each slides from the old one to the
  // new).
  let goodbye: Promise<unknown> = Promise.resolve();
  const leave = async () => {
    const all = dots();
    const dot = any(all);
    if (!dot) return;
    const from = at(dot);
    goodbye = send(from, true).then(() => land(ap));
    goodbye.catch(() => {});
    await dot.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: "translateX(6px) scale(0.6)", opacity: 0 },
      ],
      {
        duration: 420,
        delay: Math.max(150, trip(from) - 420),
        easing: EASE.inOut,
        fill: "forwards",
      },
    ).finished;
    const rest = all.slice(all.indexOf(dot) + 1);
    const was = rest.map((el) => el.offsetLeft);
    dot.remove();
    rest.forEach((el, k) =>
      el.animate(
        {
          transform: [`translateX(${(was[k] ?? 0) - el.offsetLeft}px)`, "none"],
        },
        { duration: 500, easing: EASE.out },
      ),
    );
  };

  // The access point sends for the new device as it takes the goodbye,
  // 420ms after the old one began to drift off: the place at the end is
  // empty for about the packet's trip (~1s).
  const swap = async () => {
    await leave();
    await goodbye;
    await join();
  };
  const beats = [() => talk(laptop), swap, () => talk(any(dots())), swap];

  // Traffic runs while the tree has arrived, is on screen and the tab is
  // visible. Stopping clears the timer and drops every animation in the
  // tree (a beat in progress ends there: its packet goes, its dots are as
  // they were, four of them); each start is a fresh run.
  let run = 0;
  let beat = 0;
  let arrived = false;
  let onScreen = false;
  let live = false;
  const start = async () => {
    const id = ++run;
    try {
      while (id === run) {
        await wait(1800 + Math.random() * 1400);
        if (id === run) await beats[beat++ % beats.length]?.();
      }
    } catch {
      // Stopped mid-beat.
    }
  };
  const stop = () => {
    run++;
    clearTimeout(timer);
    for (const a of net.getAnimations({ subtree: true })) a.cancel();
    // A swap stopped between its leave and its join has a place free:
    // the crowd is whole again at once.
    const [model] = dots();
    while (model && dots().length < size) crowd.append(model.cloneNode());
  };
  const sync = () => {
    const go = arrived && onScreen && !document.hidden && !reduced();
    if (go === live) return;
    live = go;
    if (go) void start();
    else stop();
  };

  // On screen now (a page arriving, or a jump to #homelab): it's there.
  // Otherwise it waits undrawn and arrives at the reveal line.
  const box = net.getBoundingClientRect();
  if (visible(net) && box.top < innerHeight && box.bottom > 0) {
    arrived = true;
  } else {
    net.classList.add("pending");
    inView(net, () => {
      if (arrived) return;
      arrive();
      arrived = true;
      sync();
    });
    // Keyboard focus on a link in the tree before it has arrived: it's
    // all there at once, labels and wires, so focus never lands on
    // something unseen (as reveal.ts does for the page's reveals).
    net.addEventListener("focusin", () => {
      for (const a of arriving.splice(0)) a.finish();
      if (arrived) return;
      arrived = true;
      net.classList.add("is-in");
      sync();
    });
  }
  inView(
    net,
    (entry) => {
      onScreen = entry.isIntersecting;
      sync();
    },
    { margin: "0px", once: false },
  );
  document.addEventListener("visibilitychange", sync);
  // Reduced motion switched on: everything is at rest at once, the
  // arrival too.
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
    "change",
    () => {
      if (reduced()) {
        live = false;
        stop();
      }
      sync();
    },
  );
}
