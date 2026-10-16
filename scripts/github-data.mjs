// Fetches the public GitHub data the site shows, at build time:
//  - the latest release tag of each product (public REST API);
//  - candygoogy's public contribution calendar for the heatmap.
//
// Contributions come from the logged-out profile page, which shows exactly
// what any visitor sees on GitHub. No secret to create or expire: a
// GITHUB_TOKEN in the environment (CI has a built-in one) is only sent to
// the REST API, for its higher rate limit, and nothing needs it.
//
// Run locally, this script never fails the build. On any error it keeps the
// last good data (src/data/github.json), or falls back to the committed
// snapshot (src/data/github.snapshot.json), and prints a warning. With
// DATA_STRICT=1 (the daily CI run) it still writes that data, then exits
// with code 1 if there was any warning. On Workers Builds (WORKERS_CI=1) it
// also exits with 1 when the calendar fetch fails and the kept days are
// missing or over a week old, rather than deploy a stale heatmap.
//   node scripts/github-data.mjs [--snapshot]

import { existsSync } from "node:fs";
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  mergeData,
  parseContributions,
  productRepo,
  staleDeploy,
  validDays,
} from "./github-days.mjs";

const USER = "candygoogy";
const PROJECTS = join(import.meta.dirname, "..", "src", "content", "projects");
const DATA = join(import.meta.dirname, "..", "src", "data");
const OUT = join(DATA, "github.json");
const SNAPSHOT = join(DATA, "github.snapshot.json");
const UA = { "User-Agent": "candygoogy.dev-build" };
const STRICT = process.env.DATA_STRICT === "1";
// Set by Workers Builds on every build.
const WORKERS_BUILDS = process.env.WORKERS_CI === "1";
// Dropped once the API rejects it.
let token = process.env.GITHUB_TOKEN;

let warnings = 0;
function warn(message) {
  warnings++;
  console.warn(`github: WARNING ${message}`);
}

async function get(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...UA, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw Object.assign(new Error(`${url}: HTTP ${res.status}`), {
      status: res.status,
    });
  }
  return res;
}

async function latestRelease(repo) {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const headers = { Accept: "application/vnd.github+json" };
  let res;
  try {
    res = await get(url, {
      headers: {
        ...headers,
        ...(token && { Authorization: `Bearer ${token}` }),
      },
    });
  } catch (error) {
    // An expired or revoked token shouldn't cost the releases: the API
    // answers without one, at a lower rate limit. Dropped for the rest of
    // the run, so the warning comes once.
    if (!token || error.status !== 401) throw error;
    warn("GITHUB_TOKEN rejected (HTTP 401), asking without it");
    token = undefined;
    res = await get(url, { headers });
  }
  const { tag_name: tag } = await res.json();
  if (typeof tag !== "string" || !tag) throw new Error(`${repo}: no tag`);
  return tag.replace(/^v/, "");
}

async function contributionsFromProfile() {
  const res = await get(`https://github.com/users/${USER}/contributions`);
  return parseContributions(await res.text());
}

// The repos to ask for a release: products with a repo in their frontmatter.
// Side projects aren't asked: their versions aren't shown, and their tags
// (notary's changes-v0.2.1) aren't versions, and neither are drafts'. Top-level
// files only, like the content loader's "*.md" pattern, and only unindented
// frontmatter keys.
async function productRepos() {
  const repos = [];
  for (const file of (await readdir(PROJECTS)).sort()) {
    if (!file.endsWith(".md")) continue;
    const repo = productRepo(await readFile(join(PROJECTS, file), "utf8"));
    if (repo) repos.push(repo);
  }
  return repos;
}

async function previous() {
  for (const file of [OUT, SNAPSHOT]) {
    if (!existsSync(file)) continue;
    // A corrupt file (or one that isn't an object) falls through to the next
    // one rather than failing the build.
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (data && typeof data === "object" && !Array.isArray(data)) {
        return data;
      }
      warn(`ignoring ${file}: not an object`);
    } catch (error) {
      warn(`ignoring unreadable ${file}: ${error}`);
    }
  }
  return { fetchedAt: "", versions: {}, contributions: null };
}

// Written aside and renamed, so a cut-off write never leaves a broken file
// for the build to read.
async function writeJson(file, data) {
  await writeFile(`${file}.tmp`, JSON.stringify(data, null, 2) + "\n");
  await rename(`${file}.tmp`, file);
}

const old = await previous();

let repos = null;
try {
  repos = await productRepos();
} catch (error) {
  warn(`releases kept as before, no project list: ${error}`);
}

const versions = {};
for (const repo of repos ?? []) {
  try {
    versions[repo] = await latestRelease(repo);
    console.log(`github: ${repo} latest release ${versions[repo]}`);
  } catch (error) {
    warn(`${repo} release kept as before: ${error}`);
  }
}

let contributions = null;
try {
  const days = validDays(await contributionsFromProfile());
  contributions = { source: "profile", days };
  const total = days.reduce((sum, d) => sum + d.count, 0);
  console.log(
    `github: ${days.length} days, ${total} contributions (${contributions.source})`,
  );
} catch (error) {
  warn(
    `contributions kept from ${
      old.contributions ? "the last good data" : "nothing (heatmap hidden)"
    }: ${error}`,
  );
}

const data = mergeData(
  old,
  { repos, versions, contributions },
  new Date().toISOString(),
);

// Always write the merged data: it starts from the last good file, so a part
// that failed keeps its old value and the parts that fetched stay fresh.
await writeJson(OUT, data);
if (warnings) {
  console.warn(`github: ${warnings} warning(s), see above`);
}
if (process.argv.includes("--snapshot")) {
  await writeJson(SNAPSHOT, data);
  console.log("github: snapshot updated");
}
if (STRICT && warnings) {
  console.error("github: failing because DATA_STRICT=1");
  process.exitCode = 1;
}
if (
  staleDeploy({
    fetched: contributions !== null,
    workersBuilds: WORKERS_BUILDS,
    contributions: data.contributions,
    now: new Date(),
  })
) {
  console.error(
    "github: failing: the contributions didn't fetch on Workers Builds and the kept ones are missing or over 7 days old. Refresh the snapshot with `node scripts/github-data.mjs --snapshot` and commit it.",
  );
  process.exitCode = 1;
}
