// Content script entrypoint. Runs in the page's isolated world on domains
// the user has granted Pagewise permission for. Holds a per-tab
// RefRegistry across extractions and serves extract/jump RPC requests
// from the service worker.

import { extractPageModel } from './extract/page-model';
import { jumpToRef } from './navigate';
import { RefRegistry } from './refs/registry';
import {
  ContentRpcRequestSchema,
  type ExtractResponse,
  type JumpResponse,
} from '@/shared/messages-rpc';

let registry: RefRegistry | null = null;

function handleExtract(): ExtractResponse {
  try {
    const { pageModel, registry: nextRegistry, capability, sensitivity } =
      extractPageModel(document);
    registry = nextRegistry;
    return { kind: 'ok', model: pageModel, capability, sensitivity };
  } catch (error: unknown) {
    return {
      kind: 'error',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function handleJump(nodeRef: Parameters<typeof jumpToRef>[0]): JumpResponse {
  if (registry === null) {
    return {
      kind: 'error',
      reason: 'No extraction available; request_extract first.',
    };
  }
  const result = jumpToRef(nodeRef, registry, { document });
  if (result.kind === 'failed') {
    return { kind: 'error', reason: result.reason };
  }
  return {
    kind: 'ok',
    method: result.method,
    confidence: result.confidence,
    element: result.element,
  };
}

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const parsed = ContentRpcRequestSchema.safeParse(rawMessage);
  if (!parsed.success) {
    // Not for us — let other listeners handle it.
    return false;
  }

  switch (parsed.data.type) {
    case 'extract': {
      sendResponse(handleExtract());
      return false;
    }
    case 'jump': {
      sendResponse(handleJump(parsed.data.nodeRef));
      return false;
    }
  }
});

console.debug('[pagewise] content script loaded on', window.location.origin);
