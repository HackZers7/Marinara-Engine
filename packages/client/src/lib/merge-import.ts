// ──────────────────────────────────────────────
// Merge-import helpers
//
// Pure (framework-free) logic behind the editors' merge-import flow: envelope
// sniffing, deletion-candidate grouping, "is there anything to do" checks, and
// confirmDelete payload assembly. Kept side-effect free so it stays trivially
// unit-testable; the stateful flow lives in components/merge/MergeImportDialog.tsx.
// ──────────────────────────────────────────────
import type {
  CharacterMergeConfirmDelete,
  ExportEnvelope,
  LorebookMergeConfirmDelete,
  MergePreview,
  PresetMergeConfirmDelete,
} from "@marinara-engine/shared";

/** The element kinds whose editors offer merge import. */
export type MergeImportKind = "lorebook" | "preset" | "character" | "persona";

const EXPECTED_ENVELOPE_TYPES: Record<MergeImportKind, string> = {
  lorebook: "marinara_lorebook",
  preset: "marinara_preset",
  character: "marinara_character",
  persona: "marinara_persona",
};

/**
 * Return the parsed JSON as a Marinara-native export envelope of the expected
 * kind, or null when it is not one (foreign shape, wrong entity type, or an
 * unsupported envelope version). Same sniffing idea as the regular import
 * modal's `type === "marinara_*" && version === 1` check.
 */
export function sniffMergeEnvelope(json: unknown, kind: MergeImportKind): ExportEnvelope | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const record = json as Record<string, unknown>;
  if (record.type !== EXPECTED_ENVELOPE_TYPES[kind]) return null;
  if (record.version !== 1) return null;
  return json as ExportEnvelope;
}

function asRecord(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
}

/** Read a human label from an untyped diff row; falls back to its raw id. */
export function mergeItemLabel(item: unknown): string {
  const record = asRecord(item);
  if (!record) return "";
  for (const key of ["name", "comment", "title"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return typeof record.id === "string" ? record.id : "";
}

/** Local database ids of deletion candidates, for the confirmDelete payload. */
export function mergeItemIds(items: unknown[]): string[] {
  return items.map((item) => asRecord(item)?.id).filter((id): id is string => typeof id === "string");
}

/** One confirmation group: the deletion candidates of a single child collection. */
export interface MergeDeletableGroup {
  key: MergeConfirmGroupKey;
  items: Array<{ id: string; label: string }>;
}

export type MergeConfirmGroupKey = "entries" | "folders" | "sections" | "groups" | "choiceBlocks";

/**
 * Deletion candidate groups for a preview, in display order. Characters
 * contribute their linked standalone lorebook's entries (when the diff is
 * available); personas never have deletion candidates.
 */
export function mergeDeletableGroups(preview: MergePreview): MergeDeletableGroup[] {
  const group = (key: MergeConfirmGroupKey, items: unknown[]): MergeDeletableGroup => ({
    key,
    items: items
      .map((item) => {
        const record = asRecord(item);
        const id = typeof record?.id === "string" ? record.id : null;
        return id ? { id, label: mergeItemLabel(item) } : null;
      })
      .filter((item): item is { id: string; label: string } => item !== null),
  });

  switch (preview.kind) {
    case "lorebook":
      return [group("entries", preview.entries.deletable), group("folders", preview.folders.deletable)];
    case "preset":
      return [
        group("sections", preview.sections.deletable),
        group("groups", preview.groups.deletable),
        group("choiceBlocks", preview.choiceBlocks.deletable),
      ];
    case "character":
      return preview.book.available ? [group("entries", preview.book.entries.deletable)] : [];
    case "persona":
      return [];
  }
}

/** True when the preview offers at least one deletion candidate. */
export function mergeHasDeletableItems(preview: MergePreview): boolean {
  return mergeDeletableGroups(preview).some((group) => group.items.length > 0);
}

/** True when applying the file would neither add, update, nor delete anything. */
export function mergePreviewIsEmpty(preview: MergePreview): boolean {
  const collectionTouches = (collection: { added: unknown[]; updated: unknown[] }) =>
    collection.added.length > 0 || collection.updated.length > 0;

  switch (preview.kind) {
    case "lorebook":
      return (
        !collectionTouches(preview.entries) && !collectionTouches(preview.folders) && !mergeHasDeletableItems(preview)
      );
    case "preset":
      return (
        !collectionTouches(preview.sections) &&
        !collectionTouches(preview.groups) &&
        !collectionTouches(preview.choiceBlocks) &&
        !mergeHasDeletableItems(preview)
      );
    case "character": {
      const book = preview.book;
      const bookTouches = book.available && collectionTouches(book.entries);
      const mediaTouches = preview.media.avatar || preview.media.sprites || preview.media.gallery;
      return preview.fields.length === 0 && !mediaTouches && !bookTouches && !mergeHasDeletableItems(preview);
    }
    case "persona": {
      const mediaTouches = preview.media.avatar || preview.media.sprites || preview.media.gallery;
      return preview.fields.length === 0 && !mediaTouches;
    }
  }
}

/** Added/updated counts for the "Adds N · Updates M" summary line. */
export function mergePreviewCounts(preview: MergePreview): { added: number; updated: number } {
  const mediaCount = (media: { avatar: boolean; sprites: boolean; gallery: boolean }) =>
    [media.avatar, media.sprites, media.gallery].filter(Boolean).length;

  switch (preview.kind) {
    case "lorebook":
      return {
        added: preview.entries.added.length + preview.folders.added.length,
        updated: preview.entries.updated.length + preview.folders.updated.length,
      };
    case "preset":
      return {
        added: preview.sections.added.length + preview.groups.added.length + preview.choiceBlocks.added.length,
        updated: preview.sections.updated.length + preview.groups.updated.length + preview.choiceBlocks.updated.length,
      };
    case "character": {
      const book = preview.book;
      return {
        added: book.available ? book.entries.added.length : 0,
        updated: preview.fields.length + mediaCount(preview.media) + (book.available ? book.entries.updated.length : 0),
      };
    }
    case "persona":
      return {
        added: 0,
        updated: preview.fields.length + mediaCount(preview.media),
      };
  }
}

/** Checked group ids, as captured by the confirmation dialog. */
export type MergeConfirmSelection = Partial<Record<MergeConfirmGroupKey, ReadonlySet<string>>>;

/**
 * Assemble the request's confirmDelete payload from the dialog selection. Only
 * non-empty groups are included; absent keys mean "delete none".
 */
export function buildMergeConfirmDelete(
  kind: MergeImportKind,
  selection: MergeConfirmSelection,
): LorebookMergeConfirmDelete | PresetMergeConfirmDelete | CharacterMergeConfirmDelete | undefined {
  const ids = (key: MergeConfirmGroupKey): string[] => [...(selection[key] ?? new Set<string>())];
  const compact = (values: string[]): string[] | undefined => (values.length > 0 ? values : undefined);

  switch (kind) {
    case "lorebook":
      return { entries: compact(ids("entries")), folders: compact(ids("folders")) };
    case "preset":
      return {
        sections: compact(ids("sections")),
        groups: compact(ids("groups")),
        choiceBlocks: compact(ids("choiceBlocks")),
      };
    case "character":
      return { entries: compact(ids("entries")) };
    case "persona":
      return undefined;
  }
}
