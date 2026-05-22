# F5 — Large mutating page

Real-world equivalent: a server-side-rendered page that hydrates after
`document_idle`. The DOM you extract from at first paint is NOT the DOM
the user ends up interacting with.

This fixture is intentionally small at rest. The integration test mutates
it on-the-fly to simulate the hydration: equivalent semantic structure,
different DOM (wrapped sections, additional class names, navigation
panel added).

## What to verify

- Initial extraction produces a clean PageModel with main + headings +
  prose.
- After the simulated hydration, re-resolution of refs captured before
  the mutation still finds the equivalent semantic elements (matching
  role + accessible name) via the fallback path, OR fails safely.
- No silent wrong jumps — every resolution either correct or confidence
  below the jump threshold.

This is the only fixture currently relevant to EC-1; the mutation
scenarios in `tests/content/ec1-mutation.test.ts` are the canonical
suite.
