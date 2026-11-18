# VERIFY-RESULTS — Kane CLI verification of SplitBill

Run date: 18 Nov 2026 (WIB), against the locally served app
(`python3 -m http.server 8077` → http://127.0.0.1:8077/), Kane CLI 0.10.5,
headless, one objective per run via `run-verify.sh`.

## Headline

- **First pass: 18/21 passed.** Kane caught **2 real app bugs** (3 failing checks).
- **After fixes: 21/21 passed** (fixed checks re-run + 2 regression checks re-run green).
- Credits: 11,200 → 10,453.7 remaining (≈746 consumed by the whole effort,
  including environment-blocked early attempts and the first pass).
- Each run below is identified by its Test Manager **test_id** (session evidence
  packs live under `~/.testmuai/kaneai/sessions/<session_id>/`, raw NDJSON in
  `runs/Vxx.ndjson`; first-pass failures preserved in `runs/first-pass/`).

## Bugs Kane found — and the fixes (the closed loop)

### Bug 1 — Tip >100% error message could never appear (V10)

- **First pass:** FAIL. Kane verdict: *"A 150% tip is blocked, but the app does
  not show the required 'Tip cannot be more than 100%' error."*
- **Root cause:** `app/index.html` put `max="100"` on the tip `<input>` inside a
  `<form>` whose button is `type="submit"`. The browser's native constraint
  validation silently blocked submission, so the app's own submit handler —
  which contains the exact error message (`app.js`: "Tip cannot be more than
  100%.") — never ran. The app's validation was dead code.
- **Fix:** removed the `max="100"` attribute from `expense-tip-input` so the
  app's own validation is authoritative and its error renders in the DOM.
- **Re-run:** V10 PASS (test ea108972-e82a-4741-97b1-ccc2441555d9).

### Bug 2 — "Everyone is settled up" vanished when the last expense went away (V16, V18)

- **First pass:** FAIL ×2. Kane verdicts: after deleting the only expense (V16)
  / after removing the payer whose expense is deleted with him (V18), *"the
  expense list is empty but the app does not show the required settled-up
  message."*
- **Root cause:** `renderBalances()` in `app/app.js` computed
  `hasData = people.length > 0 && expenses.length > 0` and only showed the
  settled-up message when `hasData` was true. With people present but zero
  expenses, the UI instead showed "Balances will appear here once people and
  expenses exist." — contradicting the per-person list right below it, which
  correctly showed everyone as *settled*.
- **Fix:** settled-up state is now keyed on people, not expenses:
  `hasPeople = state.people.length > 0`; `balances-empty` shows only when
  there are no people; `settled-state` shows when `hasPeople && transfers == 0`.
- **Re-run:** V16 PASS (test 07f5d493-74b1-41e4-a230-d6a8934fa6d8),
  V18 PASS (test 85ea5583-426c-4282-9a03-b34af2d631eb).
  Regression checks on the same render path also re-run green: V07, V21.

No objective text in VERIFY-PLAN.md needed correction — every expected value in
the plan matched the app's intended behavior; both failures were genuine app
bugs, not plan errors.

## Per-objective results (final state: all PASS)

| ID | Check | Result | Test Manager test_id | Notes |
|----|-------|--------|----------------------|-------|
| V01 | Add people, empty state clears | ✅ PASS | 72c51cbd-d879-4ea8-b36d-04a23a8e1c66 | Smoke run; passed first try |
| V02 | Duplicate name rejected | ✅ PASS | cf1820c8-88ca-4c99-98a8-fc1294dfe629 | Case-insensitive ('Ana' vs 'ana') |
| V03 | Empty name rejected | ✅ PASS | 8f418fd8-7acd-4619-91f4-df6ab832b9cd | |
| V04 | Remainder distribution 100000/3 | ✅ PASS | d8987675-ce33-4fd3-8d97-4bcadb1c25e3 | 33.334/33.333/33.333 — the signature test |
| V05 | Tiny-amount remainder (100/3) | ✅ PASS | 3c101574-1183-4c99-a859-b7a81a45a71b | 34/33/33 |
| V06 | Subset split | ✅ PASS | 41a2c587-da3b-4c2b-8da6-5353a2422c3d | Payer not in split list |
| V07 | Payer-only expense settles instantly | ✅ PASS | 454e3fbb-8a3e-4853-9375-9c5886f8021a | Re-run after Bug-2 fix: still PASS |
| V08 | Tip included and split | ✅ PASS | 5ff1dc9d-ab02-451e-a7ba-39b21735e18a | Totals bar verified |
| V09 | Tip rounding edge (99999 @10%) | ✅ PASS | 44c15eca-1382-471f-be40-cae362a629f5 | 9999.9 → Rp10.000 |
| V10 | Tip over 100% rejected | ❌→✅ PASS | first: 12c1a411-08cd-4bdf-8063-7ace38f56578 · fixed: ea108972-e82a-4741-97b1-ccc2441555d9 | **Bug 1** (native `max` validation hid the app error) |
| V11 | Custom split math | ✅ PASS | 8587b18e-979f-4b56-9fe5-f3b2a9576baf | Incl. zero-share participant |
| V12 | Custom sum mismatch blocked | ✅ PASS | 7d6b5021-b863-4ed0-8a59-4b6233616ab9 | |
| V13 | Zero amount rejected | ✅ PASS | 6533f4e9-7e8e-4cd4-8849-30441c78aade | |
| V14 | No split member selected rejected | ✅ PASS | fe74e187-6bf8-4a77-89e0-15228b03c046 | |
| V15 | Multi-expense netting, min transfers | ✅ PASS | e0ec8761-fc54-44ad-8642-ee7731dcc0a7 | 2 transfers for 3 people |
| V16 | Delete expense restores settled state | ❌→✅ PASS | first: 97c22a96-c67d-4cf1-8eec-e041771b2ac4 · fixed: 07f5d493-74b1-41e4-a230-d6a8934fa6d8 | **Bug 2** (settled message keyed on expenses) |
| V17 | Remove a person who has a balance | ✅ PASS | 27734be6-549e-448e-ac40-dcbb21ccc9ed | Share re-splits 50.000/50.000 |
| V18 | Remove a payer deletes their expenses | ❌→✅ PASS | first: dfd96c49-e1f7-4597-bd6b-d93d42c56483 · fixed: 85ea5583-426c-4282-9a03-b34af2d631eb | **Bug 2**, second symptom |
| V19 | Persistence across reload | ✅ PASS | d0d0fa85-ea67-4f23-8e2e-600f0e661eca | Extraction (`store … as 'balanceBefore'`) worked |
| V20 | Currency toggle reformats | ✅ PASS | f451d61b-bb60-4c6f-b24b-864051c15ef4 | $100,000, no Rp left |
| V21 | Reset all clears everything | ✅ PASS | f52e1705-f998-4c07-ae4b-14a8c9d85c8d | Re-run after Bug-2 fix: still PASS; incl. post-reload check |

## Environment notes (what it took to run Kane on this VM)

1. **Chrome:** the VM's Hatch-managed Chromium hard-blocks loopback navigation
   (`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`) and refuses to start without
   Hatch WebGL policy flags. Solution: a vanilla **Chrome for Testing 157**
   installed workspace-local at `tools/browsers/` and passed via
   `KANE_CLI_CHROME_PATH` (see `tools/chrome-wrapper.sh` for the Hatch attempt
   and why it was abandoned).
2. **NO_PROXY:** the VM's default `NO_PROXY` contains bracketed IPv6 entries
   (`[::1]`, `[fd8b:…::1]`) that crash Kane's Python runner (httpx
   `Invalid port: ':1]'` while building the API client). `run-verify.sh`
   exports a sanitized `NO_PROXY=localhost,127.0.0.1`.
3. Runs are sequential (VM ≈1.4 effective cores); each objective took ~2 min
   and ~14–39 credits.
