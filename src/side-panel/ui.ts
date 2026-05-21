import type { NodeRef } from '@/schemas/node-ref';
import type { ExtractResponse, JumpResponse } from '@/shared/messages-rpc';

export interface SidePanelServices {
  getActiveTabId(): Promise<number | null>;
  requestExtract(tabId: number): Promise<ExtractResponse>;
  requestJump(tabId: number, nodeRef: NodeRef): Promise<JumpResponse>;
}

/**
 * Mount the side panel's deterministic Orientation view against the given
 * document. Tests can drive it by passing fake services; production wires
 * up chrome.tabs + chrome.runtime.sendMessage.
 */
export function mountSidePanelUi(
  root: ParentNode,
  services: SidePanelServices
): void {
  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = root.querySelector(sel);
    if (el === null) throw new Error(`mountSidePanelUi: missing ${sel}`);
    return el as T;
  };

  const status = $('#status-region');
  const extractBtn = $<HTMLButtonElement>('#extract-btn');
  const emptyState = $('#empty-state');
  const result = $('#result');
  const resultHeading = $('#result-heading');
  const pageMeta = $('#page-meta');
  const pageCounts = $('#page-counts');
  const jumpList = $('#jump-list');

  const announce = (
    message: string,
    tone: 'ok' | 'error' | 'info' = 'info'
  ): void => {
    status.textContent = message;
    status.setAttribute('data-tone', tone);
    status.setAttribute('data-empty', message === '' ? 'true' : 'false');
  };

  const definitionRow = (term: string, value: string): [HTMLElement, HTMLElement] => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    return [dt, dd];
  };

  const renderResult = (response: Extract<ExtractResponse, { kind: 'ok' }>): void => {
    pageMeta.replaceChildren();
    pageMeta.append(
      ...definitionRow('State', response.model.page_state),
      ...definitionRow('URL shape', response.model.url_path_shape),
      ...definitionRow('Title', response.model.title || '(untitled)'),
      ...definitionRow('Quality', response.capability.extraction_quality)
    );
    if (response.capability.reasons.length > 0) {
      pageMeta.append(
        ...definitionRow('Reasons', response.capability.reasons.join(', '))
      );
    }

    pageCounts.replaceChildren();
    const c = response.capability.counts;
    pageCounts.append(
      ...definitionRow('Headings', String(c.headings)),
      ...definitionRow('Landmarks', String(c.landmarks)),
      ...definitionRow('Links', String(c.links)),
      ...definitionRow('Buttons', String(c.buttons)),
      ...definitionRow('Form controls', String(c.form_controls)),
      ...definitionRow('Images without alt', String(c.images_without_alt))
    );

    jumpList.replaceChildren();
    const refs = response.model.deterministic_candidates;
    if (refs.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No deterministic jump targets found.';
      jumpList.append(li);
    } else {
      for (const ref of refs) {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        const labelParts: string[] = [];
        const aria = ref.selector_hints.aria;
        if (aria?.name !== undefined && aria.name !== '') labelParts.push(aria.name);
        labelParts.push(`(${ref.hashes.role})`);
        button.textContent = labelParts.join(' ');
        button.addEventListener('click', () => {
          void handleJump(ref, button);
        });
        li.append(button);
        jumpList.append(li);
      }
    }

    emptyState.setAttribute('hidden', '');
    result.removeAttribute('hidden');
    resultHeading.focus();
  };

  const handleExtract = async (): Promise<void> => {
    announce('Extracting…', 'info');
    extractBtn.disabled = true;
    try {
      const tabId = await services.getActiveTabId();
      if (tabId === null) {
        announce('No active tab.', 'error');
        return;
      }
      const response = await services.requestExtract(tabId);
      if (response.kind === 'error') {
        announce(`Extraction failed: ${response.reason}`, 'error');
        return;
      }
      announce('Extraction ready.', 'ok');
      renderResult(response);
    } finally {
      extractBtn.disabled = false;
    }
  };

  const handleJump = async (
    nodeRef: NodeRef,
    button: HTMLButtonElement
  ): Promise<void> => {
    button.disabled = true;
    try {
      const tabId = await services.getActiveTabId();
      if (tabId === null) {
        announce('No active tab.', 'error');
        return;
      }
      const response = await services.requestJump(tabId, nodeRef);
      if (response.kind === 'error') {
        announce(`Jump failed: ${response.reason}`, 'error');
        return;
      }
      const certainty =
        response.method === 'exact'
          ? 'exact match'
          : `${response.method}, confidence ${response.confidence.toFixed(2)}`;
      announce(
        `Jumped to ${response.element.role} "${response.element.name}" (${certainty}).`,
        response.method === 'exact' ? 'ok' : 'info'
      );
    } finally {
      button.disabled = false;
    }
  };

  extractBtn.addEventListener('click', () => {
    void handleExtract();
  });
}
