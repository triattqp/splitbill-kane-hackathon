/* SplitBill — group expense splitter.
 * All money is stored as whole currency units (integers). Equal splits use
 * floor division and hand the rounding remainder out one unit at a time, in
 * member order, so shares always sum exactly to the expense total.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'splitbill-state-v1';

  // ---------------------------------------------------------------- state
  var state = {
    currency: 'IDR',
    people: [],   // [{id, name}]
    expenses: []  // [{id, desc, amount, tipPct, tip, total, payerId, mode, shares:{pid:share}}]
  };
  var uidCounter = 1;

  function uid(prefix) {
    uidCounter += 1;
    return prefix + '-' + Date.now().toString(36) + '-' + uidCounter;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable (private mode) — app still works in-memory */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.people) && Array.isArray(parsed.expenses)) {
        state.currency = parsed.currency === 'USD' ? 'USD' : 'IDR';
        state.people = parsed.people;
        state.expenses = parsed.expenses;
      }
    } catch (e) { /* corrupted storage — start fresh rather than crash */ }
  }

  // ------------------------------------------------------------ pure math
  function tipFor(amount, tipPct) {
    return Math.round(amount * tipPct / 100);
  }

  // Split `total` (integer) across `ids`; first `remainder` ids get +1.
  function splitEvenly(total, ids) {
    var shares = {};
    if (ids.length === 0) return shares;
    var base = Math.floor(total / ids.length);
    var remainder = total - base * ids.length;
    ids.forEach(function (id, i) {
      shares[id] = base + (i < remainder ? 1 : 0);
    });
    return shares;
  }

  // Net balance per person: positive = is owed money, negative = owes.
  function computeBalances(st) {
    var balances = {};
    st.people.forEach(function (p) { balances[p.id] = 0; });
    st.expenses.forEach(function (exp) {
      if (balances[exp.payerId] === undefined) balances[exp.payerId] = 0;
      balances[exp.payerId] += exp.total;
      Object.keys(exp.shares).forEach(function (pid) {
        if (balances[pid] === undefined) balances[pid] = 0;
        balances[pid] -= exp.shares[pid];
      });
    });
    return balances;
  }

  // Greedy minimum-transfer settlement: match biggest debtor to biggest creditor.
  function computeSettlements(balances, people) {
    var nameOf = {};
    people.forEach(function (p) { nameOf[p.id] = p.name; });
    var debtors = [], creditors = [];
    Object.keys(balances).forEach(function (id) {
      if (balances[id] < 0) debtors.push({ id: id, amt: -balances[id] });
      else if (balances[id] > 0) creditors.push({ id: id, amt: balances[id] });
    });
    debtors.sort(function (a, b) { return b.amt - a.amt; });
    creditors.sort(function (a, b) { return b.amt - a.amt; });
    var transfers = [];
    var i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var pay = Math.min(debtors[i].amt, creditors[j].amt);
      if (pay > 0) {
        transfers.push({
          fromId: debtors[i].id, fromName: nameOf[debtors[i].id] || '?',
          toId: creditors[j].id, toName: nameOf[creditors[j].id] || '?',
          amount: pay
        });
      }
      debtors[i].amt -= pay;
      creditors[j].amt -= pay;
      if (debtors[i].amt === 0) i += 1;
      if (creditors[j].amt === 0) j += 1;
    }
    return transfers;
  }

  // ------------------------------------------------------------- formatting
  function fmt(amount) {
    var n = Math.round(amount);
    if (state.currency === 'USD') return '$' + n.toLocaleString('en-US');
    return 'Rp' + n.toLocaleString('id-ID');
  }
  function currencySymbol() { return state.currency === 'USD' ? '$' : 'Rp'; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function personById(id) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === id) return state.people[i];
    return null;
  }

  // ------------------------------------------------------------------- DOM
  var el = {};
  ['currency-select', 'reset-btn', 'add-person-form', 'person-name-input', 'person-error',
   'people-empty', 'people-list', 'add-expense-form', 'expense-desc-input',
   'expense-amount-input', 'expense-tip-input', 'expense-payer-select', 'split-members',
   'custom-split-summary', 'expense-error', 'expenses-empty', 'expense-list', 'totals-bar',
   'total-spent', 'total-tips', 'balances-empty', 'balance-list', 'settled-state',
   'settlement-list', 'confirm-modal', 'confirm-message', 'confirm-ok-btn', 'confirm-cancel-btn'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var pendingConfirm = null; // function to run when modal OK is clicked

  function showConfirm(message, onOk) {
    el['confirm-message'].textContent = message;
    pendingConfirm = onOk;
    el['confirm-modal'].hidden = false;
  }
  function hideConfirm() {
    pendingConfirm = null;
    el['confirm-modal'].hidden = true;
  }
  el['confirm-ok-btn'].addEventListener('click', function () {
    var fn = pendingConfirm;
    hideConfirm();
    if (fn) fn();
  });
  el['confirm-cancel-btn'].addEventListener('click', hideConfirm);

  function showError(elm, msg) {
    if (!msg) { elm.hidden = true; elm.textContent = ''; return; }
    elm.textContent = msg;
    elm.hidden = false;
  }

  function splitMode() {
    var checked = document.querySelector('input[name="split-mode"]:checked');
    return checked ? checked.value : 'equal';
  }

  // ---------------------------------------------------------------- render
  function renderPeople() {
    el['people-empty'].hidden = state.people.length > 0;
    el['people-list'].innerHTML = state.people.map(function (p) {
      return '<li><span class="person-name">' + escapeHtml(p.name) + '</span>' +
        '<button type="button" class="btn btn-small" data-testid="remove-person-' +
        escapeHtml(p.name) + '" data-remove-person="' + p.id + '">Remove</button></li>';
    }).join('');
    // payer select
    el['expense-payer-select'].innerHTML = state.people.map(function (p) {
      return '<option value="' + p.id + '">' + escapeHtml(p.name) + '</option>';
    }).join('');
    renderSplitMembers();
  }

  function renderSplitMembers() {
    var mode = splitMode();
    var previous = {};
    el['split-members'].querySelectorAll('.split-member-row').forEach(function (row) {
      var id = row.getAttribute('data-person-id');
      var check = row.querySelector('input[type="checkbox"]');
      var num = row.querySelector('input[type="number"]');
      previous[id] = { checked: check ? check.checked : true, custom: num ? num.value : '' };
    });
    el['split-members'].innerHTML = state.people.map(function (p) {
      var prev = previous[p.id] || { checked: true, custom: '' };
      var customInput = mode === 'custom'
        ? '<input type="number" min="0" step="1" placeholder="0" value="' +
          escapeHtml(prev.custom) + '" data-custom-for="' + p.id +
          '" data-testid="custom-amount-' + escapeHtml(p.name) + '" aria-label="Custom amount for ' +
          escapeHtml(p.name) + '">'
        : '';
      return '<div class="split-member-row" data-person-id="' + p.id + '">' +
        '<label class="member-check"><input type="checkbox" data-split-member="' + p.id + '"' +
        (prev.checked ? ' checked' : '') + ' data-testid="split-check-' + escapeHtml(p.name) + '"> ' +
        escapeHtml(p.name) + '</label>' + customInput + '</div>';
    }).join('');
    if (state.people.length === 0) {
      el['split-members'].innerHTML = '<p class="empty-state">Add people first — they will show up here as split members.</p>';
    }
    updateCustomSummary();
  }

  function currentTotal() {
    var amount = parseInt(el['expense-amount-input'].value, 10);
    var tipPct = parseInt(el['expense-tip-input'].value, 10);
    if (isNaN(amount) || amount < 0) return null;
    if (isNaN(tipPct) || tipPct < 0) tipPct = 0;
    return amount + tipFor(amount, tipPct);
  }

  function updateCustomSummary() {
    var summary = el['custom-split-summary'];
    if (splitMode() !== 'custom') { summary.hidden = true; return; }
    var total = currentTotal();
    var assigned = 0;
    el['split-members'].querySelectorAll('input[data-custom-for]').forEach(function (input) {
      var row = input.closest('.split-member-row');
      var check = row.querySelector('input[type="checkbox"]');
      if (check && check.checked) {
        var v = parseInt(input.value, 10);
        if (!isNaN(v)) assigned += v;
      }
    });
    summary.hidden = false;
    if (total === null) {
      summary.textContent = 'Enter an amount to see the split total.';
      summary.className = 'hint';
    } else if (assigned === total) {
      summary.textContent = 'Assigned ' + fmt(assigned) + ' of ' + fmt(total) + ' — exact ✓';
      summary.className = 'hint good';
    } else if (assigned < total) {
      summary.textContent = 'Assigned ' + fmt(assigned) + ' of ' + fmt(total) + ' — ' + fmt(total - assigned) + ' remaining.';
      summary.className = 'hint bad';
    } else {
      summary.textContent = 'Assigned ' + fmt(assigned) + ' of ' + fmt(total) + ' — over by ' + fmt(assigned - total) + '.';
      summary.className = 'hint bad';
    }
  }

  function renderExpenses() {
    el['expenses-empty'].hidden = state.expenses.length > 0;
    el['expense-list'].innerHTML = state.expenses.map(function (exp) {
      var payer = personById(exp.payerId);
      var shareBits = Object.keys(exp.shares).map(function (pid) {
        var p = personById(pid);
        return escapeHtml(p ? p.name : '?') + ' ' + fmt(exp.shares[pid]);
      }).join(' · ');
      var tipBit = exp.tip > 0
        ? ' (incl. tip ' + fmt(exp.tip) + ' at ' + exp.tipPct + '%)' : '';
      return '<li><div class="expense-head"><span class="expense-desc">' + escapeHtml(exp.desc) +
        '</span><span class="expense-total" data-testid="expense-total-' + exp.id + '">' + fmt(exp.total) +
        '</span></div><div class="expense-meta">Paid by ' + escapeHtml(payer ? payer.name : '?') +
        tipBit + '<br>Split: ' + shareBits + '</div>' +
        '<div class="expense-actions"><button type="button" class="btn btn-small" data-delete-expense="' +
        exp.id + '" data-testid="delete-expense-' + exp.id + '">Delete</button></div></li>';
    }).join('');
    var totalSpent = 0, totalTips = 0;
    state.expenses.forEach(function (e) { totalSpent += e.total; totalTips += e.tip; });
    el['totals-bar'].hidden = state.expenses.length === 0;
    el['total-spent'].textContent = fmt(totalSpent);
    el['total-tips'].textContent = fmt(totalTips);
  }

  function renderBalances() {
    var balances = computeBalances(state);
    var hasPeople = state.people.length > 0;
    el['balances-empty'].hidden = hasPeople;
    el['balance-list'].innerHTML = state.people.map(function (p) {
      var b = balances[p.id] || 0;
      var cls = b > 0 ? 'positive' : (b < 0 ? 'negative' : 'zero');
      var note = b > 0 ? 'gets back' : (b < 0 ? 'owes' : 'settled');
      return '<li><span class="person-name">' + escapeHtml(p.name) +
        '<span class="balance-note">' + note + '</span></span>' +
        '<span class="balance-amount ' + cls + '" data-testid="balance-' + escapeHtml(p.name) + '">' +
        fmt(Math.abs(b)) + '</span></li>';
    }).join('');
    var transfers = computeSettlements(balances, state.people);
    el['settled-state'].hidden = !(hasPeople && transfers.length === 0);
    el['settlement-list'].innerHTML = transfers.map(function (t) {
      return '<li data-testid="settlement-item"><strong>' + escapeHtml(t.fromName) +
        '</strong> pays <strong>' + escapeHtml(t.toName) + '</strong> ' +
        '<span class="amount">' + fmt(t.amount) + '</span></li>';
    }).join('');
  }

  function render() {
    el['currency-select'].value = state.currency;
    document.querySelectorAll('[data-currency-symbol]').forEach(function (s) {
      s.textContent = currencySymbol();
    });
    renderPeople();
    renderExpenses();
    renderBalances();
  }

  // ---------------------------------------------------------------- events
  el['add-person-form'].addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = el['person-name-input'].value.trim();
    if (!name) { showError(el['person-error'], 'Please enter a name.'); return; }
    var dupe = state.people.some(function (p) { return p.name.toLowerCase() === name.toLowerCase(); });
    if (dupe) { showError(el['person-error'], '"' + name + '" is already on the list.'); return; }
    showError(el['person-error'], null);
    state.people.push({ id: uid('p'), name: name });
    el['person-name-input'].value = '';
    save();
    render();
  });

  el['people-list'].addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-remove-person]');
    if (!btn) return;
    var person = personById(btn.getAttribute('data-remove-person'));
    if (!person) return;
    var balances = computeBalances(state);
    var bal = balances[person.id] || 0;
    var paidCount = state.expenses.filter(function (e) { return e.payerId === person.id; }).length;
    var inCount = state.expenses.filter(function (e) {
      return e.payerId !== person.id && e.shares[person.id] !== undefined;
    }).length;
    if (bal === 0 && paidCount === 0 && inCount === 0) {
      state.people = state.people.filter(function (p) { return p.id !== person.id; });
      save(); render();
      return;
    }
    var parts = [];
    if (bal !== 0) parts.push('they currently have a balance of ' + fmt(bal) + ' (not settled)');
    if (paidCount > 0) parts.push(paidCount + ' expense(s) they paid for will be deleted');
    if (inCount > 0) parts.push('their share in ' + inCount + ' other expense(s) will be re-split equally among the remaining members');
    showConfirm('Remove ' + person.name + '? Note: ' + parts.join('; ') + '.', function () {
      removePerson(person.id);
    });
  });

  function removePerson(personId) {
    // Delete expenses this person paid for.
    state.expenses = state.expenses.filter(function (e) { return e.payerId !== personId; });
    // Remove their share elsewhere; re-split that expense equally among the rest.
    state.expenses = state.expenses.filter(function (exp) {
      if (exp.shares[personId] === undefined) return true;
      var remaining = Object.keys(exp.shares).filter(function (id) { return id !== personId; });
      if (remaining.length === 0) return false; // nobody left to carry this expense
      exp.shares = splitEvenly(exp.total, remaining);
      exp.mode = 'equal';
      return true;
    });
    state.people = state.people.filter(function (p) { return p.id !== personId; });
    save();
    render();
  }

  document.querySelectorAll('input[name="split-mode"]').forEach(function (radio) {
    radio.addEventListener('change', renderSplitMembers);
  });
  el['split-members'].addEventListener('input', updateCustomSummary);
  el['split-members'].addEventListener('change', updateCustomSummary);
  el['expense-amount-input'].addEventListener('input', updateCustomSummary);
  el['expense-tip-input'].addEventListener('input', updateCustomSummary);

  el['add-expense-form'].addEventListener('submit', function (ev) {
    ev.preventDefault();
    var desc = el['expense-desc-input'].value.trim() || 'Expense';
    var amount = parseInt(el['expense-amount-input'].value, 10);
    var tipPct = parseInt(el['expense-tip-input'].value, 10);
    var payerId = el['expense-payer-select'].value;

    if (state.people.length === 0) { showError(el['expense-error'], 'Add at least one person first.'); return; }
    if (isNaN(amount) || amount <= 0) { showError(el['expense-error'], 'Amount must be greater than zero.'); return; }
    if (isNaN(tipPct) || tipPct < 0) tipPct = 0;
    if (tipPct > 100) { showError(el['expense-error'], 'Tip cannot be more than 100%.'); return; }
    if (!payerId || !personById(payerId)) { showError(el['expense-error'], 'Choose who paid.'); return; }

    var memberIds = [];
    el['split-members'].querySelectorAll('input[data-split-member]').forEach(function (box) {
      if (box.checked) memberIds.push(box.getAttribute('data-split-member'));
    });
    if (memberIds.length === 0) { showError(el['expense-error'], 'Select at least one person to split between.'); return; }

    var tip = tipFor(amount, tipPct);
    var total = amount + tip;
    var mode = splitMode();
    var shares;
    if (mode === 'custom') {
      shares = {};
      var sum = 0;
      for (var i = 0; i < memberIds.length; i++) {
        var input = el['split-members'].querySelector('input[data-custom-for="' + memberIds[i] + '"]');
        var v = input ? parseInt(input.value, 10) : NaN;
        if (isNaN(v) || v < 0) {
          showError(el['expense-error'], 'Custom amounts must be zero or more for every selected person.');
          return;
        }
        shares[memberIds[i]] = v;
        sum += v;
      }
      if (sum !== total) {
        showError(el['expense-error'], 'Custom amounts add up to ' + fmt(sum) + ' but the total (with tip) is ' + fmt(total) + '. They must match exactly.');
        return;
      }
    } else {
      shares = splitEvenly(total, memberIds);
    }

    showError(el['expense-error'], null);
    state.expenses.push({
      id: uid('e'), desc: desc, amount: amount, tipPct: tipPct, tip: tip,
      total: total, payerId: payerId, mode: mode, shares: shares
    });
    el['expense-desc-input'].value = '';
    el['expense-amount-input'].value = '';
    el['expense-tip-input'].value = '0';
    save();
    render();
  });

  el['expense-list'].addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-delete-expense]');
    if (!btn) return;
    var id = btn.getAttribute('data-delete-expense');
    state.expenses = state.expenses.filter(function (e) { return e.id !== id; });
    save();
    render();
  });

  el['currency-select'].addEventListener('change', function () {
    state.currency = el['currency-select'].value === 'USD' ? 'USD' : 'IDR';
    save();
    render();
  });

  el['reset-btn'].addEventListener('click', function () {
    if (state.people.length === 0 && state.expenses.length === 0) return;
    showConfirm('Reset everything? All people and expenses will be cleared. This cannot be undone.', function () {
      state.people = [];
      state.expenses = [];
      save();
      render();
    });
  });

  // ------------------------------------------------------------------ init
  load();
  render();

  // Exposed for debugging / future automated checks.
  window.SplitBill = {
    splitEvenly: splitEvenly,
    computeBalances: computeBalances,
    computeSettlements: computeSettlements,
    tipFor: tipFor,
    getState: function () { return state; }
  };
})();
