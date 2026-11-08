import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AgentContext } from "../../packages/shared/src/types/agent.ts";
import {
  agentRequestOptions,
  executeAgent,
  executeAgentBatch,
} from "../../packages/server/src/services/agents/agent-executor.ts";
import { resolveGeminiThinkingConfig } from "../../packages/server/src/services/llm/providers/google.provider.ts";
import {
  BaseLLMProvider,
  type ChatCompletionResult,
  type ChatMessage,
  type ChatOptions,
} from "../../packages/server/src/services/llm/base-provider.ts";

const jsonAgentConfig = {
  id: "tracker-id",
  type: "world-state",
  name: "World tracker",
  phase: "post_processing",
  promptTemplate: "Return the world state as JSON.",
  connectionId: null,
  settings: { maxTokens: 1024, contextSize: 5 },
  isCustomAgent: false,
};

const context = (overrides: Partial<AgentContext> = {}): AgentContext => ({
  chatId: "reasoning-capture-fixture",
  chatMode: "roleplay",
  recentMessages: [],
  characters: [],
  persona: null,
  memory: {},
  writableLorebookIds: null,
  chatSummary: null,
  streaming: true,
  ...overrides,
});

class ReasoningProvider extends BaseLLMProvider {
  calls: Array<{ messages: ChatMessage[]; options: ChatOptions }> = [];

  constructor(
    private readonly payload: {
      content: string;
      reasoningChunk?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    super("http://localhost", "", 16384, null);
  }

  async *chat(): AsyncGenerator<string, void, unknown> {}

  override async chatComplete(messages: ChatMessage[], options: ChatOptions): Promise<ChatCompletionResult> {
    this.calls.push({ messages, options });
    if (options.stream !== false) {
      if (this.payload.reasoningChunk) options.onThinking?.(this.payload.reasoningChunk);
      await options.onToken?.(this.payload.content);
      return {
        content: this.payload.content,
        toolCalls: [],
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        ...(this.payload.metadata ? { providerMetadata: this.payload.metadata } : {}),
      };
    }
    return {
      content: this.payload.content,
      toolCalls: [],
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      ...(this.payload.metadata ? { providerMetadata: this.payload.metadata } : {}),
    };
  }
}

// Capture off (default): JSON agents still force reasoning off and no
// reasoning text is attached, even when the provider streams thinking anyway.
{
  const provider = new ReasoningProvider({
    content: JSON.stringify({ location: "Road" }),
    reasoningChunk: "unsolicited thoughts",
  });
  const result = await executeAgent(jsonAgentConfig, context(), provider, "test-model");
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0]!.options.reasoningEffort, "none");
  assert.equal(result.reasoning, undefined);
}

// Capture on, streaming: the suppression override is skipped, capture is
// requested from the provider, and reasoning accumulates from onThinking.
{
  const provider = new ReasoningProvider({
    content: JSON.stringify({ location: "Road" }),
    reasoningChunk: "stream thoughts",
  });
  const result = await executeAgent(jsonAgentConfig, context({ captureAgentReasoning: true }), provider, "test-model");
  assert.equal(provider.calls[0]!.options.reasoningEffort, undefined);
  assert.equal(provider.calls[0]!.options.captureReasoning, true);
  assert.equal(result.reasoning, "stream thoughts");
}

// Capture on, Gemini: the agent's capture flag must produce an explicit
// includeThoughts request even when the connection has no reasoning level set.
{
  const options = agentRequestOptions(jsonAgentConfig, true, true);
  assert.deepEqual(resolveGeminiThinkingConfig("gemini-2.5-flash", options, 4096), {
    thinkingBudget: 2048,
    includeThoughts: true,
  });
}

// Capture on, non-streaming: reasoning comes from provider-native metadata.
{
  const provider = new ReasoningProvider({
    content: JSON.stringify({ location: "Road" }),
    metadata: { reasoning_content: "metadata thoughts" },
  });
  const result = await executeAgent(
    jsonAgentConfig,
    context({ captureAgentReasoning: true, streaming: false }),
    provider,
    "test-model",
  );
  assert.equal(result.reasoning, "metadata thoughts");
}

// Capture on with a non-streaming UI: the agent wrapper keeps the provider
// stream alive for its inactivity timeout, suppresses visible text callbacks,
// but still collects the explicitly requested reasoning.
{
  const provider = new ReasoningProvider({
    content: JSON.stringify({ location: "Road" }),
    reasoningChunk: "quiet UI thoughts",
  });
  const result = await executeAgent(
    jsonAgentConfig,
    context({ captureAgentReasoning: true, streaming: false }),
    provider,
    "test-model",
  );
  assert.equal(provider.calls[0]!.options.onToken, undefined);
  assert.equal(result.reasoning, "quiet UI thoughts");
}

// Batch: members share one LLM response, so its reasoning lands on every
// parsed member result and the suppression override is skipped there too.
{
  const configs = [jsonAgentConfig, { ...jsonAgentConfig, id: "tracker-id-2", type: "combat", name: "Combat tracker" }];
  const provider = new ReasoningProvider({
    content: JSON.stringify({ "world-state": { location: "Road" }, combat: { enemies: [] } }),
    reasoningChunk: "batch thoughts",
  });
  const results = await executeAgentBatch(configs, context({ captureAgentReasoning: true }), provider, "test-model");
  assert.equal(results.length, 2);
  for (const entry of results) assert.equal(entry.reasoning, "batch thoughts");
  assert.equal(provider.calls[0]!.options.reasoningEffort, undefined);
  assert.equal(provider.calls[0]!.options.captureReasoning, true);
}

// The capture control belongs to the top-level Agents settings, before the
// collapsed roleplay Trackers control card; otherwise it looks missing.
{
  const drawerSource = readFileSync(
    new URL("../../packages/client/src/components/chat/ChatSettingsDrawer.tsx", import.meta.url),
    "utf8",
  );
  const captureControl = drawerSource.indexOf('label={localizeUi("chat.settings.agents.captureReasoning")}');
  const trackersControl = drawerSource.indexOf("id={`${chat.id}:trackers-control`}");
  assert.ok(captureControl >= 0, "Capture agent reasoning control exists");
  assert.ok(trackersControl >= 0, "Roleplay trackers control exists");
  assert.ok(captureControl < trackersControl, "Capture agent reasoning is visible outside the collapsed trackers card");
}

console.info("Agent reasoning capture regression passed.");
