// The avatar's way to the icons: GitHub's answer checked (scripts/avatar.mjs),
// then which picture the icons are made from (scripts/icons.mjs). Importing
// either script runs nothing; only running the file does.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { checkedAvatar } from "../../scripts/avatar.mjs";
import { pickSource } from "../../scripts/icons.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const png = (size) =>
  sharp({
    create: { width: size, height: size, channels: 3, background: "#c33" },
  })
    .png()
    .toBuffer();
const answer = (body, type = "image/png", status = 200) =>
  new Response(body, { status, headers: { "content-type": type } });

test("checkedAvatar: a usable picture comes back with both hashes", async () => {
  const original = await png(96);
  const { jpeg, meta, info } = await checkedAvatar(answer(original));
  assert.deepEqual([info.width, info.height, info.format], [96, 96, "jpeg"]);
  assert.deepEqual(meta, {
    sha256: hash(original),
    jpegSha256: hash(jpeg),
  });
});

test("checkedAvatar: anything else throws, so the last good one is kept", async () => {
  for (const [res, why] of [
    [answer("", "image/png", 503), /HTTP 503/],
    [answer("<html></html>", "text/html"), /not an image \(text\/html\)/],
    [answer(Buffer.alloc(2 * 1024 * 1024 + 1)), /2097153 bytes/],
    [answer(Buffer.from("not a png")), /./],
    [answer(await png(32)), /only 32×32/],
  ]) {
    await assert.rejects(checkedAvatar(res), why);
  }
});

test("pickSource: the live avatar its meta vouches for, else the committed one", async () => {
  const live = Buffer.from("live jpeg");
  const committed = Buffer.from("committed jpeg");
  let read = 0;
  const files = {
    committed: async () => {
      read++;
      return committed;
    },
  };
  const meta = (jpegSha256) => JSON.stringify({ sha256: "orig", jpegSha256 });

  assert.deepEqual(
    await pickSource({ ...files, live, meta: meta(hash(live)) }),
    { image: live, sha256: "orig", name: "the GitHub avatar" },
  );
  assert.equal(read, 0);
  // A meta for another JPEG (cut off between avatar.mjs's renames), or one
  // from before jpegSha256: the live picture, but no known crop.
  for (const other of [meta(hash(committed)), '{"sha256":"orig"}']) {
    assert.deepEqual(await pickSource({ ...files, live, meta: other }), {
      image: live,
      sha256: undefined,
      name: "the GitHub avatar",
      unvouched: true,
    });
  }
  // Without both live files, the committed one, with its own hash.
  for (const missing of [{ live }, { meta: meta(hash(live)) }, {}]) {
    assert.deepEqual(await pickSource({ ...files, ...missing }), {
      image: committed,
      sha256: hash(committed),
      name: "src/assets/avatar.jpg",
    });
  }
  assert.equal(read, 3);
});
