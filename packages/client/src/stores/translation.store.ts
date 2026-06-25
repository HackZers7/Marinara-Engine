import { create } from "zustand";

// ── Translation channel config (chat messages vs user input) ──
export interface TranslationChannelConfig {
  provider: "ai" | "deeplx" | "deepl" | "google";
  targetLanguage: string;
  connectionId?: string;
  deeplApiKey?: string;
  deeplxUrl?: string;
}

/** Single source of truth for provider values + their human-readable labels.
 *  Used by the coerce whitelist and by the settings UI's <select>/fallback label. */
export const TRANSLATION_PROVIDER_OPTIONS = [
  { value: "google", label: "Google Translate" },
  { value: "deepl", label: "DeepL API" },
  { value: "deeplx", label: "DeepLX (self-hosted)" },
  { value: "ai", label: "AI (via connection)" },
] as const satisfies ReadonlyArray<{ value: TranslationChannelConfig["provider"]; label: string }>;

/** Whitelist coerce — guards against arbitrary strings landing in metadata. */
export function coerceTranslationProvider(value: unknown): TranslationChannelConfig["provider"] {
  return typeof value === "string" && TRANSLATION_PROVIDER_OPTIONS.some((o) => o.value === value)
    ? (value as TranslationChannelConfig["provider"])
    : "google";
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Convert raw chat metadata into the chat- and input-channel configs the store consumes. */
export function buildTranslationConfigsFromMeta(meta: Record<string, unknown>): {
  chat: TranslationChannelConfig;
  input: TranslationChannelConfig | null;
} {
  const chat: TranslationChannelConfig = {
    provider: coerceTranslationProvider(meta.translationProvider),
    targetLanguage: toOptionalString(meta.translationTargetLang) ?? "en",
    connectionId: toOptionalString(meta.translationConnectionId),
    deeplApiKey: toOptionalString(meta.translationDeeplApiKey),
    deeplxUrl: toOptionalString(meta.translationDeeplxUrl),
  };
  const input: TranslationChannelConfig | null =
    meta.translationInputConfigured === true
      ? {
          provider: coerceTranslationProvider(meta.translationInputProvider),
          targetLanguage: toOptionalString(meta.translationInputTargetLang) ?? "en",
          connectionId: toOptionalString(meta.translationInputConnectionId),
          deeplApiKey: toOptionalString(meta.translationInputDeeplApiKey),
          deeplxUrl: toOptionalString(meta.translationInputDeeplxUrl),
        }
      : null;
  return { chat, input };
}

// ── Zustand store for translation cache ──
interface TranslationStore {
  /** Config for chat-message translations (AI responses, manual translate on messages) */
  config: TranslationChannelConfig;
  setConfig: (config: TranslationChannelConfig) => void;
  /** Config for user-input translations. null = inherit chat config. */
  inputConfig: TranslationChannelConfig | null;
  setInputConfig: (config: TranslationChannelConfig | null) => void;
  /** messageId -> translated text. Keyed by messageId for chat-channel only;
   *  if input translations ever get cached, the key must include the channel. */
  translations: Record<string, string>;
  /** messageId -> hidden translation display state */
  hiddenTranslationIds: Record<string, boolean>;
  /** messageId -> currently translating */
  translating: Record<string, boolean>;
  setTranslation: (id: string, text: string) => void;
  removeTranslation: (id: string) => void;
  setTranslating: (id: string, val: boolean) => void;
  /** Clear all translations (e.g. on chat switch) */
  clearAll: () => void;
  /** Seed translations from message extras (e.g. on chat load) */
  seedFromMessages: (messages: Array<{ id: string; extra?: string | Record<string, unknown> | null }>) => void;
}

export const useTranslationStore = create<TranslationStore>((set) => ({
  config: { provider: "google", targetLanguage: "en" },
  setConfig: (config) => set({ config }),
  inputConfig: null,
  setInputConfig: (inputConfig) => set({ inputConfig }),
  translations: {},
  hiddenTranslationIds: {},
  translating: {},
  setTranslation: (id, text) =>
    set((s) => {
      const { [id]: _, ...hiddenRest } = s.hiddenTranslationIds;
      return {
        translations: { ...s.translations, [id]: text },
        hiddenTranslationIds: hiddenRest,
      };
    }),
  removeTranslation: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.translations;
      return { translations: rest, hiddenTranslationIds: { ...s.hiddenTranslationIds, [id]: true } };
    }),
  setTranslating: (id, val) => set((s) => ({ translating: { ...s.translating, [id]: val } })),
  clearAll: () => set({ translations: {}, translating: {}, hiddenTranslationIds: {} }),
  seedFromMessages: (messages) =>
    set((s) => {
      const seeded: Record<string, string> = {};
      for (const msg of messages) {
        if (!msg.extra) continue;
        try {
          const extra = typeof msg.extra === "string" ? JSON.parse(msg.extra) : msg.extra;
          if (
            extra.translation &&
            typeof extra.translation === "string" &&
            extra.translationHidden !== true &&
            !s.hiddenTranslationIds[msg.id]
          ) {
            seeded[msg.id] = extra.translation;
          }
        } catch {
          // Skip messages with malformed extra JSON
        }
      }
      // Merge with existing (in-flight translations win over seeded)
      return { translations: { ...seeded, ...s.translations } };
    }),
}));
