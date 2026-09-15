import { memo, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useAgentStore, type AgentTrackEntry, type AgentTrackStatus } from "../../stores/agent.store";
import {
  AGENT_TRACK_KEYFRAMES,
  MAIN_GENERATION_AGENT_TYPE,
  STATUS_COLORS,
  STATUS_RINGS,
  TRANSLATION_AGENT_TYPE,
  renderAgentAnimation,
} from "./agent-track-animations";
import { AgentTrackResultPopup } from "./AgentTrackResultPopup";
import { useTranslation as useUiTranslation } from "react-i18next";

// Re-exported for use-generate.ts, which emits track entries for the two
// virtual agents. The canonical definitions now live in the animations module.
export { MAIN_GENERATION_AGENT_TYPE, TRANSLATION_AGENT_TYPE };

// Virtual phases position pseudo-agents (main-response generation,
// auto-translation) between real agent phases. The main-response runs
// concurrently with the parallel phase on the server, but rendering it
// right after the parallel batch keeps the row readable left-to-right:
// pre-gen → parallel → main response → post-processing → translation.
const PHASE_ORDER: Record<string, number> = {
  pre_generation: 0,
  parallel: 1,
  main_generation: 1.5,
  post_processing: 2,
  translation: 3,
};

// ──────────────────────────────────────────────
// Single agent widget
// ──────────────────────────────────────────────

interface AgentTrackWidgetProps {
  entry: AgentTrackEntry;
}

const AgentTrackWidget = memo(function AgentTrackWidget({ entry }: AgentTrackWidgetProps) {
  const { t: localizeUi } = useUiTranslation();
  const { agentType, agentName, status } = entry;
  const color = STATUS_COLORS[status];
  const ringColor = STATUS_RINGS[status];
  const isDone = status === "completed" || status === "failed";

  // Settled widgets open the rich result popup (hover, or click to pin —
  // the only pointer gesture on touch); running/queued keep the simple tooltip.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const popupPanelRef = useRef<HTMLDivElement | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const closePopup = useCallback(() => {
    setPopupOpen(false);
    setPinned(false);
  }, []);
  const showTip = useCallback(() => {
    if (isDone) {
      setPopupOpen(true);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTipPos({ left: rect.left + rect.width / 2, top: rect.top });
  }, [isDone]);
  // Hover-out closes only when the pointer is not travelling into the
  // portalled popup panel — otherwise its buttons would be unreachable.
  const handleLeave = useCallback(
    (event: { relatedTarget: EventTarget | null }) => {
      if (event.relatedTarget instanceof Node && popupPanelRef.current?.contains(event.relatedTarget)) return;
      if (!pinned) {
        setTipPos(null);
        setPopupOpen(false);
      }
    },
    [pinned],
  );
  const handleBlur = useCallback(() => {
    if (!pinned) {
      setTipPos(null);
      setPopupOpen(false);
    }
  }, [pinned]);
  const togglePin = useCallback(() => {
    if (!isDone) return;
    setPinned((current) => {
      const next = !current;
      if (next) setPopupOpen(true);
      else closePopup();
      return next;
    });
  }, [isDone, closePopup]);

  return (
    <motion.div
      ref={anchorRef}
      layout
      initial={{ opacity: 0, scale: 0.5, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`relative flex shrink-0 flex-col items-center ${isDone ? "cursor-pointer" : ""}`}
      onMouseEnter={showTip}
      onMouseLeave={handleLeave}
      onFocus={showTip}
      onBlur={handleBlur}
      onClick={togglePin}
      title={
        isDone
          ? undefined
          : localizeUi("ui.agents.agenttrackwidget.value1Value2", { value1: agentName, value2: status })
      }
    >
      {tipPos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--secondary)] px-2 py-1 text-xs font-medium text-[var(--foreground)] shadow-md"
            style={{ left: tipPos.left, top: tipPos.top - 6 }}
          >
            <span className="font-semibold">{agentName}</span>
            <span className="ml-1 text-[var(--muted-foreground)]">· {status}</span>
          </div>,
          document.body,
        )}

      {popupOpen && isDone && (
        <AgentTrackResultPopup
          entry={entry}
          anchor={anchorRef.current}
          panelRef={popupPanelRef}
          pinned={pinned}
          onClose={closePopup}
        />
      )}

      {/* Circular widget — 44px outer */}
      <div
        className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors duration-300"
        style={{
          borderColor: color,
          backgroundColor: ringColor,
          boxShadow: status === "running" ? `0 0 8px ${color}40` : "none",
          overflow: "hidden",
        }}
      >
        {isDone ? (
          <span className="flex items-center justify-center text-lg font-bold" style={{ color }}>
            {status === "completed" ? "✓" : "✗"}
          </span>
        ) : (
          <div className="at-anim absolute inset-0">{renderAgentAnimation(agentType, status, color)}</div>
        )}
      </div>
    </motion.div>
  );
});

// ──────────────────────────────────────────────
// Batch cluster — visually groups widgets that share a single LLM request
// ──────────────────────────────────────────────

interface AgentTrackBatchClusterProps {
  entries: AgentTrackEntry[];
}

const AgentTrackBatchCluster = memo(function AgentTrackBatchCluster({ entries }: AgentTrackBatchClusterProps) {
  const { t: localizeUi } = useUiTranslation();
  // Pick the dominant status colour so the container tracks the batch state.
  // Priority: failed > running > queued > completed. This mirrors how a user
  // reads the batch: any failure surfaces, otherwise show progress, finally
  // green when the whole batch settled.
  const dominantStatus: AgentTrackStatus = useMemo(() => {
    if (entries.some((e) => e.status === "failed")) return "failed";
    if (entries.some((e) => e.status === "running")) return "running";
    if (entries.some((e) => e.status === "queued")) return "queued";
    return "completed";
  }, [entries]);

  const borderColor = STATUS_COLORS[dominantStatus];

  // Very translucent fill in the border colour so the cluster reads as a
  // single "capsule" without competing with the widgets themselves.
  // Uses color-mix so it works with both hex colors and CSS variables
  // (STATUS_COLORS is a var() reference).
  const fillColor = `color-mix(in srgb, ${borderColor} 10%, transparent)`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="relative mt-2 flex shrink-0 items-center gap-2 rounded-xl border-2 border-dashed px-2 pt-2.5 pb-1.5"
      style={{ borderColor, backgroundColor: fillColor }}
      title={localizeUi("ui.agents.agenttrackbatchcluster.batchedLlmRequestValue1Agents", { value1: entries.length })}
    >
      <span
        className="pointer-events-none absolute -top-2 left-2 whitespace-nowrap rounded-sm border px-1 text-[0.55rem] font-semibold uppercase tracking-wider"
        style={{
          color: borderColor,
          borderColor,
          backgroundColor: "var(--background)",
        }}
      >
        {localizeUi("ui.agents.agenttrackbatchcluster.batch")}
        {entries.length}
      </span>
      {entries.map((entry) => (
        <AgentTrackWidget key={`${entry.phase}-${entry.agentType}-${entry.order}`} entry={entry} />
      ))}
    </motion.div>
  );
});

// ──────────────────────────────────────────────
// Track bar
// ──────────────────────────────────────────────

export function AgentTrackBar({ chatId }: { chatId: string }) {
  const { t: localizeUi } = useUiTranslation();
  const agentTrackQueue = useAgentStore((s) => s.agentTrackQueue);
  const agentTrackChatId = useAgentStore((s) => s.agentTrackChatId);
  const agentTrackHidden = useAgentStore((s) => s.agentTrackHidden);
  const setAgentTrackHidden = useAgentStore((s) => s.setAgentTrackHidden);

  const sorted = useMemo(() => {
    // Compute a stable group key per entry: agents sharing a batchId land in
    // the same key, solo agents get a unique key. The group's position in
    // the row is anchored by the minimum `order` among its members, so a
    // batch keeps the slot its first-declared member would have occupied.
    const groupAnchor = new Map<string, number>();
    const keyOf = (entry: AgentTrackEntry) => (entry.batchId ? `batch:${entry.batchId}` : `solo:${entry.order}`);
    for (const entry of agentTrackQueue) {
      const key = keyOf(entry);
      const existing = groupAnchor.get(key);
      if (existing === undefined || entry.order < existing) {
        groupAnchor.set(key, entry.order);
      }
    }
    return [...agentTrackQueue].sort((a, b) => {
      const phaseA = PHASE_ORDER[a.phase] ?? 3;
      const phaseB = PHASE_ORDER[b.phase] ?? 3;
      if (phaseA !== phaseB) return phaseA - phaseB;
      const anchorA = groupAnchor.get(keyOf(a)) ?? a.order;
      const anchorB = groupAnchor.get(keyOf(b)) ?? b.order;
      if (anchorA !== anchorB) return anchorA - anchorB;
      return a.order - b.order;
    });
  }, [agentTrackQueue]);

  // Group consecutive widgets that share a batchId — they fulfill a single
  // LLM request, so we render them inside a shared outlined container.
  // Standalone widgets (batchId=null or a batch of one) are just passed
  // through as solo items.
  const clusters = useMemo(() => {
    type Cluster =
      | { kind: "solo"; entry: AgentTrackEntry }
      | { kind: "batch"; batchId: string; entries: AgentTrackEntry[] };
    const out: Cluster[] = [];
    for (const entry of sorted) {
      if (entry.batchId) {
        const last = out[out.length - 1];
        if (last && last.kind === "batch" && last.batchId === entry.batchId) {
          last.entries.push(entry);
          continue;
        }
        out.push({ kind: "batch", batchId: entry.batchId, entries: [entry] });
        continue;
      }
      out.push({ kind: "solo", entry });
    }
    // Batches of one degrade to solo — a single agent in "its own batch"
    // shouldn't render a container.
    return out.map((c) =>
      c.kind === "batch" && c.entries.length === 1 ? ({ kind: "solo", entry: c.entries[0]! } as const) : c,
    );
  }, [sorted]);

  const completed = sorted.filter((e) => e.status === "completed" || e.status === "failed").length;
  const total = sorted.length;
  const allDone = total > 0 && completed === total;
  const ownsChat = agentTrackChatId === chatId;
  // The bar stays until the user hides it with the chevron; a new queue
  // un-hides it (setAgentTrackQueue resets the flag).
  const visible = ownsChat && agentTrackQueue.length > 0 && !agentTrackHidden;

  // Re-showing a manually hidden bar when the queue has already been cleared
  // (chat switch, replaced turn) has nothing to expand — say so and keep the stub.
  const handleShow = useCallback(() => {
    if (useAgentStore.getState().agentTrackQueue.length > 0) setAgentTrackHidden(false);
    else toast.info(localizeUi("ui.agents.agenttrackbar.nothingToShow"));
  }, [setAgentTrackHidden, localizeUi]);

  return (
    <>
      <style>{AGENT_TRACK_KEYFRAMES}</style>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="track-bar"
            initial={{ height: 0, opacity: 0, y: 40 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 40 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 overflow-hidden border-t border-[var(--border)]/40 px-3 py-1.5"
          >
            <div className="flex shrink-0 flex-col items-center pr-1">
              <span className="text-[0.625rem] font-bold text-[var(--foreground)]">
                {completed}/{total}
              </span>
              <span className="text-[0.5rem] text-[var(--muted-foreground)]">
                {localizeUi("ui.agents.agenttrackbar.agents")}
              </span>
            </div>

            <div className="h-8 w-px shrink-0 bg-[var(--border)]/40" />

            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              <AnimatePresence mode="popLayout">
                {clusters.map((cluster) => {
                  if (cluster.kind === "solo") {
                    const e = cluster.entry;
                    return <AgentTrackWidget key={`${e.phase}-${e.agentType}-${e.order}`} entry={e} />;
                  }
                  return <AgentTrackBatchCluster key={`batch-${cluster.batchId}`} entries={cluster.entries} />;
                })}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={() => setAgentTrackHidden(true)}
              aria-label={localizeUi("ui.agents.agenttrackbar.hide")}
              title={localizeUi("ui.agents.agenttrackbar.hide")}
              className="ml-1 shrink-0 rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--secondary)] hover:text-[var(--foreground)] active:scale-90"
            >
              <ChevronDown size="0.875rem" />
            </button>
          </motion.div>
        )}
        {ownsChat && agentTrackHidden && (
          <motion.div
            key="track-bar-stub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center px-3 py-1"
          >
            <button
              type="button"
              onClick={handleShow}
              aria-label={localizeUi("ui.agents.agenttrackbar.show")}
              title={localizeUi("ui.agents.agenttrackbar.show")}
              className="flex h-7 w-7 items-center justify-center rounded-full border-2 bg-[var(--secondary)] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] active:scale-90"
              style={{ borderColor: allDone ? STATUS_COLORS.completed : STATUS_COLORS.running }}
            >
              <ChevronUp size="0.875rem" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
