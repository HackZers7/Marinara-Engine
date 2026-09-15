// ──────────────────────────────────────────────
// Service: Merge-Import — Personas
// ──────────────────────────────────────────────
//
// Applies a Marinara-native persona envelope (.marinara.json) onto an
// EXISTING persona instead of creating a new one. Fields only (no embedded
// book): the incoming file wins for every top-level field it contains, fields
// absent from the file stay as-is. Never merged from the file:
// `versioningEnabled` (a local setting) and `characterSheetImageId` (a gallery
// connection — exports strip it; the merge-restore path reassigns it from the
// restored gallery's character-sheet marker instead).
//
// Exactly ONE version snapshot (source "merge-import") is taken before any
// mutation; every write passes skipVersionSnapshot: true.

import { canonicalizeLegacyPersonaInput } from "@marinara-engine/shared";
import type { ExportEnvelope, PersonaMergeApplyResult, PersonaMergePreview } from "@marinara-engine/shared";
import type { DB } from "../../db/connection.js";
import {
  createCharactersStorage,
  type PersonaStorageRow,
  type PersonaStorageWriteFields,
} from "../storage/characters.storage.js";
import { createPersonaGalleryStorage } from "../storage/persona-gallery.storage.js";
import { encodePersonaCreate, projectPersona } from "../personas/persona-projector.js";
import {
  parseNativePersonaInput,
  restorePersonaGallery,
  restoreSprites,
  saveAvatarFromDataUrl,
} from "../import/marinara.importer.js";
import { removeUnattachedAvatarFile } from "../image/avatar-file-lifecycle.js";
import { logger } from "../../lib/logger.js";

type DataRecord = Record<string, unknown>;

/** Persona fields the merge never takes from the file. */
export const PERSONA_MERGE_EXCLUDED_FIELDS: readonly string[] = ["versioningEnabled", "characterSheetImageId"];

const PERSONA_STRING_FIELDS = [
  "comment",
  "creator",
  "phoneticName",
  "description",
  "personality",
  "scenario",
  "backstory",
  "appearance",
  "nameColor",
  "dialogueColor",
  "boxColor",
  "convoDisplayName",
  "aboutMe",
] as const;

const PERSONA_STRUCTURED_FIELDS = [
  "avatarCrop",
  "trackerCardColors",
  "personaStats",
  "tags",
  "savedStatusOptions",
  "convoBehavior",
] as const;

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string") return value;
  }
  return undefined;
}

function isRecord(value: unknown): value is DataRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** The persona payload of a native persona envelope (`data` itself). */
export function personaEnvelopePayload(envelope: ExportEnvelope): {
  data: DataRecord;
  avatar: unknown;
  sprites: unknown;
  gallery: unknown;
} {
  const data = isRecord(envelope.data) ? envelope.data : {};
  return { data, avatar: data.avatar, sprites: data.sprites, gallery: data.gallery };
}

function envelopeMediaFlags(payload: ReturnType<typeof personaEnvelopePayload>) {
  return {
    avatar: typeof payload.avatar === "string" && payload.avatar.length > 0,
    sprites: Array.isArray(payload.sprites) && payload.sprites.length > 0,
    gallery: Array.isArray(payload.gallery) && payload.gallery.length > 0,
  };
}

/** Pick only the persona fields the file actually contains (fields absent stay as-is). */
export function selectPersonaIncomingFields(incoming: DataRecord): DataRecord {
  const selected: DataRecord = {};
  if (typeof incoming.name === "string") selected.name = incoming.name;
  if (typeof incoming.versioningEnabled === "boolean") selected.versioningEnabled = incoming.versioningEnabled;
  for (const field of PERSONA_STRUCTURED_FIELDS) {
    if (incoming[field] !== undefined) selected[field] = incoming[field];
  }
  for (const field of PERSONA_STRING_FIELDS) {
    if (typeof incoming[field] === "string") selected[field] = incoming[field];
  }
  // Legacy aliases accepted by the native import path.
  const personaVersion = firstString(incoming.personaVersion, incoming.persona_version, incoming.character_version);
  if (personaVersion !== undefined) selected.personaVersion = personaVersion;
  const creatorNotes = firstString(incoming.creatorNotes, incoming.creator_notes);
  if (creatorNotes !== undefined) selected.creatorNotes = creatorNotes;
  return selected;
}

/**
 * The storage-shaped persona patch the merge would persist, run through the
 * same tolerant parse boundary as native persona imports
 * (`canonicalizeLegacyPersonaInput` → `parseNativePersonaInput` →
 * `encodePersonaCreate`). Fields absent from the file — or dropped/replaced by
 * the boundary — stay as-is.
 */
export function extractPersonaPatch(incoming: DataRecord): Partial<PersonaStorageWriteFields> {
  const candidate = canonicalizeLegacyPersonaInput(selectPersonaIncomingFields(incoming)) as DataRecord;
  const provided = new Set(Object.keys(candidate));
  const parsed = parseNativePersonaInput(candidate);
  const { name, description, extra } = encodePersonaCreate(parsed);
  const patch: DataRecord = { name, description, ...extra };
  // encodePersonaCreate defaults unspecified fields; only file-provided ones merge.
  for (const key of Object.keys(patch)) {
    if (!provided.has(key)) delete patch[key];
  }
  for (const key of PERSONA_MERGE_EXCLUDED_FIELDS) delete patch[key];
  // The import boundary replaces an invalid name with its sentinel default;
  // a merge must keep the current name instead of renaming to it.
  if (patch.name === "Imported Persona" && candidate.name !== "Imported Persona") delete patch.name;
  return patch as Partial<PersonaStorageWriteFields>;
}

/** Names of persona fields that would change if the patch were applied. */
export function diffPersonaFields(persona: PersonaStorageRow, patch: Partial<PersonaStorageWriteFields>): string[] {
  const current = persona as unknown as DataRecord;
  const incoming = patch as unknown as DataRecord;
  return Object.keys(patch).filter((key) => JSON.stringify(incoming[key]) !== JSON.stringify(current[key]));
}

// ── Preview ──

/** Build the merge preview for an existing persona. Returns null when the persona does not exist. */
export async function previewPersonaMerge(
  db: DB,
  personaId: string,
  envelope: ExportEnvelope,
): Promise<PersonaMergePreview | null> {
  const persona = await createCharactersStorage(db).getPersona(personaId);
  if (!persona) return null;

  const payload = personaEnvelopePayload(envelope);
  return {
    kind: "persona",
    fields: diffPersonaFields(persona, extractPersonaPatch(payload.data)),
    media: envelopeMediaFlags(payload),
  };
}

// ── Apply ──

/**
 * Apply a native persona envelope onto an existing persona. Returns null when
 * the persona does not exist; throws on storage failures (the route surfaces
 * them). MUST run inside the per-persona update queue.
 */
export async function applyPersonaMerge(
  db: DB,
  personaId: string,
  envelope: ExportEnvelope,
): Promise<PersonaMergeApplyResult | null> {
  const storage = createCharactersStorage(db);
  const persona = await storage.getPersona(personaId);
  if (!persona) return null;

  const payload = personaEnvelopePayload(envelope);
  const patch = extractPersonaPatch(payload.data);
  const changedFields = diffPersonaFields(persona, patch);
  const media = envelopeMediaFlags(payload);

  const willChange = changedFields.length > 0 || media.avatar || media.sprites || media.gallery;

  // Exactly ONE pre-merge snapshot of the current state.
  if (willChange && persona.versioningEnabled !== "false") {
    await storage.createPersonaVersionSnapshot(personaId, {
      source: "merge-import",
      reason: "Saved before merge import",
    });
  }

  let updated = 0;

  if (changedFields.length > 0) {
    await storage.updatePersona(personaId, patch, { skipVersionSnapshot: true });
    updated += changedFields.length;
  }

  // Media — replaced only when the file provides it.
  // ponytail: media restore is additive (importer semantics) — superseded
  // avatar/sprite/gallery files are not pruned. Upgrade path: collect the
  // owner's previous files before restore and unlink the unreferenced ones
  // afterwards via galleryFileHasReferences, as persona deletion does.
  if (media.avatar) {
    const saved = await saveAvatarFromDataUrl(payload.avatar, "persona", personaId);
    if (saved) {
      try {
        const avatarUpdated = await storage.updatePersona(
          personaId,
          { avatarPath: saved.avatarPath },
          {
            skipVersionSnapshot: true,
          },
        );
        if (!avatarUpdated) await removeUnattachedAvatarFile({ filePath: saved.filePath });
        else updated += 1;
      } catch (error) {
        await removeUnattachedAvatarFile({ filePath: saved.filePath });
        throw error;
      }
    }
  }

  if (media.sprites) {
    await restoreSprites(payload.sprites, personaId);
    updated += 1;
  }

  if (media.gallery) {
    const galleryStorage = createPersonaGalleryStorage(db);
    const characterSheetImageId = await restorePersonaGallery(payload.gallery, personaId, galleryStorage);
    if (characterSheetImageId) {
      // Mirror the native import: the restored sheet marker reassigns the
      // gallery connection, and the sheet-reference flag travels with the file.
      const useCharacterSheetAsReference =
        payload.data.useCharacterSheetAsReference === true || payload.data.useCharacterSheetAsReference === "true";
      await storage.updatePersona(
        personaId,
        { characterSheetImageId, useCharacterSheetAsReference: String(useCharacterSheetAsReference) },
        { skipVersionSnapshot: true },
      );
    }
    updated += 1;
  }

  logger.info("Merge-import applied to persona %s: %d field/media update(s)", personaId, updated);

  const row = await storage.getPersona(personaId);
  return {
    kind: "persona",
    added: 0,
    updated,
    deleted: 0,
    data: row ? { ...projectPersona(row) } : {},
  };
}
