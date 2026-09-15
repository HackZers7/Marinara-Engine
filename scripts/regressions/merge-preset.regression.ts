// Merge-import preset plan: diff classification, raw-row normalization,
// group/section reference remap, and merged order semantics.
import assert from "node:assert/strict";
import { planPresetMerge, type PresetMergeSnapshot } from "../../packages/server/src/services/merge/preset-merge.js";

type Row = Record<string, unknown>;

// ── Fixtures shaped like the real data: local rows straight from the storage
//    (string booleans), incoming rows straight from the export envelope JSON
//    (string booleans, JSON-string markerConfig/options/orders). ──

const current: PresetMergeSnapshot = {
  preset: { id: "p1", sectionOrder: JSON.stringify(["A", "X", "C"]), groupOrder: JSON.stringify(["G1"]) },
  sections: [
    {
      id: "A",
      identifier: "main",
      name: "Main",
      content: "local-a",
      role: "system",
      enabled: "true",
      isMarker: "false",
      groupId: "G1",
      markerConfig: null,
      injectionPosition: "ordered",
      injectionDepth: 0,
      injectionOrder: 0,
      forbidOverrides: "false",
    },
    { id: "X", identifier: "custom-x", name: "Local only", content: "local-x", enabled: "true", injectionOrder: 100 },
    { id: "C", identifier: "custom-c", name: "Shared C", content: "local-c", enabled: "true", injectionOrder: 200 },
  ],
  groups: [
    { id: "G1", name: "Core", parentGroupId: null, order: 0, enabled: "true" },
    { id: "GX", name: "Local group", parentGroupId: null, order: 100, enabled: "true" },
  ],
  choiceBlocks: [
    { id: "V1", variableName: "POV", question: "POV?", options: "[]", multiSelect: "false", sortOrder: 100 },
    { id: "V0", variableName: "OLD", question: "Old?", options: "[]", multiSelect: "false", sortOrder: 0 },
  ],
};

const incoming: PresetMergeSnapshot = {
  preset: {
    sectionOrder: JSON.stringify(["A", "B", "C", "GHOST"]),
    groupOrder: JSON.stringify(["G1", "G2", "GZ"]),
  },
  sections: [
    {
      id: "A",
      identifier: "main",
      name: "Main",
      content: "file-a",
      role: "system",
      enabled: "true",
      isMarker: "false",
      groupId: "G1",
      markerConfig: null,
      injectionPosition: "ordered",
      injectionDepth: 0,
      injectionOrder: 0,
      forbidOverrides: "false",
    },
    {
      id: "B",
      identifier: "custom-b",
      name: "Added B",
      content: "file-b",
      enabled: "true",
      isMarker: "false",
      groupId: "G2",
      markerConfig: '{"type":"chat_history"}',
      injectionPosition: "depth",
      injectionDepth: 4,
      injectionOrder: 700,
      forbidOverrides: "true",
    },
    { id: "B2", identifier: "custom-b2", name: "Orphan ref", content: "", groupId: "GZ", enabled: "false" },
    {
      id: "C",
      identifier: "custom-c",
      name: "Shared C",
      content: "file-c",
      enabled: false,
      isMarker: "false",
      groupId: "GX",
      injectionPosition: "depth",
    },
  ],
  groups: [
    { id: "G1", name: "Core", parentGroupId: null, order: 0, enabled: "true" },
    { id: "G2", name: "Extra", parentGroupId: "G1", order: 100, enabled: "true" },
    { id: "G3", name: "Orphan", parentGroupId: "GZ", order: 200, enabled: false },
  ],
  choiceBlocks: [
    {
      id: "V1",
      variableName: "POV",
      question: "POV?",
      options: '[{"id":"o1","label":"First","value":"first"}]',
      multiSelect: "true",
      separator: " | ",
      randomPick: "false",
      displayMode: "listbox",
      optionSort: "alphabetical",
      sortOrder: 0,
    },
    {
      id: "V2",
      variableName: "NEW",
      question: "New?",
      options: "[]",
      multiSelect: "false",
      displayMode: "weird",
      optionSort: "recent",
      sortOrder: 300,
    },
  ],
};

const plan = planPresetMerge(current, incoming);
const { sections, groups, choiceBlocks } = plan.preview;

// ── Diff classification ──

assert.deepEqual(
  sections.added.map((row) => (row as Row).id),
  ["B", "B2"],
  "Sections only in the file are added",
);
assert.deepEqual(
  sections.updated.map((pair) => (pair.current as Row).id),
  ["A", "C"],
  "Sections on both sides are updates keeping the local id",
);
assert.deepEqual(
  sections.deletable.map((row) => (row as Row).id),
  ["X"],
  "Sections only local are deletion candidates",
);
assert.equal((sections.deletable[0] as Row).content, "local-x", "Deletable rows are the raw local rows");

assert.deepEqual(
  groups.added.map((row) => (row as Row).id),
  ["G2", "G3"],
);
assert.deepEqual(
  groups.updated.map((pair) => (pair.current as Row).id),
  ["G1"],
);
assert.deepEqual(
  groups.deletable.map((row) => (row as Row).id),
  ["GX"],
  "Groups only local are deletion candidates",
);

assert.deepEqual(
  choiceBlocks.added.map((row) => (row as Row).id),
  ["V2"],
);
assert.deepEqual(
  choiceBlocks.updated.map((pair) => (pair.current as Row).id),
  ["V1"],
);
assert.deepEqual(
  choiceBlocks.deletable.map((row) => (row as Row).id),
  ["V0"],
);

// ── Raw-row normalization (string booleans, JSON-string fields) ──

assert.deepEqual(
  sections.added[0],
  {
    id: "B",
    identifier: "custom-b",
    name: "Added B",
    content: "file-b",
    role: "system",
    enabled: true,
    isMarker: false,
    groupId: "G2",
    markerConfig: { type: "chat_history" },
    injectionPosition: "depth",
    injectionDepth: 4,
    injectionOrder: 700,
    forbidOverrides: true,
  },
  "Added rows are normalized into storage-create shape",
);

const updatedA = sections.updated[0]!.incoming as Row;
assert.equal(updatedA.enabled, true, '"enabled": "true" normalizes to a real boolean');
assert.equal((sections.updated[1]!.incoming as Row).enabled, false, "Hydrated booleans pass through");

const updatedC = sections.updated[1]!.incoming as Row;
assert.equal(updatedC.role, "system", "Missing role falls back to system");
assert.equal(updatedC.injectionPosition, "depth");

// ── Reference remap through the incoming group id space ──

assert.equal(updatedA.groupId, "G1", "Matched group reference keeps the local id");
assert.equal((sections.added[0] as Row).groupId, "G2", "Added group reference keeps its placeholder until apply");
assert.equal(updatedC.groupId, null, "Reference to a local-only (deletion candidate) group resolves to null");
assert.equal((sections.added[1] as Row).groupId, null, "Unknown group reference resolves to null");

assert.deepEqual(
  groups.added[0],
  {
    id: "G2",
    name: "Extra",
    parentGroupId: "G1",
    order: 100,
    enabled: true,
  },
  "Added child group keeps its matched parent id",
);
assert.equal((groups.added[1] as Row).parentGroupId, null, "Added group with unknown parent resolves to null");
assert.equal((groups.added[1] as Row).enabled, false);

const updatedV1 = choiceBlocks.updated[0]!.incoming as Row;
assert.deepEqual(updatedV1.options, [{ id: "o1", label: "First", value: "first" }], "JSON-string options are parsed");
assert.equal(updatedV1.multiSelect, true);
assert.equal(updatedV1.displayMode, "listbox");
assert.equal(updatedV1.optionSort, "alphabetical");
assert.equal((choiceBlocks.added[0] as Row).displayMode, "auto", "Invalid displayMode falls back to auto");
assert.equal((choiceBlocks.added[0] as Row).optionSort, "manual", "Invalid optionSort falls back to manual");

// ── Merged orders ──

assert.deepEqual(
  plan.sectionOrder,
  ["A", "B", "X", "C"],
  "Spec example: current [A,X,C] + incoming [A,B,C] weaves B between A and X, deletion candidate X untouched",
);
assert.deepEqual(plan.groupOrder, ["G1", "G2"], "Unknown incoming order ids drop; local-only order ids survive");
assert.deepEqual(
  plan.choiceBlockOrder,
  ["V0", "V1", "V2"],
  "Choice-block order uses sortOrder ascending on both sides",
);

console.log("Preset merge plan regressions passed.");
