// ──────────────────────────────────────────────
// Fullscreen viewer for agent track widget content
// (collected result JSON, reasoning, or error text).
// Result payloads open in the readable parsed-tree mode
// with a toggle to the raw pretty-printed JSON.
// ──────────────────────────────────────────────
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Modal } from "../ui/Modal";
import { copyToClipboard } from "../../lib/utils";
import { useTranslation as useUiTranslation } from "react-i18next";
import { buildAgentResultTree } from "../../lib/agent-result-tree";
import { ResultTreeView } from "../agents/AgentTrackResultPopup";

interface AgentTrackViewerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
  /** Parsed result payload; when present the readable tree mode is available and default. */
  data?: unknown;
}

const MODE_BUTTON_CLASS =
  "rounded px-2 py-1 text-xs font-medium transition-colors hover:text-[var(--foreground)] aria-pressed:bg-[var(--secondary)] aria-pressed:text-[var(--foreground)]";

export function AgentTrackViewerModal({ open, onClose, title, content, data }: AgentTrackViewerModalProps) {
  const { t: localizeUi } = useUiTranslation();
  const [copied, setCopied] = useState(false);
  const hasTree = data != null;
  // Readable parsed tree first; raw pretty-printed JSON is one click away.
  // Plain text payloads (reasoning, errors) have nothing to re-parse.
  const [mode, setMode] = useState<"readable" | "raw">("readable");
  const effectiveMode = hasTree ? mode : "raw";

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-4xl" mobileFullscreen>
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center gap-2">
          {hasTree && (
            <div
              role="group"
              aria-label={localizeUi("ui.agents.agenttrackviewer.modeLabel")}
              className="flex gap-0.5 rounded-md bg-[var(--background)] p-0.5 ring-1 ring-[var(--border)]"
            >
              <button
                type="button"
                aria-pressed={effectiveMode === "readable"}
                onClick={() => setMode("readable")}
                className={MODE_BUTTON_CLASS}
              >
                {localizeUi("ui.agents.agenttrackviewer.modeReadable")}
              </button>
              <button
                type="button"
                aria-pressed={effectiveMode === "raw"}
                onClick={() => setMode("raw")}
                className={MODE_BUTTON_CLASS}
              >
                {localizeUi("ui.agents.agenttrackviewer.modeRaw")}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!content}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--secondary)] active:scale-95 disabled:opacity-40"
          >
            {copied ? <Check size="0.75rem" /> : <Copy size="0.75rem" />}
            {localizeUi(copied ? "ui.agents.agenttrackviewer.copied" : "ui.agents.agenttrackviewer.copy")}
          </button>
        </div>
        {effectiveMode === "readable" ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-[var(--secondary)] p-3">
            <ResultTreeView nodes={buildAgentResultTree(data, Number.POSITIVE_INFINITY, true)} depth={0} readable />
          </div>
        ) : (
          <pre className="min-h-0 flex-1 whitespace-pre-wrap break-words rounded-md bg-[var(--secondary)] p-3 font-mono text-xs leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </Modal>
  );
}
