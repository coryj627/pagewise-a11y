// Content script entrypoint. Runs in the page's isolated world on domains
// the user has granted Pagewise permission for. Extraction, ref registry,
// and jump handling will live here. See architecture.md §6, §7.

console.debug('[pagewise] content script loaded on', window.location.origin);
