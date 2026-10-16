import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Reads the data written by scripts/github-data.mjs, or the committed
// snapshot when a build ran without it. Build time only.

// The project root, which build-time paths in src/lib are joined onto. The
// build sets it (astro.config.mjs); the unit tests import this file under
// plain Node, run from the root.
export const root =
  typeof __PROJECT_ROOT__ === "string" ? __PROJECT_ROOT__ : process.cwd();

export interface Day {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

// A published release, for the feed (scripts/github-days.mjs, parseReleases).
export interface Release {
  tag: string;
  name: string;
  url: string;
  published: string;
}

interface GithubData {
  fetchedAt: string;
  versions: Record<string, string>;
  // Each product's last releases, newest first.
  releases: Record<string, Release[]>;
  contributions: { source: string; days: Day[] } | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const isRelease = (r: unknown): r is Release =>
  isObject(r) &&
  ["tag", "name", "url", "published"].every((k) => typeof r[k] === "string");

// The parts the pages read must have the right shape, or the first page
// that reads one throws ("versions": null). A wrong part is dropped with a
// warning; the rest of the file is still used.
function checked(data: Record<string, unknown>, file: string): GithubData {
  let { versions, releases, contributions } = data;
  if (!isObject(versions)) {
    console.warn(`github: WARNING ignoring versions in ${file}: not an object`);
    versions = {};
  }
  // Older files have no releases; a list of the wrong shape is dropped.
  releases = Object.fromEntries(
    Object.entries(isObject(releases) ? releases : {}).filter(
      ([repo, list]) => {
        const ok = Array.isArray(list) && list.every(isRelease);
        if (!ok) {
          console.warn(
            `github: WARNING ignoring ${repo}'s releases in ${file}: not a list of releases`,
          );
        }
        return ok;
      },
    ),
  );
  if (
    contributions !== null &&
    !(isObject(contributions) && Array.isArray(contributions["days"]))
  ) {
    console.warn(
      `github: WARNING ignoring contributions in ${file}: no days list`,
    );
    contributions = null;
  }
  return { ...data, versions, releases, contributions } as GithubData;
}

// A file that doesn't parse, or isn't an object, falls through to the next
// one rather than failing the build.
function load(): GithubData {
  const empty: GithubData = {
    fetchedAt: "",
    versions: {},
    releases: {},
    contributions: null,
  };
  for (const name of ["github.json", "github.snapshot.json"]) {
    const file = `src/data/${name}`;
    const path = join(root, file);
    if (!existsSync(path)) continue;
    try {
      const data: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (isObject(data)) return checked({ ...empty, ...data }, file);
      console.warn(`github: WARNING ignoring ${file}: not an object`);
    } catch (error) {
      console.warn(`github: WARNING ignoring unreadable ${file}: ${error}`);
    }
  }
  return empty;
}

export const github = load();

// Semver precedence between two pre-release tags ("rc.1" vs "beta"):
// identifier by identifier, numbers below words, and a shorter tag that
// matches so far is the lower one.
function comparePre(a: string[], b: string[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const diff = Number(x) - Number(y);
      if (diff) return diff;
    } else if (nx !== ny) {
      return nx ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

// The higher of two dotted versions ("v1.2" and "1.2.0" read the same).
// A pre-release sits below its final ("1.1.0-rc.1" < "1.1.0"); build
// metadata after "+" is ignored. Junk parts read as 0 rather than throwing.
// Either may be missing, then the other wins.
export function higherVersion(
  a: string | undefined,
  b: string | undefined,
): string | undefined {
  if (!a || !b) return a || b;
  // "v1.1.0-rc.1+abc": the numbers before the first "-", the pre-release
  // tag after it, up to any "+".
  const split = (v: string) => {
    const [, core = "", pre] = /^v?([^-+]*)(?:-([^+]*))?/.exec(v) ?? [];
    return {
      nums: core.split(".").map(Number),
      pre: pre === undefined ? [] : pre.split("."),
    };
  };
  const va = split(a);
  const vb = split(b);
  for (let i = 0; i < Math.max(va.nums.length, vb.nums.length); i++) {
    const diff = (va.nums[i] || 0) - (vb.nums[i] || 0);
    if (diff) return diff > 0 ? a : b;
  }
  // Same numbers: the final release beats any pre-release of it.
  if (!va.pre.length) return a;
  if (!vb.pre.length) return b;
  return comparePre(va.pre, vb.pre) < 0 ? b : a;
}

// A stale fetched value (snapshot or last good data) must not beat a newer
// version written in the project's frontmatter. The fetched versions can be
// passed in (the tests do), and default to the build's data.
export function latestVersion(
  repo: string | undefined,
  fallback: string | undefined,
  versions: Record<string, string> = github.versions,
): string | undefined {
  return higherVersion(repo ? versions[repo] : undefined, fallback);
}
