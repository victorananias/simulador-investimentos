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
  return App.normalizeNumberInput(value);
}

function formatControlValue(controlId, value) {
  const { kind } = App.CONTROL_CONFIG[controlId];
  if (kind === 'percent') return value.toFixed(1).replace('.', ',') + '%';
  return App.fmtFull(value);
}

function formatEditableValue(controlId, value) {
  const { kind } = App.CONTROL_CONFIG[controlId];
  if (kind === 'percent') return value.toFixed(1).replace('.', ',');
  return App.formatEditableCurrency(value);
}

function isCurrencyControl(controlId) {
  return App.CONTROL_CONFIG[controlId].kind === 'currency';
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
  saveControlValues();

  if (options.recalculate !== false) App.calcular();
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

      applyTypedValue(controlId, display.value);
    });

    display.addEventListener('blur', () => {
      if (!applyTypedValue(controlId, display.value)) {
        range.value = display.dataset.previousValue || range.value;
        App.calcular();
      }
      display.value = formatControlValue(controlId, Number(range.value));
    });

    display.addEventListener('keydown', event => {
      if (event.key === 'Enter') display.blur();

      if (event.key === 'Escape') {
        range.value = display.dataset.previousValue || range.value;
        display.value = formatControlValue(controlId, Number(range.value));
        App.calcular();
        display.blur();
      }
    });
  });
}

function saveControlValues() {
  const values = App.CONTROL_IDS.reduce((accumulator, controlId) => {
    accumulator[controlId] = document.getElementById(controlId).value;
    return accumulator;
  }, {});

  try {
    localStorage.setItem(App.STORAGE_KEY, JSON.stringify({
      controls: values,
      extras: App.state.extrasState,
      scenarios: App.state.savedScenarios,
      selectedScenarioId: App.state.selectedScenarioId,
    }));
  } catch {
  }
}

function restoreControlValues() {
  try {
    const savedValues = localStorage.getItem(App.STORAGE_KEY);
    if (!savedValues) return;

    const parsedValues = JSON.parse(savedValues);
    const controlValues = parsedValues && parsedValues.controls ? parsedValues.controls : parsedValues;

    App.CONTROL_IDS.forEach(controlId => {
      const savedValue = controlValues?.[controlId];
      if (savedValue === undefined || savedValue === null || savedValue === '') return;

      const normalized = clampRangeValue(controlId, Number(savedValue), { skipStepSnap: true });
      if (!Number.isFinite(normalized)) return;
      document.getElementById(controlId).value = normalized;
    });

    App.state.extrasState = Array.isArray(parsedValues?.extras)
      ? parsedValues.extras.map(App.sanitizeExtraDraft)
      : [];

    App.state.savedScenarios = Array.isArray(parsedValues?.scenarios)
      ? parsedValues.scenarios.map((scenario, index) => App.sanitizeScenarioDraft(scenario, index))
      : [];

    const restoredSelectedId = typeof parsedValues?.selectedScenarioId === 'string'
      ? parsedValues.selectedScenarioId
      : null;

    App.state.selectedScenarioId = App.state.savedScenarios.some(scenario => scenario.id === restoredSelectedId)
      ? restoredSelectedId
      : null;
  } catch {
    App.state.extrasState = [];
    App.state.savedScenarios = [];
    App.state.selectedScenarioId = null;
  }
}

Object.assign(App, {
  getControlSnapshot,
  applyControlSnapshot,
  parseControlValue,
  formatControlValue,
  formatEditableValue,
  isCurrencyControl,
  getDisplayInput,
  clampRangeValue,
  syncDisplayValues,
  applyTypedValue,
  normalizeSliderControlValue,
  setupEditableControls,
  saveControlValues,
  restoreControlValues,
});
})();