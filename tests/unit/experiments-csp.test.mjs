import assert from "node:assert/strict";
import test from "node:test";
import {
  classify,
  connectSources,
  elsewhereSources,
  listedUrl,
  looser,
  mergeChecks,
  oldestCheck,
  policyOf,
} from "../../scripts/experiments-policy.mjs";
import { experiments as words } from "../../src/data/experiments.ts";

// The tools' live headers (2026-10-17), with connect-src as given.
const policy = (connect) =>
  `default-src 'self'; connect-src ${connect}; img-src 'self' blob: data:; style-src 'self'; script-src 'self' 'sha256-627f5p/vlnarQwcW9ccStvxb1wRwSP/gtaPcLndxSd0='; font-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;
const read = (id, header) => {
  const { connect, elsewhere } = policyOf(header);
  return classify(id, connect, elsewhere);
};

test("today's live policies read as described", () => {
  for (const id of ["battery", "compose", "keyboard", "logscope", "photo"]) {
    assert.equal(read(id, policy("'none'")), "none", id);
  }
  assert.equal(read("subnet", policy("'none'")), "none");
  assert.equal(read("mail", policy("https://cloudflare-dns.com")), "dns");
  assert.deepEqual(elsewhereSources(policy("'none'")), []);
});

test("another way out makes a policy unknown", () => {
  for (const [change, why] of [
    [["img-src 'self' blob: data:", "img-src 'self' https:"], "img-src https:"],
    [["font-src 'self'", "font-src *"], "font-src *"],
    [["; form-action 'none'", ""], "form-action *"],
    [["object-src 'none'", "object-src example.com"], "object-src example.com"],
    [
      ["script-src 'self'", "script-src 'self' 'strict-dynamic'"],
      "script-src 'strict-dynamic'",
    ],
    // Without its own directive, frame-src falls back to default-src.
    [["default-src 'self'", "default-src https:"], "frame-src https:"],
  ]) {
    const header = policy("'none'").replace(...change);
    assert.equal(read("photo", header), "unknown", why);
    assert.ok(elsewhereSources(header).includes(why), why);
  }
});

test("a reporting directive, with any value, makes a policy unknown", () => {
  for (const [extra, why] of [
    [
      "; report-uri https://example.com/csp",
      "report-uri https://example.com/csp",
    ],
    ["; report-uri /csp", "report-uri /csp"],
    ["; report-to csp-endpoint", "report-to csp-endpoint"],
    ["; Report-To", "report-to"],
    // In a second policy, its reports still go out.
    [", connect-src 'none'; report-to csp", "report-to csp"],
  ]) {
    const header = policy("'none'") + extra;
    assert.equal(read("photo", header), "unknown", why);
    assert.equal(
      read("mail", policy("https://cloudflare-dns.com") + extra),
      "unknown",
      why,
    );
    assert.deepEqual(elsewhereSources(header), [why], why);
  }
});

test("a check from before the other directives were read is unknown", () => {
  assert.equal(classify("photo", ["'none'"], undefined), "unknown");
  assert.deepEqual(
    oldestCheck(["mail", "photo"], {
      mail: { connect: ["https://cloudflare-dns.com"], checked: "2026-10-16" },
      photo: { connect: ["'none'"], elsewhere: [], checked: "2026-10-16" },
    }),
    { checked: undefined, failing: ["mail"] },
  );
});

test("connect-src 'none' reads as none, for any tool", () => {
  const connect = connectSources(policy("'none'"));
  assert.deepEqual(connect, ["'none'"]);
  assert.equal(classify("photo", connect, []), "none");
  assert.equal(classify("mail", connect, []), "none");
  assert.equal(read("photo", policy("'NONE'")), "none");
});

test("mail's Cloudflare DNS reads as dns, only for mail", () => {
  const connect = connectSources(policy("https://cloudflare-dns.com"));
  assert.equal(classify("mail", connect, []), "dns");
  assert.equal(looser("mail", "dns"), false);
  // Another tool talking to the same DNS isn't described.
  assert.equal(classify("photo", connect, []), "unknown");
  assert.equal(looser("photo", "unknown"), true);
});

test("a looser policy is unknown, and looser than expected", () => {
  for (const connect of [
    "'self'",
    "https://cloudflare-dns.com https://example.com",
    "https://cloudflare-dns.com/",
    "*",
  ]) {
    const cls = read("mail", policy(connect));
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
    assert.equal(read("photo", header), "unknown");
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
    photo: { connect: ["'none'"], elsewhere: [], checked: "2026-10-10" },
    mail: {
      connect: ["https://cloudflare-dns.com"],
      elsewhere: [],
      checked: "2026-10-10",
    },
    gone: { connect: ["'none'"], elsewhere: [], checked: "2026-10-10" },
  };
  const merged = mergeChecks(
    old,
    ["mail", "new", "photo"],
    {
      photo: { connect: ["'none'"], elsewhere: [] },
      mail: { error: new Error("timeout") },
      new: { error: new Error("timeout") },
    },
    "2026-10-16",
  );
  assert.deepEqual(merged, {
    photo: { connect: ["'none'"], elsewhere: [], checked: "2026-10-16" },
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
  for (const draft of ["true", "True", "TRUE"]) {
    assert.equal(listedUrl(file(`draft: ${draft}\n`)), undefined, draft);
  }
  assert.equal(
    listedUrl(file("draft: false\n")),
    "https://mail.candygoogy.dev/",
  );
  assert.equal(
    listedUrl(file("").replace("status: live", "status: retired")),
    undefined,
  );
});

test("listedUrl fails on a url it can't read, rather than skip the tool", () => {
  for (const url of [
    'url: "https://mail.candygoogy.dev/ "',
    "url: >\n  https://mail.candygoogy.dev/",
  ]) {
    assert.throws(
      () => listedUrl(`---\nname: Mail check\n${url}\nstatus: live\n---`),
      /url: can't be read/,
      url,
    );
  }
  // A file without a url isn't a listed tool.
  assert.equal(listedUrl("---\nname: Mail check\n---"), undefined);
});

const none = (checked) => ({ connect: ["'none'"], elsewhere: [], checked });
const dns = (checked) => ({
  connect: ["https://cloudflare-dns.com"],
  elsewhere: [],
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
    const checks = {
      ...fine,
      mail: { connect, elsewhere: [], checked: "2026-10-16" },
    };
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
      photo: { connect: ["'self'"], elsewhere: [], checked: "2026-10-16" },
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

test("the description follows the check, without a date", () => {
  assert.equal(
    words.description("Oct 14"),
    "Small tools that run in your browser. All but Mail check are blocked from connecting anywhere.",
  );
  assert.equal(words.description(undefined), INTRO);
  // The committed social card can't follow the check: it makes no claim.
  assert.equal(words.intro, INTRO);
});
