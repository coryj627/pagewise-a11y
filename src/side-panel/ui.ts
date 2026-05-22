import type { NodeRef } from '@/schemas/node-ref';
import type { OrientationModel } from '@/schemas/orientation-model';
import type { PageModel } from '@/schemas/page-model';
import type { PageCapabilityReport } from '@/schemas/capability-report';
import type { SensitivityReport } from '@/schemas/sensitivity-report';
import type { ExtractResponse, JumpResponse } from '@/shared/messages-rpc';
import { formatCostUsd } from '@/shared/pricing';
import type { OrientationCallResult } from './api/client';
import { buildPanelRefResolver } from './ref-resolver';

export type AiOrientationServiceInput = {
  pageModel: PageModel;
  capability: PageCapabilityReport;
  sensitivity: SensitivityReport;
  refResolver: (id: string) => NodeRef | null;
};

export type AiOrientationServiceResult =
  | OrientationCallResult
  | { kind: 'no_api_key' };

export interface DisclosureService {
  shouldPrompt(): Promise<boolean>;
  recordConfirmation(): Promise<void>;
}

export type PageChangedHandler = (event: {
  tabId: number;
  reason: string;
}) => void;

export interface SidePanelServices {
  getActiveTabId(): Promise<number | null>;
  requestExtract(tabId: number): Promise<ExtractResponse>;
  requestJump(tabId: number, nodeRef: NodeRef): Promise<JumpResponse>;
  runAiOrientation(
    input: AiOrientationServiceInput
  ): Promise<AiOrientationServiceResult>;
  estimateCall(
    input: AiOrientationServiceInput
  ): Promise<{ tokens: number; cost_usd: number }>;
  disclosure: DisclosureService;
  /**
   * Subscribe to "the page bound to this tab changed" notifications.
   * Returns an unsubscribe function. Used by the panel to mark a cached
   * result stale when the content script reports DOM/URL changes.
   */
  subscribePageChanged(handler: PageChangedHandler): () => void;
}

interface PanelState {
  lastExtract: Extract<ExtractResponse, { kind: 'ok' }> | null;
  boundTabId: number | null;
  stale: boolean;
}

export function mountSidePanelUi(
  root: ParentNode,
  services: SidePanelServices
): void {
  const state: PanelState = { lastExtract: null, boundTabId: null, stale: false };

  const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => {
    const el = root.querySelector(sel);
    if (el === null) throw new Error(`mountSidePanelUi: missing ${sel}`);
    return el as T;
  };

  const status = $('#status-region');
  const extractBtn = $<HTMLButtonElement>('#run-btn');
  const aiExtractBtn = $<HTMLButtonElement>('#run-ai-btn');
  const emptyState = $('#empty-state');
  const staleNotice = $('#stale-notice');
  const result = $('#result');
  const resultHeading = $('#result-heading');
  const pageMeta = $('#page-meta');
  const pageCounts = $('#page-counts');
  const jumpList = $('#jump-list');
  const confirm = $('#confirm-region');
  const aiResult = $('#ai-result');
  const aiResultHeading = $('#ai-result-heading');
  const aiSummary = $('#ai-summary');
  const aiMeta = $('#ai-meta');
  const aiFacts = $('#ai-facts');
  const aiJumps = $('#ai-jumps');
  const aiWarningsSection = $('#ai-warnings-section');
  const aiWarnings = $('#ai-warnings');

  const announce = (
    message: string,
    tone: 'ok' | 'error' | 'info' = 'info'
  ): void => {
    // Prefix error messages with "Error: " so the meaning is in text, not
    // just the red color (WCAG 1.4.1).
    const prefixed =
      tone === 'error' && !message.toLowerCase().startsWith('error')
        ? `Error: ${message}`
        : message;
    status.textContent = prefixed;
    status.setAttribute('data-tone', tone);
    status.setAttribute('data-empty', prefixed === '' ? 'true' : 'false');
  };

  const definitionRow = (term: string, value: string): [HTMLElement, HTMLElement] => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    return [dt, dd];
  };

  const clearConfirm = (): void => {
    confirm.replaceChildren();
    confirm.setAttribute('hidden', '');
  };

  const refFromCandidates = (id: string): NodeRef | null => {
    if (state.lastExtract === null) return null;
    const resolve = buildPanelRefResolver(state.lastExtract.model);
    return resolve(id);
  };

  // ─────────────────────────────────────────────────────────
  // Deterministic Orientation
  // ─────────────────────────────────────────────────────────

  const renderDeterministicResult = (
    response: Extract<ExtractResponse, { kind: 'ok' }>
  ): void => {
    pageMeta.replaceChildren();
    pageMeta.append(
      ...definitionRow('State', response.model.page_state),
      ...definitionRow('URL shape', response.model.url_path_shape),
      ...definitionRow('Title', response.model.title || '(untitled)'),
      ...definitionRow('Quality', response.capability.extraction_quality),
      ...definitionRow('Sensitivity', response.sensitivity.page_classification)
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
        li.append(makeJumpButton(ref));
        jumpList.append(li);
      }
    }

    emptyState.setAttribute('hidden', '');
    result.removeAttribute('hidden');
    aiExtractBtn.disabled = false;
    maybeFocus(resultHeading);
  };

  const makeJumpButton = (ref: NodeRef): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    const parts: string[] = [];
    const aria = ref.selector_hints.aria;
    if (aria?.name !== undefined && aria.name !== '') parts.push(aria.name);
    parts.push(`(${ref.hashes.role})`);
    button.textContent = parts.join(' ');
    button.addEventListener('click', () => {
      void handleJump(ref, button);
    });
    return button;
  };

  const handleExtract = async (): Promise<void> => {
    announce('Extracting…', 'info');
    extractBtn.disabled = true;
    aiExtractBtn.disabled = true;
    aiResult.setAttribute('hidden', '');
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
      state.lastExtract = response;
      state.boundTabId = tabId;
      clearStale();
      announce('Extraction ready.', 'ok');
      renderDeterministicResult(response);
    } finally {
      extractBtn.disabled = false;
    }
  };

  function markStale(): void {
    if (state.lastExtract === null) return;
    state.stale = true;
    result.setAttribute('data-stale', 'true');
    aiResult.setAttribute('data-stale', 'true');
    staleNotice.removeAttribute('hidden');
    extractBtn.textContent = 'Re-extract';
    announce('Page changed since this was captured.', 'info');
  }

  function clearStale(): void {
    state.stale = false;
    result.removeAttribute('data-stale');
    aiResult.removeAttribute('data-stale');
    staleNotice.setAttribute('hidden', '');
    extractBtn.textContent = 'Run';
  }

  services.subscribePageChanged((event) => {
    if (state.boundTabId === null) return;
    if (event.tabId !== state.boundTabId) return;
    markStale();
  });

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

  // ─────────────────────────────────────────────────────────
  // AI Orientation
  // ─────────────────────────────────────────────────────────

  const handleAiClick = async (): Promise<void> => {
    if (state.lastExtract === null) {
      announce('Run a deterministic extraction first.', 'error');
      return;
    }
    const sensitivity = state.lastExtract.sensitivity;
    if (sensitivity.page_classification !== 'public_likely') {
      showSensitivityConfirm(sensitivity.page_classification);
      return;
    }
    await afterSensitivityConfirmed();
  };

  const afterSensitivityConfirmed = async (): Promise<void> => {
    if (state.lastExtract === null) return;
    if (await services.disclosure.shouldPrompt()) {
      const refResolver = buildPanelRefResolver(state.lastExtract.model);
      const estimated = await services.estimateCall({
        pageModel: state.lastExtract.model,
        capability: state.lastExtract.capability,
        sensitivity: state.lastExtract.sensitivity,
        refResolver,
      });
      showDisclosurePrompt(estimated);
      return;
    }
    await runAiCall();
  };

  const showSensitivityConfirm = (classification: string): void => {
    confirm.replaceChildren();
    confirm.removeAttribute('hidden');
    const heading = document.createElement('h3');
    heading.id = 'confirm-heading';
    heading.textContent = `This page is classified as ${classification}`;
    confirm.append(heading);

    const body = document.createElement('p');
    body.textContent =
      'Sending this page to Anthropic will include any non-redacted ' +
      'content visible in the page model — alt text, headings, link text, ' +
      'and visible prose. Sensitive form values are not captured. ' +
      'Make sure you’re comfortable sharing this page before continuing.';
    confirm.append(body);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.textContent = 'Send anyway';
    yes.addEventListener('click', () => {
      clearConfirm();
      void afterSensitivityConfirmed();
    });
    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => {
      clearConfirm();
      announce('Cancelled.', 'info');
    });
    actions.append(yes, no);
    confirm.append(actions);
    yes.focus();
  };

  const showDisclosurePrompt = (estimated: {
    tokens: number;
    cost_usd: number;
  }): void => {
    confirm.replaceChildren();
    confirm.removeAttribute('hidden');

    const heading = document.createElement('h3');
    heading.id = 'confirm-heading';
    heading.textContent = 'About to analyze this page';
    confirm.append(heading);

    const body = document.createElement('p');
    body.textContent =
      `Estimated input: ~${estimated.tokens.toLocaleString()} tokens. ` +
      `Estimated cost: about ${formatCostUsd(estimated.cost_usd)}. ` +
      'Send page content to Anthropic?';
    confirm.append(body);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.textContent = 'Send';
    yes.addEventListener('click', () => {
      clearConfirm();
      void (async (): Promise<void> => {
        await services.disclosure.recordConfirmation();
        await runAiCall();
      })();
    });
    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = 'Cancel';
    no.addEventListener('click', () => {
      clearConfirm();
      announce('Cancelled.', 'info');
    });
    actions.append(yes, no);
    confirm.append(actions);
    yes.focus();
  };

  const runAiCall = async (): Promise<void> => {
    if (state.lastExtract === null) return;
    announce('Asking Claude…', 'info');
    aiExtractBtn.disabled = true;
    try {
      const refResolver = buildPanelRefResolver(state.lastExtract.model);
      const result = await services.runAiOrientation({
        pageModel: state.lastExtract.model,
        capability: state.lastExtract.capability,
        sensitivity: state.lastExtract.sensitivity,
        refResolver,
      });
      switch (result.kind) {
        case 'ok':
          renderAiResult(result.value, result.dropped_refs);
          announce(
            result.dropped_refs === 0
              ? 'AI orientation ready.'
              : `AI orientation ready (${result.dropped_refs} invalid refs dropped).`,
            'ok'
          );
          break;
        case 'no_api_key':
          announce(
            'No API key set. Open Pagewise options to add one.',
            'error'
          );
          break;
        case 'no_tool_use':
          announce(
            `Claude returned no tool call: ${result.message}`,
            'error'
          );
          break;
        case 'validation_failed':
          announce(
            'Claude returned a malformed response. Try again.',
            'error'
          );
          break;
        case 'rate_limited':
          announce(
            result.retryAfterSec !== undefined
              ? `Rate limited. Try again in ${result.retryAfterSec}s.`
              : 'Rate limited. Try again shortly.',
            'error'
          );
          break;
        case 'auth_failed':
          announce(
            'API key was rejected. Check the key in Pagewise options.',
            'error'
          );
          break;
        case 'network_error':
          announce(`Network error: ${result.message}`, 'error');
          break;
        case 'api_error':
          announce(
            `API error${result.status !== undefined ? ` (${result.status})` : ''}: ${result.message}`,
            'error'
          );
          break;
      }
    } finally {
      aiExtractBtn.disabled = false;
    }
  };

  const renderAiResult = (model: OrientationModel, droppedRefs: number): void => {
    aiResult.removeAttribute('hidden');
    aiSummary.textContent = model.one_line_summary;

    aiMeta.replaceChildren();
    aiMeta.append(
      ...definitionRow('Page type', model.page_type),
      ...definitionRow('Scope', model.page_scope),
      ...definitionRow('Confidence', model.confidence.toFixed(2))
    );
    if (droppedRefs > 0) {
      aiMeta.append(
        ...definitionRow('Dropped invalid refs', String(droppedRefs))
      );
    }

    aiFacts.replaceChildren();
    if (model.key_facts.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No key facts produced.';
      aiFacts.append(li);
    } else {
      for (const fact of model.key_facts) {
        const li = document.createElement('li');
        const text = document.createElement('p');
        text.textContent = fact.text;
        li.append(text);
        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = `${fact.kind} · confidence ${fact.confidence.toFixed(2)}`;
        li.append(meta);
        for (const sourceId of fact.source_node_ref_ids) {
          const ref = refFromCandidates(sourceId);
          if (ref === null) continue;
          li.append(makeWhereFromButton(ref));
        }
        aiFacts.append(li);
      }
    }

    aiJumps.replaceChildren();
    const ranked = model.jump_list
      .filter(
        (item): item is typeof item & { node_ref_id: string } =>
          typeof item.node_ref_id === 'string'
      )
      .sort((a, b) => a.priority - b.priority);
    if (ranked.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No ranked jump targets.';
      aiJumps.append(li);
    } else {
      for (const item of ranked) {
        const ref = refFromCandidates(item.node_ref_id);
        if (ref === null) continue;
        const li = document.createElement('li');
        const button = makeJumpButton(ref);
        button.textContent = `${item.label} (${item.kind ?? ref.hashes.role})`;
        li.append(button);
        if (item.description !== undefined) {
          const desc = document.createElement('p');
          desc.className = 'meta';
          desc.textContent = item.description;
          li.append(desc);
        }
        aiJumps.append(li);
      }
    }

    const warnings = model.warnings ?? [];
    aiWarnings.replaceChildren();
    if (warnings.length === 0) {
      aiWarningsSection.setAttribute('hidden', '');
    } else {
      aiWarningsSection.removeAttribute('hidden');
      for (const w of warnings) {
        const li = document.createElement('li');
        li.textContent = w.detail !== undefined ? `${w.kind}: ${w.detail}` : w.kind;
        aiWarnings.append(li);
      }
    }

    maybeFocus(aiResultHeading);
  };

  /**
   * Move focus to the given element only when the user is "passively
   * waiting" — focus is in the live status region, on body, or nowhere.
   * Otherwise leave focus alone so we don't yank the user out of
   * whatever they were doing. The status region's polite announcement
   * still fires either way.
   */
  function maybeFocus(target: HTMLElement): void {
    const active = ownerDoc.activeElement;
    if (
      active === null ||
      active === ownerDoc.body ||
      active.id === 'status-region'
    ) {
      target.focus();
    }
  }

  const makeWhereFromButton = (ref: NodeRef): HTMLAnchorElement => {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = 'Where this came from';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      void handleJump(ref, link as unknown as HTMLButtonElement);
    });
    return link;
  };

  extractBtn.addEventListener('click', () => {
    void handleExtract();
  });
  aiExtractBtn.addEventListener('click', () => {
    void handleAiClick();
  });

  // ─────────────────────────────────────────────────────────
  // Mode selector — arrow keys change selection without running.
  // Enter on a selected radio dispatches Run (deterministic). The
  // radiogroup is wired here rather than via fieldset behavior so we
  // can intercept Enter explicitly.
  // ─────────────────────────────────────────────────────────

  const modeSelector = root.querySelector<HTMLFieldSetElement>('#mode-selector');
  if (modeSelector !== null) {
    modeSelector.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      const target = event.target as HTMLElement;
      if (target.tagName !== 'INPUT') return;
      event.preventDefault();
      void handleExtract();
    });
  }

  // ─────────────────────────────────────────────────────────
  // F6 / Shift+F6 cycle focus between header / main / footer.
  // ─────────────────────────────────────────────────────────

  const regions: ReadonlyArray<HTMLElement> = [
    root.querySelector<HTMLElement>('header')!,
    root.querySelector<HTMLElement>('main')!,
    root.querySelector<HTMLElement>('footer')!,
  ].filter((el): el is HTMLElement => el !== null);

  const ownerDoc = (root instanceof Document
    ? root
    : (root as Element).ownerDocument) ?? document;

  ownerDoc.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'F6') return;
    event.preventDefault();
    cycleRegion(regions, ownerDoc, event.shiftKey ? -1 : 1);
  });
}

function cycleRegion(
  regions: ReadonlyArray<HTMLElement>,
  doc: Document,
  direction: 1 | -1
): void {
  if (regions.length === 0) return;
  const focused = doc.activeElement;
  let currentIdx = regions.findIndex(
    (r) => focused !== null && r.contains(focused)
  );
  if (currentIdx === -1) currentIdx = 0;
  const nextIdx =
    (currentIdx + direction + regions.length) % regions.length;
  const next = regions[nextIdx]!;
  focusFirstIn(next);
}

function focusFirstIn(region: HTMLElement): void {
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const candidates = region.querySelectorAll<HTMLElement>(FOCUSABLE);
  if (candidates.length > 0) {
    candidates[0]!.focus();
    return;
  }
  // No tabbable element — focus the region itself with a temporary
  // tabindex so screen readers still announce the region change.
  const original = region.getAttribute('tabindex');
  region.setAttribute('tabindex', '-1');
  region.focus();
  const restore = (): void => {
    if (original === null) region.removeAttribute('tabindex');
    else region.setAttribute('tabindex', original);
    region.removeEventListener('blur', restore);
  };
  region.addEventListener('blur', restore, { once: true });
}
