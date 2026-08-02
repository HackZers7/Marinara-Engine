// ──────────────────────────────────────────────
// NoodleR: global schedule manager. Global scheduler settings, roster-wide
// bulk actions, and inline per-creator schedule editing (cadence, images,
// reschedule, run-now) — no navigation away from the modal.
// ──────────────────────────────────────────────
import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { Modal } from "../ui/Modal";
import { Avatar, getNoodleAccentStyle, NOODLE_PINK } from "./NoodleShell";
import { NOODLE_AUTO_POST_INTENSITIES, summarizeRefreshOutcomes } from "./noodle-auto-post";
import {
  useNoodle,
  useNoodlerAccounts,
  useRefreshAllNoodlerCreatorsNow,
  useRescheduleNoodlerAutoPost,
  useRunNoodlerAutoPostNow,
  useUpdateNoodleSettings,
  useUpdateNoodlerAutoPosting,
} from "../../hooks/use-noodle";
import type { NoodleAutoPostingIntensity } from "@marinara-engine/shared";
import { toast } from "sonner";
import { useTranslation as useUiTranslation } from "react-i18next";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function NoodlerScheduleManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t: localizeUi } = useUiTranslation();
  const { data } = useNoodle();
  const settings = data?.settings;
  const accountsQuery = useNoodlerAccounts(data?.settings.enableNoodler === true);
  const creators = accountsQuery.data ?? [];
  const updateSettings = useUpdateNoodleSettings();
  const updateAutoPosting = useUpdateNoodlerAutoPosting();
  const rescheduleAutoPost = useRescheduleNoodlerAutoPost();
  const runAutoPostNow = useRunNoodlerAutoPostNow();
  const refreshAllNow = useRefreshAllNoodlerCreatorsNow();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rescheduleDraft, setRescheduleDraft] = useState("");

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkAutoPosting = async (patch: { enabled?: boolean; intensity?: NoodleAutoPostingIntensity }) => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : creators.map((profile) => profile.id);
    if (ids.length === 0) return;
    // Independent PATCHes can partially commit, so summarize settled results instead of
    // reporting a blanket failure when only some siblings reject.
    const results = await Promise.allSettled(
      ids.map((accountId) => updateAutoPosting.mutateAsync({ accountId, ...patch })),
    );
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed === 0) return;
    if (failed === ids.length) {
      toast.error(localizeUi("ui.noodle.stageprofileview.couldNotUpdateAutomaticPosting"));
    } else {
      toast.error(localizeUi("ui.noodle.noodlerschedulemanagermodal.updatedValue1OfValue2Value3Failed", { value1: ids.length - failed, value2: ids.length, value3: failed }));
    }
  };

  const automatingCount = creators.filter((profile) => profile.autoPosting.enabled).length;
  const scheduleEnabled = settings?.autoPostingScheduleEnabled ?? true;
  const defaultIntensity = settings?.autoPostingDefaultIntensity ?? 1;
  const defaultIntensityLabel =
    NOODLE_AUTO_POST_INTENSITIES.find((option) => option.value === defaultIntensity)?.label ?? "Low";
  const selectedCount = selectedIds.size;
  // Membership, not count: polling can swap a selected creator for another of the same
  // roster length, which would falsely read as "all selected".
  const allSelected = creators.length > 0 && creators.every((profile) => selectedIds.has(profile.id));
  const bulkBusy = updateAutoPosting.isPending;

  const saveSettings = (patch: { autoPostingScheduleEnabled?: boolean; autoPostingDefaultIntensity?: NoodleAutoPostingIntensity }) => {
    updateSettings.mutate(patch, { onError: (error) => toast.error(errorMessage(error,localizeUi("ui.noodle.noodlerschedulemanagermodal.couldNotUpdateSettings"))) });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={localizeUi("ui.noodle.noodlerschedulemanagermodal.noodlerSchedules")}
      width="max-w-2xl"
      panelStyle={getNoodleAccentStyle(NOODLE_PINK)}
    >
      <div className="space-y-3">
        <details className="group rounded-lg bg-[var(--secondary)] ring-1 ring-[var(--border)]" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3">
            <span className="text-sm font-semibold">{localizeUi("ui.noodle.noodlerschedulemanagermodal.globalSettings")}</span>
            <span className="flex items-center gap-2 text-[0.625rem] font-medium">
              <span className="rounded-full px-2 py-1 ring-1 ring-[var(--border)] text-[var(--muted-foreground)]">
                {scheduleEnabled ?localizeUi("ui.game.gameinput.on") :localizeUi("ui.panels.appearancesettings.off")} · {defaultIntensityLabel} · {automatingCount} {localizeUi("ui.noodle.noodlerschedulemanagermodal.automating")}</span>
              <ChevronDown size={14} className="text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="space-y-3 border-t border-[var(--border)] p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{localizeUi("ui.noodle.noodlerschedulemanagermodal.automaticPostingSchedule")}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {scheduleEnabled ?localizeUi("ui.noodle.noodlerschedulemanagermodal.creatorsPostOnTheirSchedule") :localizeUi("ui.noodle.noodlerschedulemanagermodal.pausedGloballyNoAutomaticPosts")}
                </span>
              </span>
              <input
                type="checkbox"
                checked={scheduleEnabled}
                disabled={updateSettings.isPending}
                onChange={(event) => saveSettings({ autoPostingScheduleEnabled: event.target.checked })}
                className="h-5 w-5 shrink-0 accent-[var(--noodle-accent)]"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold">{localizeUi("ui.noodle.noodlerschedulemanagermodal.defaultCadence")}</span>
              {NOODLE_AUTO_POST_INTENSITIES.map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  disabled={updateSettings.isPending}
                  onClick={() => saveSettings({ autoPostingDefaultIntensity: value })}
                  className={cn(
                    "h-8 rounded-full px-3 text-xs font-semibold ring-1 transition-colors disabled:opacity-40",
                    defaultIntensity === value
                      ? "bg-[var(--noodle-accent)] text-zinc-950 ring-transparent"
                      : "bg-[var(--background)] text-[var(--foreground)] ring-[var(--border)] hover:bg-[var(--accent)]",
                  )}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                disabled={refreshAllNow.isPending}
                onClick={() =>
                  refreshAllNow.mutate(undefined, {
                    onSuccess: ({ outcomes }) => {
                      const { ok, key, params } = summarizeRefreshOutcomes(outcomes);
                      (ok ? toast.success : toast.error)(localizeUi(key, params));
                    },
                    onError: (error) => toast.error(errorMessage(error,localizeUi("ui.noodle.noodlerschedulemanagermodal.couldNotRefreshCreators"))),
                  })
                }
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--background)] px-3 text-xs font-semibold ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--accent)] disabled:opacity-40"
              >
                <RefreshCw size={13} className={refreshAllNow.isPending ? "animate-spin" : undefined} />{localizeUi("ui.noodle.noodlerschedulemanagermodal.refreshAllNow")}</button>
            </div>
          </div>
        </details>

        {creators.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--secondary)] p-3 ring-1 ring-[var(--border)]">
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) =>
                  setSelectedIds(event.target.checked ? new Set(creators.map((profile) => profile.id)) : new Set())
                }
                className="h-4 w-4 accent-[var(--noodle-accent)]"
              />
              {selectedCount > 0 ?localizeUi("ui.agents.regexscripteditor.value1Selected", { value1: selectedCount }) :localizeUi("lorebook.editor.batch.selectAll")}
            </label>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void applyBulkAutoPosting({ enabled: true })}
                className="h-8 rounded-full bg-[var(--background)] px-3 text-xs font-semibold ring-1 ring-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-40"
              >
                {selectedCount > 0 ?localizeUi("ui.noodle.noodlerschedulemanagermodal.enableSelected") :localizeUi("ui.noodle.noodlerschedulemanagermodal.enableAll")}
              </button>
              <button
                type="button"
                disabled={bulkBusy}
                onClick={() => void applyBulkAutoPosting({ enabled: false })}
                className="h-8 rounded-full bg-[var(--background)] px-3 text-xs font-semibold ring-1 ring-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-40"
              >
                {selectedCount > 0 ?localizeUi("ui.noodle.noodlerschedulemanagermodal.pauseSelected") :localizeUi("ui.noodle.noodlerschedulemanagermodal.pauseAll")}
              </button>
              {selectedCount > 0 &&
                NOODLE_AUTO_POST_INTENSITIES.map(({ label, value }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={bulkBusy}
                    onClick={() => void applyBulkAutoPosting({ intensity: value })}
                    className="h-8 rounded-full bg-[var(--background)] px-3 text-xs font-semibold ring-1 ring-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-40"
                    title={localizeUi("ui.noodle.noodlerschedulemanagermodal.setCadenceToValue1", { value1: label })}
                  >
                    {label}
                  </button>
                ))}
            </div>
          </div>
        )}

        {creators.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">{localizeUi("ui.noodle.noodlerschedulemanagermodal.noCreatorsYetAddSomeFromTheNoodlerHub")}</p>
        ) : (
          <div className="space-y-2">
            {creators.map((profile) => {
              const auto = profile.autoPosting;
              const selected = selectedIds.has(profile.id);
              const expanded = expandedId === profile.id;
              return (
                <div key={profile.id} className="rounded-lg bg-[var(--secondary)] ring-1 ring-[var(--border)]">
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelection(profile.id)}
                      aria-label={localizeUi("ui.noodle.noodlerschedulemanagermodal.selectValue1", { value1: profile.displayName })}
                      className="h-4 w-4 shrink-0 accent-[var(--noodle-accent)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(expanded ? null : profile.id);
                        setRescheduleDraft("");
                      }}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Avatar account={profile} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{profile.displayName}</span>
                        <span className="block truncate text-xs text-[var(--muted-foreground)]">@{profile.handle}</span>
                      </span>
                    </button>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[0.625rem] font-medium ring-1 ring-[var(--border)]",
                        auto.enabled
                          ? "bg-[var(--noodle-accent)]/12 text-[var(--noodle-accent)]"
                          : "bg-[var(--background)] text-[var(--muted-foreground)]",
                      )}
                    >
                      {auto.enabled
                        ? auto.nextRunAt
                          ?localizeUi("ui.noodle.noodlerschedulemanagermodal.nextValue1", { value1: new Date(auto.nextRunAt).toLocaleString() })
                          :localizeUi("ui.noodle.noodlerschedulemanagermodal.scheduling")
                        :localizeUi("ui.noodle.noodlerschedulemanagermodal.paused")}
                    </span>
                    <label className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold">{auto.enabled ?localizeUi("ui.game.gameinput.on") :localizeUi("ui.panels.appearancesettings.off")}</span>
                      <input
                        type="checkbox"
                        checked={auto.enabled}
                        disabled={updateAutoPosting.isPending}
                        onChange={(event) =>
                          updateAutoPosting.mutate(
                            { accountId: profile.id, enabled: event.target.checked },
                            { onError: (error) => toast.error(errorMessage(error,localizeUi("ui.noodle.stageprofileview.couldNotUpdateAutomaticPosting"))) },
                          )
                        }
                        className="h-5 w-5 accent-[var(--noodle-accent)]"
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={expanded ?localizeUi("ui.noodle.noodlerschedulemanagermodal.collapseSchedule") :localizeUi("ui.noodle.noodlerschedulemanagermodal.expandSchedule")}
                      aria-expanded={expanded}
                      onClick={() => {
                        setExpandedId(expanded ? null : profile.id);
                        setRescheduleDraft("");
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                    >
                      <ChevronDown size={15} className={cn("transition-transform", expanded && "rotate-180")} />
                    </button>
                  </div>
                  {expanded && (
                    <fieldset
                      disabled={!auto.enabled || updateAutoPosting.isPending}
                      className="space-y-3 border-t border-[var(--border)] p-3 disabled:opacity-50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {NOODLE_AUTO_POST_INTENSITIES.map(({ label, value }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              updateAutoPosting.mutate(
                                { accountId: profile.id, intensity: value },
                                { onError: (error) => toast.error(errorMessage(error,localizeUi("ui.noodle.stageprofileview.couldNotUpdateCadence"))) },
                              )
                            }
                            className={cn(
                              "h-8 flex-1 rounded-full px-3 text-xs font-semibold ring-1 transition-colors",
                              auto.intensity === value
                                ? "bg-[var(--noodle-accent)] text-zinc-950 ring-transparent"
                                : "bg-[var(--background)] text-[var(--foreground)] ring-[var(--border)] hover:bg-[var(--accent)]",
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 ring-1 ring-[var(--border)]">
                        <span className="text-xs font-semibold">{localizeUi("ui.noodle.stageprofileview.generateAnImageWithPosts")}</span>
                        <input
                          type="checkbox"
                          checked={auto.imagesEnabled}
                          onChange={(event) =>
                            updateAutoPosting.mutate(
                              { accountId: profile.id, imagesEnabled: event.target.checked },
                              { onError: (error) => toast.error(errorMessage(error,localizeUi("ui.noodle.stageprofileview.couldNotUpdateImageGeneration"))) },
                            )
                          }
                          className="h-4 w-4 accent-[var(--noodle-accent)]"
                        />
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="datetime-local"
                          value={rescheduleDraft}
                          onChange={(event) => setRescheduleDraft(event.target.value)}
                          className="h-9 min-w-0 flex-1 rounded-md bg-[var(--background)] px-2 text-xs ring-1 ring-[var(--border)]"
                        />
                        <button
                          type="button"
                          disabled={!rescheduleDraft || rescheduleAutoPost.isPending}
                          onClick={() => {
                            const next = new Date(rescheduleDraft);
                            if (Number.isNaN(next.getTime()) || next.getTime() <= Date.now()) {
                              toast.error(localizeUi("ui.noodle.stageprofileview.pickAFutureDateAndTimeToReschedule"));
                              return;
                            }
                            rescheduleAutoPost.mutate(
                              { accountId: profile.id, nextRunAt: next.toISOString() },
                              {
                                onSuccess: () => setRescheduleDraft(""),
                                onError: (error) => toast.error(errorMessage(error,localizeUi("ui.noodle.stageprofileview.couldNotRescheduleTheNextPost"))),
                              },
                            );
                          }}
                          className="h-9 shrink-0 rounded-full px-3 text-xs font-semibold ring-1 ring-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50"
                        >{localizeUi("ui.noodle.stageprofileview.reschedule")}</button>
                      </div>
                      <button
                        type="button"
                        disabled={runAutoPostNow.isPending}
                        onClick={() =>
                          runAutoPostNow.mutate(profile.id, {
                            onError: (error) => toast.error(errorMessage(error,localizeUi("ui.noodle.noodlerschedulemanagermodal.couldNotRunAPostNow"))),
                          })
                        }
                        className="h-9 w-full rounded-full px-3 text-xs font-semibold ring-1 ring-[var(--border)] hover:bg-[var(--accent)] disabled:opacity-50"
                      >
                        {runAutoPostNow.isPending ?localizeUi("ui.noodle.stageprofileview.running") :localizeUi("ui.noodle.stageprofileview.runNow")}
                      </button>
                    </fieldset>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
