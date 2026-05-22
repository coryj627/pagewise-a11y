# F1 — Well-structured article

The "easy case." This fixture is what an accessible Wikipedia-style article
looks like. If extraction can't make sense of this, nothing else will work.

## What to verify

- `page_state` is `normal`.
- `main_content` is the `<main>` element.
- `landmarks` includes banner (header), navigation (primary nav),
  main, complementary (aside), contentinfo (footer).
- All h1-h3 are captured with the correct `level`.
- `deterministic_candidates` puts main first, then the H1 ("The CRISPR
  Revolution"), then continues with landmarks and links.
- `SensitivityReport.page_classification` is `public_likely` — no form
  controls, no sensitive fields, no sensitive host.
- `url_path_redacted` is false.
- Counts: landmarks ≥ 4, headings ≥ 6, links ≥ 5.
