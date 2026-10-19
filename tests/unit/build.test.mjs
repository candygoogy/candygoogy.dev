// Importing src/lib/build.ts reads this checkout's commit once, as a build
// does; the tests then pass each source in themselves.
import assert from "node:assert/strict";
import test from "node:test";
import { commitSha } from "../../src/lib/build.ts";

const ENV = "a".repeat(40);
const GIT = "b".repeat(40);
const TIP = "c".repeat(40);
const reply = (body, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const fails = (message) => () => {
  throw new Error(message);
};

test("commitSha: the environment first, then git, then GitHub", async () => {
  const asked = [];
  const get = (url) => {
    asked.push(url);
    return reply({ sha: TIP });
  };
  const git = () => `${GIT}\n`;
  assert.deepEqual(await commitSha({ env: ENV, git: fails("unused"), get }), {
    sha: ENV,
    source: "WORKERS_CI_COMMIT_SHA",
  });
  assert.deepEqual(await commitSha({ env: " not a sha ", git, get }), {
    sha: GIT,
    source: "git",
  });
  assert.deepEqual(asked, []);
  assert.deepEqual(
    await commitSha({ env: "", git: fails("not a git repository"), get }),
    { sha: TIP, source: "GitHub, latest on deploy" },
  );
  // The branch Workers Builds builds from, not main.
  assert.deepEqual(asked, [
    "https://api.github.com/repos/candygoogy/candygoogy.dev/commits/deploy",
  ]);
});

test("commitSha: with every source failing, no commit", async () => {
  for (const get of [
    () => reply({ message: "Not Found" }, 404),
    () => reply({ sha: "main" }),
    () => Promise.reject(new Error("timeout")),
  ]) {
    assert.equal(
      await commitSha({ env: undefined, git: () => "HEAD", get }),
      undefined,
    );
  }
});
