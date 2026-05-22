import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountOptionsUi } from '@/options/ui';
import { DomainStore } from '@/shared/domain-store';
import { MemoryStorageBackend } from '@/shared/storage';
import { MemoryPermissionsApi } from '@/shared/permissions';
import { CostLedger } from '@/shared/cost-ledger';
import { ApiKeyStore } from '@/shared/api-key';

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

  beforeEach(async () => {
    document.body.innerHTML = bodyFromOptionsHtml();
    permissions = new MemoryPermissionsApi();
    store = new DomainStore(new MemoryStorageBackend(), permissions);
    ledger = new CostLedger(new MemoryStorageBackend());
    apiKeyStorage = new MemoryStorageBackend();
    apiKey = new ApiKeyStore(apiKeyStorage);
    mountOptionsUi(document, { domains: store, ledger, apiKey });
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

  it('enables a sensitive domain when the user confirms', async () => {
    const input = document.getElementById('add-input') as HTMLInputElement;
    const form = document.getElementById('add-form') as HTMLFormElement;

    input.value = 'chase.com';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    const confirmRegion = document.getElementById('confirm-region')!;
    const enableButton = Array.from(
      confirmRegion.querySelectorAll('button')
    ).find((b) => b.textContent === 'Enable anyway')!;
    enableButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushMicrotasks();

    expect(await store.isEnabled('chase.com')).toBe(true);
    expect(confirmRegion.hasAttribute('hidden')).toBe(true);
    const list = document.getElementById('domains-list')!;
    expect(list.textContent).toContain('chase.com');
  });

  it('removes a domain via its Remove button', async () => {
    await store.enable('example.com');
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, { domains: store, ledger, apiKey });
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
    mountOptionsUi(document, { domains: store, ledger, apiKey });
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
    mountOptionsUi(document, { domains: store, ledger, apiKey });
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
    mountOptionsUi(document, { domains: store, ledger, apiKey });
    await flushMicrotasks();

    const input = document.getElementById('key-input') as HTMLInputElement;
    const form = document.getElementById('key-form') as HTMLFormElement;
    input.value = '   ';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushMicrotasks();

    expect(await apiKey.get()).toBeNull();
    expect(document.getElementById('key-mask')!.textContent).toBe('(not set)');
  });

  it('clears the ledger and updates the summary', async () => {
    await ledger.record({
      model: 'claude-sonnet-4-6',
      input_tokens: 1000,
      output_tokens: 100,
      cost_usd: 0.01,
    });
    document.body.innerHTML = bodyFromOptionsHtml();
    mountOptionsUi(document, { domains: store, ledger, apiKey });
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
