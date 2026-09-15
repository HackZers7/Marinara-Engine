// ──────────────────────────────────────────────
// Merge-Import Types
// ──────────────────────────────────────────────
//
// Merge-import applies a Marinara-native export envelope (.marinara.json)
// onto an EXISTING element (lorebook, preset, character card, persona)
// instead of creating a new one:
//   - items whose id exists on both sides are replaced wholesale by the
//     incoming item, keeping the local (database) id so cross-references
//     (chat entry states, section order, folder membership, linked
//     lorebook pointers) survive;
//   - items that only exist in the file are added;
//   - items that only exist locally are offered for deletion in a
//     confirmation popup and only removed when the user confirms.
//
// The merge never touches the root object of a lorebook or preset (name,
// description, links, scope): only child collections are merged. For
// characters and personas the card fields themselves are merged (incoming
// wins where the field is present in the file; fields absent from the file
// are kept), plus the embedded character book for cards.

import type { ExportEnvelope } from "./export.js";

/** Diff of one id-keyed child collection. */
export interface MergeCollectionDiff<T = Record<string, unknown>> {
  /** Present in the incoming file, absent locally — created on apply. */
  added: T[];
  /** Same id on both sides — local row replaced wholesale by the incoming item. */
  updated: Array<{ current: T; incoming: T }>;
  /** Present locally, absent from the incoming file — deletion candidates. */
  deletable: T[];
}

export interface LorebookMergePreview {
  kind: "lorebook";
  entries: MergeCollectionDiff;
  folders: MergeCollectionDiff;
}

export interface PresetMergePreview {
  kind: "preset";
  sections: MergeCollectionDiff;
  groups: MergeCollectionDiff;
  choiceBlocks: MergeCollectionDiff;
}

/**
 * Embedded-book diff for a character merge. Only available when the card has
 * a linked standalone lorebook AND the incoming file carries real entry ids
 * stamped by `character-book-sync` under
 * `character_book.entries[].extensions.marinara.entryId` (older exports and
 * unlinked books degrade to a fields-only merge).
 */
export type CharacterBookMergeDiff =
  | { available: true; lorebookId: string; entries: MergeCollectionDiff }
  | { available: false; reason: "no-linked-lorebook" | "no-stamped-entry-ids" };

export interface CharacterMergePreview {
  kind: "character";
  /** Names of the top-level card fields the file will overwrite. */
  fields: string[];
  /** Media replaced only when the file provides it. */
  media: { avatar: boolean; sprites: boolean; gallery: boolean };
  book: CharacterBookMergeDiff;
}

export interface PersonaMergePreview {
  kind: "persona";
  fields: string[];
  media: { avatar: boolean; sprites: boolean; gallery: boolean };
}

export type MergePreview = LorebookMergePreview | PresetMergePreview | CharacterMergePreview | PersonaMergePreview;

/** Ids the user confirmed for deletion in the merge popup. Absent keys or empty arrays mean "delete none". */
export interface LorebookMergeConfirmDelete {
  entries?: string[];
  folders?: string[];
}

export interface PresetMergeConfirmDelete {
  sections?: string[];
  groups?: string[];
  choiceBlocks?: string[];
}

export interface CharacterMergeConfirmDelete {
  /** Entries of the card's linked standalone lorebook. */
  entries?: string[];
  folders?: string[];
}

export interface LorebookMergeApplyPayload {
  envelope: ExportEnvelope;
  confirmDelete?: LorebookMergeConfirmDelete;
}

export interface PresetMergeApplyPayload {
  envelope: ExportEnvelope;
  confirmDelete?: PresetMergeConfirmDelete;
}

export interface CharacterMergeApplyPayload {
  envelope: ExportEnvelope;
  confirmDelete?: CharacterMergeConfirmDelete;
}

export type PersonaMergeApplyPayload = Pick<CharacterMergeApplyPayload, "envelope">;

export interface MergeApplyResult {
  added: number;
  updated: number;
  deleted: number;
}

export interface CharacterMergeApplyResult extends MergeApplyResult {
  kind: "character";
  /** The merged card data as persisted, so the open editor can adopt it. */
  data: Record<string, unknown>;
  /** False when the book merge was skipped (unlinked book or unstamped file). */
  bookApplied: boolean;
}

export interface PersonaMergeApplyResult extends MergeApplyResult {
  kind: "persona";
  data: Record<string, unknown>;
}
