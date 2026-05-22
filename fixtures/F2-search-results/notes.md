# F2 — Search results page

The headline use case for Pagewise: voluminous-but-structured pages where
the rotor says "243 headings exist" and the user needs "243 laptops sorted
by price, 16GB RAM filtered, page 1 of 12."

## What to verify

- `page_type` (from AI Orientation): `search_results`.
- `interaction_surface.search_inputs` includes the header search input.
- `interaction_surface.forms` includes the search form and the filters
  fieldset(s).
- `interaction_surface.primary_buttons` includes several "Add to cart"
  buttons.
- `deterministic_candidates` puts main → H1 ("Laptops under $1000") →
  search input → form → result list → pagination "Next" link near the top.
- Pagination links matching the pagination regex (Next, page 2, etc.) are
  in `deterministic_candidates`.
- Counts: links ≥ 10, buttons ≥ 5, form_controls ≥ 5 (checkboxes + radios
  + select).
