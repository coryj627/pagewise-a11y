import type {
  DomainStore,
  EnableResult,
  DisableResult,
} from '@/shared/domain-store';
import type { CostLedger, UsageSummary } from '@/shared/cost-ledger';
import { formatCostUsd } from '@/shared/pricing';

export interface OptionsServices {
  domains: DomainStore;
  ledger: CostLedger;
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

    const actions = document.createElement('div');
    actions.className = 'actions';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.textContent = 'Enable anyway';
    yes.addEventListener('click', () => {
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
    (yes as HTMLElement).focus();
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

  void renderList();
  void renderUsage();
}
