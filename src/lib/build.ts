import { execSync } from "node:child_process";
import { commitSha } from "./commit.ts";

// When and from which commit this build was made, for the footer stamp
// and the colophon's Source row. Build time only. The commit comes from
// Workers Builds' environment, then from git, then from the latest commit
// on the deploy branch on GitHub, which Workers Builds builds from
// (deploy-hook builds carry no commit of their own). Without any of them
// the stamp shows just the date; the build never fails over it. One log
// line says which source was used, or why none worked. A commit read from
// git, in a tree with uncommitted changes, is marked dirty: the build isn't
// that commit.

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
