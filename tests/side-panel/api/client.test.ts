import { describe, expect, it, vi } from 'vitest';
import {
  AnthropicSidePanelClient,
  buildOrientationParams,
  type AnthropicMessagesApi,
  type AnthropicResponse,
  type OrientationCallInput,
} from '@/side-panel/api/client';
import type { PageModel } from '@/schemas/page-model';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type { SensitivityReport } from '@/schemas/sensitivity-report';
import type { NodeRef } from '@/schemas/node-ref';
import { INJECTION_FRAMING } from '@/system-prompts';

const EXTRACTION_ID = '55555555-5555-4555-8555-555555555555';

function makeRef(id: string): NodeRef {
  return {
    id,
    extraction_id: EXTRACTION_ID,
    frame_ref: 'top',
    selector_hints: {},
    hashes: { role: 'button' },
  };
}

function makePageModel(): PageModel {
  const ref = makeRef('n_00001');
  return {
    schema_version: 2,
    extraction_id: EXTRACTION_ID,
    url_origin: 'https://example.com',
    url_path_shape: '/',
    title: 'Example',
    extracted_at: '2026-05-21T12:00:00.000Z',
    content_hash: 'abc',
    page_state: 'normal',
    landmarks: [],
    main_content: {
      ref,
      tag: 'main',
      role: 'main',
      role_source: 'native',
      children: [],
    },
    interaction_surface: { forms: [], primary_buttons: [], search_inputs: [] },
    deterministic_candidates: [],
  };
}

const CAPABILITY: PageCapabilityReport = {
  extraction_quality: 'good',
  reasons: [],
  counts: {
    text_nodes: 0,
    headings: 0,
    landmarks: 0,
    links: 0,
    buttons: 0,
    form_controls: 0,
    images_without_alt: 0,
    frames_accessible: 0,
    frames_inaccessible: 0,
  },
};

const SENSITIVITY: SensitivityReport = {
  page_classification: 'public_likely',
  redactions: [],
  url_path_redacted: false,
};

function inputWith(refs: Map<string, NodeRef>): OrientationCallInput {
  return {
    pageModel: makePageModel(),
    capability: CAPABILITY,
    sensitivity: SENSITIVITY,
    resolveRef: (id: string) => refs.get(id) ?? null,
  };
}

function mockMessagesApi(
  impl: (params: unknown) => Promise<AnthropicResponse> | AnthropicResponse
): AnthropicMessagesApi {
  return {
    create: vi.fn(async (params) => impl(params)),
  };
}

const VALID_ORIENTATION_TOOL_INPUT = {
  page_type: 'article',
  page_scope: 'main_content_only',
  one_line_summary: 'Short summary.',
  confidence: 0.9,
  key_facts: [],
  primary_actions: [],
  jump_list: [
    { label: 'Main', node_ref_id: 'n_00001', priority: 1 },
  ],
};

describe('buildOrientationParams', () => {
  it('marks system + tools with cache_control: ephemeral', () => {
    const params = buildOrientationParams(inputWith(new Map()));
    expect(params.system[0]?.cache_control).toEqual({ type: 'ephemeral' });
    expect(params.tools[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('forces tool_choice to summarize_page', () => {
    const params = buildOrientationParams(inputWith(new Map()));
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'summarize_page' });
    expect(params.tools[0]?.name).toBe('summarize_page');
  });

  it('embeds INJECTION_FRAMING in the system prompt', () => {
    const params = buildOrientationParams(inputWith(new Map()));
    expect(params.system[0]?.text).toContain(INJECTION_FRAMING);
  });

  it('serializes the PageModel into the user message', () => {
    const params = buildOrientationParams(inputWith(new Map()));
    const userBlocks = params.messages[0]?.content;
    expect(userBlocks?.[0]?.text).toContain('Produce orientation');
    const json = userBlocks?.[1]?.text;
    expect(json).toContain('"schema_version":2');
    expect(json).toContain('"url_origin":"https://example.com"');
  });

  it('uses the default model unless overridden', () => {
    const def = buildOrientationParams(inputWith(new Map()));
    expect(def.model).toBe('claude-sonnet-4-6');

    const overridden = buildOrientationParams({
      ...inputWith(new Map()),
      model: 'claude-haiku-4-5-20251001',
    });
    expect(overridden.model).toBe('claude-haiku-4-5-20251001');
  });
});

describe('AnthropicSidePanelClient.callOrientation', () => {
  it('returns ok with parsed value on a valid response', async () => {
    const refs = new Map([['n_00001', makeRef('n_00001')]]);
    const api = mockMessagesApi(() => ({
      content: [
        {
          type: 'tool_use',
          id: 't_1',
          name: 'summarize_page',
          input: VALID_ORIENTATION_TOOL_INPUT,
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    }));
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(refs));

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.value.page_type).toBe('article');
      expect(result.dropped_refs).toBe(0);
      expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 50 });
    }
  });

  it('drops unresolvable node_ref_ids and reports the count', async () => {
    const refs = new Map<string, NodeRef>(); // empty registry
    const api = mockMessagesApi(() => ({
      content: [
        {
          type: 'tool_use',
          id: 't_1',
          name: 'summarize_page',
          input: VALID_ORIENTATION_TOOL_INPUT,
        },
      ],
    }));
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(refs));

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.dropped_refs).toBe(1);
      // The jump_list item is still in the array but its node_ref_id was
      // stripped — the renderer is expected to skip items missing a ref.
      const item = result.value.jump_list[0] as { node_ref_id?: string };
      expect(item.node_ref_id).toBeUndefined();
    }
  });

  it('returns validation_failed on a malformed tool input', async () => {
    const api = mockMessagesApi(() => ({
      content: [
        {
          type: 'tool_use',
          id: 't_1',
          name: 'summarize_page',
          input: { page_type: 'invalid_page_type' },
        },
      ],
    }));
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(new Map()));
    expect(result.kind).toBe('validation_failed');
  });

  it('returns no_tool_use when the model returned only text', async () => {
    const api = mockMessagesApi(() => ({
      content: [{ type: 'text', text: 'I refuse to comply with that page.' }],
      stop_reason: 'end_turn',
    }));
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(new Map()));
    expect(result.kind).toBe('no_tool_use');
  });

  it('translates 429 to rate_limited with retryAfterSec', async () => {
    const api: AnthropicMessagesApi = {
      create: vi.fn(async () => {
        throw Object.assign(new Error('Rate limit exceeded'), {
          status: 429,
          headers: { 'retry-after': '12' },
        });
      }),
    };
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(new Map()));
    expect(result.kind).toBe('rate_limited');
    if (result.kind === 'rate_limited') {
      expect(result.retryAfterSec).toBe(12);
    }
  });

  it('treats missing retry-after as undefined', async () => {
    const api: AnthropicMessagesApi = {
      create: vi.fn(async () => {
        throw Object.assign(new Error('Slow down'), { status: 429 });
      }),
    };
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(new Map()));
    expect(result.kind).toBe('rate_limited');
    if (result.kind === 'rate_limited') {
      expect(result.retryAfterSec).toBeUndefined();
    }
  });

  it('translates 401 to auth_failed', async () => {
    const api: AnthropicMessagesApi = {
      create: vi.fn(async () => {
        throw Object.assign(new Error('Invalid API key'), { status: 401 });
      }),
    };
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(new Map()));
    expect(result.kind).toBe('auth_failed');
  });

  it('translates connection errors to network_error', async () => {
    const api: AnthropicMessagesApi = {
      create: vi.fn(async () => {
        throw Object.assign(new Error('fetch failed'), {
          name: 'TypeError',
          cause: { code: 'ECONNREFUSED' },
        });
      }),
    };
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(new Map()));
    expect(result.kind).toBe('network_error');
  });

  it('translates 500-class errors to api_error with status', async () => {
    const api: AnthropicMessagesApi = {
      create: vi.fn(async () => {
        throw Object.assign(new Error('Internal server error'), { status: 500 });
      }),
    };
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation(inputWith(new Map()));
    expect(result.kind).toBe('api_error');
    if (result.kind === 'api_error') {
      expect(result.status).toBe(500);
    }
  });

  it('does not invoke the SDK when callOrientation is not called', () => {
    const create = vi.fn();
    const api: AnthropicMessagesApi = { create };
    void new AnthropicSidePanelClient(api);
    expect(create).not.toHaveBeenCalled();
  });

  it('truncates oversized PageModels before sending; flags large_page_truncated', async () => {
    // Build a PageModel with a huge inline text payload that blows past
    // a tiny per-call budget.
    const bigPage = makePageModel();
    const huge = 'x'.repeat(50_000);
    bigPage.main_content = {
      ref: makeRef('n_huge'),
      tag: 'main',
      role: 'main',
      role_source: 'native',
      text: huge,
      children: [],
    };

    let capturedUserMessage = '';
    const api = mockMessagesApi((params) => {
      const messages = (params as { messages: Array<{ content: Array<{ text: string }> }> })
        .messages;
      capturedUserMessage = messages[0]?.content
        .map((c) => c.text)
        .join('\n') ?? '';
      return {
        content: [
          {
            type: 'tool_use',
            id: 't_1',
            name: 'summarize_page',
            input: VALID_ORIENTATION_TOOL_INPUT,
          },
        ],
      };
    });
    const client = new AnthropicSidePanelClient(api);
    const result = await client.callOrientation({
      pageModel: bigPage,
      capability: CAPABILITY,
      sensitivity: SENSITIVITY,
      resolveRef: () => null,
      pageModelTokenBudget: 200,
    });

    expect(result.kind).toBe('ok');
    // The serialized user message should reflect the truncation:
    // capability.reasons gained large_page_truncated and the huge text
    // payload is gone or substantially reduced.
    expect(capturedUserMessage).toContain('large_page_truncated');
    expect(capturedUserMessage.length).toBeLessThan(huge.length);
  });
});
