// ──────────────────────────────────────────────
// Parsed tree for agent widget popups
// ──────────────────────────────────────────────

export interface AgentResultTreeNode {
  /** Property name or array index; empty for a bare root primitive. */
  key: string;
  /** Leaf display text (single line, truncated); empty for branches. */
  text: string;
  /** True when the leaf value was cut at the char limit. */
  truncated: boolean;
  /** Present for objects and arrays; null for leaves. */
  children: AgentResultTreeNode[] | null;
  /** Marker leaf for a reference cycle — the renderer localizes it. */
  circular?: boolean;
  /** Set on a marker leaf listing how many children were not rendered. */
  hiddenCount?: number;
}

/** Leaf values longer than this collapse into the fullscreen viewer's job. */
export const AGENT_RESULT_TREE_MAX_LEAF_CHARS = 80;
/** Guard against pathological payloads; the viewer shows the full JSON anyway. */
export const AGENT_RESULT_TREE_MAX_CHILDREN = 50;

function describeLeaf(value: unknown, maxLeafChars: number): { text: string; truncated: boolean } {
  let raw: string;
  if (typeof value === "string") raw = value;
  else if (value === null) raw = "null";
  else if (value === undefined) raw = "undefined";
  else if (typeof value === "bigint") raw = `${value}n`;
  else raw = String(value);
  raw = raw.replace(/\s+/g, " ").trim();
  if (raw.length <= maxLeafChars) return { text: raw, truncated: false };
  return { text: `${raw.slice(0, Math.max(0, maxLeafChars - 1))}…`, truncated: true };
}

function appendNodeChildren(
  node: AgentResultTreeNode,
  entries: Array<[string, unknown]>,
  maxLeafChars: number,
  seen: WeakSet<object>,
) {
  const visible = entries.slice(0, AGENT_RESULT_TREE_MAX_CHILDREN);
  node.children = visible.map(([childKey, childValue]) =>
    buildAgentResultNode(childKey, childValue, maxLeafChars, seen),
  );
  const hidden = entries.length - visible.length;
  if (hidden > 0) {
    node.children.push({
      key: "",
      text: "",
      truncated: false,
      children: null,
      hiddenCount: hidden,
    });
  }
}

function buildAgentResultNode(
  key: string,
  value: unknown,
  maxLeafChars: number,
  seen: WeakSet<object>,
): AgentResultTreeNode {
  if (value !== null && typeof value === "object") {
    if (seen.has(value)) {
      return { key, text: "", truncated: false, children: null, circular: true };
    }
    seen.add(value);
    const node: AgentResultTreeNode = { key, text: "", truncated: false, children: [] };
    const entries = Array.isArray(value)
      ? value.map((item, index) => [String(index), item] as [string, unknown])
      : Object.entries(value as Record<string, unknown>);
    appendNodeChildren(node, entries, maxLeafChars, seen);
    seen.delete(value);
    return node;
  }
  const { text, truncated } = describeLeaf(value, maxLeafChars);
  return { key, text, truncated, children: null };
}

/**
 * Flattens an arbitrary agent result payload into a display tree for the
 * hover popup: objects expand into named children, arrays into indexed ones,
 * leaves collapse into truncated single-line strings. The fullscreen viewer
 * shows the raw pretty-printed JSON instead.
 */
export function buildAgentResultTree(
  value: unknown,
  maxLeafChars: number = AGENT_RESULT_TREE_MAX_LEAF_CHARS,
): AgentResultTreeNode[] {
  return [buildAgentResultNode("", value, maxLeafChars, new WeakSet())];
}
