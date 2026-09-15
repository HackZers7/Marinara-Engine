// ──────────────────────────────────────────────
// Service: Merge-Import — Character cards
// ──────────────────────────────────────────────
//
// Applies a Marinara-native character envelope (.marinara.json) onto an
// EXISTING character card instead of creating a new one:
//   - card fields: incoming file wins for every top-level field it contains;
//     fields absent from the file stay as-is. Never merged from the file:
//     `character_book` (the book merge below owns it), and inside
//     `extensions`: `importMetadata` (protects the linked-lorebook pointer —
//     a connection) and `versioningEnabled` (a local setting).
//   - media (avatar / sprites / gallery): replaced only when the file
//     provides them, reusing the native-import restore helpers.
//   - embedded book: merged into the card's LINKED standalone lorebook by
//     matching `character_book.entries[].extensions.marinara.entryId` stamps
//     (written by `character-book-sync`) against real entry ids, so matched
//     entries keep their ids and every downstream reference survives.
//
// Exactly ONE version snapshot (source "merge-import") is taken before any
// mutation; every write below passes skipVersionSnapshot: true.

import type { DB } from "../../db/connection.js";
import type { ExportEnvelope } from "@marinara-engine/shared";
import type {
  CharacterBookMergeDiff,
  CharacterMergeApplyResult,
  CharacterMergeConfirmDelete,
  CharacterMergePreview,
  CreateLorebookEntryInput,
  LorebookEntryPosition,
} from "@marinara-engine/shared";
import { createCharactersStorage } from "../storage/characters.storage.js";
import { createCharacterGalleryStorage } from "../storage/character-gallery.storage.js";
import { createLorebooksStorage } from "../storage/lorebooks.storage.js";
import { getEmbeddedLorebookId, syncCharacterBookFromLorebook } from "../lorebook/character-book-sync.js";
import {
  asNullableNumber,
  asNumber,
  asStringArray,
  hasSlashDelimitedRegex,
  nonEmptyString,
  normalizeRegexKeys,
  normalizeString,
  resolvePosition,
  resolveSelectiveLogic,
} from "../import/st-lorebook.importer.js";
import { resolveLorebookEntryRole } from "../import/lorebook-role.js";
import { restoreCharacterGallery, restoreSprites, saveAvatarFromDataUrl } from "../import/marinara.importer.js";
import { removeUnattachedAvatarFile } from "../image/avatar-file-lifecycle.js";
import { logger } from "../../lib/logger.js";

type CardDataRecord = Record<string, unknown>;

/** Top-level card fields the merge never takes from the file. */
export const MERGE_EXCLUDED_CARD_FIELDS: readonly string[] = ["character_book"];
/** `extensions` sub-keys the merge never takes from the file. */
export const MERGE_EXCLUDED_EXTENSION_KEYS: readonly string[] = ["importMetadata", "versioningEnabled"];

export function isRecord(value: unknown): value is CardDataRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(data: unknown): CardDataRecord {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  return isRecord(parsed) ? parsed : {};
}

/** The V2 card payload of a native character envelope (`data.data`). */
export function characterEnvelopePayload(envelope: ExportEnvelope): {
  data: CardDataRecord;
  avatar: unknown;
  sprites: unknown;
  gallery: unknown;
} {
  const payload = isRecord(envelope.data) ? envelope.data : {};
  return {
    data: isRecord(payload.data) ? payload.data : {},
    avatar: payload.avatar,
    sprites: payload.sprites,
    gallery: payload.gallery,
  };
}

/** Drop the merge-excluded keys from an incoming `extensions` object. */
export function stripExcludedExtensionKeys(extensions: CardDataRecord): CardDataRecord {
  const rest = { ...extensions };
  for (const key of MERGE_EXCLUDED_EXTENSION_KEYS) delete rest[key];
  return rest;
}

/**
 * The top-level card patch the merge would persist: every top-level field the
 * file contains (minus exclusions), with `extensions` pre-merged as
 * `{ ...currentExtensions, ...incomingExtensionsWithoutExcludedKeys }`.
 * Applying it is idempotent against the storage layer's recursive
 * `extensions` merge.
 */
export function mergeCardFields(currentData: CardDataRecord, incomingData: CardDataRecord): CardDataRecord {
  const patch: CardDataRecord = {};
  for (const [key, value] of Object.entries(incomingData)) {
    if (MERGE_EXCLUDED_CARD_FIELDS.includes(key)) continue;
    if (key === "extensions") {
      const currentExtensions = isRecord(currentData.extensions) ? currentData.extensions : {};
      const incomingExtensions = isRecord(value) ? value : {};
      patch.extensions = { ...currentExtensions, ...stripExcludedExtensionKeys(incomingExtensions) };
      continue;
    }
    patch[key] = value;
  }
  return patch;
}

/** Names of top-level card fields that would change if the merge were applied. */
export function diffCardFields(currentData: CardDataRecord, incomingData: CardDataRecord): string[] {
  const patch = mergeCardFields(currentData, incomingData);
  return Object.keys(patch).filter((key) => JSON.stringify(patch[key]) !== JSON.stringify(currentData[key]));
}

/** The real standalone-entry id stamped by `character-book-sync`, if any. */
export function readEntryStamp(entry: unknown): string | null {
  if (!isRecord(entry) || !isRecord(entry.extensions)) return null;
  const marinara = entry.extensions.marinara;
  if (!isRecord(marinara) || marinara.entryId === undefined || marinara.entryId === null) return null;
  return String(marinara.entryId);
}

export interface BookMergePlan {
  /** File entries with no matching local stamp — created as new entries. */
  added: CardDataRecord[];
  /** Stamp-matched pairs — the local entry is replaced by the incoming one, keeping its id. */
  updated: Array<{ current: CardDataRecord; incoming: CardDataRecord }>;
  /** Local entries missing from the file's stamp set — deletion candidates. */
  deletable: CardDataRecord[];
  /** False when NO incoming entry carries a stamp (book merge must be skipped). */
  stampsPresent: boolean;
}

/**
 * Pure plan for the embedded-book merge. Matching is by
 * `extensions.marinara.entryId` (string compare against the current entry id).
 * Unstamped incoming entries always land in `added` — so does a stamped entry
 * whose id does not exist locally (stale stamp from a deleted row or another
 * database). Without any stamp the caller must skip the book merge entirely
 * (the deletable set would cover every current entry).
 */
export function planBookMerge(currentEntries: CardDataRecord[], incomingBookEntries: CardDataRecord[]): BookMergePlan {
  const currentById = new Map(currentEntries.map((entry) => [String(entry.id), entry]));
  const added: CardDataRecord[] = [];
  const updated: BookMergePlan["updated"] = [];
  const matchedIds = new Set<string>();
  let stampsPresent = false;

  for (const incoming of incomingBookEntries) {
    const stamp = readEntryStamp(incoming);
    if (stamp === null) {
      added.push(incoming);
      continue;
    }
    stampsPresent = true;
    const current = currentById.get(stamp);
    if (current) {
      matchedIds.add(stamp);
      updated.push({ current, incoming });
    } else {
      added.push(incoming);
    }
  }

  const deletable = currentEntries.filter((entry) => !matchedIds.has(String(entry.id)));
  return { added, updated, deletable, stampsPresent };
}

// ── V2 book entry → standalone lorebook entry ──

/**
 * Field mapping mirrors the embedded-book import path (`importSTLorebook`):
 * insertion_order → order, position/role re-resolved, secondary_keys, regex
 * key normalization. Fields the flat V2 book cannot represent (folder,
 * relationships, dynamic state, filters, schedule) are deliberately omitted so
 * an update never clobbers them; `createEntry` re-applies the same defaults the
 * importer uses for created rows.
 */
type ConvertedBookEntry = Omit<
  CreateLorebookEntryInput,
  "lorebookId" | "folderId" | "relationships" | "dynamicState" | "activationConditions" | "schedule" | "position"
> & { position: LorebookEntryPosition };

function convertBookEntry(entry: CardDataRecord, index: number): ConvertedBookEntry {
  const rawKeys = asStringArray(entry.keys ?? entry.key);
  const rawSecondaryKeys = asStringArray(entry.secondary_keys ?? entry.keysecondary);
  const entryUsesRegex = Boolean(entry.useRegex ?? entry.regex ?? false);
  const matchWholeWords = Boolean(entry.matchWholeWords ?? entry.match_whole_words ?? false);
  const useRegex = entryUsesRegex || hasSlashDelimitedRegex(rawKeys) || hasSlashDelimitedRegex(rawSecondaryKeys);
  // Mirrors resolveProbability in st-lorebook.importer: ST's useProbability
  // gate plus a 0–100 clamp. Inlined because that helper is typed against the
  // importer's private STWorldInfoEntry.
  const useProbability = entry.useProbability ?? entry.use_probability;
  const probability = useProbability === false ? null : asNullableNumber(entry.probability);
  const clampedProbability = probability === null ? null : Math.max(0, Math.min(100, probability));
  return {
    name: nonEmptyString(entry.comment, entry.name) ?? `Entry ${index + 1}`,
    content: normalizeString(entry.content),
    description: normalizeString(entry.description),
    keys: normalizeRegexKeys(rawKeys, { useRegex, entryUsesRegex, matchWholeWords }),
    secondaryKeys: normalizeRegexKeys(rawSecondaryKeys, { useRegex, entryUsesRegex, matchWholeWords }),
    enabled: entry.disable != null ? entry.disable !== true : entry.enabled !== false,
    constant: Boolean(entry.constant ?? false),
    selective: Boolean(entry.selective ?? false),
    selectiveLogic: resolveSelectiveLogic(entry.selectiveLogic),
    probability: clampedProbability,
    scanDepth: asNullableNumber(entry.scanDepth ?? entry.scan_depth),
    matchWholeWords,
    caseSensitive: Boolean(entry.caseSensitive ?? entry.case_sensitive ?? false),
    useRegex,
    // resolvePosition only yields the storage union (0 before/1 after/2 depth/7 outlet).
    position: resolvePosition(entry.position) as 0 | 1 | 2 | 7,
    outletName: normalizeString(entry.outletName),
    depth: asNumber(entry.depth, 4),
    order: asNumber(entry.order ?? entry.insertion_order, 100),
    role: resolveLorebookEntryRole(entry.role),
    sticky: asNullableNumber(entry.sticky),
    cooldown: asNullableNumber(entry.cooldown),
    delay: asNullableNumber(entry.delay),
    ephemeral: asNullableNumber(entry.ephemeral),
    // The embedded book round-trips the stored tag; importSTLorebook instead
    // re-detects a heuristic tag because foreign ST files carry none.
    tag: typeof entry.tag === "string" ? entry.tag : "",
    group: typeof entry.group === "string" ? entry.group : "",
    groupWeight: asNullableNumber(entry.groupWeight),
    locked: Boolean(entry.locked ?? false),
    preventRecursion: entry.preventRecursion == null ? true : Boolean(entry.preventRecursion),
    excludeRecursion: Boolean(entry.excludeRecursion ?? false),
    delayUntilRecursion: Boolean(entry.delayUntilRecursion ?? false),
    excludeFromVectorization: entry.vectorized === false ? true : entry.excludeFromVectorization === true,
  };
}

// ── Book diff resolution ──

interface CharacterBookMergePlan {
  diff: CharacterBookMergeDiff;
  /** Non-null only when diff.available — the concrete add/update/delete plan. */
  plan: BookMergePlan | null;
}

async function resolveCharacterBookPlan(
  db: DB,
  currentData: CardDataRecord,
  incomingData: CardDataRecord,
): Promise<CharacterBookMergePlan> {
  const lorebookId = getEmbeddedLorebookId(currentData);
  if (!lorebookId) return { diff: { available: false, reason: "no-linked-lorebook" }, plan: null };
  const lorebooksStorage = createLorebooksStorage(db);
  const lorebook = await lorebooksStorage.getById(lorebookId);
  if (!lorebook) return { diff: { available: false, reason: "no-linked-lorebook" }, plan: null };

  const currentEntries = (await lorebooksStorage.listEntries(lorebookId)) as unknown as CardDataRecord[];
  const incomingBook = isRecord(incomingData.character_book) ? incomingData.character_book : null;
  const incomingEntries =
    incomingBook && Array.isArray(incomingBook.entries) ? incomingBook.entries.filter(isRecord) : [];
  const plan = planBookMerge(currentEntries, incomingEntries);
  if (!plan.stampsPresent) return { diff: { available: false, reason: "no-stamped-entry-ids" }, plan: null };

  return {
    diff: {
      available: true,
      lorebookId,
      entries: { added: plan.added, updated: plan.updated, deletable: plan.deletable },
    },
    plan,
  };
}

function envelopeMediaFlags(payload: ReturnType<typeof characterEnvelopePayload>) {
  return {
    avatar: typeof payload.avatar === "string" && payload.avatar.length > 0,
    sprites: Array.isArray(payload.sprites) && payload.sprites.length > 0,
    gallery: Array.isArray(payload.gallery) && payload.gallery.length > 0,
  };
}

// ── Preview ──

/** Build the merge preview for an existing character. Returns null when the character does not exist. */
export async function previewCharacterMerge(
  db: DB,
  characterId: string,
  envelope: ExportEnvelope,
): Promise<CharacterMergePreview | null> {
  const character = await createCharactersStorage(db).getById(characterId);
  if (!character) return null;

  const currentData = parseRecord(character.data);
  const payload = characterEnvelopePayload(envelope);
  return {
    kind: "character",
    fields: diffCardFields(currentData, payload.data),
    media: envelopeMediaFlags(payload),
    book: (await resolveCharacterBookPlan(db, currentData, payload.data)).diff,
  };
}

// ── Apply ──

function characterVersioningEnabled(currentData: CardDataRecord): boolean {
  const extensions = isRecord(currentData.extensions) ? currentData.extensions : {};
  return extensions.versioningEnabled !== false;
}

/**
 * Apply a native character envelope onto an existing card. Returns null when
 * the character does not exist; throws on storage failures (the route surfaces
 * them). MUST run inside the per-character update queue.
 */
export async function applyCharacterMerge(
  db: DB,
  characterId: string,
  envelope: ExportEnvelope,
  confirmDelete?: CharacterMergeConfirmDelete,
): Promise<CharacterMergeApplyResult | null> {
  const charactersStorage = createCharactersStorage(db);
  const character = await charactersStorage.getById(characterId);
  if (!character) return null;

  const currentData = parseRecord(character.data);
  const payload = characterEnvelopePayload(envelope);
  const incomingData = payload.data;

  const changedFields = diffCardFields(currentData, incomingData);
  const fieldPatch = mergeCardFields(currentData, incomingData);
  const media = envelopeMediaFlags(payload);

  // Book plan: only when the card links a live standalone lorebook AND the
  // file carries real entry-id stamps.
  const { diff: bookDiff, plan: bookPlan } = await resolveCharacterBookPlan(db, currentData, incomingData);

  // Only ids the user confirmed AND that are actual deletion candidates.
  const deletableIds = new Set((bookPlan?.deletable ?? []).map((entry) => String(entry.id)));
  const confirmedDeletes = (confirmDelete?.entries ?? []).filter((id) => deletableIds.has(id));

  const willChange =
    changedFields.length > 0 ||
    media.avatar ||
    media.sprites ||
    media.gallery ||
    (bookPlan !== null && (bookPlan.added.length > 0 || bookPlan.updated.length > 0 || confirmedDeletes.length > 0));

  // 1. Exactly ONE pre-merge snapshot of the current state.
  if (willChange && characterVersioningEnabled(currentData)) {
    await charactersStorage.createVersionSnapshot(characterId, {
      source: "merge-import",
      reason: "Saved before merge import",
    });
  }

  let added = 0;
  let updated = 0;
  let deleted = 0;

  // 2. Book merge into the linked standalone lorebook.
  const lorebooksStorage = createLorebooksStorage(db);
  if (bookPlan && bookDiff.available) {
    for (const [index, pair] of bookPlan.updated.entries()) {
      await lorebooksStorage.updateEntry(String(pair.current.id), convertBookEntry(pair.incoming, index));
      updated += 1;
    }
    for (const [index, incoming] of bookPlan.added.entries()) {
      await lorebooksStorage.createEntry({
        ...convertBookEntry(incoming, index),
        lorebookId: bookDiff.lorebookId,
        relationships: {},
        dynamicState: {},
        activationConditions: [],
        schedule: null,
      });
      added += 1;
    }
    for (const entryId of confirmedDeletes) {
      await lorebooksStorage.removeEntry(entryId);
      deleted += 1;
    }
    // Regenerate the card's embedded copy from the mutated standalone book.
    if (added + updated + deleted > 0) {
      await syncCharacterBookFromLorebook(db, bookDiff.lorebookId);
    }
  }

  // 3. Card fields update (incoming wins; exclusions preserved).
  if (changedFields.length > 0) {
    await charactersStorage.update(characterId, fieldPatch as never, undefined, { skipVersionSnapshot: true });
    updated += changedFields.length;
  }

  // 4. Media — replaced only when the file provides it.
  // ponytail: media restore is additive (importer semantics) — superseded
  // avatar/sprite/gallery files are not pruned. Upgrade path: collect the
  // owner's previous files before restore and unlink the unreferenced ones
  // afterwards via galleryFileHasReferences, as character deletion does.
  if (media.avatar) {
    const saved = await saveAvatarFromDataUrl(payload.avatar, "character", characterId);
    if (saved) {
      try {
        const avatarUpdated = await charactersStorage.update(characterId, {}, saved.avatarPath, {
          skipVersionSnapshot: true,
        });
        if (!avatarUpdated) await removeUnattachedAvatarFile({ filePath: saved.filePath });
        else updated += 1;
      } catch (error) {
        await removeUnattachedAvatarFile({ filePath: saved.filePath });
        throw error;
      }
    }
  }
  if (media.sprites) {
    await restoreSprites(payload.sprites, characterId);
    updated += 1;
  }
  if (media.gallery) {
    const galleryStorage = createCharacterGalleryStorage(db);
    const characterSheetImageId = await restoreCharacterGallery(payload.gallery, characterId, galleryStorage);
    // The export strips the gallery-pointer extension, so the only way to keep
    // the character-sheet selection traveling with the file is this marker.
    if (characterSheetImageId) {
      await charactersStorage.update(characterId, { extensions: { characterSheetImageId } } as never, undefined, {
        skipVersionSnapshot: true,
        mergeExtensions: true,
      });
    }
    updated += 1;
  }

  logger.info(
    "Merge-import applied to character %s: %d added, %d updated, %d deleted (book applied: %s)",
    characterId,
    added,
    updated,
    deleted,
    String(bookPlan !== null),
  );

  const row = await charactersStorage.getById(characterId);
  return {
    kind: "character",
    added,
    updated,
    deleted,
    data: row ? parseRecord(row.data) : currentData,
    bookApplied: bookPlan !== null,
  };
}
