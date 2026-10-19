// The colophon's Privacy row names policy values in its copy. These read
// them from the page and hold them to the policies themselves: the site's
// (scripts/csp.mjs) and what the experiments are expected to send
// (scripts/experiments-policy.mjs).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { policyFor } from "../../scripts/csp.mjs";
import {
  classify,
  connectSources,
  EXPECTED,
} from "../../scripts/experiments-policy.mjs";

const page = (
  await readFile(
    new URL("../../src/pages/colophon.astro", import.meta.url),
    "utf8",
  )
).replace(/\s+/g, " ");

const said = (pattern) => {
  const match = pattern.exec(page);
  assert.ok(match, `colophon.astro no longer says ${pattern}`);
  return match[1];
};

test("colophon: the site's connect-src is what the Privacy row says", () => {
  const { policy } = policyFor('<meta charset="utf-8">');
  const connect = policy
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("connect-src "));
  assert.equal(connect, `connect-src ${said(/\(connect-src ([^)]+)\)/)}`);
  assert.equal(connect, "connect-src 'self'");
});

test("colophon: only mail may connect, and only to the host it names", () => {
  // Every tool but mail is expected to send connect-src 'none'.
  assert.deepEqual(Object.keys(EXPECTED), ["mail"]);
  const none = said(/each tool’s policy is (connect-src '[^']+')/);
  assert.equal(classify("photo", connectSources(none), []), "none");
  // And mail's one exception is the host the copy gives.
  const host = said(/Mail check’s lookups to ([a-z0-9.-]+[a-z]) /);
  assert.equal(host, "cloudflare-dns.com");
  assert.equal(
    classify("mail", connectSources(`connect-src https://${host}`), []),
    "dns",
  );
});
