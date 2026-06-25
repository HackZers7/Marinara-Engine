import { Languages } from "lucide-react";
import { HelpTooltip } from "../../../components/ui/HelpTooltip";
import { SettingsSwitch } from "../../../components/panels/settings/SettingControls";
import { ChatSettingsSection } from "../ChatSettingsSection";
import { coerceTranslationProvider, TRANSLATION_PROVIDER_OPTIONS } from "../../../stores/translation.store";
import type { ChatConnectionOption } from "./ConnectionSection";

interface TranslationSectionProps {
  metadata: Record<string, unknown>;
  textConnections: ChatConnectionOption[];
  onMetadataChange: (patch: Record<string, unknown>) => void;
}

type InputBehavior = "off" | "auto" | "draft";

const INPUT_BEHAVIOR_OPTIONS: Array<{ value: InputBehavior; label: string; description: string }> = [
  { value: "off", label: "Off", description: "Send messages as-is." },
  { value: "auto", label: "Auto-translate", description: "Translate your messages before sending." },
  { value: "draft", label: "Draft button", description: "Add a translate button beside Send so you can review the translation before sending." },
];

function readInputBehavior(value: unknown): InputBehavior {
  return value === "auto" || value === "draft" ? value : "off";
}

function getProviderLabel(value: ReturnType<typeof coerceTranslationProvider>): string {
  return TRANSLATION_PROVIDER_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function TranslationSection({ metadata, textConnections, onMetadataChange }: TranslationSectionProps) {
  const inputBehavior = readInputBehavior(metadata.translationInputBehavior);
  const inputConfigured = metadata.translationInputConfigured === true;
  const chatProvider = coerceTranslationProvider(metadata.translationProvider);
  const chatTargetLang = (metadata.translationTargetLang as string | undefined) ?? "en";

  const setInputBehavior = (next: InputBehavior) => onMetadataChange({ translationInputBehavior: next });

  // Toggling "Configure separately" off only flips the gate. We deliberately keep
  // the translationInput* keys intact so re-enabling restores the previous values.
  const setInputConfigured = (next: boolean) =>
    onMetadataChange({ translationInputConfigured: next });

  return (
    <ChatSettingsSection
      label="Translation"
      icon={<Languages size="0.875rem" />}
      help="Configure translation for AI responses and your messages — provider, target language, and how outgoing text is translated."
    >
      <div className="space-y-4">
        {/* ── Chat Language ── */}
        <div>
          <h4 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Chat Language
            <HelpTooltip
              text="Language to translate AI responses into. Also used when you manually translate a message."
              size="0.625rem"
            />
          </h4>
          <TranslationChannelFields
            prefix="translation"
            provider={metadata.translationProvider as string | undefined}
            targetLang={metadata.translationTargetLang as string | undefined}
            connectionId={metadata.translationConnectionId as string | undefined}
            deeplApiKey={metadata.translationDeeplApiKey as string | undefined}
            deeplxUrl={metadata.translationDeeplxUrl as string | undefined}
            textConnections={textConnections}
            onMetadataChange={onMetadataChange}
          />
        </div>

        {/* ── Input Language ── */}
        <div className="rounded-lg border border-[var(--border)]/40 bg-[var(--secondary)]/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Input Language
              <HelpTooltip
                text="Language to translate your messages into before sending. By default inherits Chat Language settings."
                size="0.625rem"
              />
            </h4>
          </div>
          <SettingsSwitch
            label="Configure separately"
            description="Use a different provider or target language for your outgoing messages."
            checked={inputConfigured}
            onChange={(next) => setInputConfigured(next)}
            labelPosition="start"
            className={[
              "mb-2 justify-between rounded-lg px-3 py-2 text-left",
              inputConfigured
                ? "bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
                : "bg-[var(--secondary)] hover:bg-[var(--accent)]",
            ].join(" ")}
            labelClassName="text-[0.6875rem] font-medium"
          />
          {inputConfigured ? (
            <TranslationChannelFields
              prefix="translationInput"
              provider={metadata.translationInputProvider as string | undefined}
              targetLang={metadata.translationInputTargetLang as string | undefined}
              connectionId={metadata.translationInputConnectionId as string | undefined}
              deeplApiKey={metadata.translationInputDeeplApiKey as string | undefined}
              deeplxUrl={metadata.translationInputDeeplxUrl as string | undefined}
              textConnections={textConnections}
              onMetadataChange={onMetadataChange}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--border)]/60 bg-[var(--secondary)]/50 px-3 py-2 text-[0.6875rem] text-[var(--muted-foreground)]">
              Using Chat Language settings — <span className="font-medium text-[var(--foreground)]">{getProviderLabel(chatProvider)}</span>
              {" → "}
              <span className="font-medium text-[var(--foreground)]">{chatTargetLang}</span>
            </div>
          )}
        </div>

        {/* ── Input behavior (radio) ── */}
        <div>
          <h4 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Input Translation Mode
            <HelpTooltip
              text="How outgoing messages are translated: not at all, automatically before send, or only when you press a draft button."
              size="0.625rem"
            />
          </h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {INPUT_BEHAVIOR_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
                  inputBehavior === option.value
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : "border-[var(--border)] bg-[var(--background)]/40 hover:border-[var(--muted-foreground)]"
                }`}
              >
                <input
                  type="radio"
                  name="translationInputBehavior"
                  value={option.value}
                  checked={inputBehavior === option.value}
                  onChange={() => setInputBehavior(option.value)}
                  className="sr-only"
                />
                <span className="block text-[0.6875rem] font-medium text-[var(--foreground)]">{option.label}</span>
                <span className="mt-1 block text-[0.625rem] leading-snug text-[var(--muted-foreground)]">
                  {option.description}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* ── Auto-Translate Responses ── */}
        <div className="pt-1">
          <TranslationToggle
            enabled={metadata.autoTranslate === true}
            title="Auto-Translate Responses"
            description="Automatically translate AI responses after generation."
            onToggle={() => onMetadataChange({ autoTranslate: !metadata.autoTranslate })}
          />
        </div>
      </div>
    </ChatSettingsSection>
  );
}

// ── Reusable fields for one translation channel ──
interface TranslationChannelFieldsProps {
  prefix: string;
  provider: string | undefined;
  targetLang: string | undefined;
  connectionId: string | undefined;
  deeplApiKey: string | undefined;
  deeplxUrl: string | undefined;
  textConnections: ChatConnectionOption[];
  onMetadataChange: (patch: Record<string, unknown>) => void;
}

function TranslationChannelFields({
  prefix,
  provider: providerRaw,
  targetLang,
  connectionId,
  deeplApiKey,
  deeplxUrl,
  textConnections,
  onMetadataChange,
}: TranslationChannelFieldsProps) {
  const provider = providerRaw ?? "google";

  return (
    <div className="space-y-2">
      {/* Provider */}
      <div>
        <label className="text-[0.6875rem] font-medium text-[var(--muted-foreground)]">Provider</label>
        <select
          value={provider}
          onChange={(e) => onMetadataChange({ [`${prefix}Provider`]: e.target.value })}
          className="mt-0.5 w-full rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
        >
          {TRANSLATION_PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Target Language */}
      <div>
        <label className="text-[0.6875rem] font-medium text-[var(--muted-foreground)]">
          Language
          <HelpTooltip
            text={
              provider === "ai"
                ? "Language name (e.g. English, Japanese, Spanish)"
                : "Language code (e.g. en, ja, es, de, fr, zh, ko)"
            }
            size="0.625rem"
          />
        </label>
        <input
          type="text"
          value={targetLang ?? "en"}
          onChange={(e) => onMetadataChange({ [`${prefix}TargetLang`]: e.target.value })}
          placeholder={provider === "ai" ? "English" : "en"}
          className="mt-0.5 w-full rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
        />
      </div>

      {/* AI Connection */}
      {provider === "ai" && (
        <div>
          <label className="text-[0.6875rem] font-medium text-[var(--muted-foreground)]">
            Connection
            <HelpTooltip text="Which AI connection to use for translation" size="0.625rem" />
          </label>
          <select
            value={connectionId ?? ""}
            onChange={(e) => onMetadataChange({ [`${prefix}ConnectionId`]: e.target.value })}
            className="mt-0.5 w-full rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
          >
            <option value="">Select connection…</option>
            {textConnections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* DeepL API Key */}
      {provider === "deepl" && (
        <div>
          <label className="text-[0.6875rem] font-medium text-[var(--muted-foreground)]">DeepL API Key</label>
          <input
            type="password"
            value={deeplApiKey ?? ""}
            onChange={(e) => onMetadataChange({ [`${prefix}DeeplApiKey`]: e.target.value })}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
            className="mt-0.5 w-full rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
          />
        </div>
      )}

      {/* DeepLX URL */}
      {provider === "deeplx" && (
        <div>
          <label className="text-[0.6875rem] font-medium text-[var(--muted-foreground)]">
            DeepLX URL
            <HelpTooltip
              text="URL of your self-hosted DeepLX instance (e.g. http://localhost:1188)"
              size="0.625rem"
            />
          </label>
          <input
            type="text"
            value={deeplxUrl ?? ""}
            onChange={(e) => onMetadataChange({ [`${prefix}DeeplxUrl`]: e.target.value })}
            placeholder="http://localhost:1188"
            className="mt-0.5 w-full rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-[var(--primary)]/40"
          />
        </div>
      )}
    </div>
  );
}

// ── Toggle switch for translation features ──
function TranslationToggle({
  enabled,
  title,
  description,
  onToggle,
}: {
  enabled: boolean;
  title: string;
  description: string;
  onToggle: () => void;
}) {
  return (
    <SettingsSwitch
      label={title}
      description={description}
      checked={enabled}
      onChange={onToggle}
      labelPosition="start"
      className={[
        "justify-between rounded-lg px-3 py-2.5 text-left",
        enabled
          ? "bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]/30"
          : "bg-[var(--secondary)] hover:bg-[var(--accent)]",
      ].join(" ")}
      labelClassName="text-[0.6875rem] font-medium"
    />
  );
}
