# F3 — Div-soup app

Category-1 use case from the architecture: pages whose structure lies. The
rotor here returns nothing useful — no landmarks, no real headings, no
buttons with proper roles. Pagewise has to re-derive what the page is.

## What to verify

- `main_content` falls back to the document body (no `<main>`).
- `PageCapabilityReport.reasons` includes `no_main_region`.
- Most "clickable" divs do NOT become role=button — only the one with
  `tabindex="0"` is even focusable.
- `interaction_surface.primary_buttons` is empty (we don't pick up
  div-spans as buttons in Phase 0).
- The fake "heading-1" / "heading-2" divs are NOT detected as headings
  (role inference is from the tag, not from font sizing).
- Counts: headings = 0, landmarks = 0 (or only contentinfo if any),
  buttons = 0.
- This fixture demonstrates the limit of deterministic extraction: AI
  Orientation is where the value comes from on pages like this.
