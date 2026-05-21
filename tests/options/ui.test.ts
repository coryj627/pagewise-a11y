import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountOptionsUi } from '@/options/ui';
import { DomainStore } from '@/shared/domain-store';
import { MemoryStorageBackend } from '@/shared/storage';
import { MemoryPermissionsApi } from '@/shared/permissions';

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

  beforeEach(async () => {
    document.body.innerHTML = bodyFromOptionsHtml();
    permissions = new MemoryPermissionsApi();
    store = new DomainStore(new MemoryStorageBackend(), permissions);
    mountOptionsUi(document, store);
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
    mountOptionsUi(document, store);
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
});
