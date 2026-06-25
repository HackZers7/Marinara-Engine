import { toast } from "sonner";
import { api } from "./api-client";
import { useTranslationStore } from "../stores/translation.store";
import type { TranslationChannelConfig } from "../stores/translation.store";

/**
 * Translate text using the configured provider.
 * @param channel - 'chat' uses the chat-message config, 'input' uses the
 *   user-input config (with fallback to chat config when input is not
 *   explicitly configured).
 */
export async function translateText(text: string, channel: "chat" | "input" = "chat"): Promise<string> {
  const store = useTranslationStore.getState();
  const cfg: TranslationChannelConfig =
    channel === "input" ? (store.inputConfig ?? store.config) : store.config;
  const result = await api.post<{ translatedText: string }>("/translate", {
    text,
    provider: cfg.provider,
    targetLanguage: cfg.targetLanguage,
    connectionId: cfg.connectionId,
    deeplApiKey: cfg.deeplApiKey,
    deeplxUrl: cfg.deeplxUrl,
  });
  return result.translatedText;
}

/**
 * Translate the user's outgoing message when auto-translate is on.
 * Returns the original message untouched when `enabled` is false, the message
 * is blank, or translation fails (with a single unified toast).
 */
export async function translateInputMessageIfEnabled(message: string, enabled: boolean): Promise<string> {
  if (!enabled || !message.trim()) return message;
  try {
    const translated = await translateText(message, "input");
    return translated.trim() ? translated : message;
  } catch {
    toast.error("Failed to translate message — sending original");
    return message;
  }
}
