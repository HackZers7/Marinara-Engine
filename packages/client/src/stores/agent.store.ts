// ──────────────────────────────────────────────
// Zustand Store: Agent Slice
// ──────────────────────────────────────────────
import { create } from "zustand";
import {
  ECHO_CHAMBER_MESSAGE_LIMIT,
  enqueueEchoChamberMessages,
  type EchoChamberMessage,
} from "../lib/echo-chamber-queue";
import type {
  AgentCallDebugEvent,
  AgentResult,
  AgentWriteApprovalProposal,
  CharacterCardFieldUpdate,
  MariGuidedPlanStep,
  MariSuggestionChip,
} from "@marinara-engine/shared";
import type { AgentFailure } from "../lib/agent-failures";

/**
 * A character_card_update result awaiting user confirmation.
 *
 * Character cards are sensitive (they define the character's identity) so
 * the Card Evolution Auditor never writes them automatically — each batch
 * of proposed edits sits here until the user approves or rejects it.
 */
export interface PendingCardUpdate {
  /** Client-generated ID, used as key for dismissal. */
  id: string;
  chatId: string;
  agentType: string;
  characterId: string;
  characterName: string;
  updates: CharacterCardFieldUpdate[];
  agentName: string;
  /** ms since epoch — used for stable ordering. */
  timestamp: number;
}

export interface PendingAgentWriteApproval extends AgentWriteApprovalProposal {
  /** Client-generated ID, used as key for dismissal. */
  id: string;
  /** ms since epoch — used for stable ordering. */
  timestamp: number;
}

export interface AgentDebugEntry {
  phase: string;
  agents?: Array<{
    type: string;
    name: string;
    model: string;
    maxTokens: number;
  }>;
  results?: AgentResult[];
  toolCall?: {
    name: string;
    arguments: string;
    allowed: boolean;
  };
  toolResult?: {
    name: string;
    result: string;
    success: boolean;
  };
  agentCall?: AgentCallDebugEvent;
  batchMaxTokens?: number;
  timestamp: number;
}

export type AgentTrackStatus = "queued" | "running" | "completed" | "failed";

export interface AgentTrackEntry {
  agentType: string;
  agentName: string;
  phase: string;
  status: AgentTrackStatus;
  /** Stable index in execution order — assigned when the queue is populated. */
  order: number;
  /**
   * Shared identifier for agents that fulfill a single batched LLM request.
   * Null for agents that fire their own request. Assigned when the server
   * emits `agent_start` — unknown until then.
   */
  batchId: string | null;
}

function logAgentDebugToBrowserConsole(entry: AgentDebugEntry) {
  const call = entry.agentCall;
  if (!call) {
    console.debug("[Marinara Agent Debug]", entry);
    return;
  }

  const usageParts = [
    call.promptTokens != null ? `prompt ${call.promptTokens}` : null,
    call.completionTokens != null ? `completion ${call.completionTokens}` : null,
    call.reasoningTokens != null ? `reasoning ${call.reasoningTokens}` : null,
    call.totalTokens != null ? `total ${call.totalTokens}` : null,
  ].filter(Boolean);
  const round = call.round != null ? ` round ${call.round}` : "";
  const usage = usageParts.length > 0 ? ` | ${usageParts.join(", ")} tokens` : "";
  const duration = call.durationMs != null ? ` | ${call.durationMs}ms` : "";
  const elapsed = call.elapsedMs != null ? ` | ${call.elapsedMs}ms total` : "";
  const label = `[Marinara Agent Debug] ${call.stage}${round}: ${call.agentName} (${call.agentType}) | ${call.model}${usage}${duration}${elapsed}`;

  console.groupCollapsed(label);
  console.debug("Event", call);
  if (call.messages?.length) console.debug("Messages", call.messages);
  if (call.response) console.debug("Response", call.response);
  if (call.batchedAgentTypes?.length) console.debug("Batched agents", call.batchedAgentTypes);
  if (call.tools?.length) console.debug("Tools", call.tools);
  console.groupEnd();
}

/**
 * Stable empties for selectors that hide another chat's failures. A selector that returns a
 * fresh `[]` is a new snapshot on every read, and zustand v5 has no built-in equality check —
 * React then re-renders forever ("Maximum update depth exceeded", minified error #185) as soon
 * as anything else updates the store often, e.g. a background chat streaming.
 */
export const EMPTY_AGENT_TYPES: string[] = [];
export const EMPTY_AGENT_FAILURES: AgentFailure[] = [];

interface AgentState {
  activeAgents: string[];
  lastResults: Map<string, AgentResult>;
  isProcessing: boolean;
  /** Chat IDs with agent work currently in flight. Keeps active-chat UI from flashing for background runs. */
  processingChatIds: string[];
  /** Legacy callers that do not identify an individual agent run. */
  legacyProcessingChatIds: string[];
  legacyGlobalProcessing: boolean;
  /** Generation-scoped runs, kept separate so overlapping Roleplay swipes cannot clear each other. */
  processingRunIdsByChat: Record<string, string[]>;
  /** Agent types that failed even after auto-retry — manual retry available */
  failedAgentTypes: string[];
  /** Chat ID the failed-agent list belongs to. Null means legacy/global failures. */
  failedAgentChatId: string | null;
  /** Rich failure details for the retry UI and troubleshooting copy */
  failedAgentFailures: AgentFailure[];
  thoughtBubbles: Array<{
    agentId: string;
    agentName: string;
    content: string;
    timestamp: number;
  }>;
  echoMessages: EchoChamberMessage[];
  /** How many echo messages are currently revealed (stagger counter) */
  echoVisibleCount: number;
  /** Baseline: messages at or below this count are shown without stagger */
  echoBaseline: number;
  /** Chat ID whose echo messages have been loaded — prevents redundant fetches across remounts */
  echoLoadedChatId: string | null;
  cyoaChoices: Array<{
    label: string;
    text: string;
  }>;
  cyoaChoicesChatId: string | null;
  mariChips: MariSuggestionChip[];
  mariChipsChatId: string | null;
  /**
   * A guided-creation plan Mari returned in one call: an ordered list of question+chip
   * steps. The client walks these locally (see recordMariPlanAnswer) with zero further
   * LLM calls until the plan is exhausted and a summary message is sent back to her.
   */
  mariPlan: MariGuidedPlanStep[] | null;
  mariPlanChatId: string | null;
  mariPlanCursor: number;
  mariPlanAnswers: Record<string, string>;
  /** Latest Music DJ YouTube "play" intent. nonce bumps each pick so the player reacts. */
  youtubePlay: { searchQuery: string; mood: string; nonce: number } | null;
  /** Latest Music DJ YouTube volume directive (0-100), independent of track changes. */
  youtubeVolume: number | null;
  /** Latest Music DJ Custom "play" intent. nonce bumps each pick so the player reacts. */
  localMusicPlay: { path: string; title: string; mood: string; nonce: number } | null;
  /** Latest Music DJ Custom volume directive (0-100), independent of track changes. */
  localMusicVolume: number | null;
  pendingCardUpdates: PendingCardUpdate[];
  pendingAgentWriteApprovals: PendingAgentWriteApproval[];

  /** Per-agent tracking queue for the circular progress widgets above the chat. */
  agentTrackQueue: AgentTrackEntry[];
  /** Chat ID the current track queue belongs to. */
  agentTrackChatId: string | null;

  // Actions
  setActiveAgents: (agents: string[]) => void;
  setProcessing: (processing: boolean, chatId?: string | null) => void;
  setProcessingRun: (runId: string, processing: boolean, chatId: string) => void;
  addResult: (agentId: string, result: AgentResult) => void;
  addDebugEntry: (entry: Omit<AgentDebugEntry, "timestamp"> & { timestamp?: number }) => void;
  setFailedAgentTypes: (types: string[], chatId?: string | null) => void;
  setFailedAgentFailures: (failures: AgentFailure[], chatId?: string | null) => void;
  clearFailedAgentTypes: (chatId?: string | null) => void;
  addThoughtBubble: (agentId: string, agentName: string, content: string) => void;
  dismissThoughtBubble: (index: number) => void;
  clearThoughtBubbles: () => void;
  addEchoMessage: (characterName: string, reaction: string) => void;
  enqueueEchoMessages: (reactions: Array<{ characterName: string; reaction: string }>) => void;
  setEchoMessages: (messages: Array<{ characterName: string; reaction: string; timestamp: number }>) => void;
  clearEchoMessages: () => void;
  setEchoVisibleCount: (count: number) => void;
  revealNextEchoMessage: () => void;
  setEchoBaseline: (count: number) => void;
  setEchoLoadedChatId: (chatId: string | null) => void;
  setCyoaChoices: (choices: Array<{ label: string; text: string }>, chatId?: string | null) => void;
  clearCyoaChoices: () => void;
  setMariChips: (chatId: string | null, chips: MariSuggestionChip[]) => void;
  clearMariChips: () => void;
  setMariPlan: (chatId: string | null, steps: MariGuidedPlanStep[]) => void;
  recordMariPlanAnswer: (fieldKey: string, value: string) => "advanced" | "complete";
  clearMariPlan: () => void;
  setYoutubePlay: (play: { searchQuery: string; mood: string }) => void;
  setYoutubeVolume: (volume: number | null) => void;
  clearYoutube: () => void;
  setLocalMusicPlay: (play: { path: string; title: string; mood: string }) => void;
  setLocalMusicVolume: (volume: number | null) => void;
  clearLocalMusic: () => void;
  enqueuePendingCardUpdate: (entry: PendingCardUpdate) => void;
  dismissPendingCardUpdate: (id: string) => void;
  clearPendingCardUpdates: () => void;
  enqueuePendingAgentWriteApproval: (entry: PendingAgentWriteApproval) => void;
  dismissPendingAgentWriteApproval: (id: string) => void;
  clearPendingAgentWriteApprovals: () => void;
  setAgentTrackQueue: (
    chatId: string | null,
    agents: Array<{ agentType: string; agentName: string; phase: string; batchId?: string | null }>,
  ) => void;
  /**
   * Append virtual widgets (e.g. main-response generation, auto-translation)
   * to the current queue. No-op when chatId mismatches or the queue is empty
   * — virtual widgets only make sense as siblings of real agent widgets.
   * Entries whose agentType is already present are skipped so this is safe
   * to call multiple times.
   */
  addAgentTrackEntries: (
    chatId: string,
    agents: Array<{ agentType: string; agentName: string; phase: string; status?: AgentTrackStatus }>,
  ) => void;
  /**
   * Remove a single widget from the queue by agentType. Used when a widget
   * that was seeded speculatively (e.g. the auto-translation widget) turns
   * out to be unnecessary — the setting was toggled off before the work ran.
   * No-op when chatId mismatches.
   */
  removeAgentTrackEntry: (chatId: string, agentType: string) => void;
  markAgentTrackRunning: (agentType: string, batchId?: string | null) => void;
  markAgentTrackPhaseRunning: (phase: string) => void;
  markAgentTrackCompleted: (agentType: string, success: boolean) => void;
  markAgentTrackFailed: (agentType: string) => void;
  /** Mark every queued/running entry as failed — used when generation aborts. */
  settleAgentTrackQueueAsFailed: (chatId: string) => void;
  clearAgentTrackQueue: () => void;
  /** Clear chat-runtime Agent state while retaining Professor Mari's chat-scoped continuation UI. */
  resetForChatChange: () => void;
  reset: () => void;
}

type AgentDataState = Pick<
  AgentState,
  | "activeAgents"
  | "lastResults"
  | "isProcessing"
  | "processingChatIds"
  | "legacyProcessingChatIds"
  | "legacyGlobalProcessing"
  | "processingRunIdsByChat"
  | "failedAgentTypes"
  | "failedAgentChatId"
  | "failedAgentFailures"
  | "thoughtBubbles"
  | "echoMessages"
  | "echoVisibleCount"
  | "echoBaseline"
  | "echoLoadedChatId"
  | "cyoaChoices"
  | "cyoaChoicesChatId"
  | "mariChips"
  | "mariChipsChatId"
  | "mariPlan"
  | "mariPlanChatId"
  | "mariPlanCursor"
  | "mariPlanAnswers"
  | "youtubePlay"
  | "youtubeVolume"
  | "localMusicPlay"
  | "localMusicVolume"
  | "pendingCardUpdates"
  | "pendingAgentWriteApprovals"
  | "agentTrackQueue"
  | "agentTrackChatId"
>;

function createInitialAgentDataState(): AgentDataState {
  return {
    activeAgents: [],
    lastResults: new Map(),
    isProcessing: false,
    processingChatIds: [],
    legacyProcessingChatIds: [],
    legacyGlobalProcessing: false,
    processingRunIdsByChat: {},
    failedAgentTypes: [],
    failedAgentChatId: null,
    failedAgentFailures: [],
    thoughtBubbles: [],
    echoMessages: [],
    echoVisibleCount: 0,
    echoBaseline: 0,
    echoLoadedChatId: null,
    cyoaChoices: [],
    cyoaChoicesChatId: null,
    mariChips: [],
    mariChipsChatId: null,
    mariPlan: null,
    mariPlanChatId: null,
    mariPlanCursor: 0,
    mariPlanAnswers: {},
    youtubePlay: null,
    youtubeVolume: null,
    localMusicPlay: null,
    localMusicVolume: null,
    pendingCardUpdates: [],
    pendingAgentWriteApprovals: [],
    agentTrackQueue: [],
    agentTrackChatId: null,
  };
}

export const useAgentStore = create<AgentState>((set, get) => ({
  ...createInitialAgentDataState(),

  setActiveAgents: (agents) => set({ activeAgents: agents }),
  setProcessing: (processing, chatId = null) =>
    set((s) => {
      if (!chatId) {
        const processingChatIds = Array.from(
          new Set([...s.legacyProcessingChatIds, ...Object.keys(s.processingRunIdsByChat)]),
        );
        return {
          legacyGlobalProcessing: processing,
          isProcessing: processing || processingChatIds.length > 0,
          processingChatIds,
        };
      }

      const legacyProcessingChatIds = processing
        ? s.legacyProcessingChatIds.includes(chatId)
          ? s.legacyProcessingChatIds
          : [...s.legacyProcessingChatIds, chatId]
        : s.legacyProcessingChatIds.filter((id) => id !== chatId);
      const processingChatIds = Array.from(
        new Set([...legacyProcessingChatIds, ...Object.keys(s.processingRunIdsByChat)]),
      );

      return {
        legacyProcessingChatIds,
        processingChatIds,
        isProcessing: s.legacyGlobalProcessing || processingChatIds.length > 0,
      };
    }),
  setProcessingRun: (runId, processing, chatId) =>
    set((s) => {
      const processingRunIdsByChat = { ...s.processingRunIdsByChat };
      const runIds = new Set(processingRunIdsByChat[chatId] ?? []);
      if (processing) runIds.add(runId);
      else runIds.delete(runId);
      if (runIds.size > 0) processingRunIdsByChat[chatId] = [...runIds];
      else delete processingRunIdsByChat[chatId];

      const processingChatIds = Array.from(
        new Set([...s.legacyProcessingChatIds, ...Object.keys(processingRunIdsByChat)]),
      );
      return {
        processingRunIdsByChat,
        processingChatIds,
        isProcessing: s.legacyGlobalProcessing || processingChatIds.length > 0,
      };
    }),

  addResult: (agentId, result) =>
    set((s) => {
      const results = new Map(s.lastResults);
      results.set(agentId, result);
      // Cap at 50 entries — evict oldest
      if (results.size > 50) {
        const first = results.keys().next().value;
        if (first !== undefined) results.delete(first);
      }
      return { lastResults: results };
    }),

  addDebugEntry: (entry) => {
    const stamped = { ...entry, timestamp: entry.timestamp ?? Date.now() };
    logAgentDebugToBrowserConsole(stamped);
  },

  setFailedAgentTypes: (types, chatId = null) =>
    set({
      failedAgentTypes: types,
      failedAgentChatId: chatId,
      failedAgentFailures: types.map((agentType) => ({
        agentType,
        agentName: agentType,
        error: null,
        reasonLabel: null,
        retryTarget: null,
      })),
    }),
  setFailedAgentFailures: (failures, chatId = null) =>
    set({
      failedAgentTypes: Array.from(new Set(failures.map((failure) => failure.agentType))),
      failedAgentChatId: chatId,
      failedAgentFailures: failures,
    }),
  clearFailedAgentTypes: (chatId = null) =>
    set((s) => {
      if (chatId && s.failedAgentChatId && s.failedAgentChatId !== chatId) return {};
      return { failedAgentTypes: [], failedAgentChatId: null, failedAgentFailures: [] };
    }),

  addThoughtBubble: (agentId, agentName, content) =>
    set((s) => ({
      thoughtBubbles: [...s.thoughtBubbles, { agentId, agentName, content, timestamp: Date.now() }].slice(-50),
    })),

  dismissThoughtBubble: (index) =>
    set((s) => ({
      thoughtBubbles: s.thoughtBubbles.filter((_, i) => i !== index),
    })),

  clearThoughtBubbles: () => set({ thoughtBubbles: [] }),

  addEchoMessage: (characterName, reaction) =>
    set((s) => {
      const queued = enqueueEchoChamberMessages(
        {
          messages: s.echoMessages,
          visibleCount: s.echoVisibleCount,
          baseline: s.echoBaseline,
        },
        [{ characterName, reaction }],
      );
      return {
        echoMessages: queued.messages,
        echoVisibleCount: queued.visibleCount,
        echoBaseline: queued.baseline,
      };
    }),

  enqueueEchoMessages: (reactions) =>
    set((s) => {
      const queued = enqueueEchoChamberMessages(
        {
          messages: s.echoMessages,
          visibleCount: s.echoVisibleCount,
          baseline: s.echoBaseline,
        },
        reactions,
      );
      return {
        echoMessages: queued.messages,
        echoVisibleCount: queued.visibleCount,
        echoBaseline: queued.baseline,
      };
    }),

  setEchoMessages: (messages) =>
    set((state) => {
      const nextMessages = messages.slice(-ECHO_CHAMBER_MESSAGE_LIMIT);
      return {
        echoMessages: nextMessages,
        echoVisibleCount: Math.min(state.echoVisibleCount, nextMessages.length),
        echoBaseline: Math.min(state.echoBaseline, nextMessages.length),
      };
    }),

  clearEchoMessages: () => set({ echoMessages: [], echoVisibleCount: 0, echoBaseline: 0, echoLoadedChatId: null }),

  setEchoVisibleCount: (count) => set({ echoVisibleCount: count }),
  revealNextEchoMessage: () =>
    set((state) => ({
      echoVisibleCount: Math.min(state.echoVisibleCount + 1, state.echoMessages.length),
    })),
  setEchoBaseline: (count) => set({ echoBaseline: count }),
  setEchoLoadedChatId: (chatId) => set({ echoLoadedChatId: chatId }),

  setCyoaChoices: (choices, chatId = null) => set({ cyoaChoices: choices, cyoaChoicesChatId: chatId }),
  clearCyoaChoices: () => set({ cyoaChoices: [], cyoaChoicesChatId: null }),
  setMariChips: (chatId, chips) => set({ mariChips: chips, mariChipsChatId: chatId }),
  clearMariChips: () => set({ mariChips: [], mariChipsChatId: null }),
  setMariPlan: (chatId, steps) =>
    set({ mariPlan: steps, mariPlanChatId: chatId, mariPlanCursor: 0, mariPlanAnswers: {} }),
  recordMariPlanAnswer: (fieldKey, value) => {
    const { mariPlan, mariPlanCursor, mariPlanAnswers } = get();
    const nextAnswers = { ...mariPlanAnswers, [fieldKey]: value };
    const nextCursor = mariPlanCursor + 1;
    if (!mariPlan || nextCursor >= mariPlan.length) {
      set({ mariPlanAnswers: nextAnswers });
      return "complete";
    }
    set({ mariPlanAnswers: nextAnswers, mariPlanCursor: nextCursor });
    return "advanced";
  },
  clearMariPlan: () => set({ mariPlan: null, mariPlanChatId: null, mariPlanCursor: 0, mariPlanAnswers: {} }),

  setYoutubePlay: ({ searchQuery, mood }) =>
    set((s) => ({ youtubePlay: { searchQuery, mood, nonce: (s.youtubePlay?.nonce ?? 0) + 1 } })),
  setYoutubeVolume: (volume) => set({ youtubeVolume: volume }),
  clearYoutube: () => set({ youtubePlay: null, youtubeVolume: null }),
  setLocalMusicPlay: ({ path, title, mood }) =>
    set((s) => ({ localMusicPlay: { path, title, mood, nonce: (s.localMusicPlay?.nonce ?? 0) + 1 } })),
  setLocalMusicVolume: (volume) => set({ localMusicVolume: volume }),
  clearLocalMusic: () => set({ localMusicPlay: null, localMusicVolume: null }),

  enqueuePendingCardUpdate: (entry) =>
    set((s) => ({ pendingCardUpdates: [...s.pendingCardUpdates, entry].slice(-20) })),
  dismissPendingCardUpdate: (id) =>
    set((s) => ({ pendingCardUpdates: s.pendingCardUpdates.filter((e) => e.id !== id) })),
  clearPendingCardUpdates: () => set({ pendingCardUpdates: [] }),
  enqueuePendingAgentWriteApproval: (entry) =>
    set((s) => ({ pendingAgentWriteApprovals: [...s.pendingAgentWriteApprovals, entry].slice(-20) })),
  dismissPendingAgentWriteApproval: (id) =>
    set((s) => ({
      pendingAgentWriteApprovals: s.pendingAgentWriteApprovals.filter((entry) => entry.id !== id),
    })),
  clearPendingAgentWriteApprovals: () => set({ pendingAgentWriteApprovals: [] }),

  setAgentTrackQueue: (chatId, agents) =>
    set({
      agentTrackChatId: chatId,
      agentTrackQueue: agents.map((a, index) => ({
        agentType: a.agentType,
        agentName: a.agentName,
        phase: a.phase,
        status: "queued" as const,
        order: index,
        // The server can pre-compute batch clustering in agent_queue so the
        // UI shows the correct batch grouping immediately in "queued" state
        // rather than waiting for the first agent_start to arrive.
        batchId: a.batchId ?? null,
      })),
    }),

  addAgentTrackEntries: (chatId, agents) =>
    set((s) => {
      if (s.agentTrackChatId !== chatId) return {};
      if (s.agentTrackQueue.length === 0) return {};
      const existing = new Set(s.agentTrackQueue.map((e) => e.agentType));
      const fresh = agents.filter((a) => !existing.has(a.agentType));
      if (fresh.length === 0) return {};
      const nextOrder = s.agentTrackQueue.reduce((m, e) => Math.max(m, e.order), -1) + 1;
      return {
        agentTrackQueue: [
          ...s.agentTrackQueue,
          ...fresh.map((a, i) => ({
            agentType: a.agentType,
            agentName: a.agentName,
            phase: a.phase,
            status: (a.status ?? "queued") as AgentTrackStatus,
            order: nextOrder + i,
            batchId: null,
          })),
        ],
      };
    }),

  removeAgentTrackEntry: (chatId, agentType) =>
    set((s) => {
      if (s.agentTrackChatId !== chatId) return {};
      if (!s.agentTrackQueue.some((e) => e.agentType === agentType)) return {};
      return {
        agentTrackQueue: s.agentTrackQueue.filter((e) => e.agentType !== agentType),
      };
    }),

  markAgentTrackRunning: (agentType, batchId = null) =>
    set((s) => ({
      agentTrackQueue: s.agentTrackQueue.map((entry) =>
        entry.agentType === agentType && entry.status === "queued"
          ? {
              ...entry,
              status: "running" as const,
              // Keep the id the server pre-planned in agent_queue when
              // present — the runtime one that comes back on agent_start
              // matches by design. Fall back to the runtime id only if the
              // entry didn't have one to begin with.
              batchId: entry.batchId ?? batchId,
            }
          : entry,
      ),
    })),

  markAgentTrackPhaseRunning: (phase) =>
    set((s) => {
      // The server runs agents within a phase concurrently (grouped by
      // provider+model). Promote every queued agent in this phase, not just
      // the first — otherwise the widgets look stuck while the batch runs.
      // The special value "retry" (emitted by the retry-agents route) promotes
      // every queued entry regardless of its real phase, since the retry route
      // fires them together.
      const matches = (entryPhase: string) => phase === "retry" || entryPhase === phase;
      const hasQueued = s.agentTrackQueue.some((e) => matches(e.phase) && e.status === "queued");
      if (!hasQueued) return {};
      return {
        agentTrackQueue: s.agentTrackQueue.map((entry) =>
          matches(entry.phase) && entry.status === "queued" ? { ...entry, status: "running" as const } : entry,
        ),
      };
    }),

  markAgentTrackCompleted: (agentType, success) =>
    set((s) => ({
      // Only flip the addressed entry. The server drives phase transitions via
      // agent_start events, so the store must not "promote" siblings on its own.
      agentTrackQueue: s.agentTrackQueue.map((entry) =>
        entry.agentType === agentType && entry.status !== "completed" && entry.status !== "failed"
          ? { ...entry, status: success ? ("completed" as const) : ("failed" as const) }
          : entry,
      ),
    })),

  markAgentTrackFailed: (agentType) =>
    set((s) => ({
      agentTrackQueue: s.agentTrackQueue.map((entry) =>
        entry.agentType === agentType && entry.status !== "completed" && entry.status !== "failed"
          ? { ...entry, status: "failed" as const }
          : entry,
      ),
    })),

  settleAgentTrackQueueAsFailed: (chatId) =>
    set((s) => {
      // Ignore stale calls from an unrelated chat's generation cleanup — the
      // active queue may already belong to another chat by then.
      if (s.agentTrackChatId !== chatId) return {};
      const hasUnfinished = s.agentTrackQueue.some((e) => e.status === "queued" || e.status === "running");
      if (!hasUnfinished) return {};
      return {
        agentTrackQueue: s.agentTrackQueue.map((entry) =>
          entry.status === "queued" || entry.status === "running" ? { ...entry, status: "failed" as const } : entry,
        ),
      };
    }),

  clearAgentTrackQueue: () => set({ agentTrackQueue: [], agentTrackChatId: null }),

  resetForChatChange: () =>
    set((state) => ({
      ...createInitialAgentDataState(),
      mariChips: state.mariChips,
      mariChipsChatId: state.mariChipsChatId,
      mariPlan: state.mariPlan,
      mariPlanChatId: state.mariPlanChatId,
      mariPlanCursor: state.mariPlanCursor,
      mariPlanAnswers: state.mariPlanAnswers,
    })),
  reset: () => set(createInitialAgentDataState()),
}));
