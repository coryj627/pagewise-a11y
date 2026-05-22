import type {
  DomainStore,
  EnableResult,
  DisableResult,
} from '@/shared/domain-store';
import type { CostLedger, UsageSummary } from '@/shared/cost-ledger';
import { ApiKeyStore } from '@/shared/api-key';
import {
  DISCLOSURE_AUTO_DISABLE_AFTER,
  type DisclosurePreference,
  type DisclosureMode,
} from '@/shared/disclosure';
import { formatCostUsd } from '@/shared/pricing';

export interface OptionsServices {
  domains: DomainStore;
  ledger: CostLedger;
  apiKey: ApiKeyStore;
  disclosure: DisclosurePreference;
}

/**
 * Mount the options-page UI against the given root document. Exported so
 * tests can swap in stores backed by in-memory storage and permissions,
 * mount the UI in jsdom, and drive it directly.
 */
export function mountOptionsUi(
  root: ParentNode,
  services: OptionsServices
): void {
  const store = services.domains;
  const ledger = services.ledger;
  const apiKey = services.apiKey;
  const disclosure = services.disclosure;
  const $ = <T extends Element = HTMLElement>(sel: string): T => {
    const el = root.querySelector(sel);
    if (el === null) throw new Error(`mountOptionsUi: missing element ${sel}`);
    return el as T;
  };

  const status = $('#status-region');
  const list = $('#domains-list');
  const form = $<HTMLFormElement>('#add-form');
  const input = $<HTMLInputElement>('#add-input');
  const confirm = $('#confirm-region');

  const announce = (message: string, tone: 'ok' | 'error' | 'info' = 'info'): void => {
    status.textContent = message;
    status.setAttribute('data-tone', tone);
    if (message === '') {
      status.setAttribute('data-empty', 'true');
    } else {
      status.setAttribute('data-empty', 'false');
    }
  };

  const renderList = async (): Promise<void> => {
    const hosts = await store.getEnabledDomains();
    list.replaceChildren();
    if (hosts.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No domains enabled.';
      list.append(li);
      return;
    }
    for (const host of hosts) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = host;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${host}`);
      remove.addEventListener('click', () => {
        void handleRemove(host);
      });
      li.append(name, remove);
      list.append(li);
    }
  };

  const clearConfirm = (): void => {
    confirm.replaceChildren();
    confirm.setAttribute('hidden', '');
  };

  const showSensitiveConfirm = (
    host: string,
    category: string,
    matched: string
  ): void => {
    confirm.replaceChildren();
    confirm.removeAttribute('hidden');

    const heading = document.createElement('h3');
    heading.id = 'confirm-heading';
    heading.textContent = `Sensitive domain: ${host}`;
    confirm.append(heading);

    const body = document.createElement('p');
    body.textContent =
      `${host} is on the sensitive list (matched ${matched}, category: ${category}). ` +
      'Pagewise can send page content from this domain to Anthropic when you ' +
      'explicitly request an AI-enriched view. Make sure you trust both ' +
      'Anthropic and your own choice to use Pagewise here before enabling.';
    confirm.append(body);

    // Architecture §10.4 — sensitive domains require "extra
    // confirmation". A consent checkbox forces the user to actively
    // acknowledge the implication before the Enable button activates.
    const consentLabel = document.createElement('label');
    consentLabel.className = 'consent';
    const consent = document.createElement('input');
    consent.type = 'checkbox';
    consent.id = 'consent-sensitive';
    consentLabel.append(consent);
    const consentText = document.createTextNode(
      ` I understand that Pagewise can send page content from ${host} to ` +
        'Anthropic when I press Run with AI.'
    );
    consentLabel.append(consentText);
    confirm.append(consentLabel);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.textContent = `Enable ${host}`;
    yes.disabled = true;
    consent.addEventListener('change', () => {
      yes.disabled = !consent.checked;
    });
    yes.addEventListener('click', () => {
      if (!consent.checked) return;
      void handleEnable(host, { confirmSensitive: true });
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
    consent.focus();
  };

  const explainResult = (result: EnableResult | DisableResult): {
    message: string;
    tone: 'ok' | 'error' | 'info';
  } => {
    switch (result.kind) {
      case 'enabled':
        return { message: `Enabled ${result.host}.`, tone: 'ok' };
      case 'already_enabled':
        return { message: `${result.host} is already enabled.`, tone: 'info' };
      case 'disabled':
        return { message: `Removed ${result.host}.`, tone: 'ok' };
      case 'not_enabled':
        return { message: `${result.host} is not enabled.`, tone: 'info' };
      case 'invalid_domain':
        if (result.reason === 'privileged_scheme') {
          return {
            message:
              'Pagewise cannot run on chrome://, file://, or other browser-internal URLs.',
            tone: 'error',
          };
        }
        return {
          message: `That doesn't look like a valid domain (${result.reason}).`,
          tone: 'error',
        };
      case 'permission_denied':
        return {
          message: `Permission was denied. ${result.host} was not enabled.`,
          tone: 'error',
        };
      case 'permission_request_failed':
        return {
          message: `Couldn't request permission for ${result.host}. Please try again.`,
          tone: 'error',
        };
      case 'sensitive_confirmation_required':
        return {
          message: `${result.host} is a sensitive domain. Confirm before enabling.`,
          tone: 'info',
        };
    }
  };

  const handleEnable = async (
    rawHost: string,
    options: { confirmSensitive?: boolean } = {}
  ): Promise<void> => {
    const result = await store.enable(rawHost, options);
    if (result.kind === 'sensitive_confirmation_required') {
      showSensitiveConfirm(result.host, result.category, result.matched);
      announce(explainResult(result).message, 'info');
      return;
    }
    clearConfirm();
    const { message, tone } = explainResult(result);
    announce(message, tone);
    if (result.kind === 'enabled') {
      input.value = '';
      await renderList();
    }
  };

  const handleRemove = async (host: string): Promise<void> => {
    const result = await store.disable(host);
    const { message, tone } = explainResult(result);
    announce(message, tone);
    await renderList();
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    void handleEnable(value);
  });

  // ─────────────────────────────────────────────────────────
  // Usage section
  // ─────────────────────────────────────────────────────────

  const today = $('#usage-today');
  const month = $('#usage-month');
  const all = $('#usage-all');
  const clearLedgerBtn = $<HTMLButtonElement>('#clear-ledger');

  const fmtSummary = (s: UsageSummary): string => {
    const tokens = s.input_tokens + s.output_tokens;
    return `${tokens.toLocaleString()} tokens · ${formatCostUsd(s.cost_usd)}`;
  };

  const renderUsage = async (): Promise<void> => {
    today.textContent = fmtSummary(await ledger.summaryToday());
    month.textContent = fmtSummary(await ledger.summaryThisMonth());
    all.textContent = fmtSummary(await ledger.summaryAllTime());
  };

  clearLedgerBtn.addEventListener('click', () => {
    void (async (): Promise<void> => {
      await ledger.clear();
      await renderUsage();
      announce('Cleared usage ledger.', 'ok');
    })();
  });

  // ─────────────────────────────────────────────────────────
  // API key section
  // ─────────────────────────────────────────────────────────

  const keyMask = $('#key-mask');
  const keyForm = $<HTMLFormElement>('#key-form');
  const keyInput = $<HTMLInputElement>('#key-input');
  const keyClearBtn = $<HTMLButtonElement>('#key-clear');

  const renderKey = async (): Promise<void> => {
    const value = await apiKey.get();
    keyMask.textContent = ApiKeyStore.mask(value);
  };

  keyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void (async (): Promise<void> => {
      const value = keyInput.value;
      await apiKey.set(value);
      keyInput.value = '';
      await renderKey();
      const isSet = await apiKey.isSet();
      announce(isSet ? 'Saved API key.' : 'Cleared API key.', 'ok');
    })();
  });

  keyClearBtn.addEventListener('click', () => {
    void (async (): Promise<void> => {
      await apiKey.clear();
      keyInput.value = '';
      await renderKey();
      announce('Cleared API key.', 'ok');
    })();
  });

  // ─────────────────────────────────────────────────────────
  // Disclosure preference section
  // ─────────────────────────────────────────────────────────

  const disclosureRadios = root.querySelectorAll<HTMLInputElement>(
    'input[name="disclosure-mode"]'
  );
  const disclosureCounter = $('#disclosure-counter');

  const renderDisclosure = async (): Promise<void> => {
    const mode = await disclosure.getMode();
    const counter = await disclosure.getCounter();
    for (const radio of Array.from(disclosureRadios)) {
      radio.checked = radio.value === mode;
    }
    if (mode === 'auto_first_5') {
      const remaining = Math.max(0, DISCLOSURE_AUTO_DISABLE_AFTER - counter);
      disclosureCounter.textContent =
        remaining === 0
          ? `Auto: already shown ${counter} times — the prompt is currently disabled. Switch modes to re-enable it.`
          : `Auto: ${counter} of ${DISCLOSURE_AUTO_DISABLE_AFTER} confirmations recorded so far (${remaining} remaining).`;
    } else {
      disclosureCounter.textContent = '';
    }
  };

  for (const radio of Array.from(disclosureRadios)) {
    radio.addEventListener('change', () => {
      const value = radio.value as DisclosureMode;
      void (async (): Promise<void> => {
        await disclosure.setMode(value);
        await renderDisclosure();
        announce(`Cost disclosure set to: ${value.replace(/_/g, ' ')}.`, 'ok');
      })();
    });
  }

  void renderList();
  void renderUsage();
  void renderKey();
  void renderDisclosure();
}
