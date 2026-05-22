# Pagewise

A Chrome / Edge extension that gives blind users a faster, structured way
to understand any web page, powered by the Claude API.

**Status:** Phase 0 spike code-complete. Manual screen-reader pass per
[`docs/plans/ec-checklist.md`](./docs/plans/ec-checklist.md) is the gate
to Phase 1.

## What's wired

- **Deterministic Orientation** — a `PageModel` extracted from the live
  DOM (landmarks, headings, forms, interaction surface, deterministic
  jump candidates) with no network call.
- **AI Orientation** — optional Claude API call (Sonnet 4.6 default,
  forced `summarize_page` tool) producing a one-line summary, anchored
  key facts, and a ranked jump list.
- **Per-domain opt-in** — Pagewise is inert on any domain until the user
  enables it via the options page. Content scripts register dynamically
  via `chrome.scripting.registerContentScripts`.
- **Sensitivity gate** — non-public pages (passwords, credit cards,
  banking/health/government domains) require explicit confirmation
  before any Claude call.
- **Cost disclosure** — "~N tokens, ~$X" prompt before the first 5 AI
  calls (configurable in options).
- **Local-only cost ledger** — today / this month / all-time token + USD
  totals visible in options.
- **Jump targets** — click a jump button in the panel and focus moves on
  the host page (`tabindex="-1"` applied temporarily, restored on blur).
- **EC-1 mutation handling** — refs survive re-render, virtualized
  list scroll, and hydration via the multi-step resolution algorithm
  (live lookup → selector hint match → role + accessible-name fallback).
- **Sanitizer** — HTML and URL sanitizers cover the 8 adversarial
  inputs in [`phase-0-spike.md`](./docs/plans/phase-0-spike.md).

## Docs

1. [`docs/plans/architecture.md`](./docs/plans/architecture.md) — canonical
   architecture. Start here.
2. [`docs/plans/phase-0-spike.md`](./docs/plans/phase-0-spike.md) — what
   the spike must prove, with exit criteria.
3. [`docs/plans/schemas.md`](./docs/plans/schemas.md) — Zod schemas for
   every contract.
4. [`docs/plans/system-prompts.md`](./docs/plans/system-prompts.md) — the
   three Claude system prompts plus shared injection framing.
5. [`docs/plans/ec-checklist.md`](./docs/plans/ec-checklist.md) — manual
   exit-criteria checklist to run before Phase 1.
6. [`fixtures/README.md`](./fixtures/README.md) — the 5 Phase 0 fixtures.

## Development

Requires Node 22+ and npm.

```sh
npm install
npm run dev        # vite dev server + HMR
npm run build      # typecheck + production build to dist/
npm run typecheck
npm test           # vitest, jsdom env
npm run test:watch
```

Current test count: ~485 across 36 files. All green is a hard
precondition for committing changes.

### Loading the extension in Chrome

1. `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. **Load unpacked** → select the `dist/` directory.
5. Open the options page (extensions menu → Pagewise → Details → Extension
   options):
   - Paste your Anthropic API key (it's stored locally, sent only to
     `api.anthropic.com`).
   - Enable one or more domains.
6. Open a tab on an enabled domain, press **Alt+Shift+P** (or click the
   toolbar icon) to open the side panel.
7. Press **Run** for a deterministic page summary, or **Run with AI** for
   the Claude-enriched version.

### Serving the Phase 0 fixtures locally

The fixtures under [`fixtures/`](./fixtures/) need a real URL to load
into a real Chrome tab. Any static file server works:

```sh
python3 -m http.server 8080 -d fixtures
```

Then visit `http://localhost:8080/F1-article/` etc. Enable `localhost`
in Pagewise options (the domain logic accepts it) and run through the
checklist.

## Project layout

```
src/
├── content/                 # runs in page context (extract + jump)
│   ├── main.ts              # built standalone → dist/content-script.js
│   ├── dom-accessibility/   # accessible-name, role, hiddenness, focusability
│   ├── extract/             # walker, page-model, sensitivity, pre-rank
│   ├── refs/                # hashing, RefRegistry, re-resolution
│   └── navigate.ts          # jump-to-element with tabindex handling
├── service-worker/          # background: routing, cache, permissions wiring
├── side-panel/              # the user-facing UI; owns Claude API calls
│   ├── api/                 # Anthropic SDK wrapper + token/cost helpers
│   ├── render/sanitizer.ts  # HTML + URL sanitizer
│   ├── ref-resolver.ts      # PageModel → (id) → NodeRef lookup
│   └── ui.ts                # mountSidePanelUi(root, services)
├── options/                 # API key, domain allowlist, ledger, disclosure
├── system-prompts/          # the three Claude prompts + injection framing
├── schemas/                 # Zod schemas for every cross-boundary contract
└── shared/                  # storage / permissions / domain / cost-ledger /
                             # disclosure / url-sanitizer / content-hash etc.
```

## Known caveats

- `npm audit` flags a high-severity advisory on `rollup` (a build-time
  dep of `@crxjs/vite-plugin`). It's a path-traversal in artifact upload
  — not a runtime issue — and downgrading crxjs to v1 would break the MV3
  build. Resolves when crxjs bumps its rollup peer.
- Pricing constants in `src/shared/pricing.ts` are best-effort and need
  verification against [Anthropic's pricing page](https://www.anthropic.com/pricing)
  before shipping in front of users.
- Sensitivity detection is intentionally conservative — false positives
  cost a confirmation click; false negatives could send private content.
  Expand the curated registry in `src/shared/domains.ts` rather than
  loosening the matcher.

## License

MIT — see [`LICENSE`](./LICENSE).
