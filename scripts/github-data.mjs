// Fetches the public GitHub data the site shows, at build time:
//  - the latest release tag of each product (public REST API, no token);
//  - candygoogy's public contribution calendar for the heatmap.
//
// Contributions come from the logged-out profile page, which shows exactly
// what any visitor sees on GitHub. No token, so no secret to create or expire.
//
// This script never fails the build. On any error it keeps the last good
// data (src/data/github.json), or falls back to the committed snapshot
// (src/data/github.snapshot.json), and prints a warning.

import { existsSync } from "node:fs";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const USER = "candygoogy";
const REPOS = ["fettle-page/fettle", "fettle-page/idiff"];
const DATA = join(import.meta.dirname, "..", "src", "data");
const OUT = join(DATA, "github.json");
const SNAPSHOT = join(DATA, "github.snapshot.json");
const UA = { "User-Agent": "candygoogy.dev-build" };

async function get(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...UA, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function latestRelease(repo) {
  const res = await get(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      headers: { Accept: "application/vnd.github+json" },
    },
  );
  const { tag_name: tag } = await res.json();
  if (typeof tag !== "string" || !tag) throw new Error(`${repo}: no tag`);
  return tag.replace(/^v/, "");
}

async function contributionsFromProfile() {
  const html = await (
    await get(`https://github.com/users/${USER}/contributions`)
  ).text();
  const cells = new Map();
  for (const [, attrs] of html.matchAll(
    /<td\b([^>]*\bContributionCalendar-day\b[^>]*)>/g,
  )) {
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const date = /\bdata-date="(\d{4}-\d{2}-\d{2})"/.exec(attrs)?.[1];
    const level = Number(/\bdata-level="(\d)"/.exec(attrs)?.[1]);
    if (id && date) cells.set(id, { date, count: 0, level });
  }
  for (const [, id, text] of html.matchAll(
    /<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g,
  )) {
    const cell = cells.get(id);
    const n = /^([\d,]+) contributions? on/.exec(text.trim())?.[1];
    if (cell && n) cell.count = Number(n.replaceAll(",", ""));
  }
  return [...cells.values()];
}

function validDays(days) {
  if (days.length < 300) throw new Error(`only ${days.length} days`);
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error("bad date");
    if (!Number.isInteger(d.count) || d.count < 0) throw new Error("bad count");
    if (!Number.isInteger(d.level) || d.level < 0 || d.level > 4)
      throw new Error("bad level");
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

async function previous() {
  for (const file of [OUT, SNAPSHOT]) {
    if (existsSync(file)) return JSON.parse(await readFile(file, "utf8"));
  }
  return { versions: {}, contributions: null };
}

const old = await previous();
const data = {
  fetchedAt: new Date().toISOString(),
  versions: { ...old.versions },
  contributions: old.contributions,
};
let warnings = 0;

for (const repo of REPOS) {
  try {
    data.versions[repo] = await latestRelease(repo);
    console.log(`github: ${repo} latest release ${data.versions[repo]}`);
  } catch (error) {
    warnings++;
    console.warn(`github: WARNING ${repo} release kept as before: ${error}`);
  }
}

try {
  const days = validDays(await contributionsFromProfile());
  data.contributions = { source: "profile", days };
  const total = days.reduce((sum, d) => sum + d.count, 0);
  console.log(
    `github: ${days.length} days, ${total} contributions (${data.contributions.source})`,
  );
} catch (error) {
  warnings++;
  console.warn(
    `github: WARNING contributions kept from ${
      data.contributions ? "the last good data" : "nothing (heatmap hidden)"
    }: ${error}`,
  );
}

if (warnings && !existsSync(OUT) && existsSync(SNAPSHOT)) {
  await copyFile(SNAPSHOT, OUT);
} else {
  await writeFile(OUT, JSON.stringify(data, null, 2) + "\n");
}
if (process.argv.includes("--snapshot")) {
  await writeFile(SNAPSHOT, JSON.stringify(data, null, 2) + "\n");
  console.log("github: snapshot updated");
}
