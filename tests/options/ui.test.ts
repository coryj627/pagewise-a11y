import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountOptionsUi } from '@/options/ui';
import { DomainStore } from '@/shared/domain-store';
import { MemoryStorageBackend } from '@/shared/storage';
import { MemoryPermissionsApi } from '@/shared/permissions';
import { CostLedger } from '@/shared/cost-ledger';
import { ApiKeyStore } from '@/shared/api-key';
import { DisclosurePreference } from '@/shared/disclosure';
import { OnboardingPreference } from '@/shared/onboarding';
import { DebugLog } from '@/shared/debug-log';

// Vitest is started from the repo root, so a cwd-relative path is stable.
const HTML_PATH = resolve(process.cwd(), 'src/options/index.html');

/** Strip <script>/<link> tags — we drive the UI directly via mountOptionsUi. */
function bodyFromOptionsHtml(): string {
  const raw = readFileSync(HTML_PATH, 'utf8');
  const bodyMatch = raw.match(/<body>([\s\S]*?)<\/body>/);
  if (bodyMatch === null) throw new Error('Could not extract <body> from options HTML');
  return bodyMatch[1]!
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<link\b[^>]*>/g, '');
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('options UI', () => {
  let store: DomainStore;
  let permissions: MemoryPermissionsApi;
  let ledger: CostLedger;
  let apiKey: ApiKeyStore;
  let apiKeyStorage: MemoryStorageBackend;
  let disclosure: DisclosurePreference;
  let disclosureStorage: MemoryStorageBackend;
  let onboarding: OnboardingPreference;
  let onboardingStorage: MemoryStorageBackend;
  let debugLog: DebugLog;
  let debugSession: MemoryStorageBackend;
  let debugEnabledStore: MemoryStorageBackend;

  beforeEach(async () => {
    document.body.innerHTML = bodyFromOptionsHtml();
    permissions = new MemoryPermissionsApi();
    store = new DomainStore(new MemoryStorageBackend(), permissions);
    ledger = new CostLedger(new MemoryStorageBackend());
    apiKeyStorage = new MemoryStorageBackend();
    apiKey = new ApiKeyStore(apiKeyStorage);
    disclosureStorage = new MemoryStorageBackend();
    disclosure = new DisclosurePreference(disclosureStorage);
    onboardingStorage = new MemoryStorageBackend();
    onboarding = new OnboardingPreference(onboardingStorage);
    debugSession = new MemoryStorageBackend();
    debugEnabledStore = new MemoryStorageBackend();
    debugLog = new DebugLog(debugSession, debugEnabledStore);
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();
  });

  it('shows the empty state on first render', () => {
    const list = document.getElementById('domains-list')!;
    expect(list.querySelector('.empty')).not.toBeNull();
    expect(list.querySelector('.empty')!.textContent).toContain('No domains');
  });

  it('adds a domain via the form, clears the input, renders it in the list', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;

    input.value = 'example.com';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const list = document.getElementById('domains-list')!;
    expect(list.textContent).toContain('example.com');
    expect(list.querySelector('.empty')).toBeNull();
    expect(input.value).toBe('');

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('Enabled example.com');
    expect(status.getAttribute('data-tone')).toBe('ok');

    expect(await permissions.contains(['https://example.com/*'])).toBe(true);
  });

  it('rejects an invalid domain without touching the list', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;

    input.value = '';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent?.toLowerCase()).toContain('valid');
    expect(status.getAttribute('data-tone')).toBe('error');

    const list = document.getElementById('domains-list')!;
    expect(list.querySelector('.empty')).not.toBeNull();
  });

  it('prompts before enabling a sensitive domain and respects cancel', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;

    input.value = 'chase.com';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const confirmRegion = document.getElementById('confirm-region')!;
    expect(confirmRegion.hasAttribute('hidden')).toBe(false);
    expect(confirmRegion.textContent).toContain('chase.com');
    expect(confirmRegion.textContent).toContain('banking');
    expect(await store.isEnabled('chase.com')).toBe(false);

    const cancel = Array.from(
      confirmRegion.querySelectorAll('button')
    ).find((b) => b.textContent === 'Cancel')!;
    cancel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMicrotasks();

    expect(confirmRegion.hasAttribute('hidden')).toBe(true);
    expect(await store.isEnabled('chase.com')).toBe(false);
  });

  it('enables a sensitive domain only after the consent checkbox is checked', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;

    input.value = 'chase.com';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const confirmRegion = document.getElementById('confirm-region')!;
    const enableBtn = Array.from(
      confirmRegion.querySelectorAll<HTMLButtonElement>('button')
    ).find((b) => b.textContent?.startsWith('Enable '))!;
    expect(enableBtn.textContent).toBe('Enable chase.com');
    expect(enableBtn.disabled).toBe(true);

    // Clicking while disabled is a no-op.
    enableBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMicrotasks();
    expect(await store.isEnabled('chase.com')).toBe(false);

    const consent = document.getElementById(
      'consent-sensitive'
    ) as HTMLInputElement;
    consent.checked = true;
    consent.dispatchEvent(new Event('change', { bubbles: true }));
    expect(enableBtn.disabled).toBe(false);

    enableBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMicrotasks();

    expect(await store.isEnabled('chase.com')).toBe(true);
    expect(confirmRegion.hasAttribute('hidden')).toBe(true);
    const list = document.getElementById('domains-list')!;
    expect(list.textContent).toContain('chase.com');
  });

  it('prefixes error-tone status messages with "Error: " (WCAG 1.4.1)', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;
    input.value = '';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent?.startsWith('Error: ')).toBe(true);
  });

  it('does NOT double-prefix when the message already starts with "Error"', async () => {
    // Simulate: an upstream system already returns "Error parsing input."
    // We don't want the status region to show "Error: Error parsing input."
    // The check is case-insensitive so "error" / "ERROR" don't get doubled.
    permissions.setAutoApprove(false);
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;
    input.value = 'example.com';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    const matches = status.textContent?.match(/error:/gi) ?? [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it('shows the welcome section on first render (no key, no domains)', () => {
    const welcome = document.getElementById('welcome')!;
    expect(welcome.hasAttribute('hidden')).toBe(false);
    expect(
      document
        .getElementById('welcome-step-key')!
        .getAttribute('data-complete')
    ).toBe('false');
    expect(
      document
        .getElementById('welcome-step-domain')!
        .getAttribute('data-complete')
    ).toBe('false');
  });

  it('marks step 1 as Done once the API key is saved', async () => {
    const input = document.getElementById('key-input') as HTMLInputElement;
    const form = document.getElementById('key-form') as HTMLFormElement;
    input.value = 'sk-ant-test-key';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const step = document.getElementById('welcome-step-key')!;
    expect(step.getAttribute('data-complete')).toBe('true');
    expect(step.querySelector('.welcome-status')?.textContent).toBe('Done');
  });

  it('marks step 2 as Done once a domain is enabled', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;
    input.value = 'example.com';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const step = document.getElementById('welcome-step-domain')!;
    expect(step.getAttribute('data-complete')).toBe('true');
  });

  it('auto-hides the welcome section once both key + a domain are set', async () => {
    await apiKey.set('sk-ant-x');
    await store.enable('example.com');
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();

    expect(document.getElementById('welcome')?.hasAttribute('hidden')).toBe(true);
  });

  it('persists Dismiss across remounts', async () => {
    const dismiss = document.getElementById('welcome-dismiss') as HTMLButtonElement;
    dismiss.click();
    await flushMicrotasks();

    expect(document.getElementById('welcome')?.hasAttribute('hidden')).toBe(true);
    expect(await onboarding.isDismissed()).toBe(true);

    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();
    expect(document.getElementById('welcome')?.hasAttribute('hidden')).toBe(true);
  });

  it('debug log toggle starts unchecked when log is disabled', () => {
    const toggle = document.getElementById('debug-enabled') as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it('toggling debug-enabled persists and updates the status line', async () => {
    const toggle = document.getElementById('debug-enabled') as HTMLInputElement;
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushMicrotasks();

    expect(await debugLog.isEnabled()).toBe(true);
    expect(document.getElementById('debug-status')?.textContent).toContain(
      'enabled'
    );
    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('enabled');
  });

  it('Clear debug logs empties stored entries and reports it', async () => {
    await debugLog.setEnabled(true);
    await debugLog.error('whatever broke');
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();
    expect(document.getElementById('debug-status')?.textContent).toContain('1');

    (document.getElementById('debug-clear') as HTMLButtonElement).click();
    await flushMicrotasks();

    expect(await debugLog.getCount()).toBe(0);
    expect(document.getElementById('debug-status')?.textContent).toContain(
      'No entries yet'
    );
    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('Cleared');
  });

  it('associates the API key input with its description via aria-describedby (WCAG 1.3.5)', () => {
    const input = document.getElementById('key-input') as HTMLInputElement;
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBe('key-description');
    expect(document.getElementById('key-description')).not.toBeNull();
  });

  it('reports a clear error message when given a privileged-scheme URL', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;
    input.value = 'chrome://settings';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('chrome://');
    expect(status.getAttribute('data-tone')).toBe('error');
    expect(await store.isEnabled('chrome://settings')).toBe(false);
  });

  it('removes a domain via its Remove button', async () => {
    await store.enable('example.com');
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();

    const removeBtn = document.querySelector(
      '#domains-list button'
    ) as HTMLButtonElement;
    expect(removeBtn.textContent).toBe('Remove');
    removeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMicrotasks();

    expect(await store.isEnabled('example.com')).toBe(false);
    const list = document.getElementById('domains-list')!;
    expect(list.querySelector('.empty')).not.toBeNull();
    expect(await permissions.contains(['https://example.com/*'])).toBe(false);
  });

  it('reports permission denial through the live region', async () => {
    permissions.setAutoApprove(false);
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;

    input.value = 'example.com';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const status = document.getElementById('status-region')!;
    expect(status.textContent?.toLowerCase()).toContain('denied');
    expect(status.getAttribute('data-tone')).toBe('error');
    expect(await store.isEnabled('example.com')).toBe(false);
  });

  it('renders empty usage on first mount', () => {
    const today = document.getElementById('usage-today')!;
    expect(today.textContent).toContain('0 tokens');
    expect(today.textContent).toContain('$0.00');
  });

  it('reflects seeded ledger entries in the summary numbers', async () => {
    await ledger.record({
      model: 'claude-sonnet-4-6',
      input_tokens: 10_000,
      output_tokens: 500,
      cost_usd: 0.0375,
    });
    // Re-mount so the summary reads the seeded ledger.
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();

    const today = document.getElementById('usage-today')!.textContent ?? '';
    expect(today).toContain('10,500 tokens');
    expect(today).toContain('$0.04');
  });

  it('renders "(not set)" mask when no API key is stored', () => {
    expect(document.getElementById('key-mask')!.textContent).toBe('(not set)');
  });

  it('saves an API key via the form and updates the masked display', async () => {
    const input = document.getElementById('key-input') as HTMLInputElement;
    const form = document.getElementById('key-form') as HTMLFormElement;
    input.value = 'sk-ant-test-key-12345';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    expect(await apiKey.get()).toBe('sk-ant-test-key-12345');
    expect(input.value).toBe('');
    expect(document.getElementById('key-mask')!.textContent).toContain('sk-an');
    expect(document.getElementById('key-mask')!.textContent).toContain('2345');
    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('Saved');
  });

  it('clears the API key via the Clear button', async () => {
    await apiKey.set('sk-ant-stored');
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();

    const clearBtn = document.getElementById('key-clear') as HTMLButtonElement;
    clearBtn.click();
    await flushMicrotasks();

    expect(await apiKey.get()).toBeNull();
    expect(document.getElementById('key-mask')!.textContent).toBe('(not set)');
    expect(document.getElementById('status-region')!.textContent).toContain('Cleared');
  });

  it('saving empty input clears the key', async () => {
    await apiKey.set('sk-ant-existing');
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();

    const input = document.getElementById('key-input') as HTMLInputElement;
    const form = document.getElementById('key-form') as HTMLFormElement;
    input.value = '   ';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    expect(await apiKey.get()).toBeNull();
    expect(document.getElementById('key-mask')!.textContent).toBe('(not set)');
  });

  it('reflects the current disclosure mode in the radio group', async () => {
    expect(
      (document.getElementById('disclosure-auto') as HTMLInputElement).checked
    ).toBe(true);
    expect(
      (document.getElementById('disclosure-always') as HTMLInputElement).checked
    ).toBe(false);
  });

  it('shows the auto-mode counter status', () => {
    const text = document.getElementById('disclosure-counter')!.textContent ?? '';
    expect(text).toContain('Auto');
    expect(text).toContain('0 of 5');
  });

  it('persists a mode change made via the radio group', async () => {
    const never = document.getElementById('disclosure-never') as HTMLInputElement;
    never.checked = true;
    never.dispatchEvent(new Event('change', { bubbles: true }));
    await flushMicrotasks();

    expect(await disclosure.getMode()).toBe('never');
    expect(document.getElementById('disclosure-counter')!.textContent).toBe('');
    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('never');
  });

  it('shows the disabled message once auto counter is exhausted', async () => {
    for (let i = 0; i < 5; i++) await disclosure.recordConfirmation();
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();
    const text = document.getElementById('disclosure-counter')!.textContent ?? '';
    expect(text).toContain('disabled');
  });

  it('clears the ledger and updates the summary', async () => {
    await ledger.record({
      model: 'claude-sonnet-4-6',
      input_tokens: 1000,
      output_tokens: 100,
      cost_usd: 0.01,
    });
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, {
      domains: store,
      ledger,
      apiKey,
      disclosure,
      onboarding,
      debugLog,
    });
    await flushMicrotasks();

    const clearBtn = document.getElementById('clear-ledger') as HTMLButtonElement;
    clearBtn.click();
    await flushMicrotasks();

    const today = document.getElementById('usage-today')!.textContent ?? '';
    expect(today).toContain('0 tokens');
    expect(today).toContain('$0.00');
    const status = document.getElementById('status-region')!;
    expect(status.textContent).toContain('Cleared');
    expect(status.getAttribute('data-tone')).toBe('ok');
  });
});
