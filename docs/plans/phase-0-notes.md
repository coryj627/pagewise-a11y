# Phase 0 — Notes

A blank template for the human reviewer to fill out after running through
[`ec-checklist.md`](./ec-checklist.md). The goal is to capture what the
EC pass surfaced that the automated tests didn't — and what we'd change
about the architecture or plan before opening Phase 1.

> **Copy this file to `phase-0-notes-run.md` before filling it in.** The
> template stays clean for the next pass.

---

## Tester / environment

- Tester: ____________________
- Date(s): ____________________
- Builds tested (commit shas): ____________________
- Tester matrix from EC-7 (paste the filled grid here):

```
| Tester | OS | Browser | Screen reader | Notes |
|---|---|---|---|---|
|   |    |         |               |       |
```

## Headline

One paragraph summarizing the EC pass.

- What was the overall outcome — pass / partial / fail?
- Were there any showstoppers?
- Which combinations passed all six ECs?

## What worked well

- Surprise wins:
- Things that "just worked":
- Architecture decisions that paid off:

## What surprised us

- Behaviors that didn't match expectations:
- Real-world quirks the fixtures didn't capture:
- Performance / latency observations:
- Screen-reader-specific behaviors (per SR):

## Bugs found during manual testing

For each: short description, fixture or page where it reproduces, severity
(blocker / serious / nice-to-fix), and the planned response (fix in Phase 0
patch / re-scope into Phase 1 / accept-and-document).

1.
2.
3.

## EC-by-EC notes

Reference the relevant section of the run checklist for evidence — this
section just highlights anything noteworthy.

### EC-1 — Refs resolve after mutations
-

### EC-2 — Jumps produce useful SR output
-

### EC-3 — No host-page content executes
-

### EC-4 — No sensitive form values captured
-

### EC-5 — API call survives the SW lifecycle
-

### EC-6 — Side panel opens reliably from the shortcut
-

## Would change before Phase 1

- Architecture changes prompted by what we learned:
- Default behaviors to revisit:
- UX rough edges to smooth:

## Open questions for Phase 1 planning

- (Use this list to drive the Phase 1 kickoff conversation.)
-

## Phase 0 → Phase 1 hand-off

- [ ] All ECs pass on at least one row.
- [ ] At least 3 of 4 tester / SR combinations report a complete pass.
- [ ] Bugs found in this pass have been triaged.
- [ ] Approved by: ____________________ Date: __________
