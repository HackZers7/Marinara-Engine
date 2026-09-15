// ──────────────────────────────────────────────
// Hover/click popup for a settled agent track widget
// ──────────────────────────────────────────────
import { useLayoutEffect, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Brain, Copy, Maximize2 } from "lucide-react";
import { useTranslation as useUiTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AgentTrackEntry } from "../../stores/agent.store";
import { buildAgentResultTree, type AgentResultTreeNode } from "../../lib/agent-result-tree";
import { copyToClipboard } from "../../lib/utils";
import { useUIStore } from "../../stores/ui.store";
import { STATUS_COLORS } from "./agent-track-animations";

interface AgentTrackResultPopupProps {
  entry: AgentTrackEntry;
  /** Widget element the popup anchors to. */
  anchor: HTMLElement | null;
  /** Panel element, owned by the widget so its hover bridge can find us. */
  panelRef: RefObject<HTMLDivElement | null>;
  /** Whether the user click-pinned the popup — hover-out must not close it then. */
  pinned: boolean;
  onClose: () => void;
}

const PILL_BUTTON_CLASS =
  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.6875rem] font-medium ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--secondary)] active:scale-95";

function TreeView({ nodes, depth }: { nodes: AgentResultTreeNode[]; depth: number }) {
  const { t: localizeUi } = useUiTranslation();
  return (
    <div className={depth > 0 ? "ml-2 border-l border-[var(--border)] pl-2" : undefined}>
      {nodes.map((node, index) => (
        <div key={`${node.key}-${index}`} className="py-px">
          <span className="font-mono text-xs leading-relaxed">
            {node.children ? (
              <>
                {node.key !== "" && <span className="font-semibold">{node.key}: </span>}
                <span className="text-[var(--muted-foreground)]">
                  {node.children.length === 0
                    ? "{}"
                    : localizeUi("ui.agents.treeview.value1", { value1: node.children.length })}
                </span>
              </>
            ) : node.circular ? (
              <span className="text-[var(--muted-foreground)]">{localizeUi("ui.agents.treeview.circular")}</span>
            ) : node.hiddenCount ? (
              <span className="text-[var(--muted-foreground)]">
                {localizeUi("ui.agents.treeview.moreValues", { value1: node.hiddenCount })}
              </span>
            ) : (
              <>
                {node.key !== "" && <span className="font-semibold">{node.key}: </span>}
                <span className={node.truncated ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}>
                  {node.text}
                </span>
              </>
            )}
          </span>
          {node.children && node.children.length > 0 && <TreeView nodes={node.children} depth={depth + 1} />}
        </div>
      ))}
    </div>
  );
}

function serializeResult(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function AgentTrackResultPopup({ entry, anchor, panelRef, pinned, onClose }: AgentTrackResultPopupProps) {
  const { t: localizeUi } = useUiTranslation();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const size = panel.getBoundingClientRect();
    const pad = 8;
    let left = rect.left + rect.width / 2 - size.width / 2;
    let top = rect.top - 6 - size.height;
    left = Math.max(pad, Math.min(left, window.innerWidth - pad - size.width));
    if (top < pad) top = Math.min(rect.bottom + 6, window.innerHeight - pad - size.height);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.visibility = "visible";
  }, [anchor, panelRef]);

  useLayoutEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchor, panelRef, onClose]);

  const failed = entry.status === "failed";
  const result = entry.result;
  const errorText = failed ? (result?.error ?? localizeUi("ui.agents.agenttrackpopup.interrupted")) : null;
  const dataJson = failed ? "" : serializeResult(result?.data);
  const reasoning = result?.reasoning ?? null;
  const hasData = !failed && result?.data != null;
  const openViewer = (title: string, content: string) => {
    onClose();
    useUIStore.getState().openModal("agent-track-viewer", { title, content });
  };

  const copyContent = async () => {
    const content = failed ? (errorText ?? "") : dataJson;
    const ok = await copyToClipboard(content);
    if (ok) toast.success(localizeUi("ui.agents.agenttrackpopup.copied"));
    else toast.error(localizeUi("ui.agents.agenttrackpopup.copyFailed"));
  };

  return createPortal(
    <div
      ref={panelRef}
      onMouseLeave={(event) => {
        // Moving from the panel back onto the widget keeps the popup open —
        // the widget's own leave handler would otherwise look like a close.
        if (event.relatedTarget instanceof Node && anchor?.contains(event.relatedTarget)) return;
        if (!pinned) onClose();
      }}
      className="fixed z-[9999] flex w-80 max-w-[calc(100vw-1rem)] flex-col rounded-lg bg-[var(--popover)] text-[var(--popover-foreground)] shadow-xl ring-1 ring-[var(--border)]"
      style={{ visibility: "hidden" }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <span className="truncate text-xs font-semibold">{entry.agentName}</span>
        <span
          className="shrink-0 text-[0.625rem] font-bold uppercase tracking-wide"
          style={{ color: failed ? STATUS_COLORS.failed : STATUS_COLORS.completed }}
        >
          {failed ? localizeUi("ui.agents.agenttrackpopup.error") : localizeUi("ui.agents.agenttrackpopup.result")}
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto overscroll-contain px-3 py-2">
        {failed ? (
          <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{errorText}</p>
        ) : hasData ? (
          <TreeView nodes={buildAgentResultTree(result?.data)} depth={0} />
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">{localizeUi("ui.agents.agenttrackpopup.noData")}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 border-t border-[var(--border)] px-2 py-1.5">
        {(failed || hasData) && (
          <button
            type="button"
            onClick={() =>
              openViewer(
                localizeUi(
                  failed ? "ui.agents.agenttrackviewer.titleError" : "ui.agents.agenttrackviewer.titleResult",
                  {
                    value1: entry.agentName,
                  },
                ),
                failed ? (errorText ?? "") : dataJson,
              )
            }
            className={PILL_BUTTON_CLASS}
          >
            <Maximize2 size="0.75rem" />
            {localizeUi("ui.agents.agenttrackpopup.openFull")}
          </button>
        )}
        {reasoning && (
          <button
            type="button"
            onClick={() =>
              openViewer(
                localizeUi("ui.agents.agenttrackviewer.titleReasoning", { value1: entry.agentName }),
                reasoning,
              )
            }
            className={PILL_BUTTON_CLASS}
          >
            <Brain size="0.75rem" />
            {localizeUi("ui.agents.agenttrackpopup.reasoning")}
          </button>
        )}
        {(failed || hasData) && (
          <button type="button" onClick={() => void copyContent()} className={`${PILL_BUTTON_CLASS} ml-auto`}>
            <Copy size="0.75rem" />
            {localizeUi("ui.agents.agenttrackpopup.copy")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
