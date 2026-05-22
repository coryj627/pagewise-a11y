// Content script entrypoint. Runs in the page's isolated world on domains
// the user has granted Pagewise permission for. Holds a per-tab
// RefRegistry across extractions, serves extract/jump RPC requests from
// the service worker, and pushes page-change notifications to the SW so
// the side panel can mark cached results stale.

import { extractPageModel } from './extract/page-model';
import { jumpToRef } from './navigate';
import { RefRegistry } from './refs/registry';
import { PageChangeObserver } from './observer';
import {
  ContentRpcRequestSchema,
  type ContentEventMessage,
  type ExtractResponse,
  type JumpResponse,
} from '@/shared/messages-rpc';

let registry: RefRegistry | null = null;

const observer = new PageChangeObserver({
  onChange: (reason) => {
    const message: ContentEventMessage = { type: 'content:pageChanged', reason };
    void chrome.runtime.sendMessage(message).catch(() => {
      // Service worker may be asleep / extension reloading; safe to drop.
    });
  },
});
observer.start();

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
  // Pause the observer briefly so our own focus/scroll-driven DOM changes
  // (temporary tabindex set + removed on blur) don't read as page mutations.
  observer.pause();
  const result = jumpToRef(nodeRef, registry, { document });
  setTimeout(() => observer.resume(), 100);

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
