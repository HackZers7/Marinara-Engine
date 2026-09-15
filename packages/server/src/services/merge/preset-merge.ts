// ──────────────────────────────────────────────
// Merge-Import: Preset plan + apply
// ──────────────────────────────────────────────
//
// Applies a Marinara-native preset export envelope onto an EXISTING preset.
// Sections, groups, and choice blocks whose id exists on both sides are
// replaced wholesale by the incoming item while KEEPING the local id, so
// sectionOrder / groupOrder / groupId references survive; items only in the
// file are added; items only local are deletion candidates removed only on
// user confirmation. The preset ROOT object (name, description, imagePath,
// prompts, variables, parameters, ...) is never touched.
//
// Exported envelope rows are raw database rows (string booleans "true"/"false",
// JSON-string markerConfig/options/sectionOrder), so everything is normalized
// on the way in — the same normalization importPreset uses before calling
// createSection / createGroup / createChoiceBlock.

import type {
  ChoiceOption,
  MarkerConfig,
  MergeApplyResult,
  MergeCollectionDiff,
  PresetMergeConfirmDelete,
} from "@marinara-engine/shared";
import type { createPromptsStorage } from "../storage/prompts.storage.js";
import { mergeSequences } from "./merge-sequence.js";

type PromptsStorage = ReturnType<typeof createPromptsStorage>;

/** Loose row shape — raw DB rows on the current side, parsed JSON on the incoming side. */
type Row = Record<string, unknown>;

/** A section/group/choice-block normalized into the shape the storage create/update helpers expect. */
export type NormalizedMergeGroup = {
  id: string;
  name: string;
  /** Incoming-id space: matched parent keeps its id, an added parent keeps the file id until apply resolves it, unknown → null. */
  parentGroupId: string | null;
  order: number;
  enabled: boolean;
};

export type NormalizedMergeSection = {
  id: string;
  identifier: string;
  name: string;
  content: string;
  role: "system" | "user" | "assistant";
  enabled: boolean;
  isMarker: boolean;
  /** Incoming-id space, same remap rules as NormalizedMergeGroup.parentGroupId. */
  groupId: string | null;
  /** Parsed from the envelope's raw row; object shape trusted as MarkerConfig like importPreset does. */
  markerConfig: MarkerConfig | null;
  injectionPosition: "ordered" | "depth";
  injectionDepth: number;
  injectionOrder: number;
  forbidOverrides: boolean;
};

export type NormalizedMergeChoiceBlock = {
  id: string;
  variableName: string;
  question: string;
  /** Parsed from the envelope's raw row; option objects are trusted as ChoiceOption like importPreset does. */
  options: ChoiceOption[];
  multiSelect: boolean;
  separator: string;
  randomPick: boolean;
  displayMode: "auto" | "buttons" | "listbox";
  optionSort: "manual" | "alphabetical";
};

/** One side of the merge: the preset row (for sectionOrder/groupOrder) plus its child collections. */
export interface PresetMergeSnapshot {
  preset: Row;
  sections: Row[];
  groups: Row[];
  choiceBlocks: Row[];
}

/**
 * Pure merge plan. Diffs are ready for the preview route; the three order
 * arrays are the merged sequences in "incoming-id space": matched items keep
 * their local id, added items keep their file id as a placeholder that apply
 * resolves through its created-id map. Items that exist locally but not in
 * the file (deletion candidates) stay in the current sequence untouched, so
 * unconfirmed deletions keep their position.
 *
 * The diff fields are typed with the normalized incoming items (structurally
 * compatible with the untyped `PresetMergePreview` wire contract); `current`
 * sides and `deletable` entries are the raw local rows.
 */
export interface PresetMergePlan {
  preview: {
    kind: "preset";
    sections: MergeCollectionDiff<NormalizedMergeSection>;
    groups: MergeCollectionDiff<NormalizedMergeGroup>;
    choiceBlocks: MergeCollectionDiff<NormalizedMergeChoiceBlock>;
  };
  groupOrder: string[];
  sectionOrder: string[];
  choiceBlockOrder: string[];
}

function toBool(value: unknown): boolean {
  return value === true || value === "true";
}

/** Parse a value that may be a JSON string (raw DB row) or already an object/array (hydrated). */
function parseJsonField(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/** Read an ordered id list that may be a JSON string (raw preset row) or an array (parsed). */
function parseIdOrder(value: unknown): string[] {
  return asStringArray(parseJsonField(value));
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeGroup(row: Row, incomingGroupIds: ReadonlySet<string>): NormalizedMergeGroup {
  const rawParent = typeof row.parentGroupId === "string" ? row.parentGroupId : null;
  return {
    id: String(row.id),
    name: toText(row.name, ""),
    parentGroupId: rawParent && incomingGroupIds.has(rawParent) ? rawParent : null,
    order: Number(row.order ?? 100),
    enabled: toBool(row.enabled),
  };
}

function normalizeSection(row: Row, incomingGroupIds: ReadonlySet<string>): NormalizedMergeSection {
  const markerConfig = asRecord(parseJsonField(row.markerConfig));
  const rawGroup = typeof row.groupId === "string" ? row.groupId : null;
  return {
    id: String(row.id),
    identifier: toText(row.identifier, ""),
    name: toText(row.name, ""),
    content: toText(row.content, ""),
    role: row.role === "user" || row.role === "assistant" ? row.role : "system",
    enabled: toBool(row.enabled),
    isMarker: toBool(row.isMarker),
    groupId: rawGroup && incomingGroupIds.has(rawGroup) ? rawGroup : null,
    markerConfig: markerConfig as MarkerConfig | null,
    injectionPosition: row.injectionPosition === "depth" ? "depth" : "ordered",
    injectionDepth: Number(row.injectionDepth ?? 0),
    injectionOrder: Number(row.injectionOrder ?? 100),
    forbidOverrides: toBool(row.forbidOverrides),
  };
}

function normalizeChoiceBlock(row: Row): NormalizedMergeChoiceBlock {
  const options = parseJsonField(row.options);
  return {
    id: String(row.id),
    variableName: toText(row.variableName, ""),
    question: toText(row.question, ""),
    options: Array.isArray(options) ? (options.filter((o) => asRecord(o) !== null) as ChoiceOption[]) : [],
    multiSelect: toBool(row.multiSelect),
    separator: toText(row.separator, ", "),
    randomPick: toBool(row.randomPick),
    displayMode: row.displayMode === "buttons" || row.displayMode === "listbox" ? row.displayMode : "auto",
    optionSort: row.optionSort === "alphabetical" ? "alphabetical" : "manual",
  };
}

/** Choice-block display order = sortOrder ascending (listChoiceBlocksForPreset's order, kept pure here). */
function choiceBlockOrder(rows: Row[]): string[] {
  return [...rows].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)).map((row) => String(row.id));
}

/**
 * Build the id-keyed diff for one collection and remember the incoming-id
 * space (matched → local id, added → file id placeholder).
 */
function diffCollection<T extends { id: string }>(
  current: Row[],
  incoming: Row[],
  normalize: (row: Row) => T,
): { diff: MergeCollectionDiff<T>; incomingIdSpace: Map<string, string> } {
  const currentById = new Map(current.map((row) => [String(row.id), row]));
  const diff: MergeCollectionDiff<T> = { added: [], updated: [], deletable: [] };
  const incomingIdSpace = new Map<string, string>();
  const incomingIds = new Set<string>();

  for (const row of incoming) {
    const id = String(row.id);
    incomingIds.add(id);
    const item = normalize(row);
    const local = currentById.get(id);
    if (local) {
      incomingIdSpace.set(id, id); // matched — the local id survives
      diff.updated.push({ current: local as unknown as T, incoming: item });
    } else {
      incomingIdSpace.set(id, id); // added — placeholder until apply resolves the created id
      diff.added.push(item);
    }
  }
  for (const row of current) {
    if (!incomingIds.has(String(row.id))) diff.deletable.push(row as unknown as T);
  }
  return { diff, incomingIdSpace };
}

/** Merged order: current ids that still exist, woven with the file's mapped order. */
function mergedOrder(currentOrder: string[], existingIds: ReadonlySet<string>, incomingOrder: string[]): string[] {
  const current = currentOrder.filter((id) => existingIds.has(id));
  return mergeSequences(current, incomingOrder);
}

export function planPresetMerge(current: PresetMergeSnapshot, incoming: PresetMergeSnapshot): PresetMergePlan {
  const incomingGroupIds = new Set(incoming.groups.map((row) => String(row.id)));

  const groups = diffCollection(current.groups, incoming.groups, (row) => normalizeGroup(row, incomingGroupIds));
  const sections = diffCollection(current.sections, incoming.sections, (row) =>
    normalizeSection(row, incomingGroupIds),
  );
  const choiceBlocks = diffCollection(current.choiceBlocks, incoming.choiceBlocks, normalizeChoiceBlock);

  // Orders. Incoming order entries are kept only when they name an item that
  // actually exists in the file ("dropping unknown ids"); in plan space the id
  // map is identity (matched keep the local id, added keep their file id).
  const incomingSectionOrder = parseIdOrder(incoming.preset.sectionOrder).filter((id) =>
    sections.incomingIdSpace.has(id),
  );
  const sectionOrder = mergedOrder(
    parseIdOrder(current.preset.sectionOrder),
    new Set(current.sections.map((row) => String(row.id))),
    incomingSectionOrder,
  );

  const incomingGroupOrder = parseIdOrder(incoming.preset.groupOrder).filter((id) => groups.incomingIdSpace.has(id));
  const groupOrder = mergedOrder(
    parseIdOrder(current.preset.groupOrder),
    new Set(current.groups.map((row) => String(row.id))),
    incomingGroupOrder,
  );

  const incomingChoiceOrder = choiceBlockOrder(incoming.choiceBlocks).filter((id) =>
    choiceBlocks.incomingIdSpace.has(id),
  );
  const choiceOrder = mergedOrder(
    choiceBlockOrder(current.choiceBlocks),
    new Set(current.choiceBlocks.map((row) => String(row.id))),
    incomingChoiceOrder,
  );

  return {
    preview: {
      kind: "preset",
      sections: sections.diff,
      groups: groups.diff,
      choiceBlocks: choiceBlocks.diff,
    },
    sectionOrder,
    groupOrder,
    choiceBlockOrder: choiceOrder,
  };
}

// ── Apply ────────────────────────────────────

/**
 * Execute a plan against the existing preset. Deletions run first (only ids
 * the user confirmed), then group creates (parents re-linked after all ids
 * exist, mirroring the duplicate/import two-pass), group updates, section
 * creates/updates, choice-block creates/updates, and finally the three
 * reorder passes that make the merged orders authoritative.
 */
export async function applyPresetMerge(
  storage: PromptsStorage,
  presetId: string,
  plan: PresetMergePlan,
  confirmDelete: PresetMergeConfirmDelete | undefined,
): Promise<MergeApplyResult> {
  const confirmed = {
    sections: new Set(confirmDelete?.sections ?? []),
    groups: new Set(confirmDelete?.groups ?? []),
    choiceBlocks: new Set(confirmDelete?.choiceBlocks ?? []),
  };

  // 1. Deletions (confirmed only). removeGroup is the spec's non-cascading
  //    delete: it ungroups its sections and unparents child groups.
  let deleted = 0;
  for (const section of plan.preview.sections.deletable) {
    const id = String(section.id);
    if (!confirmed.sections.has(id)) continue;
    await storage.removeSection(id);
    deleted += 1;
  }
  for (const group of plan.preview.groups.deletable) {
    const id = String(group.id);
    if (!confirmed.groups.has(id)) continue;
    await storage.removeGroup(id);
    deleted += 1;
  }
  for (const block of plan.preview.choiceBlocks.deletable) {
    const id = String(block.id);
    if (!confirmed.choiceBlocks.has(id)) continue;
    await storage.removeChoiceBlock(id);
    deleted += 1;
  }

  // 2. Groups. Added groups are created detached, then every incoming
  //    parentGroupId is resolved through the id map (matched → same id,
  //    added → created id, unknown/local-only → null).
  const groupMap = new Map<string, string>();
  for (const { incoming: group } of plan.preview.groups.updated) groupMap.set(group.id, group.id);
  for (const group of plan.preview.groups.added) {
    const created = await storage.createGroup({
      presetId,
      name: group.name,
      parentGroupId: null, // linked below once every id exists
      order: group.order,
      enabled: group.enabled,
    });
    if (created) groupMap.set(group.id, created.id);
  }
  const resolveGroupRef = (ref: string | null): string | null => (ref ? (groupMap.get(ref) ?? null) : null);
  for (const group of plan.preview.groups.added) {
    const persistedId = groupMap.get(group.id);
    if (persistedId) await storage.updateGroup(persistedId, { parentGroupId: resolveGroupRef(group.parentGroupId) });
  }
  for (const { incoming: group } of plan.preview.groups.updated) {
    await storage.updateGroup(group.id, {
      name: group.name,
      parentGroupId: resolveGroupRef(group.parentGroupId),
      enabled: group.enabled,
    });
  }

  // 3. Sections (creates remap groupId through the group id map).
  const sectionMap = new Map<string, string>();
  for (const section of plan.preview.sections.added) {
    const created = await storage.createSection({
      presetId,
      identifier: section.identifier,
      name: section.name,
      content: section.content,
      role: section.role,
      enabled: section.enabled,
      isMarker: section.isMarker,
      groupId: resolveGroupRef(section.groupId),
      markerConfig: section.markerConfig,
      injectionPosition: section.injectionPosition,
      injectionDepth: section.injectionDepth,
      injectionOrder: section.injectionOrder,
      forbidOverrides: section.forbidOverrides,
    });
    if (created) sectionMap.set(section.id, created.id);
  }
  for (const { incoming: section } of plan.preview.sections.updated) {
    await storage.updateSection(section.id, {
      name: section.name,
      content: section.content,
      role: section.role,
      enabled: section.enabled,
      groupId: resolveGroupRef(section.groupId),
      markerConfig: section.markerConfig,
      injectionPosition: section.injectionPosition,
      injectionDepth: section.injectionDepth,
      injectionOrder: section.injectionOrder,
      forbidOverrides: section.forbidOverrides,
    });
  }

  // 4. Choice blocks.
  const choiceBlockMap = new Map<string, string>();
  for (const block of plan.preview.choiceBlocks.added) {
    const created = await storage.createChoiceBlock({
      presetId,
      variableName: block.variableName,
      question: block.question,
      options: block.options,
      multiSelect: block.multiSelect,
      separator: block.separator,
      randomPick: block.randomPick,
      displayMode: block.displayMode,
      optionSort: block.optionSort,
    });
    if (created) choiceBlockMap.set(block.id, created.id);
  }
  for (const { incoming: block } of plan.preview.choiceBlocks.updated) {
    await storage.updateChoiceBlock(block.id, {
      variableName: block.variableName,
      question: block.question,
      options: block.options,
      multiSelect: block.multiSelect,
      separator: block.separator,
      randomPick: block.randomPick,
      displayMode: block.displayMode,
      optionSort: block.optionSort,
    });
  }

  // 5. Orders: resolve added-item placeholders to created ids, then keep only
  //    ids that actually exist now (confirmed deletions and any local row
  //    missing from the stored order drop out; unconfirmed deletions stay).
  const survivingSections = new Set((await storage.listSections(presetId)).map((row) => row.id));
  await storage.reorderSections(
    presetId,
    plan.sectionOrder.map((id) => sectionMap.get(id) ?? id).filter((id) => survivingSections.has(id)),
  );
  const survivingGroups = new Set((await storage.listGroups(presetId)).map((row) => row.id));
  await storage.reorderGroups(
    presetId,
    plan.groupOrder.map((id) => groupMap.get(id) ?? id).filter((id) => survivingGroups.has(id)),
  );
  const survivingChoiceBlocks = new Set((await storage.listChoiceBlocksForPreset(presetId)).map((row) => row.id));
  await storage.reorderVariables(
    presetId,
    plan.choiceBlockOrder.map((id) => choiceBlockMap.get(id) ?? id).filter((id) => survivingChoiceBlocks.has(id)),
  );

  const added =
    plan.preview.sections.added.length + plan.preview.groups.added.length + plan.preview.choiceBlocks.added.length;
  const updated =
    plan.preview.sections.updated.length +
    plan.preview.groups.updated.length +
    plan.preview.choiceBlocks.updated.length;
  return { added, updated, deleted };
}
