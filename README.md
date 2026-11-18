# SplitBill — split group expenses, exactly

**Live demo:** https://triattqp.github.io/splitbill-kane-hackathon/
**Entry:** Kane CLI Hackathon (TestMu AI) — built by an AI coding agent, verified end-to-end by Kane CLI.

SplitBill is a dependency-free static web app (plain HTML/CSS/JS — no build step,
no backend, no sign-up) for splitting group expenses:

- Add people (with duplicate / empty-name validation)
- Add expenses with a payer and an optional tip — tips are rounded and capped at 100%
- Split equally among any subset of the group, or by **custom amounts** with a live sum check
- Per-person balances and a greedy **minimum-transfer settlement list** ("who pays whom")
- IDR/USD display toggle, state persists in `localStorage`

Its one obsession is the math. All money is **integer math with remainder
distribution**, so shares always sum exactly to the total — Rp100.000 split
3 ways is **33.334 / 33.333 / 33.333**, never 99.999. Tip rounding edges
(9,999.9 → 10,000), unequal splits, and settlement netting are all covered
by tests (below).

## Run it

```bash
cd app && python3 -m http.server 8077   # → http://localhost:8077/
```

…or just open `app/index.html` in a browser. No credentials, no services.

## Verified by Kane CLI — 21/21 PASS

The app was verified by [Kane CLI](https://www.testmuai.com/kane-cli/), an AI
tester that drives a real browser from plain-English objectives. The suite
(21 objectives, defined in `VERIFY-PLAN.md`, runnable via `run-verify.sh`)
attacks the places money code usually breaks: remainder splits, tiny amounts,
subset splits, tip rounding and bounds, custom-split mismatches, negative
validation, multi-expense netting, both person-removal cascades, reload
persistence, and the currency toggle.

**First pass: 18/21.** Kane caught **2 genuine bugs**:

1. **The >100% tip error could never appear (V10).** The tip input carried a
   native `max="100"` attribute inside a submit form, so the browser silently
   blocked submission and the app's own *"Tip cannot be more than 100%"*
   error was dead code. Fix: removed the attribute so the app's validation
   is authoritative.
2. **"Everyone is settled up" vanished with the last expense (V16, V18).**
   The settled-up state was keyed on expenses existing, so deleting the last
   expense — or removing its payer — hid the confirmation even though every
   balance was zero. Fix: settled state is now keyed on people, not expenses.

Both fixes were driven by Kane's failure verdicts and re-verified:
**21/21 PASS.** Full per-objective results, Test Manager test IDs, and the
exact verdicts are in `VERIFY-RESULTS.md`; the failing first-pass run logs
are preserved in `runs/first-pass/` in the project archive.

## Replay the verification

```bash
npm install --prefix tools @testmuai/kane-cli   # Kane CLI 0.10.5
# authenticate once: kane-cli login (OAuth)
./run-verify.sh            # serves the app, runs all 21 objectives headlessly
./run-verify.sh V04 V10    # …or just a few
```

Exit code 0 per objective = pass; each run's raw output lands in `runs/`.

## Layout

```
app/             the SplitBill app (index.html, style.css, app.js)
VERIFY-PLAN.md   the 21 Kane objectives and what each one attacks
VERIFY-RESULTS.md  results, the 2 bugs, fixes, and evidence pointers
run-verify.sh    the closed loop: serve → verify → failures are bug reports
```
