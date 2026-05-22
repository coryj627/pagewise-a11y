import {
  PanelRpcRequestSchema,
  ExtractResponseSchema,
  JumpResponseSchema,
  ContentEventMessageSchema,
  type ExtractResponse,
  type JumpResponse,
  type PanelNotificationMessage,
} from '@/shared/messages-rpc';
import { setCache, clearCache } from './cache';

/**
 * Wire the panel↔content-script routing. The service worker accepts
 * panel:extract / panel:jump from the side panel and forwards an
 * extract/jump RPC to the addressed tab's content script. On the way
 * back, extract responses get cached so subsequent re-opens of the panel
 * don't have to re-walk the DOM.
 */
export function installRouter(): void {
  chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    // Panel → SW RPC.
    const rpcParsed = PanelRpcRequestSchema.safeParse(rawMessage);
    if (rpcParsed.success) {
      switch (rpcParsed.data.type) {
        case 'panel:extract': {
          handleExtract(rpcParsed.data.tabId)
            .then(sendResponse)
            .catch((error: unknown) => sendResponse(asExtractError(error)));
          return true;
        }
        case 'panel:jump': {
          handleJump(rpcParsed.data.tabId, rpcParsed.data.nodeRef)
            .then(sendResponse)
            .catch((error: unknown) => sendResponse(asJumpError(error)));
          return true;
        }
      }
    }

    // Content → SW push (page changed).
    const eventParsed = ContentEventMessageSchema.safeParse(rawMessage);
    if (eventParsed.success && eventParsed.data.type === 'content:pageChanged') {
      const tabId = sender.tab?.id;
      if (tabId !== undefined) {
        clearCache(tabId);
        const notification: PanelNotificationMessage = {
          type: 'panel:pageChanged',
          tabId,
          reason: eventParsed.data.reason,
        };
        // Broadcast to all extension pages; the side panel filters by tabId.
        void chrome.runtime.sendMessage(notification).catch(() => undefined);
      }
      return false;
    }

    return false;
  });

  // Clear cache when a tab navigates so stale PageModels aren't returned.
  chrome.webNavigation?.onCommitted?.addListener((details) => {
    if (details.frameId === 0) clearCache(details.tabId);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    clearCache(tabId);
  });
}

async function handleExtract(tabId: number): Promise<ExtractResponse> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'extract' });
    const parsed = ExtractResponseSchema.safeParse(response);
    if (!parsed.success) {
      return {
        kind: 'error',
        reason: `Invalid extract response: ${parsed.error.message}`,
      };
    }
    if (parsed.data.kind === 'ok') {
      setCache(tabId, {
        model: parsed.data.model,
        capability: parsed.data.capability,
        sensitivity: parsed.data.sensitivity,
      });
    }
    return parsed.data;
  } catch (error: unknown) {
    return asExtractError(error);
  }
}

async function handleJump(
  tabId: number,
  nodeRef: unknown
): Promise<JumpResponse> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'jump',
      nodeRef,
    });
    const parsed = JumpResponseSchema.safeParse(response);
    if (!parsed.success) {
      return {
        kind: 'error',
        reason: `Invalid jump response: ${parsed.error.message}`,
      };
    }
    return parsed.data;
  } catch (error: unknown) {
    return asJumpError(error);
  }
}

function asExtractError(error: unknown): ExtractResponse {
  return {
    kind: 'error',
    reason: error instanceof Error ? error.message : String(error),
  };
}

function asJumpError(error: unknown): JumpResponse {
  return {
    kind: 'error',
    reason: error instanceof Error ? error.message : String(error),
  };
}
