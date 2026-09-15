// ──────────────────────────────────────────────
// Fullscreen viewer for agent track widget content
// (collected result JSON, reasoning, or error text)
// ──────────────────────────────────────────────
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Modal } from "../ui/Modal";
import { copyToClipboard } from "../../lib/utils";
import { useTranslation as useUiTranslation } from "react-i18next";

interface AgentTrackViewerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export function AgentTrackViewerModal({ open, onClose, title, content }: AgentTrackViewerModalProps) {
  const { t: localizeUi } = useUiTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const ok = await copyToClipboard(content);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-4xl" mobileFullscreen>
      <div className="flex h-full flex-col gap-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!content}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ring-1 ring-[var(--border)] transition-colors hover:bg-[var(--secondary)] active:scale-95 disabled:opacity-40"
          >
            {copied ? <Check size="0.75rem" /> : <Copy size="0.75rem" />}
            {localizeUi(copied ? "ui.agents.agenttrackviewer.copied" : "ui.agents.agenttrackviewer.copy")}
          </button>
        </div>
        <pre className="min-h-0 flex-1 whitespace-pre-wrap break-words rounded-md bg-[var(--secondary)] p-3 font-mono text-xs leading-relaxed">
          {content}
        </pre>
      </div>
    </Modal>
  );
}
