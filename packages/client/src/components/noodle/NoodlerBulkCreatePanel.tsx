// ──────────────────────────────────────────────
// NoodleR: bulk-create stage profiles from eligible public accounts.
// Mounted in the NoodleR hub right sidebar and (in a Modal) from settings.
// ──────────────────────────────────────────────
import { useState } from "react";
import { Check, Loader2, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import type { NoodleIdentityDisclosure } from "@marinara-engine/shared";
import { cn } from "../../lib/utils";
import { useBulkCreateNoodlerStageProfiles, useNoodlerEligibleAccounts } from "../../hooks/use-noodle";
import { Modal } from "../ui/Modal";
import { getNoodleAccentStyle, NOODLE_PINK } from "./NoodleShell";
import { useTranslation as useUiTranslation } from "react-i18next";

const DISCLOSURE_CHOICES: { value: NoodleIdentityDisclosure; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "hinted", label: "Hinted" },
  { value: "secret", label: "Secret" },
];

const eyebrowClass = "text-[0.625rem] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]";

function NoodlerBulkCreatePanel() {
  const { t: localizeUi } = useUiTranslation();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "character" | "persona">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [disclosureMode, setDisclosureMode] = useState<NoodleIdentityDisclosure>("hinted");

  const eligibleQuery = useNoodlerEligibleAccounts(search, kind);
  const bulkCreate = useBulkCreateNoodlerStageProfiles();

  const accounts = eligibleQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Derive "all selected" from membership of the currently-visible accounts, not counts —
  // a size match can be true while the visible account is unchecked (stale filter selection).
  const allVisibleSelected = accounts.length > 0 && accounts.every((a) => selected.has(a.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of accounts) {
        if (allVisibleSelected) next.delete(a.id);
        else next.add(a.id);
      }
      return next;
    });
  };

  const create = () => {
    bulkCreate.mutate(
      { noodleAccountIds: Array.from(selected), disclosureMode },
      {
        // Keep the selection on failure so the user can retry.
        onSuccess: () => setSelected(new Set()),
        onError: (error) =>
          toast.error(error instanceof Error ? error.message :localizeUi("ui.noodle.noodlerbulkcreatepanel.couldNotCreateCreators")),
      },
    );
  };

  return (
    <div className="rounded-lg ring-1 ring-[var(--border)] bg-[var(--secondary)] p-3">
      <div className="flex items-center gap-2">
        <Users size={15} className="shrink-0 text-[var(--noodle-accent)]" />
        <p className={eyebrowClass}>{localizeUi("ui.noodle.noodlerbulkcreatepanel.bulkCreateCreators")}</p>
      </div>
      <label className="relative mt-2.5 block">
        <Search size={14} className="absolute left-2.5 top-2.5 !text-[var(--noodle-accent)]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={localizeUi("ui.noodle.noodlerbulkcreatepanel.searchAccounts")}
          className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--background)] pl-8 pr-2 text-xs text-[var(--foreground)] outline-none transition-colors focus:border-[var(--noodle-accent)]"
        />
      </label>
      <div className="mt-2 grid grid-cols-3 rounded-md ring-1 ring-[var(--border)] p-0.5" aria-label={localizeUi("ui.noodle.noodlerbulkcreatepanel.filterByKind")}>
        {(["all", "character", "persona"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
            className={cn(
              "h-7 rounded px-1.5 text-[0.68rem] font-semibold capitalize",
              kind === option
                ? "bg-[var(--noodle-accent)] text-zinc-950"
                : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
            )}
          >
            {option === "all" ?localizeUi("ui.noodle.stageprofilesourcepicker.all") : option}
          </button>
        ))}
      </div>

      {eligibleQuery.isLoading ? (
        <div className="mt-3 flex items-center justify-center gap-2 py-6 text-xs text-[var(--muted-foreground)]">
          <Loader2 size={14} className="animate-spin" /> {localizeUi("ui.characters.characterlibraryview.loading")}</div>
      ) : eligibleQuery.isError ? (
        <div className="mt-3 flex flex-col items-center gap-2 py-6 text-center text-xs text-[var(--muted-foreground)]">
          <span>{localizeUi("ui.noodle.noodlerbulkcreatepanel.couldNotLoadEligibleAccounts")}</span>
          <button
            type="button"
            onClick={() => void eligibleQuery.refetch()}
            className="rounded-md px-2 py-1 font-semibold text-[var(--noodle-accent)] hover:underline"
          >{localizeUi("game.characterSheet.regenerate.label")}</button>
        </div>
      ) : accounts.length === 0 ? (
        <p className="mt-3 py-4 text-center text-xs text-[var(--muted-foreground)]">{localizeUi("ui.noodle.noodlerbulkcreatepanel.noEligibleAccountsRemainEveryAccountAlreadyHasA")}</p>
      ) : (
        <>
          <div className="mt-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={toggleAll}
              className="text-[0.68rem] font-semibold text-[var(--noodle-accent)] hover:underline"
            >
              {allVisibleSelected ?localizeUi("ui.noodle.noodlerbulkcreatepanel.deselectAll") :localizeUi("lorebook.editor.batch.selectAll")}
            </button>
            <span className="text-[0.68rem] text-[var(--muted-foreground)]">{selected.size} {localizeUi("ui.agents.agenteditor.selected")}</span>
          </div>
          <div className="mt-1.5 max-h-56 divide-y divide-[var(--border)] overflow-y-auto rounded-md ring-1 ring-[var(--border)]">
            {accounts.map((account) => {
              const checked = selected.has(account.id);
              return (
                <button
                  key={account.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggle(account.id)}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--accent)]"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked ? "border-[var(--noodle-accent)] bg-[var(--noodle-accent)]" : "border-[var(--border)]",
                    )}
                  >
                    {checked && <Check size={11} className="text-zinc-950" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{account.displayName}</span>
                    <span className="block truncate text-[0.68rem] text-[var(--muted-foreground)]">
                      @{account.handle}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {eligibleQuery.hasNextPage && (
            <button
              type="button"
              onClick={() => void eligibleQuery.fetchNextPage()}
              disabled={eligibleQuery.isFetchingNextPage}
              className="mt-1.5 flex h-7 w-full items-center justify-center gap-1.5 rounded-md ring-1 ring-[var(--border)] text-[0.68rem] font-semibold hover:bg-[var(--accent)] disabled:opacity-50"
            >
              {eligibleQuery.isFetchingNextPage && <Loader2 size={12} className="animate-spin" />}{localizeUi("ui.gameAssets.assetgrid.loadMore")}</button>
          )}

          <fieldset className="mt-3">
            <legend className={eyebrowClass}>{localizeUi("ui.noodle.wizard.disclosure")}</legend>
            <div className="mt-1.5 grid grid-cols-3 rounded-md ring-1 ring-[var(--border)] p-0.5">
              {DISCLOSURE_CHOICES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={disclosureMode === option.value}
                  onClick={() => setDisclosureMode(option.value)}
                  className={cn(
                    "h-7 rounded px-1.5 text-[0.68rem] font-semibold",
                    disclosureMode === option.value
                      ? "bg-[var(--noodle-accent)] text-zinc-950"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            onClick={create}
            disabled={selected.size === 0 || bulkCreate.isPending}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-md bg-[var(--noodle-accent)] text-xs font-bold text-zinc-950 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkCreate.isPending && <Loader2 size={13} className="animate-spin" />}
            {selected.size === 0
              ?localizeUi("ui.noodle.noodlerbulkcreatepanel.createCreatorsPaused")
              :localizeUi("ui.noodle.noodlerbulkcreatepanel.createValue1CreatorValue2Paused", { value1: selected.size, value2: selected.size === 1 ? "" :localizeUi("ui.noodle.stageprofileview.s") })}
          </button>
        </>
      )}
    </div>
  );
}

export function NoodlerBulkCreateButton({ label = "Bulk-create creators" }: { label?: string }) {
  const { t: localizeUi } = useUiTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--noodle-accent)]/40 bg-[var(--noodle-accent)]/10 px-3 text-xs font-semibold text-[var(--noodle-accent)] transition-colors hover:bg-[var(--noodle-accent)]/15"
      >
        <Plus size={15} className="!text-[var(--noodle-accent)]" />
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={localizeUi("ui.noodle.noodlerbulkcreatepanel.bulkCreateCreators")}
        width="max-w-md"
        panelStyle={getNoodleAccentStyle(NOODLE_PINK)}
      >
        <NoodlerBulkCreatePanel />
      </Modal>
    </>
  );
}
