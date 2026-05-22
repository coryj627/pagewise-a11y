/**
 * Debounced detector for "the page has changed" in ways that invalidate a
 * cached PageModel. Covers two signals:
 *
 *   1. DOM mutations under document.body (childList + subtree). SPAs
 *      re-render content here on route changes; static pages mutate too
 *      (carousels, infinite scroll, hover menus). We debounce aggressively
 *      to avoid firing on incidental churn.
 *   2. URL changes — pushState / replaceState (patched), popstate,
 *      hashchange. These map to client-side routing in every framework.
 *
 * The observer does NOT trigger re-extraction itself. It fires a callback
 * the content script forwards to the side panel; the user decides whether
 * to re-extract.
 *
 * Attribute mutations are intentionally NOT watched — Pagewise's own
 * jump-to-element flow sets a temporary tabindex, and we don't want
 * those self-mutations to fire.
 */

export type PageChangeReason =
  | 'dom_mutation'
  | 'url_pushstate'
  | 'url_replacestate'
  | 'url_popstate'
  | 'url_hashchange';

export interface PageChangeObserverOptions {
  /** Debounce window in ms. Multiple events within this window collapse to one fire. Defaults to 500. */
  debounceMs?: number;
  /** Watch DOM mutations under document.body. Defaults to true. */
  watchDom?: boolean;
  /** Watch URL changes (pushState/replaceState/popstate/hashchange). Defaults to true. */
  watchUrl?: boolean;
  /** Callback invoked (debounced) with the first reason seen in the window. */
  onChange: (reason: PageChangeReason) => void;
}

interface ResolvedOptions {
  debounceMs: number;
  watchDom: boolean;
  watchUrl: boolean;
  onChange: (reason: PageChangeReason) => void;
}

export class PageChangeObserver {
  private readonly options: ResolvedOptions;
  private readonly doc: Document;
  private readonly win: Window;

  private mutationObserver: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private firstReasonInWindow: PageChangeReason | null = null;
  private paused = false;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;
  private boundPopState = (): void => this.fire('url_popstate');
  private boundHashChange = (): void => this.fire('url_hashchange');

  constructor(
    options: PageChangeObserverOptions,
    doc: Document = document,
    win: Window = window
  ) {
    this.options = {
      debounceMs: options.debounceMs ?? 500,
      watchDom: options.watchDom ?? true,
      watchUrl: options.watchUrl ?? true,
      onChange: options.onChange,
    };
    this.doc = doc;
    this.win = win;
  }

  start(): void {
    if (this.options.watchDom) {
      this.mutationObserver = new MutationObserver(() => this.fire('dom_mutation'));
      this.mutationObserver.observe(this.doc.body, {
        childList: true,
        subtree: true,
      });
    }
    if (this.options.watchUrl) {
      this.patchHistory();
      this.win.addEventListener('popstate', this.boundPopState);
      this.win.addEventListener('hashchange', this.boundHashChange);
    }
  }

  stop(): void {
    if (this.mutationObserver !== null) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    if (this.originalPushState !== null) {
      this.win.history.pushState = this.originalPushState;
      this.originalPushState = null;
    }
    if (this.originalReplaceState !== null) {
      this.win.history.replaceState = this.originalReplaceState;
      this.originalReplaceState = null;
    }
    this.win.removeEventListener('popstate', this.boundPopState);
    this.win.removeEventListener('hashchange', this.boundHashChange);
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.firstReasonInWindow = null;
  }

  /**
   * Suppress fires until {@link resume}. The content script uses this while
   * it is itself mutating the DOM (e.g., during a jump) to avoid feedback.
   */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  private fire(reason: PageChangeReason): void {
    if (this.paused) return;

    if (this.firstReasonInWindow === null) {
      this.firstReasonInWindow = reason;
    }

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const reasonToReport = this.firstReasonInWindow ?? reason;
      this.firstReasonInWindow = null;
      this.options.onChange(reasonToReport);
    }, this.options.debounceMs);
  }

  private patchHistory(): void {
    const history = this.win.history;
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
    const self = this;

    history.pushState = function patchedPushState(
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      const result = self.originalPushState!.apply(this, args);
      self.fire('url_pushstate');
      return result;
    };

    history.replaceState = function patchedReplaceState(
      this: History,
      ...args: Parameters<History['replaceState']>
    ): void {
      const result = self.originalReplaceState!.apply(this, args);
      self.fire('url_replacestate');
      return result;
    };
  }
}
