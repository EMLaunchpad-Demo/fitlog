/**
 * Minimal Claude Messages API client over fetch.
 *
 * The official @anthropic-ai/sdk does not support React Native, so requests go
 * over plain HTTP. The SDK package is only used for its TypeScript types
 * (type-only imports, nothing from it is bundled).
 */
import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { Platform } from 'react-native';

export const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
/**
 * Server-side fallback when the model's safety classifiers decline a request.
 * Claude Haiku 5.5 has no server-side fallback, so it gets neither the beta nor the parameter.
 */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const supportsFallback = (model: string) => !model.startsWith('claude-haiku');

export type CoachModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

export const MODELS: {
  id: CoachModel;
  label: string;
  note: string;
  /** USD per million tokens */
  price: {
    input: number;
    output: number;
    cacheWrite: number;
    cacheRead: number;
  };
}[] = [
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    note: 'Slimst. Beste schattingen van foto’s en schema’s.',
    price: { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    note: 'Sneller en ongeveer half zo duur.',
    price: { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    note: 'Snelst en veruit het goedkoopst.',
    price: { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 },
  },
];

export type CreateBody = Omit<MessageCreateParamsNonStreaming, 'betas'> & {
  /** Top-level automatic prompt caching. */
  cache_control?: { type: 'ephemeral' };
};

export class ClaudeError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function friendlyError(status: number, body: unknown): ClaudeError {
  const apiMessage =
    typeof body === 'object' && body && 'error' in body
      ? String((body as { error?: { message?: string } }).error?.message ?? '')
      : '';
  if (status === 401)
    return new ClaudeError(
      'Je API-key is ongeldig. Controleer hem bij Coach-instellingen.',
      status,
      false,
    );
  if (status === 403)
    return new ClaudeError('Deze API-key heeft geen toegang tot dit model.', status, false);
  if (status === 400 && /credit balance/i.test(apiMessage))
    return new ClaudeError(
      'Je tegoed in de Anthropic Console is op. Waardeer op via console.anthropic.com.',
      status,
      false,
    );
  if (status === 413)
    return new ClaudeError('Het bericht (of de foto) is te groot.', status, false);
  if (status === 429)
    return new ClaudeError(
      'Even te veel verzoeken. Probeer het over een minuutje opnieuw.',
      status,
      true,
    );
  if (status === 529 || status >= 500)
    return new ClaudeError('Claude is even overbelast. Probeer het zo opnieuw.', status, true);
  return new ClaudeError(
    apiMessage ? `Claude gaf een fout (${status}): ${apiMessage}` : `Onverwachte fout (${status}).`,
    status,
    false,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST /v1/messages (non-streaming: React Native's fetch has no response streams). */
export async function createMessage(
  apiKey: string,
  body: CreateBody,
  opts: { signal?: AbortSignal; maxRetries?: number } = {},
): Promise<BetaMessage> {
  const maxRetries = opts.maxRetries ?? 2;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        signal: opts.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          ...(supportsFallback(body.model) ? { 'anthropic-beta': FALLBACK_BETA } : {}),
          // Only needed when the request comes from a browser (web build).
          ...(Platform.OS === 'web' ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
        },
        body: JSON.stringify(
          supportsFallback(body.model) ? { ...body, fallbacks: 'default' } : body,
        ),
      });
    } catch {
      if (opts.signal?.aborted) throw new ClaudeError('Geannuleerd.', null, false);
      if (attempt < maxRetries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw new ClaudeError('Geen verbinding met Claude. Check je internet.', null, true);
    }

    if (res.ok) return (await res.json()) as BetaMessage;

    let errBody: unknown = null;
    try {
      errBody = await res.json();
    } catch {
      // ignore non-JSON error bodies
    }
    const err = friendlyError(res.status, errBody);
    if (err.retryable && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * 2 ** attempt,
      );
      continue;
    }
    throw err;
  }
}

/** Estimated cost in USD for one response's usage. */
export function costOf(
  model: string,
  usage: Pick<
    BetaMessage['usage'],
    'input_tokens' | 'output_tokens' | 'cache_creation_input_tokens' | 'cache_read_input_tokens'
  >,
): number {
  const price = (MODELS.find((m) => m.id === model) ?? MODELS[0]).price;
  return (
    (usage.input_tokens * price.input +
      usage.output_tokens * price.output +
      (usage.cache_creation_input_tokens ?? 0) * price.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * price.cacheRead) /
    1_000_000
  );
}

/** Checks a key with GET /v1/models (free, no tokens used). */
export async function verifyKey(apiKey: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': API_VERSION,
        ...(Platform.OS === 'web' ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
      },
    });
  } catch {
    throw new ClaudeError('Geen verbinding met Anthropic. Check je internet.', null, true);
  }
  if (res.ok) return;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  throw friendlyError(res.status, body);
}
