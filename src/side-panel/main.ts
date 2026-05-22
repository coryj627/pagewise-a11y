import {
  mountSidePanelUi,
  type SidePanelServices,
  type AiOrientationServiceInput,
  type AiOrientationServiceResult,
  type PageChangedHandler,
} from './ui';
import type { NodeRef } from '@/schemas/node-ref';
import {
  ExtractResponseSchema,
  JumpResponseSchema,
  PanelNotificationMessageSchema,
  type ExtractResponse,
  type JumpResponse,
} from '@/shared/messages-rpc';
import { ChromeStorageBackend } from '@/shared/storage';
import { ApiKeyStore } from '@/shared/api-key';
import { CostLedger } from '@/shared/cost-ledger';
import { DisclosurePreference } from '@/shared/disclosure';
import { DebugLog } from '@/shared/debug-log';
import {
  createAnthropicClient,
  DEFAULT_MODEL,
} from './api/client';
import { estimateCost, pricingForModel } from '@/shared/pricing';
import { estimateRequestTokens } from '@/shared/tokens';
import { ORIENTATION_SYSTEM_PROMPT } from '@/system-prompts';
import { summarizePageTool } from '@/schemas/orientation-model';

const storage = new ChromeStorageBackend(chrome.storage.local);
const sessionStorage = new ChromeStorageBackend(chrome.storage.session);
const apiKey = new ApiKeyStore(storage);
const ledger = new CostLedger(storage);
const disclosure = new DisclosurePreference(storage);
const debugLog = new DebugLog(sessionStorage, storage);

/** Rough heuristic: orientation responses average ~500 output tokens. */
const ESTIMATED_OUTPUT_TOKENS = 500;

async function runAiOrientation(
  input: AiOrientationServiceInput
): Promise<AiOrientationServiceResult> {
  const key = await apiKey.get();
  if (key === null) return { kind: 'no_api_key' };

  const client = createAnthropicClient(key);
  const result = await client.callOrientation({
    pageModel: input.pageModel,
    capability: input.capability,
    sensitivity: input.sensitivity,
    resolveRef: input.refResolver,
  });

  if (result.kind === 'ok' && result.usage !== null) {
    const pricing = pricingForModel(DEFAULT_MODEL);
    const cost = estimateCost(result.usage, pricing);
    await ledger
      .record({
        model: DEFAULT_MODEL,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        ...(result.usage.cache_creation_input_tokens !== undefined
          ? { cache_creation_input_tokens: result.usage.cache_creation_input_tokens }
          : {}),
        ...(result.usage.cache_read_input_tokens !== undefined
          ? { cache_read_input_tokens: result.usage.cache_read_input_tokens }
          : {}),
        cost_usd: cost,
      })
      .catch((error: unknown) => {
        console.warn('[pagewise] failed to record cost', error);
        void debugLog.warn('failed to record cost in ledger', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  } else if (result.kind !== 'ok') {
    void debugLog.error(`AI orientation failed: ${result.kind}`, {
      kind: result.kind,
      message:
        'message' in result ? result.message : '(no message)',
      ...(result.kind === 'api_error' && result.status !== undefined
        ? { status: result.status }
        : {}),
      ...(result.kind === 'rate_limited' && result.retryAfterSec !== undefined
        ? { retryAfterSec: result.retryAfterSec }
        : {}),
    });
  }

  return result;
}

async function estimateCall(
  input: AiOrientationServiceInput
): Promise<{ tokens: number; cost_usd: number }> {
  const userMessage = JSON.stringify({
    page_model: input.pageModel,
    capability: input.capability,
    sensitivity: input.sensitivity,
  });
  const breakdown = estimateRequestTokens({
    systemPrompt: ORIENTATION_SYSTEM_PROMPT,
    toolsJson: JSON.stringify(summarizePageTool),
    userMessage,
  });
  const pricing = pricingForModel(DEFAULT_MODEL);
  const cost = estimateCost(
    {
      input_tokens: breakdown.total,
      output_tokens: ESTIMATED_OUTPUT_TOKENS,
    },
    pricing
  );
  return { tokens: breakdown.total, cost_usd: cost };
}

const services: SidePanelServices = {
  async getActiveTabId(): Promise<number | null> {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    return tab?.id ?? null;
  },
  async requestExtract(tabId: number): Promise<ExtractResponse> {
    const response = await chrome.runtime.sendMessage({
      type: 'panel:extract',
      tabId,
    });
    return ExtractResponseSchema.parse(response);
  },
  async requestJump(tabId: number, nodeRef: NodeRef): Promise<JumpResponse> {
    const response = await chrome.runtime.sendMessage({
      type: 'panel:jump',
      tabId,
      nodeRef,
    });
    return JumpResponseSchema.parse(response);
  },
  runAiOrientation,
  estimateCall,
  disclosure: {
    shouldPrompt: () => disclosure.shouldPrompt(),
    recordConfirmation: () => disclosure.recordConfirmation(),
  },
  subscribePageChanged(handler: PageChangedHandler): () => void {
    const listener = (raw: unknown): void => {
      const parsed = PanelNotificationMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      if (parsed.data.type !== 'panel:pageChanged') return;
      handler({ tabId: parsed.data.tabId, reason: parsed.data.reason });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    mountSidePanelUi(document, services);
  });
} else {
  mountSidePanelUi(document, services);
}
