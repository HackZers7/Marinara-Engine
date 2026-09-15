// ──────────────────────────────────────────────
// Merge Import Dialog
//
// The header control + flow for importing a Marinara-native export envelope
// (.marinara.json) ONTO the element currently open in the editor, instead of
// creating a new one. Rendered inline in each editor's header actions; renders
// the trigger button, the hidden .json file input, and — only when the preview
// reports deletion candidates — a confirmation dialog with per-collection
// checkbox groups (all pre-checked, Select all / None per group). Everything
// else (empty diff, clean add/update diff, apply, errors) resolves without
// showing a dialog: toasts for outcomes, alert dialogs for failures.
//
// Pure pieces (envelope sniffing, deletable grouping, confirmDelete assembly)
// live in lib/merge-import.ts.
// ──────────────────────────────────────────────
import { useCallback, useRef, useState } from "react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, GitMerge, Loader2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { api } from "../../lib/api-client";
import { cn } from "../../lib/utils";
import { showAlertDialog } from "../../lib/app-dialogs";
import {
  buildMergeConfirmDelete,
  mergeDeletableGroups,
  mergeHasDeletableItems,
  mergePreviewCounts,
  mergePreviewIsEmpty,
  sniffMergeEnvelope,
  type MergeConfirmGroupKey,
  type MergeConfirmSelection,
  type MergeDeletableGroup,
  type MergeImportKind,
} from "../../lib/merge-import";
import type { ExportEnvelope, MergeApplyResult, MergePreview } from "@marinara-engine/shared";

/** REST base for an element's merge endpoints (…/merge/preview, …/merge). */
const MERGE_BASE_PATHS: Record<MergeImportKind, (id: string) => string> = {
  lorebook: (id) => `/lorebooks/${id}`,
  preset: (id) => `/prompts/${id}`,
  character: (id) => `/characters/${id}`,
  // Persona routes live under the characters prefix on the server (/api/characters/personas/...).
  persona: (id) => `/characters/personas/${id}`,
};

const KIND_LABEL_KEYS: Record<MergeImportKind, string> = {
  lorebook: "ui.merge.mergeImportDialog.kindLorebook",
  preset: "ui.merge.mergeImportDialog.kindPreset",
  character: "ui.merge.mergeImportDialog.kindCharacter",
  persona: "ui.merge.mergeImportDialog.kindPersona",
};

const GROUP_LABEL_KEYS: Record<MergeConfirmGroupKey, string> = {
  entries: "ui.merge.mergeImportDialog.groupEntries",
  folders: "ui.merge.mergeImportDialog.groupFolders",
  sections: "ui.merge.mergeImportDialog.groupSections",
  groups: "ui.merge.mergeImportDialog.groupGroups",
  choiceBlocks: "ui.merge.mergeImportDialog.groupChoiceBlocks",
};

type FlowPhase = "idle" | "comparing" | "confirming" | "applying";

interface MergeImportDialogProps {
  /** Which editor the merge targets; decides the envelope type and endpoints. */
  kind: MergeImportKind;
  /** The element the merge applies onto. */
  elementId: string;
  /** Called after a successful apply, with the server's apply result. */
  onApplied: (result: MergeApplyResult) => void;
  /** Trigger icon size; match the surrounding header buttons. */
  iconSize?: string;
}

export function MergeImportDialog({ kind, elementId, onApplied, iconSize = "1rem" }: MergeImportDialogProps) {
  const { t: localizeUi } = useUiTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const applyButtonRef = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [envelope, setEnvelope] = useState<ExportEnvelope | null>(null);
  const [groups, setGroups] = useState<MergeDeletableGroup[]>([]);
  const [selection, setSelection] = useState<MergeConfirmSelection>({});
  const [summary, setSummary] = useState<{ added: number; updated: number } | null>(null);

  const resetFlow = useCallback(() => {
    setPhase("idle");
    setEnvelope(null);
    setGroups([]);
    setSelection({});
    setSummary(null);
  }, []);

  const showErrorAlert = useCallback(
    (error: unknown) => {
      void showAlertDialog({
        title: localizeUi("ui.merge.mergeImportDialog.errorTitle"),
        message:
          error instanceof Error && error.message
            ? error.message
            : localizeUi("ui.merge.mergeImportDialog.errorFallback"),
      });
    },
    [localizeUi],
  );

  const applyMerge = useCallback(
    async (pendingEnvelope: ExportEnvelope, pendingSelection: MergeConfirmSelection | undefined) => {
      setPhase("applying");
      const confirmDelete = pendingSelection ? buildMergeConfirmDelete(kind, pendingSelection) : undefined;
      const body = {
        envelope: pendingEnvelope,
        ...(confirmDelete ? { confirmDelete } : {}),
      };
      try {
        const result = await api.post<MergeApplyResult>(`${MERGE_BASE_PATHS[kind](elementId)}/merge`, body);
        toast.success(
          localizeUi("ui.merge.mergeImportDialog.appliedToast", {
            added: result.added,
            updated: result.updated,
            deleted: result.deleted,
          }),
        );
        resetFlow();
        onApplied(result);
      } catch (error) {
        resetFlow();
        showErrorAlert(error);
      }
    },
    [elementId, kind, localizeUi, onApplied, resetFlow, showErrorAlert],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setPhase("comparing");
      let parsedEnvelope: ExportEnvelope | null = null;
      try {
        parsedEnvelope = sniffMergeEnvelope(JSON.parse(await file.text()), kind);
      } catch {
        parsedEnvelope = null;
      }
      if (!parsedEnvelope) {
        resetFlow();
        void showAlertDialog({
          title: localizeUi("ui.merge.mergeImportDialog.wrongFileTitle"),
          message: localizeUi("ui.merge.mergeImportDialog.wrongFileMessage", {
            kind: localizeUi(KIND_LABEL_KEYS[kind]),
          }),
        });
        return;
      }

      try {
        const preview = await api.post<MergePreview>(`${MERGE_BASE_PATHS[kind](elementId)}/merge/preview`, {
          envelope: parsedEnvelope,
        });
        if (mergePreviewIsEmpty(preview)) {
          resetFlow();
          toast.info(localizeUi("ui.merge.mergeImportDialog.nothingToImport"));
          return;
        }
        if (!mergeHasDeletableItems(preview)) {
          await applyMerge(parsedEnvelope, undefined);
          return;
        }
        const pendingGroups = mergeDeletableGroups(preview).filter((group) => group.items.length > 0);
        setEnvelope(parsedEnvelope);
        setGroups(pendingGroups);
        setSummary(mergePreviewCounts(preview));
        // Every deletion candidate starts checked; the user unchecks to keep.
        setSelection(
          Object.fromEntries(pendingGroups.map((group) => [group.key, new Set(group.items.map((item) => item.id))])),
        );
        setPhase("confirming");
      } catch (error) {
        resetFlow();
        showErrorAlert(error);
      }
    },
    [applyMerge, elementId, kind, localizeUi, resetFlow, showErrorAlert],
  );

  const toggleItem = useCallback((groupKey: MergeConfirmGroupKey, itemId: string, checked: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev[groupKey] ?? []);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return { ...prev, [groupKey]: next };
    });
  }, []);

  const selectGroup = useCallback((groupKey: MergeConfirmGroupKey, ids: string[]) => {
    setSelection((prev) => ({ ...prev, [groupKey]: new Set(ids) }));
  }, []);

  const confirming = phase === "confirming";
  const applying = phase === "applying";
  const deletionsSelected = groups.some((group) => (selection[group.key]?.size ?? 0) > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={phase !== "idle"}
        className="mari-editor-action inline-flex disabled:cursor-not-allowed disabled:opacity-50"
        title={localizeUi("ui.merge.mergeImportDialog.title")}
        aria-label={localizeUi("ui.merge.mergeImportDialog.title")}
      >
        {phase === "comparing" || applying ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <GitMerge size={iconSize} />
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />

      <Modal
        open={confirming}
        onClose={resetFlow}
        closeDisabled={applying}
        title={localizeUi("ui.merge.mergeImportDialog.confirmTitle")}
        width="max-w-lg"
        initialFocusRef={applyButtonRef}
      >
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            {localizeUi("ui.merge.mergeImportDialog.confirmHint")}
          </p>
          <div className="rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs font-medium">
            {summary ? localizeUi("ui.merge.mergeImportDialog.summary", summary) : null}
          </div>

          {groups.map((group) => (
            <DeletableGroupSection
              key={group.key}
              label={localizeUi(GROUP_LABEL_KEYS[group.key])}
              items={group.items}
              selectedIds={selection[group.key] ?? new Set<string>()}
              onToggleItem={(itemId, checked) => toggleItem(group.key, itemId, checked)}
              onSelectAll={() =>
                selectGroup(
                  group.key,
                  group.items.map((item) => item.id),
                )
              }
              onSelectNone={() => selectGroup(group.key, [])}
            />
          ))}

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
            <button
              type="button"
              onClick={resetFlow}
              disabled={applying}
              className="rounded-lg px-4 py-2 text-xs font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] disabled:cursor-wait disabled:opacity-40"
            >
              {localizeUi("ui.merge.mergeImportDialog.cancel")}
            </button>
            <button
              type="button"
              ref={applyButtonRef}
              onClick={() => {
                if (envelope) void applyMerge(envelope, selection);
              }}
              disabled={applying}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-white transition-all disabled:cursor-wait disabled:opacity-50",
                deletionsSelected
                  ? "bg-[var(--destructive)] hover:bg-[var(--destructive)]/85"
                  : "bg-[var(--primary)] hover:bg-[var(--primary)]/85",
              )}
            >
              {applying ? <Loader2 size="0.8125rem" className="animate-spin" /> : null}
              {localizeUi("ui.merge.mergeImportDialog.apply")}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** One deletion-candidate collection: header with counts + All/None, check rows below. */
function DeletableGroupSection({
  label,
  items,
  selectedIds,
  onToggleItem,
  onSelectAll,
  onSelectNone,
}: {
  label: string;
  items: Array<{ id: string; label: string }>;
  selectedIds: ReadonlySet<string>;
  onToggleItem: (itemId: string, checked: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
}) {
  const { t: localizeUi } = useUiTranslation();
  const [expanded, setExpanded] = useState(items.length <= 8);

  return (
    <div className="rounded-lg border border-[var(--border)]">
      <div className="flex items-center gap-2.5 p-2.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {label}{" "}
          <span className="text-[var(--muted-foreground)]">
            ({selectedIds.size}/{items.length})
          </span>
        </span>
        <button
          type="button"
          onClick={onSelectAll}
          className="rounded-md px-2 py-1 text-[0.625rem] font-medium text-[var(--primary)] transition-colors hover:bg-[var(--accent)]"
        >
          {localizeUi("ui.noodle.stageprofilesourcepicker.all")}
        </button>
        <button
          type="button"
          onClick={onSelectNone}
          className="rounded-md px-2 py-1 text-[0.625rem] font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          {localizeUi("ui.game.gamesurfacecomponent.none")}
        </button>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="rounded-md px-2 py-1 text-[0.625rem] font-medium text-[var(--primary)] transition-colors hover:bg-[var(--accent)]"
        >
          {expanded
            ? localizeUi("ui.noodle.stageprofileview.hide")
            : localizeUi("ui.modals.selectableimportcategory.show")}
        </button>
      </div>

      {expanded && items.length > 0 && (
        <div className="max-h-60 space-y-1 overflow-y-auto border-t border-[var(--border)] px-2.5 py-2">
          {items.map((item) => {
            const checked = selectedIds.has(item.id);
            return (
              <label
                key={item.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--secondary)]/70",
                  checked && "bg-[var(--primary)]/6",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => onToggleItem(item.id, e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--primary)]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium">{item.label}</span>
                    {checked && (
                      <span className="shrink-0 rounded-full bg-[var(--primary)]/15 px-1.5 py-0.5 text-[0.5625rem] font-medium text-[var(--primary)]">
                        <span className="inline-flex items-center gap-1">
                          <Check size="0.5625rem" />
                          {localizeUi("ui.modals.selectableimportcategory.selected")}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
