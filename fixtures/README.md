# Fixtures

Hand-authored HTML pages that exercise the extractor against the variety of
real-world page shapes Phase 0 must handle. Each fixture is small enough to
commit, large enough to stress the relevant code paths.

## Inventory

| Fixture | Purpose |
|---|---|
| `F1-article` | Well-structured article with real landmarks, headings, prose. The "easy case" — if this fails, everything fails. |
| `F2-search-results` | Voluminous-but-structured page (search header, filter aside, result list, pagination). The headline use case. |
| `F3-div-soup` | Structure lies: no landmarks, generic divs styled like buttons, fake headings via font sizing. |
| `F4-form-heavy` | Multi-step form with password, credit-card, and personal-data inputs. Exercises sensitivity detection. |
| `F5-large-mutating` | Server-rendered HTML that "hydrates" into a different DOM with the same semantics. Exercises EC-1 mutation handling. |

## Anatomy

Each fixture lives in `fixtures/F#-name/`:

- `index.html` — the saved page. Standalone — no remote resources.
- `notes.md` — what this fixture is meant to exercise and what to check.

The integration test at `tests/fixtures/extract.test.ts` loads each fixture
into jsdom and asserts the extractor produces the expected shape.

## Adding a new fixture

1. Pick a real-world page archetype not already covered.
2. Author a minimal HTML that mimics the archetype's structure (or save a
   real page and inline its assets).
3. Add a `notes.md` explaining the fixture's purpose.
4. Extend `tests/fixtures/extract.test.ts` with assertions specific to it.
