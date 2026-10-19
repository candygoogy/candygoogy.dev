import { execSync } from "node:child_process";
import { site } from "../data/site.ts";

// When and from which commit this build was made, for the footer stamp.
// Build time only. The commit comes from Workers Builds' environment, then
// from git, then from the latest commit on the deploy branch on GitHub,
// which Workers Builds builds from (deploy-hook builds carry no commit of
// their own). Without any of them the stamp shows just the date; the build
// never fails over it. One log line says which source was used, or why none
// worked. A commit read from git, in a tree with uncommitted changes, is
// marked dirty: the build isn't that commit.

const now = new Date();

export const builtOn = {
  // <time datetime>, in UTC.
  iso: now.toISOString().slice(0, 10),
  // "Oct 11, 2026", in UTC, no time of day.
  label: new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(now),
};

const SHA = /^[0-9a-f]{40}$/i;
// "https://github.com/owner/repo" -> "owner/repo"
const REPO = new URL(site.source).pathname.slice(1);

const firstLine = (error: unknown) =>
  String(
    (error as { stderr?: Buffer }).stderr?.toString().trim() ||
      (error as Error).message ||
      error,
  ).split("\n")[0];

// Where the commit can come from, passed in so the tests can stand in for
// each one.
type Sources = {
  env: string | undefined;
  git: () => string;
  get: typeof fetch;
};

/** The build's commit and which source gave it, trying each in turn; undefined
 * when none did. */
export async function commitSha({
  env,
  git,
  get,
}: Sources): Promise<{ sha: string; source: string } | undefined> {
  const misses: string[] = [];

  env = env?.trim();
  if (env && SHA.test(env)) return found(env, "WORKERS_CI_COMMIT_SHA", misses);
  misses.push(`env ${env ? "not a SHA" : "empty"}`);

  try {
    const sha = git().trim();
    if (SHA.test(sha)) return found(sha, "git", misses);
    misses.push(`git gave "${sha}"`);
  } catch (error) {
    misses.push(`git: ${firstLine(error)}`);
  }

  try {
    const res = await get(
      `https://api.github.com/repos/${REPO}/commits/deploy`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "candygoogy.dev-build",
        },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { sha } = (await res.json()) as { sha?: unknown };
    if (typeof sha === "string" && SHA.test(sha)) {
      return found(sha, "GitHub, latest on deploy", misses);
    }
    misses.push("GitHub: no SHA in the reply");
  } catch (error) {
    misses.push(`GitHub: ${firstLine(error)}`);
  }

  console.warn(`build stamp: no commit (${misses.join("; ")})`);
  return undefined;
}

function found(sha: string, source: string, misses: string[]) {
  const why = misses.length ? ` (${misses.join("; ")})` : "";
  console.log(`build stamp: commit ${sha.slice(0, 7)} from ${source}${why}`);
  return { sha: sha.toLowerCase(), source };
}

const stamp = await commitSha({
  env: process.env.WORKERS_CI_COMMIT_SHA,
  git: () =>
    execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "pipe"],
    }).toString(),
  get: fetch,
});
export const commit = stamp?.sha;
const fromGit = stamp?.source === "git";

function uncommitted(): boolean {
  try {
    return (
      execSync("git status --porcelain", {
        stdio: ["ignore", "pipe", "pipe"],
      })
        .toString()
        .trim() !== ""
    );
  } catch {
    return false;
  }
}

export const dirty = fromGit && uncommitted();
if (dirty) console.log("build stamp: uncommitted changes, marked dirty");

// The commit as the stamp shows it: "1a2b3c4", or "1a2b3c4-dirty".
export const shortCommit =
  commit && `${commit.slice(0, 7)}${dirty ? "-dirty" : ""}`;
