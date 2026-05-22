import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  PageChangeObserver,
  type PageChangeReason,
} from '@/content/observer';

const DEBOUNCE_MS = 50;

function setupObserver(extra: Partial<{
  watchDom: boolean;
  watchUrl: boolean;
}> = {}): { observer: PageChangeObserver; reasons: PageChangeReason[] } {
  const reasons: PageChangeReason[] = [];
  const observer = new PageChangeObserver({
    debounceMs: DEBOUNCE_MS,
    watchDom: extra.watchDom ?? true,
    watchUrl: extra.watchUrl ?? true,
    onChange: (reason) => reasons.push(reason),
  });
  observer.start();
  return { observer, reasons };
}

function flushTimers(ms: number = DEBOUNCE_MS + 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('PageChangeObserver — initial state', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main><h1>Initial</h1></main>';
  });

  it('does not fire on its own', async () => {
    const { observer, reasons } = setupObserver();
    await flushTimers();
    expect(reasons).toEqual([]);
    observer.stop();
  });
});

describe('PageChangeObserver — DOM mutations', () => {
  let env: ReturnType<typeof setupObserver>;
  beforeEach(() => {
    document.body.innerHTML = '<main><h1>Initial</h1></main>';
    env = setupObserver();
  });
  afterEach(() => env.observer.stop());

  it('fires once for an appendChild', async () => {
    document.body.appendChild(document.createElement('p'));
    await flushTimers();
    expect(env.reasons).toEqual(['dom_mutation']);
  });

  it('coalesces multiple mutations in the debounce window into one fire', async () => {
    for (let i = 0; i < 5; i++) {
      document.body.appendChild(document.createElement('span'));
    }
    await flushTimers();
    expect(env.reasons).toEqual(['dom_mutation']);
  });

  it('fires again for mutations in a separate debounce window', async () => {
    document.body.appendChild(document.createElement('p'));
    await flushTimers();
    document.body.appendChild(document.createElement('p'));
    await flushTimers();
    expect(env.reasons).toEqual(['dom_mutation', 'dom_mutation']);
  });

  it('does not fire on attribute changes (Pagewise sets temporary tabindex)', async () => {
    const h1 = document.querySelector('h1')!;
    h1.setAttribute('tabindex', '-1');
    h1.removeAttribute('tabindex');
    await flushTimers();
    expect(env.reasons).toEqual([]);
  });
});

describe('PageChangeObserver — URL changes', () => {
  let env: ReturnType<typeof setupObserver>;
  beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    env = setupObserver();
  });
  afterEach(() => env.observer.stop());

  it('fires on history.pushState', async () => {
    window.history.pushState({}, '', '/route-a');
    await flushTimers();
    expect(env.reasons).toContain('url_pushstate');
  });

  it('fires on history.replaceState', async () => {
    window.history.replaceState({}, '', '/route-b');
    await flushTimers();
    expect(env.reasons).toContain('url_replacestate');
  });

  it('fires on popstate', async () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushTimers();
    expect(env.reasons).toContain('url_popstate');
  });

  it('fires on hashchange', async () => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushTimers();
    expect(env.reasons).toContain('url_hashchange');
  });
});

describe('PageChangeObserver — pause / resume', () => {
  let env: ReturnType<typeof setupObserver>;
  beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    env = setupObserver();
  });
  afterEach(() => env.observer.stop());

  it('does not fire while paused', async () => {
    env.observer.pause();
    document.body.appendChild(document.createElement('div'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushTimers();
    expect(env.reasons).toEqual([]);
  });

  it('fires again after resume', async () => {
    env.observer.pause();
    document.body.appendChild(document.createElement('div'));
    await flushTimers();
    expect(env.reasons).toEqual([]);

    env.observer.resume();
    document.body.appendChild(document.createElement('div'));
    await flushTimers();
    expect(env.reasons).toEqual(['dom_mutation']);
  });
});

describe('PageChangeObserver — stop', () => {
  it('removes DOM, URL, and patched-history listeners; restores history methods', async () => {
    document.body.innerHTML = '<main></main>';
    const originalPushState = window.history.pushState;
    const { observer, reasons } = setupObserver();
    // While running the methods are patched.
    expect(window.history.pushState).not.toBe(originalPushState);
    observer.stop();
    // After stop they are restored.
    expect(window.history.pushState).toBe(originalPushState);

    // No fires after stop.
    document.body.appendChild(document.createElement('div'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.history.pushState({}, '', '/after-stop');
    await flushTimers();
    expect(reasons).toEqual([]);
  });
});

describe('PageChangeObserver — watch flags', () => {
  it('respects watchUrl: false', async () => {
    document.body.innerHTML = '<main></main>';
    const { observer, reasons } = setupObserver({ watchUrl: false });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    document.body.appendChild(document.createElement('p'));
    await flushTimers();
    expect(reasons).toEqual(['dom_mutation']);
    observer.stop();
  });

  it('respects watchDom: false', async () => {
    document.body.innerHTML = '<main></main>';
    const { observer, reasons } = setupObserver({ watchDom: false });
    document.body.appendChild(document.createElement('p'));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await flushTimers();
    expect(reasons).toEqual(['url_hashchange']);
    observer.stop();
  });
});

describe('PageChangeObserver — cross-source coalescing', () => {
  it('coalesces URL + DOM events in the same window into one fire', async () => {
    // URL methods fire synchronously; MutationObserver callbacks defer
    // to a microtask. Whichever happens first wins the "reason" slot;
    // in practice for synchronous code that's always the URL signal.
    document.body.innerHTML = '<main></main>';
    const { observer, reasons } = setupObserver();
    window.history.pushState({}, '', '/route');
    document.body.appendChild(document.createElement('p'));
    await flushTimers();
    expect(reasons).toHaveLength(1);
    expect(['url_pushstate', 'dom_mutation']).toContain(reasons[0]);
    observer.stop();
  });
});
