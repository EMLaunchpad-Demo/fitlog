import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  BetaAssistantMessageParam,
  BetaContentBlockParam,
  BetaImageBlockParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
  BetaUserMessageParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { ClaudeError, type CoachModel, costOf, createMessage } from '@/ai/api';
import { deleteImages, loadImage } from '@/ai/images';
import { getApiKey } from '@/ai/key';
import { SYSTEM_PROMPT, renderProfile } from '@/ai/prompt';
import { TOOLS, TOOLS_NON_STRICT, type ToolAction, type UndoRecord, runTool } from '@/ai/tools';
import { longDate } from '@/lib/format';
import { useStore } from '@/store/store';

/** The conversation only ever holds user and assistant turns. */
export type ChatMessage = BetaUserMessageParam | BetaAssistantMessageParam;

/** Simple string hash, to detect when the prompt or tools changed in an app update. */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const PROMPT_VERSION = hash(SYSTEM_PROMPT + JSON.stringify(TOOLS));

/** Image blocks in the stored history point to locally stored photos. */
const IMAGE_REF = 'fitlog-image-ref:';
/** Upper bound on model calls per user message (each tool round is one call). */
const MAX_STEPS = 8;

interface CoachState {
  model: CoachModel;
  /** Conversation exactly as sent to the API. Append-only: earlier turns are never edited. */
  messages: ChatMessage[];
  /** What each tool call did, keyed by tool_use id (for the chat UI). */
  actions: Record<string, ToolAction>;
  conversationCost: number;
  totalCost: number;
  /** Context size of the last request (all input tokens), to suggest a fresh chat. */
  lastContextTokens: number;
  /**
   * The profile block captured when this conversation started. It stays fixed
   * for the whole conversation: the system prompt must not change mid-conversation.
   */
  profileSnapshot: string;
  /** Version of system prompt + tools this conversation started with. */
  promptVersion: string;
  /** Coach actions the user has undone (keyed by tool_use id). */
  undone: Record<string, true>;
  /** Notes for the coach, sent along with the next user message (e.g. undone actions). */
  pendingNotes: string[];
  /** False once the API rejected the strict tool schemas; from then on tools are sent without `strict`. */
  strictTools: boolean;
  // runtime only
  /** Undo data for this session's coach actions (not persisted). */
  undoable: Record<string, UndoRecord>;
  busy: boolean;
  activity: string | null;
  error: string | null;
  notice: string | null;
}

export const useCoach = create<CoachState>()(
  persist(
    (): CoachState => ({
      model: 'claude-opus-5-5',
      messages: [],
      actions: {},
      conversationCost: 0,
      totalCost: 0,
      lastContextTokens: 0,
      profileSnapshot: '',
      promptVersion: PROMPT_VERSION,
      undone: {},
      pendingNotes: [],
      strictTools: true,
      undoable: {},
      busy: false,
      activity: null,
      error: null,
      notice: null,
    }),
    {
      name: 'fitlog-coach',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        model: s.model,
        messages: s.messages,
        actions: s.actions,
        conversationCost: s.conversationCost,
        totalCost: s.totalCost,
        lastContextTokens: s.lastContextTokens,
        profileSnapshot: s.profileSnapshot,
        promptVersion: s.promptVersion,
        undone: s.undone,
        pendingNotes: s.pendingNotes,
        strictTools: s.strictTools,
      }),
    },
  ),
);

export function setCoachModel(model: CoachModel) {
  useCoach.setState({ model });
}

export function imageRefBlock(imageId: string): BetaImageBlockParam {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/jpeg',
      data: IMAGE_REF + imageId,
    },
  };
}

export function imageIdOf(block: BetaContentBlockParam): string | null {
  if (block.type !== 'image' || block.source.type !== 'base64') return null;
  return block.source.data.startsWith(IMAGE_REF) ? block.source.data.slice(IMAGE_REF.length) : null;
}

/** Replace stored image references with the actual base64 data, without touching the stored history. */
async function expandImages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (m) => {
      if (typeof m.content === 'string' || !m.content.some((b) => imageIdOf(b))) return m;
      const content = await Promise.all(
        m.content.map(async (b): Promise<BetaContentBlockParam> => {
          const id = imageIdOf(b);
          if (!id) return b;
          const data = await loadImage(id);
          if (!data) return { type: 'text', text: '[foto niet meer beschikbaar]' };
          return {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data },
          };
        }),
      );
      return { ...m, content };
    }),
  );
}

function contextBlock(notes: string[], now = new Date()): string {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const extra = notes.map((n) => `\n${n}`).join('');
  return `<context>Nu: ${longDate(now)} ${now.getFullYear()}, ${time}${extra}</context>`;
}

/** The user-visible text of a user message (without the context block). */
export function isContextBlock(block: BetaContentBlockParam): boolean {
  return block.type === 'text' && block.text.startsWith('<context>');
}

const append = (...msgs: ChatMessage[]) =>
  useCoach.setState((s) => ({ messages: [...s.messages, ...msgs] }));

let controller: AbortController | null = null;

export function cancelCoach() {
  controller?.abort();
}

/** Sends one user message and runs the tool loop until Claude is done. */
export async function sendToCoach(text: string, imageIds: string[] = []): Promise<void> {
  if (useCoach.getState().busy) return;
  const apiKey = await getApiKey();
  if (!apiKey) {
    useCoach.setState({
      error: 'Stel eerst je Anthropic API-key in (tandwiel rechtsboven).',
    });
    return;
  }

  // The app was updated with a different prompt or tools: the old conversation
  // can't continue with them, so start a fresh one.
  if (useCoach.getState().messages.length && useCoach.getState().promptVersion !== PROMPT_VERSION) {
    await newConversation();
  }

  const content: BetaContentBlockParam[] = [
    { type: 'text', text: contextBlock(useCoach.getState().pendingNotes) },
    ...imageIds.map(imageRefBlock),
  ];
  if (text.trim()) content.push({ type: 'text', text: text.trim() });
  // A new conversation picks up the current profile; a running one keeps its own.
  if (!useCoach.getState().messages.length) {
    useCoach.setState({
      profileSnapshot: renderProfile(useStore.getState().profile),
      promptVersion: PROMPT_VERSION,
    });
  }
  useCoach.setState({ pendingNotes: [] });
  append({ role: 'user', content });
  await runLoop(apiKey);
}

/** Re-runs the last unanswered user message (after an error). */
export async function retryCoach(): Promise<void> {
  const { busy, messages } = useCoach.getState();
  if (busy || messages[messages.length - 1]?.role !== 'user') return;
  const apiKey = await getApiKey();
  if (!apiKey) return;
  await runLoop(apiKey);
}

/** Schema-complexity rejections of strict tool schemas (400). */
const SCHEMA_TOO_COMPLEX =
  /union types|optional parameters|strict tools|too complex for compilation|compil/i;

async function requestTurn(apiKey: string, signal: AbortSignal) {
  const { messages, model, profileSnapshot, strictTools } = useCoach.getState();
  // A copy with the photos filled in; the stored history keeps only references.
  const apiMessages = await expandImages(messages);
  const send = (strict: boolean) =>
    createMessage(
      apiKey,
      {
        model,
        max_tokens: 16000,
        system: profileSnapshot
          ? [
              { type: 'text', text: SYSTEM_PROMPT },
              { type: 'text', text: profileSnapshot },
            ]
          : SYSTEM_PROMPT,
        tools: strict ? TOOLS : TOOLS_NON_STRICT,
        messages: apiMessages,
        output_config: { effort: 'medium' },
        cache_control: { type: 'ephemeral' },
      },
      { signal },
    );
  try {
    return await send(strictTools);
  } catch (e) {
    // The tool list may only change before the first assistant reply of a conversation.
    const fresh = !messages.some((m) => m.role === 'assistant');
    if (
      strictTools &&
      fresh &&
      e instanceof ClaudeError &&
      e.status === 400 &&
      SCHEMA_TOO_COMPLEX.test(e.message)
    ) {
      useCoach.setState({ strictTools: false });
      return send(false);
    }
    throw e;
  }
}

async function runLoop(apiKey: string): Promise<void> {
  controller = new AbortController();
  useCoach.setState({
    busy: true,
    activity: 'Denkt na…',
    error: null,
    notice: null,
  });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await requestTurn(apiKey, controller.signal);

      const cost = costOf(response.model, response.usage);
      useCoach.setState((s) => ({
        conversationCost: s.conversationCost + cost,
        totalCost: s.totalCost + cost,
        lastContextTokens:
          response.usage.input_tokens +
          (response.usage.cache_read_input_tokens ?? 0) +
          (response.usage.cache_creation_input_tokens ?? 0),
      }));

      // Keep the assistant turn exactly as returned (thinking blocks included).
      if (response.content.length) {
        append({
          role: 'assistant',
          content: response.content as BetaContentBlockParam[],
        });
      }

      if (response.stop_reason === 'refusal') {
        useCoach.setState({
          notice: 'Claude kon hier geen antwoord op geven. Probeer het anders te formuleren.',
        });
        break;
      }

      const toolUses = response.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use');
      if (!toolUses.length) {
        if (response.stop_reason === 'pause_turn') continue;
        if (response.stop_reason === 'max_tokens')
          useCoach.setState({
            notice: 'Het antwoord werd afgekapt omdat het te lang werd.',
          });
        break;
      }

      const results: BetaToolResultBlockParam[] = [];
      const actions: Record<string, ToolAction> = {};
      const undoable: Record<string, UndoRecord> = {};
      for (const call of toolUses) {
        useCoach.setState({ activity: activityLabel(call.name) });
        const outcome = runTool(call.name, call.input);
        actions[call.id] = outcome.action;
        if (outcome.undo) undoable[call.id] = outcome.undo;
        results.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: outcome.content,
          is_error: outcome.isError,
        });
      }
      useCoach.setState((s) => ({
        actions: { ...s.actions, ...actions },
        undoable: { ...s.undoable, ...undoable },
        activity: 'Denkt na…',
      }));
      append({ role: 'user', content: results });

      if (step === MAX_STEPS - 1)
        useCoach.setState({
          notice:
            'De coach heeft veel stappen nodig gehad en is gestopt. Vraag gerust om verder te gaan.',
        });
    }
  } catch (e) {
    const message = e instanceof ClaudeError ? e.message : 'Er ging iets mis. Probeer het opnieuw.';
    if (!(e instanceof ClaudeError && e.message === 'Geannuleerd.'))
      useCoach.setState({ error: message });
  } finally {
    controller = null;
    useCoach.setState({ busy: false, activity: null });
  }
}

function activityLabel(tool: string): string {
  if (tool.startsWith('get_')) return 'Gegevens bekijken…';
  if (tool.includes('plan')) return 'Schema aanpassen…';
  if (tool.includes('food') || tool === 'set_water' || tool === 'set_nutrition_goals')
    return 'Voeding bijwerken…';
  if (tool.includes('workout')) return 'Training bijwerken…';
  if (tool.includes('weight')) return 'Gewicht bijwerken…';
  if (tool === 'update_profile') return 'Profiel bijwerken…';
  return 'Bezig…';
}

/** Undo is possible as long as nothing touched the same data since the action. */
export function canUndo(record: UndoRecord | undefined): boolean {
  if (!record) return false;
  const s = useStore.getState();
  return record.keys.every((k) => s[k] === record.after[k]);
}

/** Restores the app data from before a coach action and tells the coach next turn. */
export function undoCoachAction(toolUseId: string) {
  const { undoable, actions } = useCoach.getState();
  const record = undoable[toolUseId];
  if (!record || !canUndo(record)) return;
  useStore.setState(record.before);
  const label = actions[toolUseId]?.label ?? 'een actie';
  useCoach.setState((s) => {
    const rest = { ...s.undoable };
    delete rest[toolUseId];
    return {
      undoable: rest,
      undone: { ...s.undone, [toolUseId]: true },
      pendingNotes: [
        ...s.pendingNotes,
        `De gebruiker heeft deze actie van jou ongedaan gemaakt: ${label}`,
      ],
    };
  });
}

/** Starts a fresh conversation and removes the photos of the old one. */
export async function newConversation() {
  const { messages, busy } = useCoach.getState();
  if (busy) cancelCoach();
  const ids = messages.flatMap((m) =>
    typeof m.content === 'string' ? [] : m.content.map(imageIdOf).filter((x): x is string => !!x),
  );
  useCoach.setState({
    messages: [],
    actions: {},
    conversationCost: 0,
    lastContextTokens: 0,
    profileSnapshot: '',
    promptVersion: PROMPT_VERSION,
    undone: {},
    undoable: {},
    pendingNotes: [],
    error: null,
    notice: null,
  });
  await deleteImages(ids);
}

/** True when the saved profile differs from the one this conversation started with. */
export function useProfileOutdated(): boolean {
  const profile = useStore((s) => s.profile);
  const snapshot = useCoach((s) => s.profileSnapshot);
  const started = useCoach((s) => s.messages.length > 0);
  return started && renderProfile(profile) !== snapshot;
}

/** True when an app update changed the coach's prompt or tools since this conversation began. */
export function useCoachUpdated(): boolean {
  return useCoach((s) => s.messages.length > 0 && s.promptVersion !== PROMPT_VERSION);
}
