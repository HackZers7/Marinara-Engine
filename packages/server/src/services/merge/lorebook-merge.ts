// ──────────────────────────────────────────────
// Merge-Import: Lorebook plan + apply
// ──────────────────────────────────────────────
//
// Applies a Marinara-native lorebook export envelope onto an EXISTING
// lorebook. Entries/folders whose id exists on both sides are replaced
// wholesale by the incoming item while KEEPING the local id, so chat entry
// states, section order, folder membership, and cross-references survive;
// items only in the file are added; items only local are deletion candidates
// removed only on user confirmation. The lorebook ROOT object (name,
// description, characterIds, personaIds, scope, chatId, ...) is never touched.
//
// Envelope rows are verbatim hydrated DB rows (real booleans, real arrays —
// see parseEntryRow). The incoming side is normalized for createEntry /
// updateEntry with the same field mapping the Marinara native importer uses
// in its lorebook branch (marinara.importer.ts): id, lorebookId, createdAt,
// updatedAt, embedding, and embeddingSpaceId are server-managed and dropped.

import { canReparentFolder, lorebookFilterModeSchema } from "@marinara-engine/shared";
import type {
  ActivationCondition,
  CreateLorebookEntryInput,
  LorebookFilterMode,
  LorebookMatchingSource,
  LorebookMergeConfirmDelete,
  LorebookMergePreview,
  LorebookSchedule,
  MergeApplyResult,
  MergeCollectionDiff,
} from "@marinara-engine/shared";
import type { createLorebooksStorage } from "../storage/lorebooks.storage.js";
import { resolveLorebookEntryRole } from "../import/lorebook-role.js";
import { mergeSequences } from "./merge-sequence.js";

type LorebooksStorage = ReturnType<typeof createLorebooksStorage>;

/** Loose row shape — hydrated DB rows on the current side, parsed JSON on the incoming side. */
type Row = Record<string, unknown>;

/** Container-map key for lorebook-root entries (folderId null). */
const ROOT_CONTAINER_KEY = "";

/** An incoming folder normalized for createFolder / updateFolder. */
export type NormalizedMergeFolder = {
  id: string;
  name: string;
  enabled: boolean;
  /** Incoming-id space: matched parent keeps its id, an added parent keeps the file id until apply resolves it, unknown → null. */
  parentFolderId: string | null;
  order: number;
};

/** An incoming entry normalized for createEntry / updateEntry (server-managed fields stripped). */
export type NormalizedMergeEntry = Omit<
  CreateLorebookEntryInput,
  "lorebookId" | "folderId" | "position" | "relationships" | "dynamicState" | "activationConditions" | "schedule"
> & {
  id: string;
  /** Incoming-id space, same remap rules as NormalizedMergeFolder.parentFolderId. */
  folderId: string | null;
  /** z.input widens position to number; updateEntry's input keeps the 0|1|2|7 union. */
  position: 0 | 1 | 2 | 7;
  relationships: Record<string, string>;
  dynamicState: Record<string, unknown>;
  activationConditions: ActivationCondition[];
  schedule: LorebookSchedule | null;
};

/**
 * Pure merge plan. The preview diffs hold raw rows (hydrated local rows vs
 * verbatim envelope rows); the create/update lists hold the normalized
 * incoming items in "incoming-id space": matched items keep their local id,
 * added items keep their file id as a placeholder that apply resolves through
 * its created-id map. Incoming rows without an id get a unique synthetic
 * placeholder so two id-less rows can never collide. When `confirmedDeletions`
 * is given (apply recomputes the plan with it; preview does not), only those
 * candidates are removed from the merged order sequences — unconfirmed
 * candidates keep their slot, so locals never move relative to each other.
 */
export interface LorebookMergePlan {
  preview: LorebookMergePreview;
  createFolders: NormalizedMergeFolder[];
  /** Matched folders, replaced wholesale; ids are local ids. */
  updateFolders: NormalizedMergeFolder[];
  createEntries: NormalizedMergeEntry[];
  /** Matched entries, replaced wholesale; ids are local ids. */
  updateEntries: NormalizedMergeEntry[];
  /** Merged folder display order (incoming-id space). */
  folderOrder: string[];
  /** Merged entry order per container (folderId null = lorebook root), incoming-id space. */
  entrySequences: Array<{ folderId: string | null; entryIds: string[] }>;
}

// ponytail: the four resolvers below mirror marinara.importer.ts's private
// lorebook normalizers (inlined because those are typed against the importer's
// private STWorldInfoEntry). Ceiling: two sources of truth for the same field
// mapping. Upgrade path: export the normalizers from the importer and import
// them here if the importer ever needs the merge shapes.

function resolveNativeSelectiveLogic(value: unknown): "and" | "and_all" | "or" | "not" | "not_all" {
  return value === "and_all" || value === "or" || value === "not" || value === "not_all" ? value : "and";
}

function resolveNativePosition(value: unknown): 0 | 1 | 2 | 7 {
  if (typeof value === "string") {
    if (value === "after_char") return 1;
    if (value === "at_depth" || value === "depth") return 2;
    if (value === "outlet") return 7;
    return 0;
  }
  return typeof value === "number" && Number.isInteger(value) && [0, 1, 2, 7].includes(value)
    ? (value as 0 | 1 | 2 | 7)
    : 0;
}

const VALID_MATCHING_SOURCES = new Set<LorebookMatchingSource>([
  "character_name",
  "character_description",
  "character_personality",
  "character_scenario",
  "character_tags",
  "persona_description",
  "persona_tags",
]);

function readMatchingSources(value: unknown): LorebookMatchingSource[] {
  if (!Array.isArray(value)) return [];
  return value.filter((source): source is LorebookMatchingSource =>
    VALID_MATCHING_SOURCES.has(source as LorebookMatchingSource),
  );
}

function readFilterMode(value: unknown): LorebookFilterMode {
  const parsed = lorebookFilterModeSchema.safeParse(value);
  return parsed.success ? parsed.data : "any";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function rowOrder(row: Row): number {
  return Number(row.order ?? 0);
}

/**
 * Map key for an incoming row: its real id, or a unique synthetic placeholder
 * when the file omits the id. Placeholders are >21 chars, so they can never
 * collide with a real nanoid row id — two id-less rows each get their own.
 */
function rowKey(row: Row, kind: "entry" | "folder", index: number): string {
  return typeof row.id === "string" && row.id ? row.id : `__merge_new_${kind}_${index}__`;
}

function normalizeFolder(row: Row, id: string, incomingFolderIds: ReadonlySet<string>): NormalizedMergeFolder {
  const rawParent = typeof row.parentFolderId === "string" ? row.parentFolderId : null;
  return {
    id,
    name: String(row.name ?? "Folder"),
    enabled: row.enabled !== false,
    parentFolderId: rawParent && incomingFolderIds.has(rawParent) ? rawParent : null,
    order: Number(row.order ?? 0),
  };
}

function normalizeEntry(row: Row, id: string, incomingFolderIds: ReadonlySet<string>): NormalizedMergeEntry {
  const rawFolderId = typeof row.folderId === "string" ? row.folderId : null;
  return {
    id,
    name: String(row.name ?? ""),
    content: String(row.content ?? ""),
    description: String(row.description ?? ""),
    keys: Array.isArray(row.keys) ? row.keys.map(String) : [],
    secondaryKeys: Array.isArray(row.secondaryKeys) ? row.secondaryKeys.map(String) : [],
    enabled: row.enabled !== false,
    constant: Boolean(row.constant),
    selective: Boolean(row.selective),
    selectiveLogic: resolveNativeSelectiveLogic(row.selectiveLogic),
    probability: row.probability != null ? Number(row.probability) : null,
    scanDepth: row.scanDepth != null ? Number(row.scanDepth) : null,
    matchWholeWords: Boolean(row.matchWholeWords),
    caseSensitive: Boolean(row.caseSensitive),
    useRegex: Boolean(row.useRegex),
    characterFilterMode: readFilterMode(row.characterFilterMode),
    characterFilterIds: Array.isArray(row.characterFilterIds) ? row.characterFilterIds.map(String) : [],
    characterTagFilterMode: readFilterMode(row.characterTagFilterMode),
    characterTagFilters: Array.isArray(row.characterTagFilters) ? row.characterTagFilters.map(String) : [],
    generationTriggerFilterMode: readFilterMode(row.generationTriggerFilterMode),
    generationTriggerFilters: Array.isArray(row.generationTriggerFilters)
      ? row.generationTriggerFilters.map(String)
      : [],
    additionalMatchingSources: readMatchingSources(row.additionalMatchingSources),
    position: resolveNativePosition(row.position),
    outletName: String(row.outletName ?? ""),
    depth: Number(row.depth ?? 4),
    order: Number(row.order ?? 100),
    role: resolveLorebookEntryRole(row.role),
    sticky: row.sticky != null ? Number(row.sticky) : null,
    cooldown: row.cooldown != null ? Number(row.cooldown) : null,
    delay: row.delay != null ? Number(row.delay) : null,
    ephemeral: row.ephemeral != null ? Number(row.ephemeral) : null,
    group: String(row.group ?? ""),
    groupWeight: row.groupWeight != null ? Number(row.groupWeight) : null,
    folderId: rawFolderId && incomingFolderIds.has(rawFolderId) ? rawFolderId : null,
    locked: Boolean(row.locked),
    preventRecursion: row.preventRecursion == null ? true : Boolean(row.preventRecursion),
    excludeRecursion: Boolean(row.excludeRecursion),
    delayUntilRecursion: Boolean(row.delayUntilRecursion),
    excludeFromVectorization: Boolean(row.excludeFromVectorization),
    tag: String(row.tag ?? ""),
    relationships: (isRecord(row.relationships) ? row.relationships : {}) as Record<string, string>,
    dynamicState: isRecord(row.dynamicState) ? row.dynamicState : {},
    activationConditions: (Array.isArray(row.activationConditions)
      ? row.activationConditions
      : []) as ActivationCondition[],
    schedule: (row.schedule ?? null) as LorebookSchedule | null,
  };
}

/** Id-keyed diff for one collection; every side carries the raw rows. */
function diffCollection(current: Row[], incoming: Row[]): MergeCollectionDiff {
  const currentById = new Map(current.map((row) => [String(row.id), row]));
  const incomingIds = new Set(incoming.map((row) => String(row.id)));
  const diff: MergeCollectionDiff = { added: [], updated: [], deletable: [] };
  for (const row of incoming) {
    const local = currentById.get(String(row.id));
    if (local) diff.updated.push({ current: local, incoming: row });
    else diff.added.push(row);
  }
  for (const row of current) {
    if (!incomingIds.has(String(row.id))) diff.deletable.push(row);
  }
  return diff;
}

function pushId(sequences: Map<string, string[]>, key: string, id: string) {
  const sequence = sequences.get(key);
  if (sequence) sequence.push(id);
  else sequences.set(key, [id]);
}

export function planLorebookMerge(
  currentEntries: Row[],
  currentFolders: Row[],
  incomingEntries: Row[],
  incomingFolders: Row[],
  confirmedDeletions?: LorebookMergeConfirmDelete,
): LorebookMergePlan {
  const currentEntryIds = new Set(currentEntries.map((row) => String(row.id)));
  const currentFolderIds = new Set(currentFolders.map((row) => String(row.id)));
  const incomingFolderIds = new Set(incomingFolders.map((row, index) => rowKey(row, "folder", index)));

  const normalizedEntryById = new Map<string, NormalizedMergeEntry>();
  for (const [index, row] of incomingEntries.entries()) {
    const key = rowKey(row, "entry", index);
    normalizedEntryById.set(key, normalizeEntry(row, key, incomingFolderIds));
  }

  const createEntries: NormalizedMergeEntry[] = [];
  const updateEntries: NormalizedMergeEntry[] = [];
  for (const [index, row] of incomingEntries.entries()) {
    const entry = normalizedEntryById.get(rowKey(row, "entry", index))!;
    if (currentEntryIds.has(entry.id)) updateEntries.push(entry);
    else createEntries.push(entry);
  }
  const createFolders: NormalizedMergeFolder[] = [];
  const updateFolders: NormalizedMergeFolder[] = [];
  for (const [index, row] of incomingFolders.entries()) {
    const key = rowKey(row, "folder", index);
    const folder = normalizeFolder(row, key, incomingFolderIds);
    if (currentFolderIds.has(folder.id)) updateFolders.push(folder);
    else createFolders.push(folder);
  }

  const entriesDiff = diffCollection(currentEntries, incomingEntries);
  const foldersDiff = diffCollection(currentFolders, incomingFolders);

  // Current display order per container: current entries grouped by folderId
  // and sorted by `order`, minus CONFIRMED deletion candidates, minus matched
  // entries whose folder changes (they are new arrivals in the target
  // container). Unconfirmed candidates keep their slot — locals never move
  // relative to each other.
  const deletableEntryIds = new Set(entriesDiff.deletable.map((row) => String(row.id)));
  const confirmedEntryDeletions = new Set(confirmedDeletions?.entries ?? []);
  const currentSequences = new Map<string, string[]>();
  for (const row of [...currentEntries].sort((left, right) => rowOrder(left) - rowOrder(right))) {
    const id = String(row.id);
    if (deletableEntryIds.has(id) && confirmedEntryDeletions.has(id)) continue;
    const rawFolderId = typeof row.folderId === "string" && row.folderId ? row.folderId : null;
    const incoming = normalizedEntryById.get(id);
    if (incoming && incoming.folderId !== rawFolderId) continue;
    pushId(currentSequences, rawFolderId ?? ROOT_CONTAINER_KEY, id);
  }

  // Incoming display order per container: the file's array order.
  const incomingSequences = new Map<string, string[]>();
  for (const [index, row] of incomingEntries.entries()) {
    const entry = normalizedEntryById.get(rowKey(row, "entry", index))!;
    pushId(incomingSequences, entry.folderId ?? ROOT_CONTAINER_KEY, entry.id);
  }

  const containerKeys = new Set([...currentSequences.keys(), ...incomingSequences.keys()]);
  const entrySequences = Array.from(containerKeys, (key) => ({
    folderId: key === ROOT_CONTAINER_KEY ? null : key,
    entryIds: mergeSequences(currentSequences.get(key) ?? [], incomingSequences.get(key) ?? []),
  }));

  // Folder order: current folders minus confirmed deletion candidates, woven
  // with the file's folder order.
  const deletableFolderIds = new Set(foldersDiff.deletable.map((row) => String(row.id)));
  const confirmedFolderDeletions = new Set(confirmedDeletions?.folders ?? []);
  const currentFolderSequence = [...currentFolders]
    .sort((left, right) => rowOrder(left) - rowOrder(right))
    .map((row) => String(row.id))
    .filter((id) => !(deletableFolderIds.has(id) && confirmedFolderDeletions.has(id)));
  const folderOrder = mergeSequences(
    currentFolderSequence,
    incomingFolders.map((row, index) => rowKey(row, "folder", index)),
  );

  return {
    preview: { kind: "lorebook", entries: entriesDiff, folders: foldersDiff },
    createFolders,
    updateFolders,
    createEntries,
    updateEntries,
    folderOrder,
    entrySequences,
  };
}

// ── Apply ────────────────────────────────────

/**
 * Execute a plan against the existing lorebook. Deletions run first (only ids
 * the user confirmed), then folder creates (detached, re-linked through the id
 * map with the same canReparentFolder guard the PATCH route and the importer
 * use), folder updates, entry creates/updates (folderId remapped), and finally
 * the reorder passes that make the merged orders authoritative.
 */
export async function applyLorebookMerge(
  storage: LorebooksStorage,
  lorebookId: string,
  plan: LorebookMergePlan,
  confirmDelete: LorebookMergeConfirmDelete | undefined,
): Promise<MergeApplyResult> {
  const confirmedEntries = new Set(confirmDelete?.entries ?? []);
  const confirmedFolders = new Set(confirmDelete?.folders ?? []);

  // 1. Deletions (confirmed only). removeFolder is the spec's non-cascading
  //    delete: its entries fall back to root and child folders are promoted.
  let deleted = 0;
  for (const row of plan.preview.entries.deletable) {
    const id = String(row.id);
    if (!confirmedEntries.has(id)) continue;
    await storage.removeEntry(id);
    deleted += 1;
  }
  for (const row of plan.preview.folders.deletable) {
    const id = String(row.id);
    if (!confirmedFolders.has(id)) continue;
    await storage.removeFolder(id, lorebookId);
    deleted += 1;
  }

  // 2. Folders. Added folders are created detached first (a file lists parents
  //    and children in one unordered array — same two-pass as the importer),
  //    then every incoming parentFolderId is resolved through the id map:
  //    matched → same id, added → created id, unknown/local-only → null.
  const folderMap = new Map<string, string>();
  for (const folder of plan.updateFolders) folderMap.set(folder.id, folder.id);
  for (const folder of plan.createFolders) {
    // Parsed folder rows lose the row index signature in their type — cast to
    // the id the query just inserted (same pattern as the route layer).
    const created = (await storage.createFolder(lorebookId, {
      name: folder.name,
      enabled: folder.enabled,
      parentFolderId: null, // linked below once every id exists
      order: folder.order,
    })) as unknown as { id: string } | null;
    if (created) folderMap.set(folder.id, created.id);
  }
  const resolveFolderRef = (ref: string | null): string | null => (ref ? (folderMap.get(ref) ?? null) : null);
  // Mirror of the live folder rows for canReparentFolder, refreshed after
  // deletions/creates so the guard sees the tree it is actually editing; a
  // malformed or hand-edited export can never persist a self-parent or a
  // cycle — an invalid parent leaves the folder where it is.
  const folderRows = (await storage.listFolders(lorebookId)) as unknown as Array<{
    id: string;
    lorebookId: string;
    parentFolderId: string | null;
  }>;
  const reparentFolder = async (folderId: string, parentRef: string | null) => {
    const parentId = resolveFolderRef(parentRef);
    if (parentId && !canReparentFolder(folderRows, folderId, parentId).ok) return;
    await storage.updateFolder(folderId, { parentFolderId: parentId }, lorebookId);
    const row = folderRows.find((candidate) => candidate.id === folderId);
    if (row) row.parentFolderId = parentId;
  };
  for (const folder of plan.createFolders) {
    const persistedId = folderMap.get(folder.id);
    if (persistedId) await reparentFolder(persistedId, folder.parentFolderId);
  }
  for (const folder of plan.updateFolders) {
    await storage.updateFolder(
      folder.id,
      { name: folder.name, enabled: folder.enabled, order: folder.order },
      lorebookId,
    );
    await reparentFolder(folder.id, folder.parentFolderId);
  }

  // 3. Entries. Creates remap folderId through the folder id map; updates pass
  //    every incoming field (updateEntry applies defined fields → wholesale
  //    replace, and clears stale embeddings) with folderId remapped the same way.
  const entryMap = new Map<string, string>();
  for (const entry of plan.updateEntries) entryMap.set(entry.id, entry.id);
  for (const entry of plan.createEntries) {
    const { id, folderId, ...fields } = entry;
    const created = (await storage.createEntry({
      ...fields,
      lorebookId,
      folderId: resolveFolderRef(folderId),
    })) as unknown as { id: string } | null;
    if (created) entryMap.set(id, created.id);
  }
  for (const entry of plan.updateEntries) {
    const { id, folderId, ...fields } = entry;
    await storage.updateEntry(id, { ...fields, folderId: resolveFolderRef(folderId) });
  }

  // 4. Orders: resolve added-item placeholders to created ids, then let the
  //    reorder helpers renumber (i+1)*10. The plan built these sequences with
  //    confirmed deletions already removed, so every id the reorder helpers
  //    receive is a real surviving or created item.
  const survivingFolderIds = new Set(
    ((await storage.listFolders(lorebookId)) as unknown as Array<{ id: string }>).map((row) => row.id),
  );
  await storage.reorderFolders(
    lorebookId,
    plan.folderOrder.map((id) => folderMap.get(id) ?? id).filter((id) => survivingFolderIds.has(id)),
  );
  for (const sequence of plan.entrySequences) {
    const containerFolderId = sequence.folderId === null ? null : (folderMap.get(sequence.folderId) ?? null);
    await storage.reorderEntries(
      lorebookId,
      sequence.entryIds.map((id) => entryMap.get(id) ?? id),
      containerFolderId,
    );
  }

  const added = plan.createEntries.length + plan.createFolders.length;
  const updated = plan.updateEntries.length + plan.updateFolders.length;
  return { added, updated, deleted };
}
