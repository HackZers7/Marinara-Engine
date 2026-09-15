import assert from "node:assert/strict";
import type { AgentContext } from "../../packages/shared/src/types/agent.ts";
import { executeAgent, executeAgentBatch } from "../../packages/server/src/services/agents/agent-executor.ts";
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

console.info("Agent reasoning capture regression passed.");
