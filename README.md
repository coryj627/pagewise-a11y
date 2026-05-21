# Pagewise

A browser extension that gives blind users a faster, structured way to
understand any web page, powered by the Claude API.

**Status:** Phase 0 scaffold. See [`docs/plans/`](./docs/plans/) for the
architecture, schemas, system prompts, and the Phase 0 exit criteria.

## Reading order for the docs

1. [`docs/plans/architecture.md`](./docs/plans/architecture.md) — the canonical
   architecture. Start here.
2. [`docs/plans/phase-0-spike.md`](./docs/plans/phase-0-spike.md) — what to
   build first, with exit criteria.
3. [`docs/plans/schemas.md`](./docs/plans/schemas.md) — Zod schemas for every
   contract.
4. [`docs/plans/system-prompts.md`](./docs/plans/system-prompts.md) — the three
   Claude system prompts plus the shared injection framing.

## Development

Requires Node 22+ and npm.

```sh
npm install
npm run dev        # vite dev server with HMR
npm run build      # typecheck + production build to dist/
npm run typecheck
npm test           # vitest, jsdom env
npm run test:watch
```

### Loading the extension in Chrome

1. `npm run build` (or `npm run dev` for HMR).
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `dist/` directory.
5. Click the Pagewise toolbar icon, or press **Alt+Shift+P**, to open the side
   panel.

The extension is inert on all pages until you grant per-domain permission. The
domain allowlist UI lands in Phase 1; for now you can grant permissions
manually via `chrome://extensions` → Pagewise → Details → Site access.

## Project layout

The intended `src/` tree is documented in
[`architecture.md` §16](./docs/plans/architecture.md). The scaffold ships only
the entry points each surface needs to load:

```
src/
├── content/main.ts          # injected on enabled domains
├── service-worker/main.ts   # background, storage access level, side panel wiring
├── side-panel/              # the user-facing UI; owns Claude API calls
└── options/                 # API key, domain allowlist, cost ledger
```

Schemas, prompts, sanitizer, and the extractor land in subsequent milestones.

## Known caveats

- `npm audit` reports a high-severity advisory on `rollup` (a build-time
  dependency of `@crxjs/vite-plugin`). It is a path-traversal in artifact
  upload, not a runtime issue, and downgrading crxjs to v1 to "fix" it would
  regress the MV3 build. Will be resolved when crxjs bumps its rollup peer.

## License

MIT — see [`LICENSE`](./LICENSE).
