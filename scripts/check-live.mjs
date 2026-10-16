// Checks that the live site is fresh, for the daily CI run. The daily
// rebuild (the Worker's cron calling the deploy hook) fails quietly: its
// errors reach only the Workers logs. This fails loudly instead when:
//  - the live build is more than a day and a half old;
//  - the heatmap's newest day is more than 3 days old, as when the build
//    went through but kept old GitHub data.
//   node scripts/check-live.mjs
//
// The parse and checks are exported for the tests; only running the file
// directly fetches anything.

const SITE = "https://candygoogy.dev";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// How far after build time security.txt's Expires is written
// (src/pages/.well-known/security.txt.ts), so the build time can be read
// back from it.
const EXPIRES_AFTER = 180 * DAY;
// A daily rebuild, plus room for one that ran late.
const MAX_BUILD_AGE = 36 * HOUR;
const MAX_DATA_DAYS = 3;
// A browser's, since the Worker answers curl-like agents on "/" with a
// plain-text card instead of the page.
const UA = { "User-Agent": "Mozilla/5.0 (compatible; candygoogy.dev-check)" };

// How long ago the build ran, in ms, read back from security.txt's Expires.
export function buildAge(securityTxt, now) {
  const expires =
    /^Expires:[ \t]*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)[ \t]*\r?$/m.exec(
      securityTxt,
    )?.[1];
  if (!expires) throw new Error("security.txt has no Expires date");
  return EXPIRES_AFTER - (Date.parse(expires) - now);
}

// The heatmap's newest day, as YYYY-MM-DD: its first day (data-start)
// plus one day per cell after it. The data check at build time
// (validDays in scripts/github-days.mjs) rejects a gap or a repeated day,
// so the cells are consecutive. Read from markup, not from the cells'
// labels, so rewording them doesn't break this.
export function newestDay(html) {
  const start =
    /<div\b[^>]*\bclass="heatmap"[^>]*\bdata-start="(\d{4}-\d{2}-\d{2})"/.exec(
      html,
    )?.[1];
  if (!start) throw new Error("no heatmap on the page");
  const cells = html.match(/<td\b[^>]*\brole="gridcell"/g)?.length ?? 0;
  if (!cells) throw new Error("no heatmap days on the page");
  const first = Date.parse(`${start}T00:00:00Z`);
  return new Date(first + (cells - 1) * DAY).toISOString().slice(0, 10);
}

// Whole days from the given YYYY-MM-DD to today (UTC).
export function daysOld(iso, now) {
  const today = Math.floor(now / DAY) * DAY;
  return Math.round((today - Date.parse(`${iso}T00:00:00Z`)) / DAY);
}

// One line per check, each passed or not. A parse error fails its check
// without stopping the other.
export function checkLive(securityTxt, home, now) {
  const lines = [];
  try {
    const age = buildAge(securityTxt, now);
    const hours = (age / HOUR).toFixed(1);
    if (age > MAX_BUILD_AGE) {
      lines.push({
        ok: false,
        text: `build is ${hours} hours old (over ${MAX_BUILD_AGE / HOUR}): the daily rebuild hasn't deployed, check Workers Builds and the deploy hook`,
      });
    } else if (age < -HOUR) {
      // Expires further out than EXPIRES_AFTER: the two have drifted apart,
      // and every build would read as fresh.
      lines.push({
        ok: false,
        text: `Expires is more than ${EXPIRES_AFTER / DAY} days out: update EXPIRES_AFTER to match security.txt.ts`,
      });
    } else {
      lines.push({ ok: true, text: `build is ${hours} hours old` });
    }
  } catch (error) {
    lines.push({ ok: false, text: `build age: ${error.message}` });
  }
  try {
    const newest = newestDay(home);
    const days = daysOld(newest, now);
    if (days > MAX_DATA_DAYS) {
      lines.push({
        ok: false,
        text: `heatmap ends ${newest}, ${days} days ago (over ${MAX_DATA_DAYS}): the build kept old GitHub data, check its "github:" warnings`,
      });
    } else {
      lines.push({ ok: true, text: `heatmap ends ${newest}` });
    }
  } catch (error) {
    lines.push({ ok: false, text: `data age: ${error.message}` });
  }
  return lines;
}

async function get(path) {
  const res = await fetch(`${SITE}${path}`, {
    headers: UA,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${SITE}${path}: HTTP ${res.status}`);
  return res.text();
}

if (process.argv[1] === import.meta.filename) {
  try {
    const [securityTxt, home] = await Promise.all([
      get("/.well-known/security.txt"),
      get("/"),
    ]);
    for (const { ok, text } of checkLive(securityTxt, home, Date.now())) {
      if (ok) {
        console.log(`check-live: ${text}`);
      } else {
        console.error(`check-live: FAIL ${text}`);
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.error(`check-live: FAIL couldn't fetch the site: ${error}`);
    process.exitCode = 1;
  }
}
