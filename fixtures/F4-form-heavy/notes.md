# F4 — Form-heavy page

Exercises sensitivity detection and the architecture's "sensitive page"
gating. A real-world equivalent would be any checkout, account-setup, or
credentials page.

## What to verify

- `SensitivityReport.page_classification` is `credential_likely` (password
  beats credit_card by priority).
- `redactions` includes entries for: email, phone, password, credit_card
  (×4: name/number/exp/csc), address (street/zip/country).
- No form input *values* appear anywhere in the PageModel (values are
  never captured at extraction time).
- `interaction_surface.forms` contains the form.
- `deterministic_candidates` puts main → H1 → the error-region (alert
  role) — alerts are high-priority.
- AI Orientation must NOT be reachable without the sensitivity confirmation
  prompt firing first.
