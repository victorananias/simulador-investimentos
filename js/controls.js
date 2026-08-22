(() => {
const App = window.SimuladorApp;

function getControlSnapshot() {
  return App.CONTROL_IDS.reduce((snapshot, controlId) => {
    snapshot[controlId] = document.getElementById(controlId).value;
    return snapshot;
  }, {});
}

function applyControlSnapshot(snapshot) {
  App.CONTROL_IDS.forEach(controlId => {
    const value = snapshot?.[controlId];
    if (value === undefined || value === null || value === '') return;

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    document.getElementById(controlId).value = clampRangeValue(controlId, numericValue, { skipStepSnap: true });
  });
}

function parseControlValue(controlId, value) {
  const { kind } = App.CONTROL_CONFIG[controlId];
  if (kind === 'currency') return App.normalizeNumberInput(value);
  if (kind === 'integer') {
    const parsed = App.normalizeNumberInput(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed);
  }
  return App.normalizeNumberInput(value);
}

function formatControlValue(controlId, value) {
  const { kind } = App.CONTROL_CONFIG[controlId];
  if (kind === 'percent') return value.toFixed(1).replace('.', ',') + '%';
  if (kind === 'integer') return Math.max(1, Math.round(value)) + ' anos';
  return App.fmtFull(value);
}

function formatEditableValue(controlId, value) {
  const { kind } = App.CONTROL_CONFIG[controlId];
  if (kind === 'percent') return value.toFixed(1).replace('.', ',');
  if (kind === 'integer') return String(Math.max(1, Math.round(value)));
  return App.formatEditableCurrency(value);
}

function isCurrencyControl(controlId) {
  return App.CONTROL_CONFIG[controlId].kind === 'currency';
}

function isIntegerControl(controlId) {
  return App.CONTROL_CONFIG[controlId].kind === 'integer';
}

function getDisplayInput(controlId) {
  return document.getElementById(App.CONTROL_CONFIG[controlId].displayId);
}

function clampRangeValue(controlId, value, options = {}) {
  const range = document.getElementById(controlId);
  const min = Number(range.min);
  const max = Number(range.max);
  const step = Number(range.step || 1);
  const decimals = App.countStepDecimals(step);
  const clamped = Math.min(max, Math.max(min, value));

  if (options.skipStepSnap) return clamped;

  const snapped = Math.round((clamped - min) / step) * step + min;
  return Number(snapped.toFixed(decimals));
}

function syncDisplayValues() {
  App.CONTROL_IDS.forEach(controlId => {
    if (controlId === 'anosRetirada') return;
    const range = document.getElementById(controlId);
    const display = getDisplayInput(controlId);
    if (document.activeElement === display) return;
    display.value = formatControlValue(controlId, Number(range.value));
  });
}

function applyTypedValue(controlId, rawValue, options = {}) {
  const parsed = parseControlValue(controlId, rawValue);
  if (parsed === null) return false;

  const range = document.getElementById(controlId);
  range.value = clampRangeValue(controlId, parsed, { skipStepSnap: true });

  if (controlId === 'juros') {
    const lucroRange = document.getElementById('lucro');
    if (lucroRange) lucroRange.value = clampRangeValue('lucro', Number(range.value), { skipStepSnap: true });
  }

  if (controlId === 'aporte' || controlId === 'meta') {
    if (App.updateAutoScenarioName) App.updateAutoScenarioName();
  }

  App.touchLastModified();
  saveControlValues();

  if (options.recalculate !== false) App.calcular({ changedControlId: controlId });
  return true;
}

function normalizeSliderControlValue(controlId) {
  if (!isCurrencyControl(controlId)) return;

  const range = document.getElementById(controlId);
  const min = Number(range.min);
  const max = Number(range.max);
  const raw = Number(range.value);
  const clamped = Math.min(max, Math.max(min, raw));
  const snapped = Math.round((clamped - min) / 100) * 100 + min;
  range.value = Number(snapped.toFixed(2));
}

function setupEditableControls() {
  App.CONTROL_IDS.forEach(controlId => {
    const display = getDisplayInput(controlId);
    const range = document.getElementById(controlId);

    display.addEventListener('focus', () => {
      display.dataset.previousValue = range.value;
      display.value = formatEditableValue(controlId, Number(range.value));
      display.select();
    });

    display.addEventListener('input', () => {
      if (isCurrencyControl(controlId)) {
        const digits = display.value.replace(/\D/g, '');
        const numeric = digits ? Number(digits) / 100 : null;
        const formatted = numeric ? App.formatEditableCurrency(numeric) : '';
        display.value = formatted;
        display.setSelectionRange(formatted.length, formatted.length);
        if (numeric !== null) applyTypedValue(controlId, formatted, { recalculate: false });
        return;
      }

      if (isIntegerControl(controlId)) {
        const digits = display.value.replace(/\D/g, '');
        display.value = digits;
        display.setSelectionRange(digits.length, digits.length);
        if (digits) applyTypedValue(controlId, digits);
        return;
      }

      applyTypedValue(controlId, display.value);
    });

    display.addEventListener('blur', () => {
      if (!applyTypedValue(controlId, display.value)) {
        range.value = display.dataset.previousValue || range.value;
        App.calcular({ changedControlId: controlId });
      }
      if (isIntegerControl(controlId)) {
        display.value = formatControlValue(controlId, Number(range.value));
        return;
      }
      display.value = formatControlValue(controlId, Number(range.value));
    });

    display.addEventListener('keydown', event => {
      if (event.key === 'Enter') display.blur();

      if (event.key === 'Escape') {
        range.value = display.dataset.previousValue || range.value;
        display.value = formatControlValue(controlId, Number(range.value));
        App.calcular({ changedControlId: controlId });
        display.blur();
      }
    });
  });
}

function saveControlValues() {
  try {
    localStorage.setItem(App.STORAGE_KEY, JSON.stringify({
      scenarios: App.state.savedScenarios,
      selectedScenarioId: App.state.selectedScenarioId,
      lastModified: App.state.lastModified,
    }));
  } catch {
  }
}

function touchLastModified() {
  App.state.lastModified = new Date().toISOString();
}

function restoreControlValues() {
  // Alguns navegadores restauram valores de formulario ao recarregar a pagina;
  // esses campos nao devem ser persistidos, entao forcamos o padrao aqui.
  App.POST_GOAL_CONTROL_IDS.forEach(controlId => {
    const range = document.getElementById(controlId);
    range.value = range.defaultValue;
  });

  try {
    const savedValues = localStorage.getItem(App.STORAGE_KEY);
    if (!savedValues) {
      App.state.lastModified = new Date().toISOString();
      App.resetScenarioForm();
      return;
    }

    const parsedValues = JSON.parse(savedValues);

    App.state.savedScenarios = Array.isArray(parsedValues?.scenarios)
      ? parsedValues.scenarios.map((scenario, index) => App.sanitizeScenarioDraft(scenario, index))
      : [];

    const restoredSelectedId = typeof parsedValues?.selectedScenarioId === 'string'
      ? parsedValues.selectedScenarioId
      : null;

    App.state.selectedScenarioId = App.state.savedScenarios.some(scenario => scenario.id === restoredSelectedId)
      ? restoredSelectedId
      : null;

    App.state.lastModified = typeof parsedValues?.lastModified === 'string'
      ? parsedValues.lastModified
      : new Date().toISOString();

    const selectedScenario = App.state.selectedScenarioId
      ? App.state.savedScenarios.find(scenario => scenario.id === App.state.selectedScenarioId)
      : null;

    if (selectedScenario) {
      App.loadScenarioIntoForm(selectedScenario);
    } else {
      App.resetScenarioForm();
    }
  } catch {
    App.state.savedScenarios = [];
    App.state.selectedScenarioId = null;
    App.state.lastModified = new Date().toISOString();
    App.resetScenarioForm();
  }
}

Object.assign(App, {
  getControlSnapshot,
  applyControlSnapshot,
  parseControlValue,
  formatControlValue,
  formatEditableValue,
  isCurrencyControl,
  isIntegerControl,
  getDisplayInput,
  clampRangeValue,
  syncDisplayValues,
  applyTypedValue,
  normalizeSliderControlValue,
  setupEditableControls,
  saveControlValues,
  restoreControlValues,
  touchLastModified,
});
})();