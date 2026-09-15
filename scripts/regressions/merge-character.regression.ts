import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { characterBookEntrySchema } from "../../packages/shared/src/schemas/character.schema.js";
import type { ExportEnvelope } from "../../packages/shared/src/types/export.js";
import { createFileNativeDB } from "../../packages/server/src/db/file-backed-store.js";
import { characters } from "../../packages/server/src/db/schema/index.js";
import {
  applyCharacterMerge,
  diffCardFields,
  mergeCardFields,
  planBookMerge,
  previewCharacterMerge,
  readEntryStamp,
} from "../../packages/server/src/services/merge/character-merge.js";
import { createCharactersStorage } from "../../packages/server/src/services/storage/characters.storage.js";
import { createLorebooksStorage } from "../../packages/server/src/services/storage/lorebooks.storage.js";

const currentData = {
  name: "Aria",
  description: "Old description",
  summary: "Old summary",
  tags: ["mage"],
  extensions: {
    versioningEnabled: true,
    importMetadata: { embeddedLorebook: { hasEmbeddedLorebook: true, lorebookId: "lb-1" } },
    backstory: "Old backstory",
  },
};

// Incoming file wins for every top-level field it contains; absent fields are
// never listed, and excluded keys never appear in the diff.
const fields = diffCardFields(currentData, {
  name: "Aria Prime",
  tags: ["mage", "archmage"],
  extensions: { backstory: "New backstory", versioningEnabled: false },
});
assert.deepEqual(fields, ["name", "tags", "extensions"]);

// character_book is excluded from the merge even when the file contains it.
assert.deepEqual(diffCardFields(currentData, { character_book: { entries: [{ keys: [] }] } }), []);

// A file identical to the current card changes nothing.
assert.deepEqual(diffCardFields(currentData, { ...currentData }), []);

// The persisted patch keeps local settings and the linked-lorebook pointer.
const patch = mergeCardFields(currentData, {
  name: "Aria Prime",
  character_book: { entries: [{ keys: ["overwrite-attempt"] }] },
  extensions: {
    backstory: "New backstory",
    versioningEnabled: false,
    importMetadata: { embeddedLorebook: { hasEmbeddedLorebook: true, lorebookId: "foreign-book" } },
  },
});
assert.equal(patch.name, "Aria Prime");
assert.equal(patch.character_book, undefined, "character_book must not be part of the merge patch");
assert.equal(patch.extensions.versioningEnabled, true, "versioningEnabled is a local setting");
assert.equal(
  patch.extensions.importMetadata.embeddedLorebook.lorebookId,
  "lb-1",
  "the linked-lorebook pointer is a connection, never overwritten",
);
assert.equal(patch.extensions.backstory, "New backstory");
assert.deepEqual(patch.tags, undefined, "fields absent from the file stay as-is");

// Book plan: stamp-matched entries update in place, unstamped or stale-stamped
// file entries are added, unmatched current entries are deletion candidates.
const stamped = (entryId: string, content: string) => ({
  keys: ["k"],
  content,
  extensions: { marinara: { entryId } },
});
const planCurrentEntries = [
  { id: "e-1", name: "One", content: "one" },
  { id: "e-2", name: "Two", content: "two" },
  { id: "e-3", name: "Three", content: "three" },
];
const plan = planBookMerge(planCurrentEntries, [
  stamped("e-2", "two-updated"),
  { keys: ["new"], content: "brand new" },
  stamped("gone", "stale stamp from a deleted row"),
]);
assert.equal(plan.stampsPresent, true);
assert.deepEqual(
  plan.updated.map((pair) => String(pair.current.id)),
  ["e-2"],
  "matching is by the real standalone-entry id stamp",
);
assert.equal(plan.updated[0]!.incoming.content, "two-updated");
assert.equal(plan.added.length, 2, "unstamped and stale-stamped entries land in added");
assert.deepEqual(
  plan.deletable.map((entry) => String(entry.id)),
  ["e-1", "e-3"],
);

// A file without any stamp cannot drive the book merge at all.
const unstampedPlan = planBookMerge(planCurrentEntries, [{ keys: [], content: "x" }]);
assert.equal(unstampedPlan.stampsPresent, false);
assert.deepEqual(unstampedPlan.updated, []);
assert.equal(unstampedPlan.added.length, 1);
assert.deepEqual(
  unstampedPlan.deletable.map((entry) => String(entry.id)),
  ["e-1", "e-2", "e-3"],
);

// Stamp reading tolerates numeric ids (schema default) and missing stamps.
assert.equal(readEntryStamp({ extensions: { marinara: { entryId: 42 } } }), "42");
assert.equal(readEntryStamp({ extensions: {} }), null);
assert.equal(readEntryStamp(null), null);

// Zod normalization on the character save path must keep the stamp.
const parsedEntry = characterBookEntrySchema.parse(stamped("e-9", "kept"));
assert.equal(readEntryStamp(parsedEntry), "e-9", "characterBookEntrySchema must preserve the entry-id stamp");

// ── Runtime integration: full preview + apply on a file-backed DB ──
// Covers snapshot-before-mutation (exactly one), id-stable book merge with
// user-confirmed deletion, excluded extension keys, and the embedded-book
// sync regenerating a stamped character_book.

const storageRoot = mkdtempSync(join(tmpdir(), "marinara-merge-character-"));
const previousStorageRoot = process.env.FILE_STORAGE_DIR;
process.env.FILE_STORAGE_DIR = storageRoot;

try {
  const db = await createFileNativeDB();
  const charactersStorage = createCharactersStorage(db);
  const lorebooksStorage = createLorebooksStorage(db);

  // The card's linked standalone lorebook, with two current entries.
  const lorebook = await lorebooksStorage.create({ name: "Aria — Book", characterIds: ["char-1"] });
  const lorebookId = String(lorebook!.id);
  const keepEntry = await lorebooksStorage.createEntry({
    lorebookId,
    name: "Keep",
    keys: ["k1"],
    content: "keep-v1",
    order: 100,
  });
  const dropEntry = await lorebooksStorage.createEntry({
    lorebookId,
    name: "Drop",
    keys: ["k2"],
    content: "drop-me",
    order: 200,
  });
  const keepId = String(keepEntry!.id);
  const dropId = String(dropEntry!.id);

  const now = "2026-09-12T00:00:00.000Z";
  await db.insert(characters).values({
    id: "char-1",
    data: JSON.stringify({
      name: "Aria",
      description: "Old description",
      character_version: "1.0",
      extensions: {
        versioningEnabled: true,
        importMetadata: { embeddedLorebook: { hasEmbeddedLorebook: true, lorebookId } },
      },
    }),
    comment: "",
    avatarPath: null,
    spriteFolderPath: null,
    createdAt: now,
    updatedAt: now,
  });

  const incomingCard = {
    name: "Aria Prime",
    description: "Merged description",
    first_mes: "Hello!",
    extensions: {
      versioningEnabled: false,
      importMetadata: { embeddedLorebook: { hasEmbeddedLorebook: true, lorebookId: "foreign-db-book" } },
      backstory: "New backstory",
    },
  };
  const incomingBookEntries = [
    {
      keys: ["k1"],
      content: "keep-v2",
      extensions: { marinara: { entryId: keepId } },
      enabled: true,
      insertion_order: 100,
      name: "Keep",
      comment: "Keep",
      secondary_keys: [],
      position: "before_char",
      case_sensitive: false,
    },
    {
      keys: ["new"],
      content: "added entry",
      extensions: {},
      enabled: true,
      insertion_order: 100,
      name: "Added",
      comment: "Added",
      position: "before_char",
    },
  ];
  const envelope = {
    type: "marinara_character",
    version: 1,
    exportedAt: now,
    data: {
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: { ...incomingCard, character_book: { entries: incomingBookEntries } },
    },
  } as ExportEnvelope;

  // Preview: field names, book diff, and media flags.
  const preview = await previewCharacterMerge(db, "char-1", envelope);
  assert.ok(preview && preview.kind === "character");
  assert.deepEqual(preview.fields, ["name", "description", "first_mes", "extensions"]);
  assert.deepEqual(preview.media, { avatar: false, sprites: false, gallery: false });
  assert.ok(preview.book.available);
  if (preview.book.available) {
    assert.equal(preview.book.lorebookId, lorebookId);
    assert.deepEqual(
      preview.book.entries.updated.map((pair) => String(pair.current.id)),
      [keepId],
    );
    assert.deepEqual(preview.book.entries.added.length, 1);
    assert.deepEqual(
      preview.book.entries.deletable.map((entry) => String(entry.id)),
      [dropId],
    );
  }

  // Media flags reflect only what the file provides (preview never writes).
  const mediaPreview = await previewCharacterMerge(db, "char-1", {
    ...envelope,
    data: {
      ...envelope.data,
      sprites: [{ filename: "a.png", data: "not-a-real-image" }],
      gallery: [{ filename: "sheet.png", data: "not-a-real-image" }],
    },
  } as ExportEnvelope);
  assert.ok(mediaPreview && mediaPreview.kind === "character");
  assert.deepEqual(mediaPreview.media, { avatar: false, sprites: true, gallery: true });

  // Apply with one confirmed deletion (plus an id that is not deletable).
  const result = await applyCharacterMerge(db, "char-1", envelope, {
    entries: [dropId, "not-a-candidate"],
  });
  assert.ok(result && result.kind === "character");
  assert.equal(result.added, 1);
  assert.equal(result.updated, 4 + 1, "changed card fields plus the stamp-matched book entry");
  assert.equal(result.deleted, 1, "only confirmed deletion candidates are removed");
  assert.equal(result.bookApplied, true);

  // Matched entry kept its id; content replaced; deletion applied.
  const kept = await lorebooksStorage.getEntry(keepId);
  assert.ok(kept, "stamp-matched entry keeps its id");
  assert.equal(kept.content, "keep-v2");
  assert.equal(await lorebooksStorage.getEntry(dropId), null, "confirmed deletion removed the entry");
  const remainingEntries = await lorebooksStorage.listEntries(lorebookId);
  assert.deepEqual(
    remainingEntries.map((entry) => String(entry.name)),
    ["Keep", "Added"],
  );

  // Card fields: file wins, local settings and the lorebook pointer survive.
  const merged = result.data;
  assert.equal(merged.name, "Aria Prime");
  assert.equal(merged.description, "Merged description");
  assert.equal(merged.first_mes, "Hello!");
  const mergedExtensions = merged.extensions as Record<string, unknown>;
  assert.equal(mergedExtensions.versioningEnabled, true, "versioningEnabled is a local setting");
  assert.equal(
    (mergedExtensions.importMetadata as Record<string, unknown>).embeddedLorebook === undefined
      ? undefined
      : ((mergedExtensions.importMetadata as any).embeddedLorebook.lorebookId as string),
    lorebookId,
    "linked-lorebook pointer untouched by the file",
  );
  assert.equal(mergedExtensions.backstory, "New backstory");

  // The embedded book was regenerated from the standalone lorebook and now
  // carries fresh entry-id stamps.
  const mergedBook = merged.character_book as { entries: Array<Record<string, unknown>> } | null;
  assert.ok(mergedBook && Array.isArray(mergedBook.entries));
  assert.equal(mergedBook.entries.length, 2);
  const stamps = mergedBook.entries.map((entry) => readEntryStamp(entry));
  assert.ok(stamps.includes(keepId), "the kept entry's stamp points at its unchanged standalone id");

  // Exactly ONE pre-merge snapshot, capturing the pre-merge card.
  const versions = await charactersStorage.listVersions("char-1");
  const saved = versions.filter((version) => !version.isCurrent);
  assert.equal(saved.length, 1, "all merge writes share one pre-merge snapshot");
  assert.equal(saved[0]!.source, "merge-import");
  assert.equal(saved[0]!.reason, "Saved before merge import");
  assert.equal((saved[0]!.data as Record<string, unknown>).name, "Aria", "snapshot holds the pre-merge card");

  // Unknown characters report not-found instead of throwing.
  assert.equal(await applyCharacterMerge(db, "missing", envelope), null);
  assert.equal(await previewCharacterMerge(db, "missing", envelope), null);

  console.log("Character merge-import regressions passed (pure helpers + runtime apply).");
} finally {
  if (previousStorageRoot === undefined) delete process.env.FILE_STORAGE_DIR;
  else process.env.FILE_STORAGE_DIR = previousStorageRoot;
  rmSync(storageRoot, { recursive: true, force: true });
}
