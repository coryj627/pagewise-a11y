# Pagewise documentation

Architecture, schemas, and implementation guidance for Pagewise.

## Reading order

1. **`architecture.md`** — the canonical architecture doc. Read this first. Everything else fills in details.
2. **`phase-0-spike.md`** — what to build first, with exit criteria. Read before starting any code.
3. **`schemas.md`** — Zod schemas for every contract. Read when you need to know the shape of `PageModel`, `NodeRef`, the tool outputs, or the cross-surface messages.
4. **`system-prompts.md`** — the three Claude system prompts plus the shared injection framing. Read when working on `src/system-prompts/` or `src/side-panel/api/`.

## What's NOT in these docs (yet)

- A keyboard shortcut reference card (Phase 1).
- The fixture corpus contents (lives in `fixtures/` once Phase 0 starts).
- The cost ledger UI design (Phase 1).
- Per-surface README files (live alongside `src/content/`, `src/side-panel/`, etc.).
- Screen reader test transcripts (Phase 0 deliverable; lives in `tests/screen-reader/`).

## How to update these docs

These are living documents until v1 ships. When the architecture changes:

1. Update `architecture.md` first. It's the source of truth.
2. Update `schemas.md` to match.
3. Update `system-prompts.md` if the model contract changed.
4. Note the change in a `## What changed in this revision` block at the top of `architecture.md`.

After v1 ships, treat these as reference and put new design work in separate ADRs (architecture decision records) instead of editing the canonical docs in-place.
