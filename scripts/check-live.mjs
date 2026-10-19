// Checks that the live site is fresh, for the daily CI run. The daily
// rebuild (the Worker's cron calling the deploy hook) fails quietly: its
// errors reach only the Workers logs. This fails loudly instead when:
//  - the live build is more than a day and a half old;
//  - the heatmap's newest day is more than 3 days old, as when the build
//    went through but kept old GitHub data;
//  - the commit in the live footer's stamp isn't the tip of the deploy
//    branch, and that tip is more than 2 hours old: a push that never
//    deployed (Workers Builds missed it). A younger tip may still be
//    deploying, and when GitHub can't be asked this only warns;
//  - an experiment's live security policy lets it connect to more than
//    /experiments says (scripts/experiments-policy.mjs), or it can't be
//    checked. The build only warns about that, so the daily rebuild still
//    deploys; this is where it's loud;
//  - an experiment's menu index (the featured projects in its phone menu)
//    isn't the home page's: another heading, or rows missing, added,
//    reordered or with other names, blurbs or links; or it has none, or
//    can't be checked. The tools keep their own copy of the site's
//    featured list, and nothing else notices when the two drift apart;
//    this is where that gets loud.
//   node scripts/check-live.mjs
//
// The parse and checks are exported for the tests; only running the file
// directly fetches anything.
import { site } from "../src/data/site.ts";
import {
  allows,
  classify,
  EXPECTED,
  expected,
  listedTools,
  livePolicies,
  looser,
  policyOf,
} from "./experiments-policy.mjs";

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
// How long a push to deploy may take to go live: Workers Builds takes
// minutes, so past this it isn't coming.
const MAX_DEPLOY_WAIT = 2 * HOUR;
const SHA = /^[0-9a-f]{40}$/i;
// "https://github.com/owner/repo" -> "owner/repo", as src/lib/build.ts.
const REPO = new URL(site.source).pathname.slice(1);
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

// The commit the live footer's stamp links to (src/components/Footer.astro),
// or undefined when the stamp shows only the date: the build found none.
export function liveCommit(html) {
  const stamp = /<span\b[^>]*\bclass="stamp"[^>]*>([\s\S]*?)<\/span>/.exec(
    html,
  )?.[1];
  if (stamp === undefined) throw new Error("no build stamp on the page");
  const link = `${site.source}/commit/`;
  for (const [, href] of stamp.matchAll(/\shref="([^"]*)"/g)) {
    const sha = href.startsWith(link) ? href.slice(link.length) : "";
    if (SHA.test(sha)) return sha.toLowerCase();
  }
  return undefined;
}

// One line per check, each passed or not; a warning passes, but says why
// its check didn't run. A parse error fails its check without stopping the
// others. tip is the deploy branch's newest commit, with its date, or why
// GitHub couldn't be asked for it.
export function checkLive(securityTxt, home, now, tip) {
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
  try {
    const live = liveCommit(home);
    const short = (sha) => sha?.slice(0, 7);
    const was = live
      ? `live is ${short(live)}`
      : "the live footer has no commit";
    if ("error" in tip) {
      lines.push({
        ok: true,
        warn: true,
        text: `${was}, deploy's tip unchecked: couldn't ask GitHub: ${tip.error}`,
      });
    } else if (live === tip.sha.toLowerCase()) {
      lines.push({ ok: true, text: `live is deploy's tip, ${short(live)}` });
    } else {
      const age = now - Date.parse(tip.date);
      const hours = (age / HOUR).toFixed(1);
      if (!(age <= MAX_DEPLOY_WAIT)) {
        lines.push({
          ok: false,
          text: `${was}, deploy's tip is ${short(tip.sha)}, committed ${hours} hours ago (over ${MAX_DEPLOY_WAIT / HOUR}): the push didn't deploy, check Workers Builds (a manual build of deploy ships it)`,
        });
      } else {
        lines.push({
          ok: true,
          text: `${was}, deploy's tip ${short(tip.sha)} is ${hours} hours old: may still be deploying`,
        });
      }
    }
  } catch (error) {
    lines.push({ ok: false, text: `live commit: ${error.message}` });
  }
  return lines;
}

// One line per tool whose policy is looser than expected or that couldn't
// be checked, and one for all the others. Each result is a tool's id with
// its Content-Security-Policy header (null without one), or the error.
export function checkPolicies(results) {
  const lines = [];
  const fine = [];
  for (const result of results) {
    const { id } = result;
    if ("error" in result) {
      lines.push({
        ok: false,
        text: `${id}: couldn't check its security policy: ${result.error}`,
      });
      continue;
    }
    const policy = policyOf(result.header);
    const cls = classify(id, policy.connect, policy.elsewhere);
    if (looser(id, cls)) {
      lines.push({
        ok: false,
        text: `${id} allows ${allows(policy)}, more than "${expected(id)}": /experiments' lede drops what it says about the policies; fix the tool's policy, or the words for it`,
      });
    } else {
      fine.push(`${id} ${cls}`);
    }
  }
  // The lede names these tools, so it drops its policy sentences when one
  // isn't listed: retired, a draft, or gone.
  for (const id of Object.keys(EXPECTED)) {
    if (results.length && !results.some((r) => r.id === id)) {
      lines.push({
        ok: false,
        text: `${id} isn't listed on /experiments, but the lede names it, so it drops what it says about the policies; update its words (src/data/experiments.ts) and EXPECTED (scripts/experiments-policy.mjs)`,
      });
    }
  }
  if (!results.length) {
    lines.push({ ok: false, text: "no experiments to check" });
  } else if (fine.length) {
    lines.push({ ok: true, text: `experiments' policies: ${fine.join(", ")}` });
  }
  return lines;
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

// Character references read back as text; an unknown one stays as written.
const decode = (s) =>
  s.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (ref, dec, hex, name) => {
    if (name) return ENTITIES[name] ?? ref;
    const code = dec ? Number(dec) : parseInt(hex, 16);
    return code <= 0x10ffff ? String.fromCodePoint(code) : ref;
  });

// An element's text: tags dropped, references decoded, runs of whitespace
// as one space.
const text = (html) =>
  decode(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

// What's inside the element whose opening tag starts at start, counting
// nested ones of the same name; undefined when it isn't closed.
function inner(html, start) {
  const name = /^<([a-z][\w-]*)/i.exec(html.slice(start))[1];
  const open = html.indexOf(">", start) + 1;
  if (!open) return undefined;
  const tags = new RegExp(`<(/?)${name}(?=[\\s/>])[^>]*>`, "gi");
  tags.lastIndex = open;
  let depth = 1;
  for (let tag; (tag = tags.exec(html));) {
    depth += tag[1] ? -1 : 1;
    if (!depth) return html.slice(open, tag.index);
  }
  return undefined;
}

// Each top-level element of one name in html (nested ones stay inside
// theirs), as its opening tag and what's inside.
function children(html, name) {
  const out = [];
  const opens = new RegExp(`<${name}(?=[\\s/>])[^>]*>`, "gi");
  for (let tag; (tag = opens.exec(html));) {
    const body = inner(html, tag.index);
    if (body === undefined) break;
    out.push({ tag: tag[0], body });
    opens.lastIndex = tag.index + tag[0].length + body.length;
  }
  return out;
}

/** The featured-project index in a page's menu: the element marked
 * data-menu-index, its h2 for the heading and its ol's rows, each an li
 * with a link whose first two spans are the name and the blurb. Read from
 * that shape, not class names, so the site's markup and the experiments'
 * (each with their own classes) read the same. Links come back absolute,
 * resolved against base. null when the page has no index.
 * @param {string} html @param {string} base
 * @returns {{ title: string, rows: { name: string, blurb: string, href: string | null }[] } | null} */
export function menuIndex(html, base) {
  const page = html.replace(
    /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>/gi,
    "",
  );
  const at = /<[a-z][\w-]*(?=[\s/>])[^>]*?\sdata-menu-index(?=[\s=/>])/i.exec(
    page,
  );
  if (!at) return null;
  const box = inner(page, at.index);
  if (box === undefined) return null;
  const h2 = /<h2(?=[\s/>])/i.exec(box);
  const ol = /<ol(?=[\s/>])/i.exec(box);
  if (!h2 || !ol) return null;
  const list = inner(box, ol.index) ?? "";
  const rows = children(list, "li").map(({ body }) => {
    const [link] = children(body, "a");
    const raw =
      /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(link?.tag ?? "") ??
      [];
    const href = raw[1] ?? raw[2] ?? raw[3];
    let url = null;
    if (href !== undefined) {
      try {
        url = new URL(decode(href), base).href;
      } catch {
        url = decode(href);
      }
    }
    const [name, blurb] = children(link?.body ?? "", "span");
    return {
      name: text(name?.body ?? ""),
      blurb: text(blurb?.body ?? ""),
      href: url,
    };
  });
  return { title: text(inner(box, h2.index) ?? ""), rows };
}

/** How a tool's menu index differs from the site's, one phrase each; []
 * when they match. @param {ReturnType<typeof menuIndex>} site
 * @param {ReturnType<typeof menuIndex>} tool */
export function compareIndex(site, tool) {
  if (!tool) return ["no menu index (an element with data-menu-index)"];
  const out = [];
  if (tool.title !== site.title) {
    out.push(`heading "${tool.title}", site has "${site.title}"`);
  }
  const n = Math.max(tool.rows.length, site.rows.length);
  for (let i = 0; i < n; i++) {
    const row = tool.rows[i];
    const want = site.rows[i];
    if (!row) {
      out.push(`row ${i + 1} missing, site has ${want.name}`);
    } else if (!want) {
      out.push(
        `row ${i + 1} ${row.name} extra, site has ${site.rows.length} rows`,
      );
    } else {
      for (const key of ["name", "blurb"]) {
        if (row[key] !== want[key]) {
          out.push(
            `row ${i + 1} ${key} "${row[key]}", site has "${want[key]}"`,
          );
        }
      }
      if (row.href !== want.href) {
        out.push(`row ${i + 1} href ${row.href}, site has ${want.href}`);
      }
    }
  }
  return out;
}

/** One line per tool whose menu index isn't the home page's or that
 * couldn't be checked, and one for all the others. Each tool is its id with
 * its live page (and its address, to resolve its links), or the error.
 * @param {string} home
 * @param {({ id: string, url: string, html: string } | { id: string, error: unknown })[]} tools */
export function checkIndexes(home, tools) {
  const site = menuIndex(home, `${SITE}/`);
  if (!site) {
    return [
      {
        ok: false,
        text: "the home page has no menu index (data-menu-index), so the experiments' copies can't be checked",
      },
    ];
  }
  const lines = [];
  const fine = [];
  for (const tool of tools) {
    if ("error" in tool) {
      lines.push({
        ok: false,
        text: `${tool.id}: couldn't check its menu index: ${tool.error}`,
      });
      continue;
    }
    const problems = compareIndex(site, menuIndex(tool.html, tool.url));
    if (problems.length) {
      lines.push({
        ok: false,
        text: `${tool.id}: ${problems.join("; ")}: its menu has drifted from the site's featured list; update its copy in the experiments repo`,
      });
    } else {
      fine.push(tool.id);
    }
  }
  if (!tools.length) {
    lines.push({ ok: false, text: "no experiments' menus to check" });
  } else if (fine.length) {
    lines.push({
      ok: true,
      text: `experiments' menu index matches the site's ${site.rows.length} rows: ${fine.join(", ")}`,
    });
  }
  return lines;
}

// Every experiment /experiments lists, with its live page, or why it
// couldn't be fetched. The same list livePolicies() reads.
async function liveTools() {
  const tools = await listedTools();
  return Promise.all(
    tools.map(async ({ id, url }) => {
      try {
        const res = await fetch(url, {
          headers: UA,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return { id, url, html: await res.text() };
      } catch (error) {
        return { id, error };
      }
    }),
  );
}

// The deploy branch's newest commit and its date, from GitHub's API. With
// GITHUB_TOKEN set (CI passes its built-in one) the request carries it:
// shared runners share their address, so the limit for asking without one
// is often used up. A token the API rejects is dropped, as in
// github-data.mjs. The tests pass their own fetch and env.
export async function deployTip({
  fetch = globalThis.fetch,
  env = process.env,
} = {}) {
  let token = env.GITHUB_TOKEN;
  const ask = () =>
    fetch(`https://api.github.com/repos/${REPO}/commits/deploy`, {
      headers: {
        ...UA,
        Accept: "application/vnd.github+json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      signal: AbortSignal.timeout(15_000),
    });
  let res = await ask();
  if (res.status === 401 && token) {
    token = undefined;
    res = await ask();
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { sha, commit } = await res.json();
  const date = commit?.committer?.date;
  if (typeof sha !== "string" || !SHA.test(sha) || !Date.parse(date)) {
    throw new Error("no commit and date in the reply");
  }
  return { sha, date };
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
  const report = (lines) => {
    for (const { ok, warn, text } of lines) {
      if (warn) {
        console.warn(`check-live: WARNING ${text}`);
      } else if (ok) {
        console.log(`check-live: ${text}`);
      } else {
        console.error(`check-live: FAIL ${text}`);
        process.exitCode = 1;
      }
    }
  };
  // Each part on its own, so one that can't run doesn't hide the others.
  let home;
  try {
    let securityTxt, tip;
    [securityTxt, home, tip] = await Promise.all([
      get("/.well-known/security.txt"),
      get("/"),
      deployTip().catch((error) => ({ error })),
    ]);
    report(checkLive(securityTxt, home, Date.now(), tip));
  } catch (error) {
    console.error(`check-live: FAIL couldn't fetch the site: ${error}`);
    process.exitCode = 1;
  }
  try {
    report(checkPolicies(await livePolicies()));
  } catch (error) {
    console.error(`check-live: FAIL couldn't check the experiments: ${error}`);
    process.exitCode = 1;
  }
  // Without the home page there's nothing to compare against; that has
  // already failed above.
  if (home !== undefined) {
    try {
      report(checkIndexes(home, await liveTools()));
    } catch (error) {
      console.error(
        `check-live: FAIL couldn't check the experiments' menus: ${error}`,
      );
      process.exitCode = 1;
    }
  }
}
