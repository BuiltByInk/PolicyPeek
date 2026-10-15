import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { createPrompter } from "../lib/confirm.mjs";

const sink = () => new Writable({ write(_c, _e, cb) { cb(); } });
function piped(text, { tty = false } = {}) {
  const input = new PassThrough();
  input.isTTY = tty;
  input.end(text);
  return createPrompter({ input, output: sink() });
}

test("piped answers are read in order, including lines sent before the prompt", async () => {
  const p = piped("y\nn\n");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await p.confirm("first?"), true);
  assert.equal(await p.confirm("second?"), false);
});

test("EOF answers no instead of hanging", async () => {
  const p = piped("yes\n");
  assert.equal(await p.confirm("a?"), true);
  assert.equal(await p.confirm("b?"), false);
});

test("requireTTY prompt is always no on non-TTY stdin, even with 'y' piped", async () => {
  const p = piped("y\ny\n");
  assert.equal(await p.confirm("apply?"), true);
  assert.equal(await p.confirm("deploy?", { requireTTY: true }), false);
});

test("requireTTY prompt accepts y on a TTY", async () => {
  const p = piped("y\n", { tty: true });
  assert.equal(await p.confirm("deploy?", { requireTTY: true }), true);
});
