import { site } from "../data/site.ts";

// Finding the commit a build was made from, for the footer stamp. Nothing
// runs on import: src/lib/build.ts calls commitSha with the real sources,
// the tests with stand-ins.

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
