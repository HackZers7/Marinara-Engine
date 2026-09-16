import assert from "node:assert/strict";
import {
  AGENT_RESULT_TREE_MAX_CHILDREN,
  AGENT_RESULT_TREE_MAX_LEAF_CHARS,
  buildAgentResultTree,
} from "../../packages/client/src/lib/agent-result-tree.ts";

// A bare root primitive collapses into a single keyless leaf.
{
  const [root] = buildAgentResultTree("plain text");
  assert.ok(root);
  assert.equal(root.key, "");
  assert.equal(root.text, "plain text");
  assert.equal(root.truncated, false);
  assert.equal(root.children, null);
}

// Objects expand into named children, arrays into indexed ones.
{
  const [root] = buildAgentResultTree({ location: "Road", tags: ["night", "rain"], count: 2 });
  assert.ok(root?.children);
  const [location, tags, count] = root.children;
  assert.equal(location?.key, "location");
  assert.equal(location?.text, "Road");
  assert.deepEqual(
    tags?.children?.map((child) => `${child.key}:${child.text}`),
    ["0:night", "1:rain"],
  );
  assert.equal(count?.text, "2");
}

// Leaf values collapse whitespace and truncate at the char limit with an ellipsis.
{
  const long = "x".repeat(AGENT_RESULT_TREE_MAX_LEAF_CHARS + 40);
  const [root] = buildAgentResultTree({ text: `  a\n b\t${long}  ` });
  const leaf = root?.children?.[0];
  assert.equal(leaf?.truncated, true);
  assert.equal(leaf?.text.length, AGENT_RESULT_TREE_MAX_LEAF_CHARS);
  assert.ok(leaf?.text.endsWith("…"));
  assert.ok(!leaf?.text.includes("\n"));
}

// The char limit is a parameter — a tighter limit truncates the same way.
{
  const [root] = buildAgentResultTree({ text: "abcdefghijk" }, 8);
  const leaf = root?.children?.[0];
  assert.equal(leaf?.truncated, true);
  assert.equal(leaf?.text, "abcdefg…");
}

// Readable mode (fullscreen viewer): preserveNewlines keeps embedded line
// breaks, and an infinite char limit never truncates.
{
  const [root] = buildAgentResultTree(
    { text: "first line\nsecond line\n\nfourth line", tail: "y".repeat(AGENT_RESULT_TREE_MAX_LEAF_CHARS + 40) },
    Number.POSITIVE_INFINITY,
    true,
  );
  const leaves = Object.fromEntries(root?.children?.map((child) => [child.key, child]) ?? []);
  assert.equal(leaves.text?.truncated, false);
  assert.equal(leaves.text?.text, "first line\nsecond line\n\nfourth line");
  assert.equal(leaves.tail?.truncated, false);
  assert.equal(leaves.tail?.text.length, AGENT_RESULT_TREE_MAX_LEAF_CHARS + 40);
}

// Readable mode still trims outer whitespace but does not collapse inner runs.
{
  const [root] = buildAgentResultTree({ text: "  a\n\nb  " }, AGENT_RESULT_TREE_MAX_LEAF_CHARS, true);
  const leaf = root?.children?.[0];
  assert.equal(leaf?.text, "a\n\nb");
}

// Circular references degrade to a localized marker instead of hanging the popup.
{
  const payload: Record<string, unknown> = { name: "loop" };
  payload.self = payload;
  const [root] = buildAgentResultTree(payload);
  const self = root?.children?.find((child) => child.key === "self");
  assert.equal(self?.circular, true);
  assert.equal(self?.text, "");
  assert.equal(self?.children, null);
}

// Wide payloads cap their rendered children and leave a "+N" marker.
{
  const wide: Record<string, unknown> = {};
  for (let index = 0; index < AGENT_RESULT_TREE_MAX_CHILDREN + 7; index += 1) {
    wide[`k${index}`] = index;
  }
  const [root] = buildAgentResultTree(wide);
  assert.equal(root?.children?.length, AGENT_RESULT_TREE_MAX_CHILDREN + 1);
  const marker = root?.children?.at(-1);
  assert.equal(marker?.hiddenCount, 7);
  assert.equal(marker?.text, "");
}

// Null, undefined, booleans and nested empties render as plain leaves.
{
  const [root] = buildAgentResultTree({ a: null, b: undefined, c: false, d: {}, e: [] });
  const leaves = Object.fromEntries(root?.children?.map((child) => [child.key, child]) ?? []);
  assert.equal(leaves.a?.text, "null");
  assert.equal(leaves.b?.text, "undefined");
  assert.equal(leaves.c?.text, "false");
  assert.deepEqual(leaves.d?.children, []);
  assert.deepEqual(leaves.e?.children, []);
}

console.info("Agent track result tree regression passed.");
