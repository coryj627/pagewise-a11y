# Phase 0 — Exit Criteria Checklist

Manual checklist that gates Phase 1. Each criterion has been wired in code
and covered by automated tests in jsdom; this checklist is the
**real-browser, real-screen-reader pass** that confirms the spike works
end-to-end.

> **How to use this file.** Make a copy in `docs/plans/ec-checklist-run.md`
> before testing, then check the boxes as you go and paste evidence below
> each step. Don't edit this template in-place.

## Setup (do once)

- [ ] `npm install` succeeds.
- [ ] `npm test` reports all suites green.
- [ ] `npm run build` produces `dist/` without errors.
- [ ] Open `chrome://extensions`, enable **Developer mode**, **Load unpacked**, point at `dist/`. Pagewise appears with no console errors.
- [ ] Open Pagewise options:
  - [ ] Paste a valid Anthropic API key, save. Masked display shows `sk-an…last4`.
  - [ ] Enable a test domain (e.g., the file:// host of `fixtures/F1-article/index.html` served via a local static server).
- [ ] Open each fixture in a tab. Confirm Pagewise's content script loads (a `[pagewise]` debug log appears in the page's console).
- [ ] Each target screen reader (JAWS / NVDA / VoiceOver) is running and announcing focus changes.

If any setup step fails, stop and fix before continuing — the criteria below assume a working setup.

---

## EC-1 — Refs resolve correctly after common DOM mutations

For each of three mutation scenarios, exercise 5 jumps and confirm:
- At least 4 of 5 resolve to the same semantic element (same role + accessible name), OR fail safely with a "page changed" announcement.
- **Zero silent wrong jumps** (a wrong jump the user can't detect).

The automated harness at `tests/content/ec1-mutation.test.ts` covers the algorithmic side. Manual testing covers the browser-rendering, screen-reader-announcement side.

### Scenario A — Section re-render

- [ ] Load F1 (article) in the test tab.
- [ ] Get orientation. 5 jump targets visible in the side panel.
- [ ] In DevTools console, replace `document.querySelector('article').innerHTML = document.querySelector('article').innerHTML`. (Re-renders with same content.)
- [ ] Click each of the 5 jump targets in order. For each:
  - [ ] Focus lands on the correct semantic element, OR a "page changed" announcement fires.
  - [ ] **Confidence reported is ≥ 0.5 only when correct.**

Evidence: list which jump → which method (exact / hint_match / fallback / failed) → which announcement.

### Scenario B — Virtualized list scroll

- [ ] Load F2 (search results).
- [ ] Get orientation. Click into a jump for one of the result links to confirm it focuses there.
- [ ] In DevTools console, replace the result `<ol>` with a new `<ol>` containing different items (delete the first, add a new last).
- [ ] Trigger 5 jumps including the deleted item and 4 survivors.
- [ ] The deleted item must fail safely; the 4 survivors must resolve.

### Scenario C — Hydration

- [ ] Load F5 (large mutating).
- [ ] Get orientation. Note 5 captured jump refs.
- [ ] In DevTools console, run the hydration mutation from `tests/fixtures/extract.test.ts > F5` (wraps each `<section>` in a `<div class="hydrated">`).
- [ ] Click each of the 5 jumps. All should resolve (via fallback) with confidence ≥ 0.4 to the semantically correct element.

**Pass requires:** all three scenarios meet the 4-of-5 rule AND zero silent wrong jumps across all 15 jump attempts.

- [ ] **EC-1 PASS**

---

## EC-2 — Jumps produce useful screen reader output

For each of six element kinds, jump to the element and confirm the screen reader announces the correct role + accessible name within 2 seconds.

Repeat for each tester / screen reader combo in EC-7.

### Element kinds

- [ ] Heading (jump to H1 in F1 → "heading level 1, The CRISPR Revolution" or local equivalent)
- [ ] Landmark (jump to navigation in F1 → "navigation, Primary")
- [ ] Button (jump to "Add to cart" in F2 → "Add to cart, button")
- [ ] Link (jump to a result link in F2 → "Acer Aspire 5 — 15.6", link")
- [ ] Paragraph (jump to a paragraph in F1 → reads paragraph text)
- [ ] Form field (jump to "Card number" in F4 → "Card number, edit, required")

For each element kind: no silent jumps. The screen reader must say *something* within 2 seconds.

- [ ] **EC-2 PASS**

---

## EC-3 — No host-page content can execute in the side panel

The renderer must NEVER execute host-page HTML/scripts. The 8 adversarial inputs from `phase-0-spike.md` §Adversarial inputs are the test set; URL inputs (#3, #4) are automated in `tests/shared/url-sanitizer.test.ts`. Manual verification for the rest:

- [ ] Construct a test page containing each of the 8 inputs (inline `<script>`, event handler `onclick`, `javascript:` href, `data:` href, SVG with `<script>`, iframe to remote, CSS expression style, prompt-injection text).
- [ ] Run extraction on the test page. Open the side panel.
- [ ] DevTools Network tab: no requests fired from rendered content.
- [ ] DevTools Console: no script execution, no errors from host content.
- [ ] Inspect rendered HTML: no `javascript:` or `data:` URLs become clickable, no event handlers attached, no iframes injected.
- [ ] Prompt-injection text appears as inert text in the panel; AI Orientation (if API key configured) does NOT follow the injected instructions.

- [ ] **EC-3 PASS**

---

## EC-4 — No sensitive form values are captured

Load F4 (form-heavy). Fill in fake values for: password, credit card number, email, phone, address. Run extraction.

- [ ] In the side panel, open DevTools → inspect the PageModel JSON in the panel's network tab (the panel:extract response).
- [ ] No password value present.
- [ ] No credit-card number value present.
- [ ] No email/phone/address text values present.
- [ ] If a `<div contenteditable="true">` with content is added to the page, its text is NOT in the extraction; redaction `kind: contenteditable` IS in the SensitivityReport.
- [ ] Navigate to a URL like `/orders/8c4f1234-5678-4abc-9def-0123456789ab`. Confirm PageModel.url_path_shape is `/orders/:id`.
- [ ] `url_path_redacted` is true.

- [ ] **EC-4 PASS**

---

## EC-5 — API call works end-to-end without lifecycle failures

Load F5 (the largest fixture). Configure a valid API key. Run AI Orientation 10 times in succession.

- [ ] All 10 calls return a rendered enriched view.
- [ ] During the longest call, switch tabs and back. The side panel remains responsive; the status region still updates when the result arrives.
- [ ] Service worker logs (`chrome://extensions` → service worker → console) show no lifecycle termination during in-flight calls.
- [ ] After each successful call, the Usage section in options reflects the additional tokens + USD.

- [ ] **EC-5 PASS**

---

## EC-6 — Side panel opens reliably from the keyboard shortcut

- [ ] Confirm `chrome://extensions/shortcuts` shows Pagewise bound to **Alt+Shift+P** (default).
- [ ] Across 20 attempts on the 5 fixtures:
  - [ ] Side panel opens 20/20.
  - [ ] Focus lands on the mode selector area (no result cached) or the result heading (cached result).
  - [ ] The screen reader announces the panel becoming active.

- [ ] **EC-6 PASS**

---

## EC-7 — Tester / browser / screen reader matrix

| Tester | OS | Browser | Screen reader | EC-1 | EC-2 | EC-3 | EC-4 | EC-5 | EC-6 | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| | Windows | Chrome | JAWS | | | | | | | |
| | Windows | Edge | JAWS | | | | | | | |
| | Windows | Chrome | NVDA | | | | | | | |
| | macOS | Chrome | VoiceOver | | | | | | | |

Each row is one full pass. Fill names + notes inline.

---

## Sign-off

Phase 0 is done when:

- [ ] All six EC criteria pass on at least one tester / SR row.
- [ ] At least three of the four tester / SR combinations report a complete pass.
- [ ] A notes file (`docs/plans/phase-0-notes.md`) captures: what surprised us, what we'd change before Phase 1, and any items that need to be re-scoped before continuing.

If all three boxes above are checked: **Phase 0 → Phase 1 hand-off approved.**

- [ ] Approved: ____________________________ Date: __________
