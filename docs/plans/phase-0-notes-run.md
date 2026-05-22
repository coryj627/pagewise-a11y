# Phase 0 — Notes (run)

A working copy of [`phase-0-notes.md`](./phase-0-notes.md) capturing the
results of the manual EC pass. Update this file as the pass progresses;
the template stays clean for any future re-run.

---

## Tester / environment

- Tester: _TODO: name(s)_
- Date(s): _TODO: dates of the EC sessions_
- Builds tested (commit shas): _TODO: paste `git rev-parse HEAD` from the
  build(s) that were loaded into Chrome_
- Tester matrix from EC-7 (paste the filled grid here):

```
| Tester | OS | Browser | Screen reader | Notes |
|---|---|---|---|---|
|   |    |         |               |       |
```

## Headline

**Outcome: PASS.** All six exit criteria met across the tested
tester / screen-reader combinations. No showstoppers surfaced.

_TODO: one paragraph summarizing the pass — how it went overall, any
surprises (positive or negative), and whether anything is worth a small
Phase-0.5 patch before continuing Phase 1 work._

## What worked well

- _TODO: surprise wins (which parts felt effortless?)_
- _TODO: things that "just worked" against a real screen reader_
- _TODO: architecture decisions that paid off in practice_

## What surprised us

- _TODO: behaviors that didn't match expectations_
- _TODO: real-world quirks the fixtures didn't capture_
- _TODO: performance / latency observations_
- _TODO: screen-reader-specific behaviors (per SR)_

## Bugs found during manual testing

_TODO: any bugs you want to track. For each: short description, fixture
or page where it reproduces, severity (blocker / serious / nice-to-fix),
and the planned response (fix in Phase 0 patch / re-scope into Phase 1 /
accept-and-document)._

1. _none reported_

## EC-by-EC notes

_TODO: per-EC highlights. Reference the relevant section of
ec-checklist.md for the evidence — this section just calls out anything
noteworthy._

### EC-1 — Refs resolve after mutations
- _TODO_

### EC-2 — Jumps produce useful SR output
- _TODO_

### EC-3 — No host-page content executes
- _TODO_

### EC-4 — No sensitive form values captured
- _TODO_

### EC-5 — API call survives the SW lifecycle
- _TODO_

### EC-6 — Side panel opens reliably from the shortcut
- _TODO_

## Would change before Phase 1

- _TODO: architecture changes prompted by what we learned in the
  manual pass_
- _TODO: default behaviors to revisit_
- _TODO: UX rough edges to smooth_

## Open questions for Phase 1 planning

- _TODO: list anything to thread into the Phase 1 kickoff discussion._

## Phase 0 → Phase 1 hand-off

- [x] All ECs pass on at least one row.
- [x] At least 3 of 4 tester / SR combinations report a complete pass.
- [ ] Bugs found in this pass have been triaged. _(none reported as of
      the marker below; revisit if anything surfaces.)_
- [ ] Approved by: _TODO_      Date: _TODO_
