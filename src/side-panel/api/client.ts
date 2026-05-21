import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { OrientationModelSchema, summarizePageTool } from '@/schemas/orientation-model';
import type { OrientationModel } from '@/schemas/orientation-model';
import type { PageModel } from '@/schemas/page-model';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type { SensitivityReport } from '@/schemas/sensitivity-report';
import type { NodeRef } from '@/schemas/node-ref';
import { validateToolOutput } from '@/schemas/validate';
import { ORIENTATION_SYSTEM_PROMPT } from '@/system-prompts';

/**
 * Default model for Phase 1 per architecture.md §8. Sonnet 4.6's structured
 * output performance is what makes the forced-tool-use contract reliable.
 * Haiku evaluation is a Phase 2 decision after we have real call telemetry.
 */
export const DEFAULT_MODEL = 'claude-sonnet-4-6';

export const ORIENTATION_MAX_TOKENS = 4096;

// ─────────────────────────────────────────────────────────
// Minimal SDK-compatible interface for testability.
// ─────────────────────────────────────────────────────────

export type AnthropicCallParams = {
  model: string;
  max_tokens: number;
  system: ReadonlyArray<{
    type: 'text';
    text: string;
    cache_control?: { type: 'ephemeral' };
  }>;
  tools: ReadonlyArray<{
    name: string;
    description?: string;
    input_schema: object;
    cache_control?: { type: 'ephemeral' };
  }>;
  tool_choice: { type: 'tool'; name: string };
  messages: ReadonlyArray<{
    role: 'user';
    content: ReadonlyArray<{ type: 'text'; text: string }>;
  }>;
};

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

export type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type AnthropicResponse = {
  content: ReadonlyArray<AnthropicContentBlock>;
  usage?: AnthropicUsage;
  model?: string;
  stop_reason?: string | null;
};

export interface AnthropicMessagesApi {
  create(params: AnthropicCallParams): Promise<AnthropicResponse>;
}

// ─────────────────────────────────────────────────────────
// Call surface
// ─────────────────────────────────────────────────────────

export type RefResolver = (id: string) => NodeRef | null;

export type OrientationCallInput = {
  pageModel: PageModel;
  capability: PageCapabilityReport;
  sensitivity: SensitivityReport;
  /** Resolves a node_ref_id from the model's output against the registry. */
  resolveRef: RefResolver;
  /** Optional model override. */
  model?: string;
};

export type OrientationCallResult =
  | {
      kind: 'ok';
      value: OrientationModel;
      dropped_refs: number;
      usage: AnthropicUsage | null;
    }
  | { kind: 'no_tool_use'; message: string }
  | { kind: 'validation_failed'; error: z.ZodError }
  | { kind: 'rate_limited'; retryAfterSec?: number; message: string }
  | { kind: 'auth_failed'; message: string }
  | { kind: 'network_error'; message: string }
  | { kind: 'api_error'; status?: number; message: string };

export class AnthropicSidePanelClient {
  constructor(private readonly messages: AnthropicMessagesApi) {}

  async callOrientation(
    input: OrientationCallInput
  ): Promise<OrientationCallResult> {
    const params = buildOrientationParams(input);

    let response: AnthropicResponse;
    try {
      response = await this.messages.create(params);
    } catch (error: unknown) {
      return translateError(error);
    }

    const toolUse = response.content.find(
      (b): b is Extract<AnthropicContentBlock, { type: 'tool_use' }> =>
        b.type === 'tool_use' && b.name === 'summarize_page'
    );
    if (toolUse === undefined) {
      return {
        kind: 'no_tool_use',
        message:
          'Model did not produce a summarize_page tool call. ' +
          `stop_reason=${response.stop_reason ?? 'unknown'}`,
      };
    }

    const validation = validateToolOutput(
      OrientationModelSchema,
      toolUse.input,
      input.resolveRef
    );
    if (!validation.ok) {
      return { kind: 'validation_failed', error: validation.error };
    }

    return {
      kind: 'ok',
      value: validation.value,
      dropped_refs: validation.dropped_refs,
      usage: response.usage ?? null,
    };
  }
}

// ─────────────────────────────────────────────────────────
// Production factory
// ─────────────────────────────────────────────────────────

/**
 * Build a client backed by the real Anthropic SDK.
 *
 * `dangerouslyAllowBrowser: true` is required because the SDK refuses
 * browser environments by default to guard against shipped server keys.
 * For Pagewise this is acceptable: the extension uses BYOK stored in
 * chrome.storage.local at TRUSTED_CONTEXTS access (see architecture
 * §10.1), and the request goes directly to api.anthropic.com from the
 * side panel — there is no third party with access to the key.
 */
export function createAnthropicClient(apiKey: string): AnthropicSidePanelClient {
  const sdk = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  return new AnthropicSidePanelClient(
    sdk.messages as unknown as AnthropicMessagesApi
  );
}

// ─────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────

export function buildOrientationParams(
  input: OrientationCallInput
): AnthropicCallParams {
  return {
    model: input.model ?? DEFAULT_MODEL,
    max_tokens: ORIENTATION_MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: ORIENTATION_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: summarizePageTool.name,
        description: summarizePageTool.description,
        input_schema: summarizePageTool.input_schema as object,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tool_choice: { type: 'tool', name: summarizePageTool.name },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Produce orientation for this page. The PageModel, PageCapabilityReport, and SensitivityReport follow.',
          },
          {
            type: 'text',
            text: JSON.stringify({
              page_model: input.pageModel,
              capability: input.capability,
              sensitivity: input.sensitivity,
            }),
          },
        ],
      },
    ],
  };
}

function translateError(error: unknown): OrientationCallResult {
  // Duck-type the SDK's error shapes so we don't need to import Anthropic's
  // error classes here (and so tests can produce equivalent shapes).
  if (typeof error !== 'object' || error === null) {
    return { kind: 'api_error', message: String(error) };
  }

  const err = error as {
    status?: number;
    message?: string;
    headers?: Record<string, string | undefined> | Headers;
    name?: string;
    code?: string;
  };
  const message = err.message ?? 'Unknown error';

  if (err.status === 429) {
    return {
      kind: 'rate_limited',
      retryAfterSec: parseRetryAfter(err.headers),
      message,
    };
  }
  if (err.status === 401 || err.status === 403) {
    return { kind: 'auth_failed', message };
  }
  if (
    err.status === undefined &&
    (err.code === 'ECONNREFUSED' ||
      err.code === 'ENOTFOUND' ||
      err.name === 'FetchError' ||
      message.toLowerCase().includes('fetch failed') ||
      message.toLowerCase().includes('network'))
  ) {
    return { kind: 'network_error', message };
  }
  return { kind: 'api_error', status: err.status, message };
}

function parseRetryAfter(
  headers: Record<string, string | undefined> | Headers | undefined
): number | undefined {
  if (headers === undefined) return undefined;
  const raw =
    headers instanceof Headers
      ? headers.get('retry-after')
      : headers['retry-after'] ?? headers['Retry-After'];
  if (raw === null || raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
