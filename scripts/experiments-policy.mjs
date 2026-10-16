// The pure parts of the experiments' security policy check: reading what a
// policy lets a tool connect to, sorting that into what /experiments can
// say about it, and keeping the last good check when one fails. Shared by
// scripts/experiments-csp.mjs (at build time), scripts/check-live.mjs (the
// daily CI run) and the experiments page; nothing here fetches.
import { frontmatter, frontmatterKey } from "./github-days.mjs";

// What a tool may connect to, strictest first:
//  - none: nothing at all (connect-src 'none');
//  - dns: only Cloudflare's DNS over HTTPS, which mail uses to look up the
//    domain typed into it, and only mail;
//  - unknown: anything else, which the page doesn't put into words.
export const CLASSES = ["none", "dns", "unknown"];
const DNS = "https://cloudflare-dns.com";
// The tools allowed more than none. Every other one is expected to send
// connect-src 'none'.
const EXPECTED = { mail: "dns" };

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

/** @param {string} id @param {string[]} connect */
export function classify(id, connect) {
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
 * @param {Record<string, { connect: string[], checked: string }>} checks
 * @returns {{ checked: string | undefined, failing: string[] }} */
export function oldestCheck(ids, checks) {
  const failing = [
    ...Object.keys(EXPECTED).filter((id) => !ids.includes(id)),
    ...ids.filter(
      (id) =>
        !Object.hasOwn(checks, id) ||
        classify(id, checks[id].connect) === "unknown",
    ),
  ];
  const days = ids.map((id) => checks[id]?.checked ?? "").sort();
  return {
    checked: failing.length || !days.length ? undefined : days[0],
    failing,
  };
}

/** An experiment file's address, if /experiments lists it (not a draft,
 * not retired), else undefined. @param {string} text */
export function listedUrl(text) {
  const front = frontmatter(text);
  if (frontmatterKey(front, "draft") === "true") return undefined;
  if (frontmatterKey(front, "status") === "retired") return undefined;
  return frontmatterKey(front, "url");
}

/** The checks to keep: this run's for each tool that answered, dated
 * today; the last good one for a tool that didn't (with its old date), or
 * none. ids is null when the list couldn't be read: then every old check
 * is kept. A tool no longer listed loses its check.
 * @param {Record<string, { connect: string[], checked: string }>} old
 * @param {string[] | null} ids
 * @param {Record<string, { connect: string[] } | { error: unknown }>} results
 * @param {string} today YYYY-MM-DD */
export function mergeChecks(old, ids, results, today) {
  if (ids === null) return { ...old };
  const out = {};
  for (const id of ids) {
    const result = results[id];
    if (result && "connect" in result) {
      out[id] = { connect: result.connect, checked: today };
    } else if (Object.hasOwn(old, id)) {
      out[id] = old[id];
    }
  }
  return out;
}
