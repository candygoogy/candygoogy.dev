// The experiments' security policy check: reading what a policy lets a tool
// connect to and load from, sorting that into what /experiments can say
// about it, and keeping the last good check when one fails. Shared by
// scripts/experiments-csp.mjs (at build time), scripts/check-live.mjs (the
// daily CI run) and the experiments page. Only livePolicies() fetches;
// listedTools() reads the experiment files.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  frontmatter,
  frontmatterFlag,
  frontmatterKey,
} from "./github-days.mjs";

// What a tool may connect to, strictest first:
//  - none: nothing at all (connect-src 'none');
//  - dns: only Cloudflare's DNS over HTTPS, which mail uses to look up the
//    domain typed into it, and only mail;
//  - unknown: anything else, which the page doesn't put into words.
// Both of the first two also need every other way out closed (elsewhere).
export const CLASSES = ["none", "dns", "unknown"];
const DNS = "https://cloudflare-dns.com";
// The tools allowed more than none. Every other one is expected to send
// connect-src 'none'. The lede names each of them, so each must be listed.
export const EXPECTED = Object.freeze({ mail: "dns" });

/** @param {string} id */
export const expected = (id) =>
  Object.hasOwn(EXPECTED, id) ? EXPECTED[id] : "none";

// One policy's directive, as a list of its sources (lowercased: keywords and
// hosts are read without case), or undefined when the policy doesn't have it.
function directive(policy, name) {
  for (const part of policy.split(";")) {
    const [key, ...sources] = part.trim().split(/\s+/);
    if (key?.toLowerCase() === name) {
      return sources.filter(Boolean).map((s) => s.toLowerCase());
    }
  }
  return undefined;
}

/** What a Content-Security-Policy header lets a page connect to: its
 * connect-src, or its default-src without one. No header, or neither
 * directive, allows anything, written as ["*"]. Several policies (joined
 * by commas) all apply: one of 'none' wins, else the first that limits.
 * @param {string | null | undefined} header
 * @returns {string[]} */
export function connectSources(header) {
  const lists = (header ?? "")
    .split(",")
    .map((p) => directive(p, "connect-src") ?? directive(p, "default-src"))
    .filter((list) => list !== undefined);
  return (
    lists.find((l) => l.length === 1 && l[0] === "'none'") ?? lists[0] ?? ["*"]
  );
}

// The directives other than connect-src through which a page can load or
// send something, each with where it falls back to without it. form-action
// has no fallback: without it, a form may post anywhere.
const FETCHES = {
  "default-src": [],
  "script-src": ["default-src"],
  "script-src-elem": ["script-src", "default-src"],
  "style-src": ["default-src"],
  "style-src-elem": ["style-src", "default-src"],
  "img-src": ["default-src"],
  "font-src": ["default-src"],
  "media-src": ["default-src"],
  "object-src": ["default-src"],
  "manifest-src": ["default-src"],
  "child-src": ["default-src"],
  "frame-src": ["child-src", "default-src"],
  "worker-src": ["child-src", "script-src", "default-src"],
  "form-action": [],
};

// A source that reaches nothing outside the tool's own site: a keyword
// ('self', 'none', a hash or nonce, 'unsafe-inline'...), blob: or data:.
// Not 'strict-dynamic', which lets a trusted script load from anywhere.
const local = (source) =>
  source === "blob:" ||
  source === "data:" ||
  (source.startsWith("'") && source !== "'strict-dynamic'");

// The directives that send the browser's reports of what a policy blocked
// to an address (report-to through a Reporting-Endpoints header): with
// either, whatever its value, something can leave.
const REPORTS = ["report-uri", "report-to"];

/** What else a Content-Security-Policy header lets a page load from or send
 * to outside its own site, beyond connect-src: "<directive> <source>" for
 * each such source, sorted; [] when there's none. A directive the policy
 * doesn't have (nor its fallbacks) allows anything, written "*". Of several
 * policies (joined by commas), one that keeps a directive local wins. A
 * report-uri or report-to in any of them counts too, with its value, or
 * alone without one: each policy sends its own reports.
 * @param {string | null | undefined} header
 * @returns {string[]} */
export function elsewhereSources(header) {
  const policies = (header ?? "").split(",");
  const out = [];
  for (const [name, fallbacks] of Object.entries(FETCHES)) {
    const outside = policies.map((p) =>
      (
        [name, ...fallbacks]
          .map((d) => directive(p, d))
          .find((l) => l !== undefined) ?? ["*"]
      ).filter((s) => !local(s)),
    );
    const kept = outside.find((l) => !l.length) ?? outside[0];
    out.push(...kept.map((s) => `${name} ${s}`));
  }
  for (const p of policies) {
    for (const name of REPORTS) {
      const to = directive(p, name);
      if (to) out.push(...(to.length ? to.map((s) => `${name} ${s}`) : [name]));
    }
  }
  return out.sort();
}

/** A header read the way the checks keep it. @param {string | null} header */
export const policyOf = (header) => ({
  connect: connectSources(header),
  elsewhere: elsewhereSources(header),
});

/** A policy in words, for warnings: what it connects to, and what else gets
 * out. @param {{ connect: string[], elsewhere?: string[] }} policy */
export const allows = ({ connect, elsewhere }) =>
  [
    `connect-src ${connect.join(" ")}`,
    ...(elsewhere ?? ["the rest unread"]),
  ].join(", ");

/** @param {string} id @param {string[]} connect
 * @param {string[] | undefined} elsewhere undefined for a check kept from
 * before the other directives were read: unknown, so the lede leaves the
 * policies out until the next build checks the tool again. */
export function classify(id, connect, elsewhere) {
  if (!elsewhere || elsewhere.length) return "unknown";
  if (connect.length === 1 && connect[0] === "'none'") return "none";
  if (expected(id) === "dns" && connect.length === 1 && connect[0] === DNS)
    return "dns";
  return "unknown";
}

/** Whether a tool's class allows more than it should. @param {string} id
 * @param {string} cls */
export const looser = (id, cls) =>
  CLASSES.indexOf(cls) > CLASSES.indexOf(expected(id));

/** The day the lede's "Checked" gives: the oldest check across the listed
 * tools, so it's never newer than any one of them. The lede says every tool
 * but mail is blocked from connecting anywhere, so it's undefined when a
 * tool has no check, or one looser than that (other than none, or for mail
 * its DNS lookup or none), or when mail isn't listed; those tools are in
 * failing.
 * @param {string[]} ids
 * @param {Record<string, { connect: string[], elsewhere?: string[], checked: string }>} checks
 * @returns {{ checked: string | undefined, failing: string[] }} */
export function oldestCheck(ids, checks) {
  const failing = [
    ...Object.keys(EXPECTED).filter((id) => !ids.includes(id)),
    ...ids.filter(
      (id) =>
        !Object.hasOwn(checks, id) ||
        classify(id, checks[id].connect, checks[id].elsewhere) === "unknown",
    ),
  ];
  const days = ids.map((id) => checks[id]?.checked ?? "").sort();
  return {
    checked: failing.length || !days.length ? undefined : days[0],
    failing,
  };
}

/** An experiment file's address, if /experiments lists it (not a draft,
 * not retired), else undefined. Throws when the file has a url the plain
 * read can't take as an https address (a quoted value with spaces, a folded
 * one): the site would list that tool, so leaving it out of the checks
 * quietly would be wrong.
 * @param {string} text */
export function listedUrl(text) {
  const front = frontmatter(text);
  if (frontmatterFlag(front, "draft")) return undefined;
  if (frontmatterKey(front, "status") === "retired") return undefined;
  const url = frontmatterKey(front, "url");
  // The plain read takes "url: >" as ">": only an https address counts.
  if (/^url:/m.test(front) && !/^https:\/\//.test(url ?? "")) {
    throw new Error("its url: can't be read; write it as a plain address");
  }
  return url;
}

export const EXPERIMENTS = join(
  import.meta.dirname,
  "..",
  "src",
  "content",
  "experiments",
);
const UA = { "User-Agent": "candygoogy.dev-build" };

/** Every experiment /experiments lists, with its address, by file name.
 * Throws when the list, or a file's url, can't be read. The build and the
 * daily live checks all ask through this, so they see the same tools.
 * @returns {Promise<{ id: string, url: string }[]>} */
export async function listedTools() {
  const tools = [];
  for (const file of (await readdir(EXPERIMENTS)).sort()) {
    if (!file.endsWith(".md")) continue;
    let url;
    try {
      url = listedUrl(await readFile(join(EXPERIMENTS, file), "utf8"));
    } catch (error) {
      throw new Error(`src/content/experiments/${file}: ${error.message}`, {
        cause: error,
      });
    }
    // The file's name, as the content loader names it.
    if (url) tools.push({ id: file.slice(0, -".md".length), url });
  }
  return tools;
}

/** Every experiment /experiments lists, with its live policy header (null
 * without one) or why it couldn't be fetched. Throws only when the list
 * can't be read. The build and the daily live check both ask through this,
 * so they see the same tools the same way.
 * @returns {Promise<({ id: string, header: string | null } | { id: string, error: unknown })[]>} */
export async function livePolicies() {
  const tools = await listedTools();
  return Promise.all(
    tools.map(async ({ id, url }) => {
      try {
        const res = await fetch(url, {
          method: "HEAD",
          headers: UA,
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return { id, header: res.headers.get("content-security-policy") };
      } catch (error) {
        return { id, error };
      }
    }),
  );
}

/** The checks to keep: this run's for each tool that answered, dated
 * today; the last good one for a tool that didn't (with its old date), or
 * none. ids is null when the list couldn't be read: then every old check
 * is kept. A tool no longer listed loses its check.
 * @param {Record<string, { connect: string[], elsewhere?: string[], checked: string }>} old
 * @param {string[] | null} ids
 * @param {Record<string, { connect: string[], elsewhere: string[] } | { error: unknown }>} results
 * @param {string} today YYYY-MM-DD */
export function mergeChecks(old, ids, results, today) {
  if (ids === null) return { ...old };
  const out = {};
  for (const id of ids) {
    const result = results[id];
    if (result && "connect" in result) {
      out[id] = {
        connect: result.connect,
        elsewhere: result.elsewhere,
        checked: today,
      };
    } else if (Object.hasOwn(old, id)) {
      out[id] = old[id];
    }
  }
  return out;
}
