import { existsSync, readFileSync } from "node:fs";

// Reads the data written by scripts/github-data.mjs, or the committed
// snapshot when a build ran without it. Build time only.

export interface Day {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

interface GithubData {
  fetchedAt: string;
  versions: Record<string, string>;
  contributions: { source: string; days: Day[] } | null;
}

function load(): GithubData {
  for (const file of [
    "src/data/github.json",
    "src/data/github.snapshot.json",
  ]) {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8")) as GithubData;
    }
  }
  return { fetchedAt: "", versions: {}, contributions: null };
}

export const github = load();

export function latestVersion(
  repo: string | undefined,
  fallback: string | undefined,
): string | undefined {
  return (repo && github.versions[repo]) || fallback;
}
