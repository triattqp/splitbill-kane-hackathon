# VERIFY-PLAN — Kane CLI verification strategy for SplitBill

This plan is the core of the entry's **Verified** score (25% of judging, first tie-break)
and the Best Tester angle: instead of happy-path clicks, the suite attacks the places money
math usually breaks — rounding remainders, tip rounding, unequal splits, settlement netting,
removal edge cases, and persistence.

## How the suite will run (once Kane CLI is installed + authenticated)

Serve the app locally (any static server works; the app has no build step):

```bash
cd app && python3 -m http.server 8077   # → http://localhost:8077/
```

Each check below is one Kane objective, run headless so results are scriptable:

```bash
kane-cli run "<objective>" --url http://localhost:8077/ --headless --agent
# exit 0 = pass, 1 = assertion failed, 2 = error, 3 = timeout
```

A `run-verify.sh` runner (to be added after CLI install) will execute all objectives in
order, capture each run's JSON + evidence pack, and stop the build on any failure — that
script *is* the closed loop: agent edits code → runner verifies → failures re-prompt the fix.

Conventions: default currency is IDR, formatted Indonesian-style (`Rp100.000`). Every flow
ends in an assertion about the resulting page state, per the Kane docs. Objectives that need
a clean slate start by clearing localStorage (Kane objectives can clear browser storage) or
run against a fresh profile.

## The checks

### A. People management

**V01 — Add people, empty state clears**
Objective: "In the People section, type 'Ana' in the add-person field and click Add, then add
'Ben' and 'Cia' the same way. Verify the people list shows Ana, Ben and Cia, and verify the
'No people yet' message is no longer visible."
Covers: basic add flow, empty-state lifecycle.

**V02 — Duplicate name rejected (negative)**
Objective: "Add a person named 'Ana'. Then try to add another person named 'ana'. Verify an
error containing 'already on the list' is visible and the people list still contains exactly
one Ana."
Covers: case-insensitive duplicate validation.

**V03 — Empty name rejected (negative)**
Objective: "Leave the add-person field empty and click Add. Verify an error containing
'Please enter a name' is visible and no person was added."
Covers: required-field validation.

### B. Equal splits and rounding — the tricky core

**V04 — Remainder distribution (the signature test)**
Objective: "Add people Ana, Ben and Cia. Add an expense 'Dinner' of 100000 paid by Ana, split
equally among all three. Verify the expense shows Ana Rp33.334, Ben Rp33.333 and Cia Rp33.333,
verify Ana's balance says 'gets back' Rp66.666, and verify the settlement list shows Ben pays
Ana Rp33.333 and Cia pays Ana Rp33.333."
Covers: floor-division + one-unit remainder handout in member order; shares sum exactly to
the total (33.334 + 33.333 + 33.333 = 100.000); balance and settlement derivation.
*This is the check most splitter apps on the internet would fail.*

**V05 — Tiny-amount remainder**
Objective: "Add people Ana, Ben and Cia. Add an expense of 100 paid by Ben split equally
among all three. Verify the shares shown are Rp34, Rp33 and Rp33 and that they add up to
Rp100."
Covers: remainder logic at small magnitudes (no lost unit).

**V06 — Subset split**
Objective: "Add people Ana, Ben and Cia. Add an expense 'Taxi' of 60000 paid by Cia, split
equally, but select only Ana and Ben as split members. Verify only Ana and Ben owe Rp30.000
each, Cia's balance says 'gets back' Rp60.000, and Cia does not appear in the split list."
Covers: split-among-selected (not necessarily everyone).

**V07 — Payer-only expense settles instantly**
Objective: "Add person Ana. Add an expense of 50000 paid by Ana split only among Ana. Verify
the 'Everyone is settled up' message is visible and the settlement list is empty."
Covers: degenerate split, settled empty state.

### C. Tip math

**V08 — Tip included and split**
Objective: "Add people Ana and Ben. Add an expense 'Lunch' of 200000 with tip 10%, paid by
Ben, split equally. Verify the expense total shows Rp220.000 and mentions tip Rp20.000,
verify Ana owes Rp110.000, and verify the totals bar shows Total spent Rp220.000 and Total
tips Rp20.000."
Covers: tip = round(amount × %), tip folded into the split total, totals aggregation.

**V09 — Tip rounding edge**
Objective: "Add people Ana and Ben. Add an expense of 99999 with tip 10% paid by Ana split
equally. Verify the tip shown is Rp10.000 (9999.9 rounds up) and the expense total is
Rp109.999."
Covers: half-up tip rounding at the boundary.

**V10 — Tip over 100% rejected (negative)**
Objective: "Add people Ana and Ben. Try to add an expense of 50000 with tip 150%. Verify an
error containing 'Tip cannot be more than 100%' is visible and no expense was added."
Covers: input bounds.

### D. Custom (unequal) splits

**V11 — Custom split math**
Objective: "Add people Ana, Ben and Cia. Add an expense 'Groceries' of 90000 paid by Cia,
choose 'Custom amounts', assign Ana 50000, Ben 40000 and Cia 0. Verify the custom summary
says the assignment is exact, add the expense, and verify the settlements show Ana pays Cia
Rp50.000 and Ben pays Cia Rp40.000."
Covers: unequal shares end-to-end, zero-share participant.

**V12 — Custom sum mismatch blocked (negative)**
Objective: "Add people Ana and Ben. Start an expense of 90000 paid by Ana, choose 'Custom
amounts', assign Ana 50000 and Ben 30000. Verify the summary warns it is not exact, submit,
and verify an error containing 'must match exactly' is visible and no expense was added."
Covers: sum-must-equal-total guard, live summary feedback.

### E. Validation negatives

**V13 — Zero amount rejected**
Objective: "Add people Ana and Ben. Try to add an expense with amount 0. Verify an error
containing 'Amount must be greater than zero' is visible."
Covers: zero-amount guard.

**V14 — No split member selected rejected**
Objective: "Add people Ana and Ben. Start an expense of 50000 paid by Ana and uncheck every
split member. Submit and verify an error containing 'Select at least one person' is visible."
Covers: empty-participant guard.

### F. Balances & settlement correctness

**V15 — Multi-expense netting minimizes transfers**
Objective: "Add people Ana, Ben and Cia. Add 'Dinner' 90000 paid by Ana split equally among
all three. Then add 'Taxi' 30000 paid by Ben split equally between Ben and Cia only. Verify
the balances are Ana gets back Rp60.000, Ben owes Rp15.000, Cia owes Rp45.000, and verify the
settlement list has exactly two transfers: Cia pays Ana Rp45.000 and Ben pays Ana Rp15.000."
Covers: cross-expense netting + greedy minimum-transfer settlement (3 people, 2 transfers,
nobody pays someone they don't owe).

**V16 — Delete expense restores settled state**
Objective: "Add people Ana and Ben and an expense of 40000 paid by Ana split equally. Verify
Ben owes Rp20.000. Then delete the expense and verify the 'Everyone is settled up' message
is visible and the expense list is empty."
Covers: deletion recompute, settled-state return.

### G. Removal edge cases

**V17 — Remove a person who has a balance**
Objective: "Add people Ana, Ben and Cia. Add 'Dinner' 100000 paid by Ana split equally among
all three. Click Remove next to Ben. Verify a confirmation dialog appears mentioning Ben's
balance. Confirm the removal. Verify Ben is gone, the dinner is now split Ana Rp50.000 and
Cia Rp50.000, and the settlement shows Cia pays Ana Rp50.000."
Covers: the dangerous path — removing someone mid-debt re-splits their share equally among
the remaining members instead of corrupting the totals (shares still sum to 100.000).

**V18 — Remove a payer deletes their expenses**
Objective: "Add people Ana and Ben. Add an expense of 80000 paid by Ben split equally.
Remove Ben and confirm. Verify the expense list is empty, Ana's balance is settled, and the
'Everyone is settled up' message is visible."
Covers: payer-removal cascade.

### H. Persistence & currency

**V19 — Persistence across reload**
Objective: "Add people Ana and Ben. Add 'Dinner' 100000 paid by Ana split equally. Store the
text of Ana's balance as 'balanceBefore'. Reload the page. Verify Ana and Ben are still
listed, the Dinner expense is still shown, and Ana's balance text still equals the stored
'balanceBefore' value."
Covers: localStorage save/load round-trip, extraction pattern (`store X as 'name'`).

**V20 — Currency toggle reformats**
Objective: "Add people Ana and Ben and an expense of 100000 paid by Ana split equally.
Change the currency selector to USD. Verify amounts are now shown with a $ sign and comma
grouping (the expense total shows $100,000) and no Rp amounts remain visible."
Covers: IDR/USD formatting toggle (labels only, values unchanged).

**V21 — Reset all clears everything**
Objective: "With people and expenses present, click 'Reset all' and confirm. Verify the
'No people yet' and 'No expenses yet' empty states are both visible and the balance list is
empty. Reload the page and verify the empty states are still shown."
Covers: full reset incl. persisted state.

## Coverage map

| Area | Checks |
|---|---|
| People add/validate | V01, V02, V03 |
| Equal split + remainder | V04, V05, V06, V07 |
| Tip | V08, V09, V10 |
| Custom split | V11, V12 |
| Amount/member validation | V13, V14 |
| Balances & settlement | V15, V16 |
| Person removal cascades | V17, V18 |
| Persistence / currency / reset | V19, V20, V21 |

21 checks total (brief asked for 15+). Every negative path the UI exposes has a check, and
every check asserts a *computed* value — not just that a page element exists.
