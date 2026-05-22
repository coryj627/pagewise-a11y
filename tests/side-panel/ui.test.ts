import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mountSidePanelUi,
  type SidePanelServices,
  type AiOrientationServiceInput,
  type AiOrientationServiceResult,
} from '@/side-panel/ui';
import type { ExtractResponse, JumpResponse } from '@/shared/messages-rpc';
import type { NodeRef } from '@/schemas/node-ref';
import type { PageModel } from '@/schemas/page-model';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type { SensitivityReport } from '@/schemas/sensitivity-report';
import type { OrientationModel } from '@/schemas/orientation-model';

const HTML_PATH = resolve(process.cwd(), 'src/side-panel/index.html');
const EXTRACTION_ID = '77777777-7777-4777-8777-777777777777';

function bodyFromSidePanelHtml(): string {
  const raw = readFileSync(HTML_PATH, 'utf8');
  const match = raw.match(/<body>([\s\S]*?)<\/body>/);
  if (match === null) throw new Error('No <body> in side panel HTML');
  return match[1]!
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '');
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function ref(id: string, opts: { role?: string; name?: string } = {}): NodeRef {
  return {
    id,
    extraction_id: EXTRACTION_ID,
    frame_ref: 'top',
    selector_hints: opts.name !== undefined
      ? { aria: { role: opts.role ?? 'generic', name: opts.name } }
      : {},
    hashes: { role: opts.role ?? 'generic' },
  };
}

function pageModelWithCandidates(candidates: NodeRef[]): PageModel {
  const main: PageModel['main_content'] = {
    ref: ref('n_00000', { role: 'main' }),
    tag: 'main',
    role: 'main',
    role_source: 'native',
    children: [],
  };
  return {
    schema_version: 2,
    extraction_id: EXTRACTION_ID,
    url_origin: 'https://example.com',
    url_path_shape: '/articles/:id',
    title: 'Test page',
    extracted_at: '2026-05-21T12:00:00.000Z',
    content_hash: 'deadbeef',
    page_state: 'normal',
    landmarks: [main],
    main_content: main,
    interaction_surface: { forms: [], primary_buttons: [], search_inputs: [] },
    deterministic_candidates: candidates,
  };
}

const CAPABILITY: PageCapabilityReport = {
  extraction_quality: 'good',
  reasons: [],
  counts: {
    text_nodes: 12,
    headings: 4,
    landmarks: 3,
    links: 7,
    buttons: 2,
    form_controls: 1,
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

function makeOkResponse(
  candidates: NodeRef[] = [],
  overrides: Partial<{ sensitivity: SensitivityReport }> = {}
): ExtractResponse {
  return {
    kind: 'ok',
    model: pageModelWithCandidates(candidates),
    capability: CAPABILITY,
    sensitivity: overrides.sensitivity ?? SENSITIVITY,
  };
}

function makeAiModel(
  jumpRefId = 'n_00000'
): OrientationModel {
  return {
    page_type: 'article',
    page_scope: 'main_content_only',
    one_line_summary: 'An article about CRISPR, ~2400 words, 8 sections.',
    confidence: 0.92,
    key_facts: [
      {
        text: 'Article published 2026-03-12.',
        kind: 'explicit',
        confidence: 0.95,
        source_node_ref_ids: [jumpRefId],
      },
    ],
    primary_actions: [],
    jump_list: [
      {
        label: 'Main content',
        node_ref_id: jumpRefId,
        description: 'Body of the article',
        priority: 1,
        kind: 'main_content',
      },
    ],
    warnings: [],
  };
}

describe('side panel UI', () => {
  let getActiveTabId: Mock<() => Promise<number | null>>;
  let requestExtract: Mock<(tabId: number) => Promise<ExtractResponse>>;
  let requestJump: Mock<(tabId: number, nodeRef: NodeRef) => Promise<JumpResponse>>;
  let runAiOrientation: Mock<
    (input: AiOrientationServiceInput) => Promise<AiOrientationServiceResult>
  >;
  let estimateCall: Mock<
    (input: AiOrientationServiceInput) => Promise<{ tokens: number; cost_usd: number }>
  >;
  let shouldPrompt: Mock<() => Promise<boolean>>;
  let recordConfirmation: Mock<() => Promise<void>>;
  let pageChangedHandlers: Array<(event: { tabId: number; reason: string }) => void>;

  beforeEach(() => {
    document.body.innerHTML = bodyFromSidePanelHtml();
    getActiveTabId = vi.fn(async () => 42);
    requestExtract = vi.fn(async () => makeOkResponse());
    requestJump = vi.fn(async () => ({
      kind: 'ok',
      method: 'exact',
      confidence: 1,
      element: { role: 'main', name: 'Main', tag: 'main' },
    }));
    runAiOrientation = vi.fn(async () => ({ kind: 'no_api_key' }));
    estimateCall = vi.fn(async () => ({ tokens: 18400, cost_usd: 0.06 }));
    shouldPrompt = vi.fn(async () => false);
    recordConfirmation = vi.fn(async () => {});
    pageChangedHandlers = [];
  });

  function mountWithServices(): void {
    const services: SidePanelServices = {
      getActiveTabId,
      requestExtract,
      requestJump,
      runAiOrientation,
      estimateCall,
      disclosure: { shouldPrompt, recordConfirmation },
      subscribePageChanged(handler) {
        pageChangedHandlers.push(handler);
        return () => {
          const i = pageChangedHandlers.indexOf(handler);
          if (i >= 0) pageChangedHandlers.splice(i, 1);
        };
      },
    };
    mountSidePanelUi(document, services);
  }

  function emitPageChanged(event: { tabId: number; reason: string }): void {
    for (const handler of pageChangedHandlers) handler(event);
  }

  it('shows the empty state on first render and hides the result block', () => {
    mountWithServices();
    expect(document.getElementById('empty-state')?.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('result')?.hasAttribute('hidden')).toBe(true);
  });

  it('runs extraction on click and renders meta + counts', async () => {
    mountWithServices();
    const btn = document.getElementById('run-btn') as HTMLButtonElement;

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMicrotasks();

    expect(requestExtract).toHaveBeenCalledWith(42);
    expect(document.getElementById('result')?.hasAttribute('hidden')).toBe(false);
    const meta = document.getElementById('page-meta')!.textContent ?? '';
    expect(meta).toContain('normal');
    expect(meta).toContain('/articles/:id');
    expect(meta).toContain('Test page');

    const counts = document.getElementById('page-counts')!.textContent ?? '';
    expect(counts).toContain('4'); // headings
    expect(counts).toContain('7'); // links

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('ready');
    expect(status.getAttribute('data-tone')).toBe('ok');
  });

  it('renders deterministic_candidates as jump buttons that include role + name', async () => {
    requestExtract = vi.fn(async () =>
      makeOkResponse([
        ref('n_00001', { role: 'main', name: 'Main content' }),
        ref('n_00002', { role: 'heading', name: 'Article title' }),
      ])
    );
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const buttons = document.querySelectorAll<HTMLButtonElement>('#jump-list button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]!.textContent).toContain('Main content');
    expect(buttons[0]!.textContent).toContain('(main)');
    expect(buttons[1]!.textContent).toContain('Article title');
  });

  it('reports the empty-candidate case in the jump list', async () => {
    requestExtract = vi.fn(async () => makeOkResponse([]));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const text = document.getElementById('jump-list')!.textContent ?? '';
    expect(text).toContain('No deterministic jump targets');
  });

  it('clicking a jump button dispatches a jump and announces the outcome', async () => {
    requestExtract = vi.fn(async () =>
      makeOkResponse([ref('n_00010', { role: 'heading', name: 'Intro' })])
    );
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const jumpBtn = document.querySelector<HTMLButtonElement>('#jump-list button')!;
    jumpBtn.click();
    await flushMicrotasks();

    expect(requestJump).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ id: 'n_00010' })
    );
    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('Jumped');
    expect(status.getAttribute('data-tone')).toBe('ok');
  });

  it('announces low-confidence jumps as info, not ok', async () => {
    requestExtract = vi.fn(async () =>
      makeOkResponse([ref('n_a', { role: 'button', name: 'B' })])
    );
    requestJump = vi.fn(async () => ({
      kind: 'ok',
      method: 'fallback',
      confidence: 0.7,
      element: { role: 'button', name: 'B', tag: 'button' },
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    document.querySelector<HTMLButtonElement>('#jump-list button')!.click();
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('fallback');
    expect(status.textContent).toContain('0.70');
    expect(status.getAttribute('data-tone')).toBe('info');
  });

  it('surfaces extract errors in the status region', async () => {
    requestExtract = vi.fn(async () => ({
      kind: 'error',
      reason: 'Could not reach content script.',
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('Could not reach');
    expect(status.getAttribute('data-tone')).toBe('error');
    expect(document.getElementById('result')?.hasAttribute('hidden')).toBe(true);
  });

  it('surfaces jump errors in the status region', async () => {
    requestExtract = vi.fn(async () =>
      makeOkResponse([ref('n_a', { role: 'button', name: 'B' })])
    );
    requestJump = vi.fn(async () => ({ kind: 'error', reason: 'not_resolved' }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    document.querySelector<HTMLButtonElement>('#jump-list button')!.click();
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('not_resolved');
    expect(status.getAttribute('data-tone')).toBe('error');
  });

  it('shows "no active tab" when getActiveTabId returns null', async () => {
    getActiveTabId = vi.fn(async () => null);
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(requestExtract).not.toHaveBeenCalled();
    expect(document.getElementById('status-region')!.textContent).toContain(
      'No active tab'
    );
  });

  it('AI button is disabled before deterministic extraction has succeeded', () => {
    mountWithServices();
    const aiBtn = document.getElementById('run-ai-btn') as HTMLButtonElement;
    expect(aiBtn.disabled).toBe(true);
  });

  it('AI button is enabled after extraction succeeds', async () => {
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    const aiBtn = document.getElementById('run-ai-btn') as HTMLButtonElement;
    expect(aiBtn.disabled).toBe(false);
  });

  it('clicking AI on a public_likely page calls runAiOrientation and renders the result', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'ok',
      value: makeAiModel('n_00000'),
      dropped_refs: 0,
      usage: { input_tokens: 1000, output_tokens: 200 },
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(runAiOrientation).toHaveBeenCalledOnce();
    expect(document.getElementById('ai-result')?.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('ai-summary')?.textContent).toContain('CRISPR');
    expect(document.getElementById('ai-facts')?.textContent).toContain('2026-03-12');
    expect(document.getElementById('ai-jumps')?.textContent).toContain('Main content');
    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('ready');
    expect(status.getAttribute('data-tone')).toBe('ok');
  });

  it('announces "no API key" when runAiOrientation reports it', async () => {
    runAiOrientation = vi.fn(async () => ({ kind: 'no_api_key' }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('No API key');
    expect(status.getAttribute('data-tone')).toBe('error');
    expect(document.getElementById('ai-result')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows the sensitivity confirmation prompt for non-public pages', async () => {
    const sensitiveResponse = makeOkResponse([], {
      sensitivity: {
        page_classification: 'credential_likely',
        redactions: [],
        url_path_redacted: false,
      },
    });
    requestExtract = vi.fn(async () => sensitiveResponse);
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(runAiOrientation).not.toHaveBeenCalled();
    const confirmRegion = document.getElementById('confirm-region')!;
    expect(confirmRegion.hasAttribute('hidden')).toBe(false);
    expect(confirmRegion.textContent).toContain('credential_likely');
  });

  it('proceeds with the AI call when the user confirms a sensitive page', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'ok',
      value: makeAiModel('n_00000'),
      dropped_refs: 0,
      usage: null,
    }));
    const sensitiveResponse = makeOkResponse([], {
      sensitivity: {
        page_classification: 'personal_data_likely',
        redactions: [],
        url_path_redacted: false,
      },
    });
    requestExtract = vi.fn(async () => sensitiveResponse);
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const sendBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#confirm-region button')
    ).find((b) => b.textContent === 'Send anyway')!;
    sendBtn.click();
    await flushMicrotasks();

    expect(runAiOrientation).toHaveBeenCalledOnce();
    expect(document.getElementById('ai-result')?.hasAttribute('hidden')).toBe(false);
  });

  it('respects cancel on the sensitivity confirmation', async () => {
    const sensitiveResponse = makeOkResponse([], {
      sensitivity: {
        page_classification: 'financial_likely',
        redactions: [],
        url_path_redacted: false,
      },
    });
    requestExtract = vi.fn(async () => sensitiveResponse);
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const cancelBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#confirm-region button')
    ).find((b) => b.textContent === 'Cancel')!;
    cancelBtn.click();
    await flushMicrotasks();

    expect(runAiOrientation).not.toHaveBeenCalled();
    expect(document.getElementById('confirm-region')?.hasAttribute('hidden')).toBe(true);
  });

  it('announces rate_limited with the retry-after hint', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'rate_limited',
      retryAfterSec: 30,
      message: 'Slow down',
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('30s');
    expect(status.getAttribute('data-tone')).toBe('error');
  });

  it('surfaces a Retry button after a rate_limited error', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'rate_limited',
      message: 'Slow down',
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const retry = document.getElementById('retry-actions')!;
    expect(retry.hasAttribute('hidden')).toBe(false);
    const button = retry.querySelector<HTMLButtonElement>('button')!;
    expect(button.textContent).toBe('Retry');
    expect(button.disabled).toBe(false);
  });

  it('disables the Retry button with a countdown when retryAfterSec is set', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'rate_limited',
      retryAfterSec: 30,
      message: 'Slow down',
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const button = document
      .getElementById('retry-actions')!
      .querySelector<HTMLButtonElement>('button')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('30');
  });

  it('clicking Retry triggers another AI call', async () => {
    runAiOrientation = vi
      .fn<
        (input: AiOrientationServiceInput) => Promise<AiOrientationServiceResult>
      >()
      .mockResolvedValueOnce({ kind: 'network_error', message: 'offline' })
      .mockResolvedValueOnce({
        kind: 'ok',
        value: makeAiModel('n_00000'),
        dropped_refs: 0,
        usage: null,
      });
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(runAiOrientation).toHaveBeenCalledTimes(1);
    const retryButton = document
      .getElementById('retry-actions')!
      .querySelector<HTMLButtonElement>('button')!;
    retryButton.click();
    await flushMicrotasks();

    expect(runAiOrientation).toHaveBeenCalledTimes(2);
    expect(document.getElementById('ai-result')?.hasAttribute('hidden')).toBe(false);
    expect(document.getElementById('retry-actions')?.hasAttribute('hidden')).toBe(true);
  });

  it('clears the Retry button when a fresh extract runs', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'network_error',
      message: 'offline',
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(
      document.getElementById('retry-actions')?.hasAttribute('hidden')
    ).toBe(false);

    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(
      document.getElementById('retry-actions')?.hasAttribute('hidden')
    ).toBe(true);
  });

  it('does NOT surface Retry on auth_failed (user must fix the key, not retry)', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'auth_failed',
      message: 'Invalid API key',
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(
      document.getElementById('retry-actions')?.hasAttribute('hidden')
    ).toBe(true);
  });

  it('disables Run with AI when the extraction reports noai_opt_out', async () => {
    const noaiResponse = makeOkResponse([], {
      sensitivity: SENSITIVITY,
    });
    if (noaiResponse.kind === 'ok') {
      noaiResponse.capability = {
        ...noaiResponse.capability,
        reasons: [...noaiResponse.capability.reasons, 'noai_opt_out'],
      };
    }
    requestExtract = vi.fn(async () => noaiResponse);
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const aiBtn = document.getElementById('run-ai-btn') as HTMLButtonElement;
    expect(aiBtn.disabled).toBe(true);
    expect(aiBtn.getAttribute('title')).toContain('opted out');
  });

  it('refuses to call Claude when noai_opt_out is flagged, even if AI button is forced enabled', async () => {
    const noaiResponse = makeOkResponse([], { sensitivity: SENSITIVITY });
    if (noaiResponse.kind === 'ok') {
      noaiResponse.capability = {
        ...noaiResponse.capability,
        reasons: [...noaiResponse.capability.reasons, 'noai_opt_out'],
      };
    }
    requestExtract = vi.fn(async () => noaiResponse);
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    // Force-enable + click to simulate any defensive bypass.
    const aiBtn = document.getElementById('run-ai-btn') as HTMLButtonElement;
    aiBtn.disabled = false;
    aiBtn.click();
    await flushMicrotasks();

    expect(runAiOrientation).not.toHaveBeenCalled();
    const status = document.getElementById('status-region')!;
    expect(status.textContent?.toLowerCase()).toContain('noai');
    expect(status.getAttribute('data-tone')).toBe('error');
  });

  it('does NOT surface Retry on no_api_key', async () => {
    runAiOrientation = vi.fn(async () => ({ kind: 'no_api_key' }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(
      document.getElementById('retry-actions')?.hasAttribute('hidden')
    ).toBe(true);
  });

  it('shows the cost disclosure prompt when shouldPrompt returns true', async () => {
    shouldPrompt = vi.fn(async () => true);
    estimateCall = vi.fn(async () => ({ tokens: 18400, cost_usd: 0.06 }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(runAiOrientation).not.toHaveBeenCalled();
    const confirmRegion = document.getElementById('confirm-region')!;
    expect(confirmRegion.hasAttribute('hidden')).toBe(false);
    expect(confirmRegion.textContent).toContain('18,400 tokens');
    expect(confirmRegion.textContent).toContain('$0.06');
  });

  it('records a confirmation and proceeds when the user clicks Send on disclosure', async () => {
    shouldPrompt = vi.fn(async () => true);
    runAiOrientation = vi.fn(async () => ({
      kind: 'ok',
      value: makeAiModel('n_00000'),
      dropped_refs: 0,
      usage: null,
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const sendBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#confirm-region button')
    ).find((b) => b.textContent === 'Send')!;
    sendBtn.click();
    await flushMicrotasks();

    expect(recordConfirmation).toHaveBeenCalledOnce();
    expect(runAiOrientation).toHaveBeenCalledOnce();
    expect(document.getElementById('ai-result')?.hasAttribute('hidden')).toBe(false);
  });

  it('does NOT record a confirmation when the user cancels the disclosure', async () => {
    shouldPrompt = vi.fn(async () => true);
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const cancelBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('#confirm-region button')
    ).find((b) => b.textContent === 'Cancel')!;
    cancelBtn.click();
    await flushMicrotasks();

    expect(recordConfirmation).not.toHaveBeenCalled();
    expect(runAiOrientation).not.toHaveBeenCalled();
  });

  it('renders the mode selector with Orientation enabled and Reader/Q&A disabled', () => {
    mountWithServices();
    const orientation = document.getElementById('mode-orientation') as HTMLInputElement;
    const reader = document.getElementById('mode-reader') as HTMLInputElement;
    const qa = document.getElementById('mode-qa') as HTMLInputElement;
    expect(orientation.disabled).toBe(false);
    expect(orientation.checked).toBe(true);
    expect(reader.disabled).toBe(true);
    expect(qa.disabled).toBe(true);
  });

  it('Enter on the selected radio dispatches Run', async () => {
    mountWithServices();
    const orientation = document.getElementById('mode-orientation') as HTMLInputElement;
    orientation.focus();
    orientation.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    await flushMicrotasks();

    expect(requestExtract).toHaveBeenCalledOnce();
  });

  it('non-Enter key on the radio does NOT dispatch Run', async () => {
    mountWithServices();
    const orientation = document.getElementById('mode-orientation') as HTMLInputElement;
    orientation.focus();
    orientation.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    await flushMicrotasks();
    expect(requestExtract).not.toHaveBeenCalled();
  });

  it('F6 moves focus from header to main', () => {
    mountWithServices();
    const header = document.querySelector('header')!;
    // Header has no tabbable elements by default; the cycler falls back to
    // focusing the region itself. Then F6 should move into main.
    (header as HTMLElement).setAttribute('tabindex', '-1');
    (header as HTMLElement).focus();
    expect(document.activeElement).toBe(header);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F6', bubbles: true })
    );
    // The first focusable in main is the Orientation radio.
    expect(document.activeElement?.id).toBe('mode-orientation');
  });

  it('Shift+F6 moves focus backward from main into header', () => {
    mountWithServices();
    const orientation = document.getElementById('mode-orientation') as HTMLElement;
    orientation.focus();

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F6', shiftKey: true, bubbles: true })
    );
    // Header has no tabbable controls, so focus lands on <header> itself.
    expect(document.activeElement?.tagName).toBe('HEADER');
  });

  it('focus moves to the result heading when the user is parked on status-region', async () => {
    mountWithServices();
    const status = document.getElementById('status-region') as HTMLElement;
    status.setAttribute('tabindex', '-1');
    status.focus();
    expect(document.activeElement).toBe(status);

    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(document.activeElement?.id).toBe('result-heading');
  });

  it('focus does NOT move when the user has navigated to the mode selector', async () => {
    mountWithServices();
    const orientation = document.getElementById('mode-orientation') as HTMLInputElement;
    orientation.focus();
    expect(document.activeElement).toBe(orientation);

    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    // User parked on the mode selector — focus should stay there even
    // though the result rendered.
    expect(document.activeElement).toBe(orientation);
  });

  it('focus moves to result heading when nothing is currently focused', async () => {
    mountWithServices();
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).toBe(document.body);

    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(document.activeElement?.id).toBe('result-heading');
  });

  it('marks the result stale when a pageChanged event arrives for the bound tab', async () => {
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    expect(document.getElementById('result')?.hasAttribute('hidden')).toBe(false);

    emitPageChanged({ tabId: 42, reason: 'url_pushstate' });

    expect(document.getElementById('result')?.getAttribute('data-stale')).toBe('true');
    expect(
      document.getElementById('stale-notice')?.hasAttribute('hidden')
    ).toBe(false);
    expect(
      (document.getElementById('run-btn') as HTMLButtonElement).textContent
    ).toBe('Re-extract');
    expect(document.getElementById('status-region')?.textContent).toContain(
      'Page changed'
    );
  });

  it('ignores pageChanged events for a different tab', async () => {
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    emitPageChanged({ tabId: 999, reason: 'dom_mutation' });

    expect(document.getElementById('result')?.hasAttribute('data-stale')).toBe(false);
    expect(
      document.getElementById('stale-notice')?.hasAttribute('hidden')
    ).toBe(true);
  });

  it('clears stale state on the next successful extract', async () => {
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    emitPageChanged({ tabId: 42, reason: 'dom_mutation' });
    expect(document.getElementById('result')?.getAttribute('data-stale')).toBe('true');

    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(document.getElementById('result')?.hasAttribute('data-stale')).toBe(false);
    expect(
      document.getElementById('stale-notice')?.hasAttribute('hidden')
    ).toBe(true);
    expect(
      (document.getElementById('run-btn') as HTMLButtonElement).textContent
    ).toBe('Run');
  });

  it('F6 wraps around from footer back to header', () => {
    mountWithServices();
    const footer = document.querySelector('footer') as HTMLElement;
    footer.setAttribute('tabindex', '-1');
    footer.focus();
    expect(document.activeElement).toBe(footer);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F6', bubbles: true })
    );
    expect(document.activeElement?.tagName).toBe('HEADER');
  });

  it('skips the disclosure prompt when shouldPrompt returns false', async () => {
    shouldPrompt = vi.fn(async () => false);
    runAiOrientation = vi.fn(async () => ({
      kind: 'ok',
      value: makeAiModel('n_00000'),
      dropped_refs: 0,
      usage: null,
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(estimateCall).not.toHaveBeenCalled();
    expect(runAiOrientation).toHaveBeenCalledOnce();
  });

  it('reports dropped refs in the success announcement', async () => {
    runAiOrientation = vi.fn(async () => ({
      kind: 'ok',
      value: makeAiModel('n_00000'),
      dropped_refs: 3,
      usage: null,
    }));
    mountWithServices();
    (document.getElementById('run-btn') as HTMLButtonElement).click();
    await flushMicrotasks();
    (document.getElementById('run-ai-btn') as HTMLButtonElement).click();
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('3 invalid refs');
  });
});
