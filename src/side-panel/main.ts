// Side panel entrypoint. Owns API calls, renders results, manages focus.
// See architecture.md §9 for layout, keyboard model, live regions.

const statusEl = document.getElementById('status');
if (statusEl) {
  statusEl.textContent = 'Pagewise ready.';
}
