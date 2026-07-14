import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAgentStore, type AgentTrackEntry, type AgentTrackStatus } from "../../stores/agent.store";
import {
  AGENT_TRACK_KEYFRAMES,
  MAIN_GENERATION_AGENT_TYPE,
  TRANSLATION_AGENT_TYPE,
  renderAgentAnimation,
} from "./agent-track-animations";

// Re-exported for use-generate.ts, which emits track entries for the two
// virtual agents. The canonical definitions now live in the animations module.
export { MAIN_GENERATION_AGENT_TYPE, TRANSLATION_AGENT_TYPE };

// ──────────────────────────────────────────────
// Status colours
// ──────────────────────────────────────────────
const STATUS_COLORS: Record<AgentTrackStatus, string> = {
  queued: "var(--marinara-agent-track-queued, #a78bfa)",
  running: "var(--marinara-agent-track-running, #60a5fa)",
  completed: "var(--marinara-agent-track-completed, #34d399)",
  failed: "var(--marinara-agent-track-failed, #f87171)",
};

const STATUS_RINGS: Record<AgentTrackStatus, string> = {
  queued: "var(--marinara-agent-track-queued-ring, rgba(167,139,250,0.2))",
  running: "var(--marinara-agent-track-running-ring, rgba(96,165,250,0.25))",
  completed: "var(--marinara-agent-track-completed-ring, rgba(52,211,153,0.2))",
  failed: "var(--marinara-agent-track-failed-ring, rgba(248,113,113,0.2))",
};

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
  const { agentType, agentName, status } = entry;
  const color = STATUS_COLORS[status];
  const ringColor = STATUS_RINGS[status];
  const isDone = status === "completed" || status === "failed";

  // Portal-based tooltip — the track bar clips content with overflow-hidden
  // (needed for the height enter/exit animation), so an in-tree tooltip
  // slides under the top border. Anchor to viewport coords via portal.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [tipPos, setTipPos] = useState<{ left: number; top: number } | null>(null);

  const showTip = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTipPos({ left: rect.left + rect.width / 2, top: rect.top });
  }, []);
  const hideTip = useCallback(() => setTipPos(null), []);

  return (
    <motion.div
      ref={anchorRef}
      layout
      initial={{ opacity: 0, scale: 0.5, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.5, y: -10 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="relative flex shrink-0 flex-col items-center"
      onMouseEnter={showTip}
      onMouseLeave={hideTip}
      onFocus={showTip}
      onBlur={hideTip}
      title={`${agentName} — ${status}`}
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
  // Uses color-mix so it works with both hex colours and CSS variables
  // (STATUS_COLORS is a var(...) reference).
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
      title={`Batched LLM request (${entries.length} agents)`}
    >
      <span
        className="pointer-events-none absolute -top-2 left-2 whitespace-nowrap rounded-sm border px-1 text-[0.55rem] font-semibold uppercase tracking-wider"
        style={{
          color: borderColor,
          borderColor,
          backgroundColor: "var(--background)",
        }}
      >
        batch ×{entries.length}
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
  const agentTrackQueue = useAgentStore((s) => s.agentTrackQueue);
  const agentTrackChatId = useAgentStore((s) => s.agentTrackChatId);
  const clearAgentTrackQueue = useAgentStore((s) => s.clearAgentTrackQueue);

  const sorted = useMemo(() => {
    // Compute a stable group key per entry: agents sharing a batchId land in
    // the same key, solo agents get a unique key. The group's position in
    // the row is anchored by the minimum `order` among its members, so a
    // batch keeps the slot its first-declared member would have occupied.
    const groupAnchor = new Map<string, number>();
    const keyOf = (entry: AgentTrackEntry) =>
      entry.batchId ? `batch:${entry.batchId}` : `solo:${entry.order}`;
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
    return out.map((c) => (c.kind === "batch" && c.entries.length === 1 ? { kind: "solo", entry: c.entries[0]! } as const : c));
  }, [sorted]);

  const completed = sorted.filter((e) => e.status === "completed" || e.status === "failed").length;
  const total = sorted.length;
  const allDone = total > 0 && completed === total;
  const visible = agentTrackChatId === chatId && agentTrackQueue.length > 0;

  // Auto-clear 5s after all agents finish so the bar animates away.
  useEffect(() => {
    if (!allDone) return;
    const timer = setTimeout(() => clearAgentTrackQueue(), 5000);
    return () => clearTimeout(timer);
  }, [allDone, clearAgentTrackQueue]);

  return (
    <>
      <style>{AGENT_TRACK_KEYFRAMES}</style>
      <AnimatePresence>
        {visible && (
          <motion.div
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
              <span className="text-[0.5rem] text-[var(--muted-foreground)]">agents</span>
            </div>

            <div className="h-8 w-px shrink-0 bg-[var(--border)]/40" />

            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              <AnimatePresence mode="popLayout">
                {clusters.map((cluster) => {
                  if (cluster.kind === "solo") {
                    const e = cluster.entry;
                    return (
                      <AgentTrackWidget
                        key={`${e.phase}-${e.agentType}-${e.order}`}
                        entry={e}
                      />
                    );
                  }
                  return (
                    <AgentTrackBatchCluster
                      key={`batch-${cluster.batchId}`}
                      entries={cluster.entries}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
