import { useEffect, useState, type RefObject } from "react";

export const CHAT_VISUAL_VIEWPORT_CHANGE_EVENT = "marinara:chat-visual-viewport-change";

export interface ChatVisualViewportChangeDetail {
  height: number;
  offsetTop: number;
  keyboardOpen: boolean;
}

export function dispatchChatVisualViewportChange(detail: ChatVisualViewportChangeDetail): void {
  window.dispatchEvent(
    new CustomEvent<ChatVisualViewportChangeDetail>(CHAT_VISUAL_VIEWPORT_CHANGE_EVENT, {
      detail,
    }),
  );
}

export function useChatKeyboardOpen(): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const handleViewportChange = (event: Event) => {
      const detail = (event as CustomEvent<ChatVisualViewportChangeDetail>).detail;
      setKeyboardOpen(detail?.keyboardOpen === true);
    };

    window.addEventListener(CHAT_VISUAL_VIEWPORT_CHANGE_EVENT, handleViewportChange);
    return () => window.removeEventListener(CHAT_VISUAL_VIEWPORT_CHANGE_EVENT, handleViewportChange);
  }, []);

  return keyboardOpen;
}

function focusedElementAcceptsText(): boolean {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active instanceof HTMLTextAreaElement) return true;
  if (active instanceof HTMLInputElement) {
    return !["button", "checkbox", "color", "file", "hidden", "radio", "range", "reset", "submit"].includes(
      active.type,
    );
  }
  return active.isContentEditable;
}

export function useChatComposerFocused(): boolean {
  const [focused, setFocused] = useState(
    () => typeof document !== "undefined" && document.activeElement?.matches("[data-chat-composer]") === true,
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        setFocused(document.activeElement?.matches("[data-chat-composer]") === true);
      });
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return focused;
}

/**
 * Preserve the user's bottom anchor when a mobile software keyboard changes
 * the visual viewport. Readers who intentionally scrolled upward are left
 * exactly where they were.
 */
export function useKeepLatestChatMessageVisible(
  scrollRef: RefObject<HTMLElement | null>,
  isNearBottomRef: RefObject<boolean>,
  scrollToBottom: (behavior?: ScrollBehavior) => void,
): void {
  useEffect(() => {
    const handleViewportChange = (event: Event) => {
      const detail = (event as CustomEvent<ChatVisualViewportChangeDetail>).detail;
      if (!detail?.keyboardOpen || !focusedElementAcceptsText() || !isNearBottomRef.current) return;

      requestAnimationFrame(() => {
        const scrollElement = scrollRef.current;
        if (!scrollElement || !isNearBottomRef.current) return;
        scrollToBottom("auto");
        requestAnimationFrame(() => scrollToBottom("auto"));
      });
    };

    window.addEventListener(CHAT_VISUAL_VIEWPORT_CHANGE_EVENT, handleViewportChange);
    return () => window.removeEventListener(CHAT_VISUAL_VIEWPORT_CHANGE_EVENT, handleViewportChange);
  }, [isNearBottomRef, scrollRef, scrollToBottom]);
}
