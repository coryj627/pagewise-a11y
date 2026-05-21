import { mountSidePanelUi, type SidePanelServices } from './ui';
import type { NodeRef } from '@/schemas/node-ref';
import {
  ExtractResponseSchema,
  JumpResponseSchema,
  type ExtractResponse,
  type JumpResponse,
} from '@/shared/messages-rpc';

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
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    mountSidePanelUi(document, services);
  });
} else {
  mountSidePanelUi(document, services);
}
