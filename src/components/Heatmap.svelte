<script lang="ts">
  // GitHub contributions for the last year, rendered at build time (private
  // ones are included as plain counts, as on the GitHub profile).
  // Without JS: a table whose every day carries its count in its label, plus
  // a text summary. With JS (client:visible): one tab stop with arrow-key
  // movement, and a tooltip for pointer and keyboard users.
  import { tick, untrack } from "svelte";
  import type { Day } from "../lib/github";

  // Compact props (the island serializes them into the page): the first
  // date, then one count and one level (0 to 4) per day.
  interface Props {
    start: string;
    counts: number[];
    levels: number[];
    profile: string;
  }

  // The data is fixed at build time, so it's read once, not tracked.
  const props: Props = $props();
  const profile = untrack(() => props.profile);
  const days: Day[] = untrack(() => {
    const start = Date.parse(`${props.start}T00:00:00Z`);
    return props.counts.map((count, i) => ({
      date: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      count,
      level: (props.levels[i] ?? 0) as Day["level"],
    }));
  });

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fmtLong = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  // The tooltip's shorter date, so it fits on a phone.
  const fmtTip = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const fmtShort = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const fmtMonth = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });

  const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const plural = (n: number) =>
    `${n.toLocaleString("en-US")} contribution${n === 1 ? "" : "s"}`;

  // Weeks as columns (Sunday first), the way GitHub lays them out. Days
  // before the first date are empty padding cells.
  type Cell = (Day & { label: string }) | null;
  const weeks: Cell[][] = [];
  const firstDate = days[0]?.date;
  if (firstDate) {
    const first = parse(firstDate).getUTCDay();
    let week: Cell[] = Array.from({ length: first }, () => null);
    for (const d of days) {
      week.push({
        ...d,
        label: `${d.count ? plural(d.count) : "No contributions"} on ${fmtLong.format(parse(d.date))}`,
      });
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null);
      weeks.push(week);
    }
  }

  // A month label sits over the first week that starts in that month.
  const months = weeks.map((week, i) => {
    const firstDay = week.find((c) => c !== null);
    if (!firstDay) return "";
    const m = fmtMonth.format(parse(firstDay.date));
    const prev = weeks[i - 1]?.find((c) => c !== null);
    return i === 0 || (prev && fmtMonth.format(parse(prev.date)) !== m)
      ? m
      : "";
  });

  // Weeks before this index are hidden on narrow screens.
  const recent = weeks.length - 26;

  const total = days.reduce((sum, d) => sum + d.count, 0);
  const busiest = days.reduce<Day | undefined>(
    (best, d) => (d.count > (best?.count ?? 0) ? d : best),
    undefined,
  );

  // Roving focus: exactly one cell is tabbable; it starts on the last day.
  const lastWeek = weeks.length - 1;
  const lastDay = weeks[lastWeek]?.findLastIndex((c) => c !== null) ?? 0;
  let focusWeek = $state(lastWeek);
  let focusDay = $state(lastDay);

  let tip = $state<{ text: string; x: number; y: number } | null>(null);
  let wrap: HTMLDivElement | undefined = $state();
  let tipEl: HTMLDivElement | undefined = $state();

  // The busiest day's place in the grid (week, day), for its link from
  // the summary.
  const busiestAt = (() => {
    for (let w = 0; w < weeks.length; w++) {
      const d = weeks[w]?.findIndex((c) => c?.date === busiest?.date) ?? -1;
      if (d >= 0) return { w, d };
    }
    return null;
  })();

  // The crosshair: the marked day's whole row and column take a quiet
  // tint (a band through the grid, always inside it), its weekday and
  // month labels ink in, and the day itself is raised and ringed. The
  // classes go straight onto the cells and labels involved, so nothing
  // re-renders and nothing is measured or positioned.
  let hotEls: Element[] = [];
  let bandEls: Element[] = [];

  function mark(el: HTMLTableCellElement) {
    if (!wrap) return;
    unmark();
    const row = el.parentElement as HTMLTableRowElement;
    const tbody = row.parentElement as HTMLTableSectionElement;
    const col = el.cellIndex;
    bandEls = [
      ...[...row.cells].slice(1),
      ...[...tbody.rows].map((r) => r.cells[col]),
    ].filter((c): c is HTMLTableCellElement => !!c && c !== el);
    for (const c of bandEls) c.classList.add("band");
    // Its month: the label over this week, or the nearest one before it.
    let m = col - 1;
    while (m > 0 && !months[m]) m--;
    const month = wrap.querySelector("thead tr")?.children[m + 1];
    hotEls = [el, row.cells[0], month].filter(
      (x): x is Element => x !== undefined && x !== null,
    );
    for (const h of hotEls) h.classList.add("hot");
  }

  function unmark() {
    for (const h of hotEls) h.classList.remove("hot");
    for (const c of bandEls) c.classList.remove("band");
    hotEls = [];
    bandEls = [];
  }

  // The busiest date in the summary points at its day.
  function markBusiest() {
    if (!busiestAt) return;
    const el = cellAt(busiestAt.w, busiestAt.d);
    if (visible(el)) mark(el as HTMLTableCellElement);
  }

  // A tap shows the crosshair and the tooltip until the next tap
  // elsewhere (a mouse clears them on leaving the grid).
  $effect(() => {
    const away = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      if (wrap && !wrap.contains(e.target as Node)) {
        tip = null;
        unmark();
      }
    };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  });

  // Cells are found by position: row d, column w (after the day label).
  function cellAt(w: number, d: number): HTMLElement | null {
    const row = wrap?.querySelector("tbody")?.rows[d];
    const cell = row?.cells[w + 1];
    return cell?.getAttribute("role") === "gridcell" ? cell : null;
  }

  // On narrow screens CSS hides the older weeks; skip those.
  function visible(el: HTMLElement | null): el is HTMLElement {
    return !!el && el.offsetParent !== null;
  }

  async function show(el: HTMLElement) {
    if (!wrap || !(el instanceof HTMLTableCellElement)) return;
    mark(el);
    const row = el.parentElement as HTMLTableRowElement;
    const cell = weeks[el.cellIndex - 1]?.[row.sectionRowIndex];
    if (!cell) return;
    const box = wrap.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const date = fmtTip.format(parse(cell.date));
    const text = `${cell.count ? plural(cell.count) : "No contributions"} on ${date}`;
    const x = r.left - box.left + r.width / 2;
    tip = { text, x, y: r.top - box.top };
    // Keep the tip inside the grid: once it's drawn (before the next
    // paint), measure it and move its centre in from either edge.
    await tick();
    if (!tipEl || tip?.text !== text) return;
    const half = tipEl.offsetWidth / 2;
    tip.x = Math.min(
      Math.max(x, half),
      Math.max(half, wrap.clientWidth - half),
    );
  }

  function move(w: number, d: number) {
    const el = cellAt(w, d);
    if (!visible(el)) return;
    focusWeek = w;
    focusDay = d;
    el.focus();
  }

  function onkeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target.getAttribute("role") !== "gridcell") return;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = steps[e.key];
    if (step) {
      move(focusWeek + step[0], focusDay + step[1]);
    } else if (e.key === "Home") {
      for (let w = 0; w <= lastWeek; w++) {
        if (visible(cellAt(w, focusDay))) return move(w, focusDay);
      }
    } else if (e.key === "End") {
      for (let w = lastWeek; w >= 0; w--) {
        if (visible(cellAt(w, focusDay))) return move(w, focusDay);
      }
    } else {
      return;
    }
    e.preventDefault();
  }
</script>

<div class="heatmap">
  <p class="summary">
    <span
      class="count"
      class:grouped={total >= 1000}
      style:--to={total}
      style:--tk={total >= 1000 ? Math.floor(total / 1000) : undefined}
      style:--tr={total >= 1000 ? total % 1000 : undefined}
      >{total.toLocaleString("en-US")}</span
    >&#32;contribution{total === 1 ? "" : "s"} in the last year.
    {#if busiest}
      The busiest was
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="busiest"
        onpointerenter={markBusiest}
        onpointerleave={(e) => {
          if (e.pointerType === "mouse") unmark();
        }}>{fmtShort.format(parse(busiest.date))}</span
      >, with {plural(busiest.count)}.
    {/if}
    <a href={profile}>See them on GitHub</a>.
  </p>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="grid-wrap"
    bind:this={wrap}
    {onkeydown}
    onfocusin={(e) => show(e.target as HTMLElement)}
    onfocusout={() => {
      tip = null;
      unmark();
    }}
    onpointerover={(e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(
        '[role="gridcell"]',
      );
      if (el) show(el);
    }}
    onpointerleave={(e) => {
      if (e.pointerType !== "mouse") return;
      tip = null;
      unmark();
    }}
  >
    <table
      role="grid"
      aria-readonly="true"
      aria-label="GitHub contributions, last year"
    >
      <thead aria-hidden="true">
        <tr>
          <td></td>
          {#each months as m, w (w)}
            <th scope="col" class="m" class:old={w < recent}
              ><span>{m}</span></th
            >
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each DAY_NAMES as name, d (name)}
          <tr>
            <th scope="row" class="dn" aria-hidden="true">
              <span>{d % 2 === 1 ? name : ""}</span>
            </th>
            {#each weeks as week, w (w)}
              {@const cell = week[d]}
              {#if cell}
                <td
                  role="gridcell"
                  tabindex={w === focusWeek && d === focusDay ? 0 : -1}
                  aria-label={cell.label}
                  data-level={cell.level}
                  data-busiest={cell.date === busiest?.date ? "" : undefined}
                  style:--w={w}
                  class:old={w < recent}
                  onfocus={() => {
                    focusWeek = w;
                    focusDay = d;
                  }}><span></span></td
                >
              {:else}
                <td class="pad" class:old={w < recent}><span></span></td>
              {/if}
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if tip}
      <div
        class="tip"
        aria-hidden="true"
        bind:this={tipEl}
        style:left="{tip.x}px"
        style:top="{tip.y}px"
      >
        {tip.text}
      </div>
    {/if}
  </div>

  <div class="legend" aria-hidden="true">
    <span>Less</span>
    {#each [0, 1, 2, 3, 4] as level (level)}
      <span class="key" data-level={level}></span>
    {/each}
    <span>More</span>
  </div>
</div>

<style>
  .heatmap {
    --cell-0: color-mix(in oklab, var(--ink) 7%, var(--bg));
    --cell-1: color-mix(in oklab, var(--acc) 30%, var(--bg));
    --cell-2: color-mix(in oklab, var(--acc) 52%, var(--bg));
    --cell-3: color-mix(in oklab, var(--acc) 76%, var(--bg));
    --cell-4: var(--acc);
  }

  .summary {
    color: var(--soft);
    max-width: var(--measure);
    font-variant-numeric: tabular-nums;
  }

  /* The link stays one piece, so its marker never wraps into a lone "See". */
  .summary a {
    white-space: nowrap;
  }

  /* The busiest date: a quiet dotted underline says it points somewhere
     (hovering it marks its day in the grid). */
  .busiest {
    text-decoration: underline dotted
      color-mix(in oklab, var(--soft) 60%, transparent);
    text-underline-offset: 3px;
  }

  .grid-wrap {
    position: relative;
    margin-top: var(--sp-5);
  }

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 3px;
    margin: -3px;
  }

  th {
    font-weight: var(--fw-regular);
    font-size: var(--fs-xs);
    color: var(--soft);
    text-align: left;
    padding: 0;
    transition: color 120ms var(--ease-out);
  }

  /* The marked day's weekday and month labels. */
  th:global(.hot) {
    color: var(--ink);
  }

  thead th {
    height: 1.25rem;
    vertical-align: bottom;
    overflow: visible;
    white-space: nowrap;
  }

  thead td,
  .dn {
    width: 2rem;
  }

  .dn span {
    display: block;
    line-height: 1;
  }

  /* The 365 cells are styled through :global() under .heatmap, so Svelte
     doesn't stamp a scoping class on every cell and square. */
  .heatmap :global(td) {
    padding: 0;
  }

  .heatmap :global(td > span) {
    display: block;
    aspect-ratio: 1;
    border-radius: 2px;
    background: var(--cell-0);
    /* A hairline edge so each day reads as a square on any theme. */
    box-shadow: inset 0 0 0 0.5px
      color-mix(in oklab, var(--ink) 6%, transparent);
    transition:
      transform 120ms var(--ease-out),
      box-shadow 120ms var(--ease-out);
  }

  /* The crosshair's band: every other day in the marked row and column,
     tinted a touch toward ink (empty pads stay clear). */
  .heatmap :global(td.band[role="gridcell"] > span) {
    box-shadow:
      inset 0 0 0 0.5px color-mix(in oklab, var(--ink) 6%, transparent),
      inset 0 0 0 99px color-mix(in oklab, var(--ink) 9%, transparent);
  }

  /* The marked day: raised a little, ringed in ink. */
  .heatmap :global(td.hot > span) {
    position: relative;
    z-index: 1;
    transform: scale(1.25);
    box-shadow: 0 0 0 1px var(--ink);
  }

  .heatmap :global(.pad > span) {
    background: none;
    box-shadow: none;
  }

  .heatmap :global([data-level="1"] > span),
  .key[data-level="1"] {
    background: var(--cell-1);
  }
  .heatmap :global([data-level="2"] > span),
  .key[data-level="2"] {
    background: var(--cell-2);
  }
  .heatmap :global([data-level="3"] > span),
  .key[data-level="3"] {
    background: var(--cell-3);
  }
  .heatmap :global([data-level="4"] > span),
  .key[data-level="4"] {
    background: var(--cell-4);
  }

  .heatmap :global(td[role="gridcell"]:focus-visible) {
    outline: var(--focus-width) solid var(--focus);
    outline-offset: 1px;
  }

  .tip {
    position: absolute;
    transform: translate(-50%, calc(-100% - 8px));
    width: max-content;
    max-width: 100%;
    padding: var(--sp-1) var(--sp-2);
    font-size: var(--fs-xs);
    background: var(--ink);
    color: var(--bg);
    border-radius: 4px;
    pointer-events: none;
    z-index: 1;
  }

  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    margin-top: var(--sp-3);
    font-size: var(--fs-xs);
    color: var(--soft);
  }

  .legend span:first-child {
    margin-right: var(--sp-1);
  }

  .legend span:last-child {
    margin-left: var(--sp-1);
  }

  .key {
    width: 11px;
    height: 11px;
    border-radius: 2px;
    background: var(--cell-0);
  }

  /* Narrow screens: the last 26 weeks, so the squares stay big enough to
     read at a glance (the summary above carries the numbers). */
  @media (max-width: 40rem) {
    .heatmap :global(.old) {
      display: none;
    }
  }
</style>
