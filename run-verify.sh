#!/bin/sh
# run-verify.sh — Kane CLI verification suite for SplitBill (21 objectives).
# Closed loop: serve app -> run all objectives headlessly -> any failure is a
# bug report. Exit codes per run are appended to runs/Vxx.ndjson (EXIT:<n>).
# Usage: ./run-verify.sh [V01 V04 ...]   (default: all)
set -u
cd "$(dirname "$0")"

export NO_PROXY=localhost,127.0.0.1
export no_proxy=localhost,127.0.0.1
# Vanilla Chrome for Testing: the VM's Hatch-managed Chromium hard-blocks
# loopback navigation (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS).
export KANE_CLI_CHROME_PATH="$HOME/workspace/kane-hackathon/tools/browsers/chrome/linux-157.0.8103.78/chrome-linux64/chrome"
KANE="./tools/node_modules/.bin/kane-cli"
URL="http://127.0.0.1:8077/"
mkdir -p runs

run_obj() {
  id="$1"; obj="$2"
  echo "=== $id ==="
  "$KANE" run "$obj" --url "$URL" --headless --agent > "runs/$id.ndjson" 2>&1
  code=$?
  echo "EXIT:$code" >> "runs/$id.ndjson"
  one=$(grep -o '"one_liner":"[^"]*"' "runs/$id.ndjson" | head -1)
  echo "$id exit=$code $one"
}

want() { [ $# -eq 0 ] && return 0; for a in "$@"; do [ "$a" = "$1" ] && return 0; done; return 1; }
# simpler: build a lookup string
LIST=" $* "
has() { case "$LIST" in *" $1 "*) return 0;; *) [ $# -gt 0 ] && [ -z "$2" ] && return 0;; esac; return 1; }
ALL=0; [ $# -eq 0 ] && ALL=1
sel() { [ "$ALL" = 1 ] && return 0; case "$LIST" in *" $1 "*) return 0;; esac; return 1; }

sel V01 && run_obj V01 "In the People section, type 'Ana' in the add-person field and click Add, then add 'Ben' and 'Cia' the same way. Verify the people list shows Ana, Ben and Cia, and verify the 'No people yet' message is no longer visible."
sel V02 && run_obj V02 "Add a person named 'Ana'. Then try to add another person named 'ana'. Verify an error containing 'already on the list' is visible and the people list still contains exactly one Ana."
sel V03 && run_obj V03 "Leave the add-person field empty and click Add. Verify an error containing 'Please enter a name' is visible and no person was added."
sel V04 && run_obj V04 "Add people Ana, Ben and Cia. Add an expense 'Dinner' of 100000 paid by Ana, split equally among all three. Verify the expense shows Ana Rp33.334, Ben Rp33.333 and Cia Rp33.333, verify Ana's balance says 'gets back' Rp66.666, and verify the settlement list shows Ben pays Ana Rp33.333 and Cia pays Ana Rp33.333."
sel V05 && run_obj V05 "Add people Ana, Ben and Cia. Add an expense of 100 paid by Ben split equally among all three. Verify the shares shown are Rp34, Rp33 and Rp33 and that they add up to Rp100."
sel V06 && run_obj V06 "Add people Ana, Ben and Cia. Add an expense 'Taxi' of 60000 paid by Cia, split equally, but select only Ana and Ben as split members. Verify only Ana and Ben owe Rp30.000 each, Cia's balance says 'gets back' Rp60.000, and Cia does not appear in the split list."
sel V07 && run_obj V07 "Add person Ana. Add an expense of 50000 paid by Ana split only among Ana. Verify the 'Everyone is settled up' message is visible and the settlement list is empty."
sel V08 && run_obj V08 "Add people Ana and Ben. Add an expense 'Lunch' of 200000 with tip 10%, paid by Ben, split equally. Verify the expense total shows Rp220.000 and mentions tip Rp20.000, verify Ana owes Rp110.000, and verify the totals bar shows Total spent Rp220.000 and Total tips Rp20.000."
sel V09 && run_obj V09 "Add people Ana and Ben. Add an expense of 99999 with tip 10% paid by Ana split equally. Verify the tip shown is Rp10.000 (9999.9 rounds up) and the expense total is Rp109.999."
sel V10 && run_obj V10 "Add people Ana and Ben. Try to add an expense of 50000 with tip 150%. Verify an error containing 'Tip cannot be more than 100%' is visible and no expense was added."
sel V11 && run_obj V11 "Add people Ana, Ben and Cia. Add an expense 'Groceries' of 90000 paid by Cia, choose 'Custom amounts', assign Ana 50000, Ben 40000 and Cia 0. Verify the custom summary says the assignment is exact, add the expense, and verify the settlements show Ana pays Cia Rp50.000 and Ben pays Cia Rp40.000."
sel V12 && run_obj V12 "Add people Ana and Ben. Start an expense of 90000 paid by Ana, choose 'Custom amounts', assign Ana 50000 and Ben 30000. Verify the summary warns it is not exact, submit, and verify an error containing 'must match exactly' is visible and no expense was added."
sel V13 && run_obj V13 "Add people Ana and Ben. Try to add an expense with amount 0. Verify an error containing 'Amount must be greater than zero' is visible."
sel V14 && run_obj V14 "Add people Ana and Ben. Start an expense of 50000 paid by Ana and uncheck every split member. Submit and verify an error containing 'Select at least one person' is visible."
sel V15 && run_obj V15 "Add people Ana, Ben and Cia. Add 'Dinner' 90000 paid by Ana split equally among all three. Then add 'Taxi' 30000 paid by Ben split equally between Ben and Cia only. Verify the balances are Ana gets back Rp60.000, Ben owes Rp15.000, Cia owes Rp45.000, and verify the settlement list has exactly two transfers: Cia pays Ana Rp45.000 and Ben pays Ana Rp15.000."
sel V16 && run_obj V16 "Add people Ana and Ben and an expense of 40000 paid by Ana split equally. Verify Ben owes Rp20.000. Then delete the expense and verify the 'Everyone is settled up' message is visible and the expense list is empty."
sel V17 && run_obj V17 "Add people Ana, Ben and Cia. Add 'Dinner' 100000 paid by Ana split equally among all three. Click Remove next to Ben. Verify a confirmation dialog appears mentioning Ben's balance. Confirm the removal. Verify Ben is gone, the dinner is now split Ana Rp50.000 and Cia Rp50.000, and the settlement shows Cia pays Ana Rp50.000."
sel V18 && run_obj V18 "Add people Ana and Ben. Add an expense of 80000 paid by Ben split equally. Remove Ben and confirm. Verify the expense list is empty, Ana's balance is settled, and the 'Everyone is settled up' message is visible."
sel V19 && run_obj V19 "Add people Ana and Ben. Add 'Dinner' 100000 paid by Ana split equally. Store the text of Ana's balance as 'balanceBefore'. Reload the page. Verify Ana and Ben are still listed, the Dinner expense is still shown, and Ana's balance text still equals the stored 'balanceBefore' value."
sel V20 && run_obj V20 "Add people Ana and Ben and an expense of 100000 paid by Ana split equally. Change the currency selector to USD. Verify amounts are now shown with a \$ sign and comma grouping (the expense total shows \$100,000) and no Rp amounts remain visible."
sel V21 && run_obj V21 "With people and expenses present, click 'Reset all' and confirm. Verify the 'No people yet' and 'No expenses yet' empty states are both visible and the balance list is empty. Reload the page and verify the empty states are still shown."
echo "=== DONE ==="
