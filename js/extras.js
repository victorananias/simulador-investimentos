(() => {
const App = window.SimuladorApp;

function getActiveExtras() {
  return App.state.extrasState
    .map(extra => {
      const amount = App.normalizeNumberInput(extra.amount);
      const year = Number.parseInt(extra.year, 10);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      if (extra.recurrence === 'specific' && (!Number.isInteger(year) || year < 1)) return null;

      return {
        month: Number(extra.month),
        amount,
        recurrence: extra.recurrence,
        year: extra.recurrence === 'specific' ? year : null,
      };
    })
    .filter(Boolean);
}

function renderExtrasList() {
  const list = document.getElementById('extra-list');

  if (!App.state.extrasState.length) {
    list.innerHTML = '<div class="extra-empty">Nenhum aporte extra configurado.</div>';
    return;
  }

  list.innerHTML = App.state.extrasState.map((extra, index) => {
    const monthOptions = App.EXTRA_MONTHS.map((monthLabel, monthIndex) => {
      const monthValue = monthIndex + 1;
      return `<option value="${monthValue}"${monthValue === Number(extra.month) ? ' selected' : ''}>${monthLabel}</option>`;
    }).join('');

    const yearDisabled = extra.recurrence === 'annual' ? ' disabled' : '';
    const yearValue = App.escapeHtml(extra.year);
    const amountValue = App.escapeHtml(extra.amount);

    return `
      <div class="extra-item" data-extra-index="${index}">
        <div class="extra-grid">
          <label class="extra-field">
            <span class="extra-field-label">Mes</span>
            <select class="extra-select" data-extra-field="month">
              ${monthOptions}
            </select>
          </label>
          <label class="extra-field">
            <span class="extra-field-label">Valor</span>
            <input class="extra-input" data-extra-field="amount" type="text" inputmode="decimal" placeholder="Ex.: R$ 1.500,00" value="${amountValue}">
          </label>
          <label class="extra-field">
            <span class="extra-field-label">Recorrencia</span>
            <select class="extra-select" data-extra-field="recurrence">
              <option value="annual"${extra.recurrence === 'annual' ? ' selected' : ''}>Todo ano</option>
              <option value="specific"${extra.recurrence === 'specific' ? ' selected' : ''}>Ano especifico</option>
            </select>
          </label>
          <label class="extra-field">
            <span class="extra-field-label">Ano da simulacao</span>
            <input class="extra-year-input" data-extra-field="year" type="number" min="1" max="50" step="1" value="${yearValue}"${yearDisabled}>
          </label>
        </div>
        <div class="extra-actions">
          <span class="extra-meta">Ano 1 representa os primeiros 12 meses da simulacao.</span>
          <button type="button" class="extra-remove-btn" data-extra-action="remove">Remover</button>
        </div>
      </div>
    `;
  }).join('');
}

function setupExtraControls() {
  const list = document.getElementById('extra-list');
  const addButton = document.getElementById('add-extra');

  addButton.addEventListener('click', () => {
    App.state.extrasState.push(App.createDefaultExtra());
    renderExtrasList();
    App.calcular();
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-extra-action="remove"]');
    if (!button) return;

    const item = button.closest('[data-extra-index]');
    if (!item) return;

    const index = Number(item.dataset.extraIndex);
    App.state.extrasState.splice(index, 1);
    renderExtrasList();
    App.calcular();
  });

  list.addEventListener('input', event => {
    const field = event.target.dataset.extraField;
    const item = event.target.closest('[data-extra-index]');
    if (!field || !item) return;

    const extra = App.state.extrasState[Number(item.dataset.extraIndex)];
    if (!extra) return;

    if (field === 'amount') {
      const digits = event.target.value.replace(/\D/g, '');
      const numeric = digits ? Number(digits) / 100 : null;
      extra[field] = numeric ? App.formatEditableCurrency(numeric) : '';
      event.target.value = extra[field];
      event.target.setSelectionRange(extra[field].length, extra[field].length);
    } else {
      extra[field] = event.target.value;
    }

    App.calcular();
  });

  list.addEventListener('change', event => {
    const field = event.target.dataset.extraField;
    const item = event.target.closest('[data-extra-index]');
    if (!field || !item) return;

    const extra = App.state.extrasState[Number(item.dataset.extraIndex)];
    if (!extra) return;

    extra[field] = event.target.value;
    if (field === 'recurrence') renderExtrasList();
    App.calcular();
  });

  list.addEventListener('focusout', event => {
    const field = event.target.dataset.extraField;
    const item = event.target.closest('[data-extra-index]');
    if (!field || !item) return;

    const extra = App.state.extrasState[Number(item.dataset.extraIndex)];
    if (!extra) return;

    if (field === 'amount') {
      const parsed = App.normalizeNumberInput(extra.amount);
      extra.amount = Number.isFinite(parsed) && parsed > 0 ? App.formatEditableCurrency(parsed) : '';
      renderExtrasList();
      App.calcular();
    }

    if (field === 'year') {
      extra.year = String(Math.min(50, Math.max(1, Number.parseInt(extra.year, 10) || 1)));
      renderExtrasList();
      App.calcular();
    }
  });
}

Object.assign(App, {
  getActiveExtras,
  renderExtrasList,
  setupExtraControls,
});
})();