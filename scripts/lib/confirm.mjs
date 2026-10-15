// y/N prompts that work with both a terminal and piped/non-TTY stdin.
//
// readline/promises' rl.question() is unreliable on piped input: lines that
// arrive before the question is asked are dropped, and on EOF the pending
// promise never settles, so the process silently exits mid-script. Here all
// input lines go into one queue that every prompt reads from in order, and EOF
// answers "no" to any prompt still waiting.
import { createInterface } from "node:readline";

export function createPrompter({ input = process.stdin, output = process.stdout } = {}) {
  const interactive = Boolean(input.isTTY);
  const rl = createInterface({ input, terminal: false });
  const lines = [];
  const waiters = [];
  let ended = false;
  rl.on("line", (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)));
  rl.on("close", () => {
    ended = true;
    while (waiters.length) waiters.shift()(null);
  });
  const nextLine = () =>
    lines.length ? Promise.resolve(lines.shift()) : ended ? Promise.resolve(null) : new Promise((r) => waiters.push(r));

  /** Resolves true only for an explicit y/yes. EOF or anything else = no.
   *  With requireTTY, a non-interactive stdin is always "no" (used for deploy). */
  async function confirm(q, { requireTTY = false } = {}) {
    output.write(`${q} [y/N] `);
    if (requireTTY && !interactive) {
      output.write("\n(stdin is not a terminal, answering no; run this interactively to confirm)\n");
      return false;
    }
    const a = await nextLine();
    if (a === null) {
      output.write("\n(no input, answering no)\n");
      return false;
    }
    if (!interactive) output.write(`${a}\n`);
    const t = a.trim().toLowerCase();
    return t === "y" || t === "yes";
  }
  return { confirm, interactive, close: () => rl.close() };
}
