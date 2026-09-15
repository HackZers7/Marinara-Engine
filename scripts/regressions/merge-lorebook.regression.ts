import assert from "node:assert/strict";
import { mergeSequences } from "../../packages/server/src/services/merge/merge-sequence.js";
import { planLorebookMerge } from "../../packages/server/src/services/merge/lorebook-merge.js";
import type { LorebookMergePlan } from "../../packages/server/src/services/merge/lorebook-merge.js";

// ── mergeSequences ──

// Spec example: a new id is woven in right after its nearest preceding
// neighbor from the incoming sequence that is already placed.
assert.deepEqual(mergeSequences(["A", "X", "C"], ["A", "B", "C"]), ["A", "B", "X", "C"]);

// A new item whose predecessor is absent goes before the first placed
// successor; one with a placed predecessor follows it.
assert.deepEqual(mergeSequences(["A", "C"], ["Z", "A", "M", "C"]), ["Z", "A", "M", "C"]);

// Duplicate and unknown ids are tolerated (never duplicated, never crash).
assert.deepEqual(mergeSequences(["A", "Q"], ["B", "B", "A"]), ["B", "A", "Q"]);
assert.deepEqual(mergeSequences(["A"], ["A", "A", "N"]), ["A", "N"]);

// ── planLorebookMerge ──

type Row = Record<string, unknown>;

function entryRow(over: Row): Row {
  return {
    lorebookId: "book",
    name: "entry",
    content: "",
    description: "",
    keys: [],
    secondaryKeys: [],
    enabled: true,
    constant: false,
    selective: false,
    selectiveLogic: "and",
    probability: null,
    scanDepth: null,
    matchWholeWords: false,
    caseSensitive: false,
    useRegex: false,
    characterFilterMode: "any",
    characterFilterIds: [],
    characterTagFilterMode: "any",
    characterTagFilters: [],
    generationTriggerFilterMode: "any",
    generationTriggerFilters: [],
    additionalMatchingSources: [],
    position: 0,
    outletName: "",
    depth: 4,
    order: 100,
    role: "system",
    sticky: null,
    cooldown: null,
    delay: null,
    ephemeral: null,
    group: "",
    groupWeight: null,
    folderId: null,
    locked: false,
    preventRecursion: true,
    excludeRecursion: false,
    delayUntilRecursion: false,
    excludeFromVectorization: false,
    tag: "",
    relationships: {},
    dynamicState: {},
    activationConditions: [],
    schedule: null,
    embedding: null,
    embeddingSpaceId: null,
    createdAt: "t",
    updatedAt: "t",
    ...over,
  };
}

function folderRow(over: Row): Row {
  return { lorebookId: "book", name: "folder", enabled: true, parentFolderId: null, order: 0, ...over };
}

// Diff classification + sanitizer strips server-managed fields.
const classification = planLorebookMerge(
  [entryRow({ id: "E1", content: "old", order: 10 })],
  [],
  [
    entryRow({ id: "E1", content: "new", order: 10 }),
    entryRow({
      id: "E3",
      content: "incoming",
      order: 20,
      lorebookId: "OTHER_BOOK",
      embedding: [0.1, 0.2],
      embeddingSpaceId: "space",
      createdAt: "old",
      updatedAt: "old",
      role: "boss",
    }),
  ],
  [],
);
assert.deepEqual(
  classification.preview.entries.added.map((row) => row.id),
  ["E3"],
);
assert.deepEqual(
  classification.preview.entries.updated.map((pair) => pair.current.id),
  ["E1"],
);
assert.deepEqual(classification.preview.entries.deletable, []);
const created = classification.createEntries[0]!;
assert.equal(created.id, "E3");
assert.equal(created.folderId, null);
assert.equal(created.content, "incoming");
assert.equal(created.role, "system", "untrusted role must clamp to system like the importer");
assert.equal("embedding" in created, false, "embedding must not round-trip through a merge");
assert.equal("embeddingSpaceId" in created, false);
assert.equal("lorebookId" in created, false);
assert.equal("createdAt" in created, false);
assert.equal("updatedAt" in created, false);
const updatedEntry = classification.updateEntries[0]!;
assert.equal(updatedEntry.id, "E1");
assert.equal(updatedEntry.content, "new");

// Folder remap, moved-entry container change, deletable detection, merged orders.
const currentFolders = [folderRow({ id: "FL", order: 10 }), folderRow({ id: "FD", order: 20 })];
const incomingFolders = [
  folderRow({ id: "FL", order: 10 }),
  folderRow({ id: "FN", order: 0 }),
  folderRow({ id: "FC", order: 0, parentFolderId: "FN" }),
];
const currentEntries = [
  entryRow({ id: "M1", folderId: "FL", order: 10 }), // moves to root in the file
  entryRow({ id: "M2", folderId: "FL", order: 20 }), // stays
  entryRow({ id: "R1", order: 5 }), // root, stays
  entryRow({ id: "D1", folderId: "FD", order: 30 }), // local only → deletable
];
const incomingEntries = [
  entryRow({ id: "R1", order: 5 }),
  entryRow({ id: "M1", folderId: null, order: 10 }), // moved: FL → root
  entryRow({ id: "M2", folderId: "FL", order: 20 }),
  entryRow({ id: "N1", folderId: "FC", order: 40 }), // new, inside an added folder
  entryRow({ id: "N2", folderId: "GHOST", order: 50 }), // new, unknown folder → root
];
const plan: LorebookMergePlan = planLorebookMerge(currentEntries, currentFolders, incomingEntries, incomingFolders);

// Diffs.
assert.deepEqual(
  plan.preview.entries.added.map((row) => row.id),
  ["N1", "N2"],
);
assert.deepEqual(
  plan.preview.entries.updated.map((pair) => pair.current.id),
  ["R1", "M1", "M2"], // every id present on both sides is an updated pair
);
assert.deepEqual(
  plan.preview.entries.deletable.map((row) => row.id),
  ["D1"],
);
assert.deepEqual(
  plan.preview.folders.added.map((row) => row.id),
  ["FN", "FC"],
);
assert.deepEqual(
  plan.preview.folders.updated.map((pair) => pair.current.id),
  ["FL"],
);
assert.deepEqual(
  plan.preview.folders.deletable.map((row) => row.id),
  ["FD"],
);
assert.equal(plan.preview.kind, "lorebook");

// Added folders keep incoming-id placeholders; the child points at its parent.
assert.deepEqual(
  plan.createFolders.map((folder) => folder.id),
  ["FN", "FC"],
);
assert.equal(plan.createFolders[0]!.parentFolderId, null);
assert.equal(plan.createFolders[1]!.parentFolderId, "FN");
assert.deepEqual(
  plan.updateFolders.map((folder) => folder.id),
  ["FL"],
);

// Entries inside added folders keep the file-id placeholder; unknown folder
// references fall back to root.
assert.deepEqual(
  plan.createEntries.map((entry) => [entry.id, entry.folderId]),
  [
    ["N1", "FC"],
    ["N2", null],
  ],
);
assert.deepEqual(
  plan.updateEntries.map((entry) => [entry.id, entry.folderId]),
  [
    ["R1", null], // matched, container unchanged
    ["M1", null], // moved to root
    ["M2", "FL"], // unchanged container
  ],
);

// Merged per-container sequences: M1 arrives in root after R1, leaves FL;
// deletable D1 is already out of the sequences.
const sequenceOf = (folderId: string | null) =>
  plan.entrySequences.find((sequence) => sequence.folderId === folderId)?.entryIds;
assert.deepEqual(sequenceOf(null), ["R1", "M1", "N2"]);
assert.deepEqual(sequenceOf("FL"), ["M2"]);
assert.deepEqual(sequenceOf("FC"), ["N1"]);
assert.deepEqual(plan.folderOrder, ["FL", "FN", "FC"]);

console.log("Lorebook merge sequence interleave and plan regressions passed.");
