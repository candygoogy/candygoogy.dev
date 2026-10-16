import assert from "node:assert/strict";
import test from "node:test";
import {
  classify,
  connectSources,
  listedUrl,
  looser,
  mergeChecks,
  oldestCheck,
} from "../../scripts/experiments-policy.mjs";
import { experiments as words } from "../../src/data/experiments.ts";

// Shaped like the tools' live headers (2026-10-16).
const policy = (connect) =>
  `default-src 'self'; connect-src ${connect}; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'`;

test("connect-src 'none' reads as none, for any tool", () => {
  const connect = connectSources(policy("'none'"));
  assert.deepEqual(connect, ["'none'"]);
  assert.equal(classify("photo", connect), "none");
  assert.equal(classify("mail", connect), "none");
  assert.equal(classify("photo", connectSources(policy("'NONE'"))), "none");
});

test("mail's Cloudflare DNS reads as dns, only for mail", () => {
  const connect = connectSources(policy("https://cloudflare-dns.com"));
  assert.equal(classify("mail", connect), "dns");
  assert.equal(looser("mail", "dns"), false);
  // Another tool talking to the same DNS isn't described.
  assert.equal(classify("photo", connect), "unknown");
  assert.equal(looser("photo", "unknown"), true);
});

test("a looser policy is unknown, and looser than expected", () => {
  for (const connect of [
    "'self'",
    "https://cloudflare-dns.com https://example.com",
    "https://cloudflare-dns.com/",
    "*",
  ]) {
    const cls = classify("mail", connectSources(policy(connect)));
    assert.equal(cls, "unknown", connect);
    assert.equal(looser("mail", cls), true);
  }
  assert.equal(looser("photo", "dns"), true);
  // Stricter than expected is fine.
  assert.equal(looser("mail", "none"), false);
});

test("no header, or neither directive, allows anything", () => {
  for (const header of [null, undefined, "", "img-src 'self'"]) {
    const connect = connectSources(header);
    assert.deepEqual(connect, ["*"]);
    assert.equal(classify("photo", connect), "unknown");
  }
});

test("without connect-src, default-src applies", () => {
  assert.deepEqual(connectSources("default-src 'none'; img-src 'self'"), [
    "'none'",
  ]);
});

test("of several policies, one of 'none' wins", () => {
  assert.deepEqual(connectSources(`${policy("'self'")}, connect-src 'none'`), [
    "'none'",
  ]);
});

test("a failed check keeps the last good one, with its old date", () => {
  const old = {
    photo: { connect: ["'none'"], checked: "2026-10-10" },
    mail: { connect: ["https://cloudflare-dns.com"], checked: "2026-10-10" },
    gone: { connect: ["'none'"], checked: "2026-10-10" },
  };
  const merged = mergeChecks(
    old,
    ["mail", "new", "photo"],
    {
      photo: { connect: ["'none'"] },
      mail: { error: new Error("timeout") },
      new: { error: new Error("timeout") },
    },
    "2026-10-16",
  );
  assert.deepEqual(merged, {
    photo: { connect: ["'none'"], checked: "2026-10-16" },
    mail: old.mail,
    // A tool never checked has no line; one no longer listed is dropped.
  });
  // Without a list, every old check is kept.
  assert.deepEqual(mergeChecks(old, null, {}, "2026-10-16"), old);
});

test("listedUrl skips drafts and retired tools", () => {
  const file = (extra) =>
    `---\nname: Mail check\nurl: https://mail.candygoogy.dev/\nstatus: live\n${extra}---\nBody`;
  assert.equal(listedUrl(file("")), "https://mail.candygoogy.dev/");
  assert.equal(listedUrl(file("draft: true\n")), undefined);
  assert.equal(
    listedUrl(file("").replace("status: live", "status: retired")),
    undefined,
  );
});

const none = (checked) => ({ connect: ["'none'"], checked });
const dns = (checked) => ({
  connect: ["https://cloudflare-dns.com"],
  checked,
});
const ids = ["mail", "photo", "subnet"];
const fine = {
  mail: dns("2026-10-16"),
  photo: none("2026-10-14"),
  subnet: none("2026-10-15"),
};
const LEDE =
  "Small tools that run in your browser. All but Mail check are blocked from connecting anywhere. Checked Oct 14.";
const INTRO = "Small tools that run in your browser.";

test("the lede: all fine says so, with the oldest check", () => {
  assert.deepEqual(oldestCheck(ids, fine), {
    checked: "2026-10-14",
    failing: [],
  });
  assert.equal(words.lede("Oct 14"), LEDE);
});

test("the lede: mail at none is stricter than expected, still fine", () => {
  assert.deepEqual(oldestCheck(ids, { ...fine, mail: none("2026-10-16") }), {
    checked: "2026-10-14",
    failing: [],
  });
});

test("the lede: mail looser than its DNS host drops the sentences", () => {
  for (const connect of [
    ["'self'"],
    ["https://cloudflare-dns.com", "https://example.com"],
    ["*"],
  ]) {
    const checks = { ...fine, mail: { connect, checked: "2026-10-16" } };
    assert.deepEqual(oldestCheck(ids, checks), {
      checked: undefined,
      failing: ["mail"],
    });
  }
  assert.equal(words.lede(undefined), INTRO);
});

test("the lede: one unknown, unchecked or unlisted tool drops the sentences", () => {
  // Another tool with mail's DNS host is looser than its none.
  assert.deepEqual(oldestCheck(ids, { ...fine, photo: dns("2026-10-16") }), {
    checked: undefined,
    failing: ["photo"],
  });
  assert.deepEqual(
    oldestCheck(ids, {
      ...fine,
      photo: { connect: ["'self'"], checked: "2026-10-16" },
    }),
    { checked: undefined, failing: ["photo"] },
  );
  const unchecked = { ...fine };
  delete unchecked.subnet;
  assert.deepEqual(oldestCheck(ids, unchecked), {
    checked: undefined,
    failing: ["subnet"],
  });
  // The lede names mail: without it listed, it would say something false.
  assert.deepEqual(oldestCheck(["photo", "subnet"], fine), {
    checked: undefined,
    failing: ["mail"],
  });
  assert.equal(words.lede(undefined), INTRO);
  assert.equal(words.lede(""), INTRO);
});

test("the lede: the date is the oldest check, wherever it is", () => {
  for (const [id, day] of [
    ["mail", "2026-10-09"],
    ["photo", "2026-10-08"],
    ["subnet", "2025-12-31"],
  ]) {
    const checks = { ...fine, [id]: { ...fine[id], checked: day } };
    assert.equal(oldestCheck(ids, checks).checked, day, id);
  }
});

test("the description stays static and dateless", () => {
  assert.equal(
    words.description,
    "Small tools that run in your browser. All but Mail check are blocked from connecting anywhere.",
  );
});
