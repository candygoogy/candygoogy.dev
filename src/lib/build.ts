import { execSync } from "node:child_process";

// When and from which commit this build was made, for the footer stamp.
// Build time only. The commit comes from Workers Builds' environment, or
// from git locally; without either, the stamp shows just the date, and
// the build never fails over it.

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

function commitSha(): string | undefined {
  let sha = process.env.WORKERS_CI_COMMIT_SHA;
  if (!sha) {
    try {
      sha = execSync("git rev-parse HEAD", {
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      // No git here: no commit in the stamp.
    }
  }
  return sha && /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : undefined;
}

export const commit = commitSha();
