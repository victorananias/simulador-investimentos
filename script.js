function hasFraction(value) {
  return Math.abs(value % 1) > 0.000001;
}

function fmtFull(v) {
  return 'R$ ' + v.toLocaleString('pt-BR', {
    minimumFractionDigits: hasFraction(v) ? 2 : 0,
    maximumFractionDigits: 2,
  });
}
function fmt(v) {
  if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(2).replace('.', ',') + ' M';
  if (v >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mil';
  return fmtFull(v);
}

const CONTROL_CONFIG = {
  inicial: { displayId: 'v-inicial', kind: 'currency' },
  aporte: { displayId: 'v-aporte', kind: 'currency' },
  juros: { displayId: 'v-juros', kind: 'percent' },
  meta: { displayId: 'v-meta', kind: 'currency' },
};

const CONTROL_IDS = Object.keys(CONTROL_CONFIG);
const STORAGE_KEY = 'simulador-investimentos:parametros';
const MAX_SIMULATION_MONTHS = 600;
const EXTRA_MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Marco',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

let chartInst;
let extrasState = [];
let savedScenarios = [];

function normalizeScenarioColor(color, fallback = '#4ade80') {
  const normalized = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

function createDefaultExtra() {
  return {
    id: crypto.randomUUID(),
    month: 12,
    amount: '',
    recurrence: 'annual',
    year: '1',
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeExtraDraft(extra = {}) {
  const month = Math.min(12, Math.max(1, Number.parseInt(extra.month, 10) || 1));
  const recurrence = extra.recurrence === 'specific' ? 'specific' : 'annual';
  const year = String(Math.min(50, Math.max(1, Number.parseInt(extra.year, 10) || 1)));
  const amount = typeof extra.amount === 'string' ? extra.amount : extra.amount == null ? '' : String(extra.amount);

  return {
    id: typeof extra.id === 'string' && extra.id ? extra.id : crypto.randomUUID(),
    month,
    amount,
    recurrence,
    year,
  };
}

function sanitizeScenarioDraft(scenario = {}, fallbackIndex = 0) {
  const safeColor = normalizeScenarioColor(scenario.color);
  const extras = Array.isArray(scenario.extras) ? scenario.extras.map(sanitizeExtraDraft) : [];

  return {
    id: typeof scenario.id === 'string' && scenario.id ? scenario.id : crypto.randomUUID(),
    name: typeof scenario.name === 'string' && scenario.name.trim() ? scenario.name.trim() : `Cenario ${fallbackIndex + 1}`,
    color: safeColor,
    inicial: Number.isFinite(Number(scenario.inicial)) ? Number(scenario.inicial) : 0,
    aporte: Number.isFinite(Number(scenario.aporte)) ? Number(scenario.aporte) : 0,
    taxa: Number.isFinite(Number(scenario.taxa)) ? Number(scenario.taxa) : 0,
    meta: Number.isFinite(Number(scenario.meta)) ? Number(scenario.meta) : 0,
    visible: scenario.visible !== false,
    extras,
    createdAt: typeof scenario.createdAt === 'string' ? scenario.createdAt : new Date().toISOString(),
  };
}

function getControlSnapshot() {
  return CONTROL_IDS.reduce((snapshot, controlId) => {
    snapshot[controlId] = document.getElementById(controlId).value;
    return snapshot;
  }, {});
}

function applyControlSnapshot(snapshot) {
  CONTROL_IDS.forEach(controlId => {
    const value = snapshot?.[controlId];
    if (value === undefined || value === null || value === '') return;

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    document.getElementById(controlId).value = clampRangeValue(controlId, numericValue, { skipStepSnap: true });
  });
}

function collectCurrentScenario(controlSnapshot = null) {
  const nameInput = document.getElementById('scenario-name');
  const colorInput = document.getElementById('scenario-color');
  const initialName = nameInput.value.trim();
  const snapshot = controlSnapshot || getControlSnapshot();

  return {
    id: crypto.randomUUID(),
    name: initialName || `Cenario ${savedScenarios.length + 1}`,
    color: normalizeScenarioColor(colorInput.value),
    inicial: Number(snapshot.inicial),
    aporte: Number(snapshot.aporte),
    taxa: Number(snapshot.juros),
    meta: Number(snapshot.meta),
    visible: true,
    extras: extrasState.map(sanitizeExtraDraft),
    createdAt: new Date().toISOString(),
  };
}

function alignSeriesData(source, length) {
  const result = [];
  for (let index = 0; index < length; index++) {
    result.push(source[index] ?? null);
  }
  return result;
}

function buildChartLabels(primary, scenarioSeries) {
  const allSeries = [primary, ...scenarioSeries];
  const longest = allSeries.reduce((best, series) => {
    return series.labels.length > best.labels.length ? series : best;
  }, primary);
  return longest.labels;
}

function setupScenarioControls() {
  const saveButton = document.getElementById('save-scenario');
  const nameInput = document.getElementById('scenario-name');
  const compareBody = document.getElementById('compare-body');

  const saveScenario = () => {
    const controlSnapshot = getControlSnapshot();
    savedScenarios.push(collectCurrentScenario(controlSnapshot));
    nameInput.value = '';
    CONTROL_IDS.forEach(controlId => {
      const range = document.getElementById(controlId);
      range.value = range.defaultValue;
    });
    extrasState = [];
    renderExtrasList();
    calcular();
    syncDisplayValues();
  };

  saveButton.addEventListener('click', saveScenario);
  nameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveScenario();
    }
  });

  compareBody.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-scenario-visible]');
    const colorInput = event.target.closest('[data-scenario-color]');

    if (checkbox) {
      const scenarioId = checkbox.dataset.scenarioVisible;
      const scenario = savedScenarios.find(item => item.id === scenarioId);
      if (!scenario) return;

      scenario.visible = checkbox.checked;
      calcular();
      return;
    }

    if (colorInput) {
      const scenarioId = colorInput.dataset.scenarioColor;
      const scenario = savedScenarios.find(item => item.id === scenarioId);
      if (!scenario) return;

      scenario.color = normalizeScenarioColor(colorInput.value, scenario.color);
      calcular();
    }
  });

  compareBody.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-scenario-delete]');
    if (!deleteButton) return;

    const scenarioId = deleteButton.dataset.scenarioDelete;
    const index = savedScenarios.findIndex(item => item.id === scenarioId);
    if (index === -1) return;

    savedScenarios.splice(index, 1);
    calcular();
  });

  compareBody.addEventListener('input', event => {
    const colorInput = event.target.closest('[data-scenario-color]');
    if (!colorInput) return;

    const scenarioId = colorInput.dataset.scenarioColor;
    const scenario = savedScenarios.find(item => item.id === scenarioId);
    if (!scenario) return;

    scenario.color = normalizeScenarioColor(colorInput.value, scenario.color);
    calcular();
  });

  
}

function getActiveExtras() {
  return extrasState
    .map(extra => {
      const amount = normalizeNumberInput(extra.amount);
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

  if (!extrasState.length) {
    list.innerHTML = '<div class="extra-empty">Nenhum aporte extra configurado.</div>';
    return;
  }

  list.innerHTML = extrasState.map((extra, index) => {
    const monthOptions = EXTRA_MONTHS.map((monthLabel, monthIndex) => {
      const monthValue = monthIndex + 1;
      return `<option value="${monthValue}"${monthValue === Number(extra.month) ? ' selected' : ''}>${monthLabel}</option>`;
    }).join('');

    const yearDisabled = extra.recurrence === 'annual' ? ' disabled' : '';
    const yearValue = escapeHtml(extra.year);
    const amountValue = escapeHtml(extra.amount);

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

function saveControlValues() {
  const values = CONTROL_IDS.reduce((accumulator, controlId) => {
    accumulator[controlId] = document.getElementById(controlId).value;
    return accumulator;
  }, {});

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      controls: values,
      extras: extrasState,
      scenarios: savedScenarios,
    }));
  } catch {
  }
}

function restoreControlValues() {
  try {
    const savedValues = localStorage.getItem(STORAGE_KEY);
    if (!savedValues) return;

    const parsedValues = JSON.parse(savedValues);
    const controlValues = parsedValues && parsedValues.controls ? parsedValues.controls : parsedValues;
    CONTROL_IDS.forEach(controlId => {
      const savedValue = controlValues?.[controlId];
      if (savedValue === undefined || savedValue === null || savedValue === '') return;

      const normalized = clampRangeValue(controlId, Number(savedValue), { skipStepSnap: true });
      if (!Number.isFinite(normalized)) return;
      document.getElementById(controlId).value = normalized;
    });

    extrasState = Array.isArray(parsedValues?.extras)
      ? parsedValues.extras.map(sanitizeExtraDraft)
      : [];

    savedScenarios = Array.isArray(parsedValues?.scenarios)
      ? parsedValues.scenarios.map((scenario, index) => sanitizeScenarioDraft(scenario, index))
      : [];
  } catch {
    extrasState = [];
    savedScenarios = [];
  }
}

function countStepDecimals(step) {
  const stepText = String(step);
  const parts = stepText.split('.');
  return parts[1] ? parts[1].length : 0;
}

function normalizeNumberInput(value) {
  const sanitized = value.trim().replace(/[^\d,.-]/g, '');
  if (!sanitized || sanitized === '-' || sanitized === ',' || sanitized === '.') return null;

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);

  if (separatorIndex === -1) {
    const integerOnly = sanitized.replace(/[.,]/g, '');
    const parsedInteger = Number(integerOnly);
    return Number.isFinite(parsedInteger) ? parsedInteger : null;
  }

  const integerPart = sanitized.slice(0, separatorIndex).replace(/[.,]/g, '');
  const decimalPart = sanitized.slice(separatorIndex + 1).replace(/[.,]/g, '');
  const normalized = `${integerPart || '0'}.${decimalPart}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseControlValue(controlId, value) {
  const { kind } = CONTROL_CONFIG[controlId];

  if (kind === 'currency') {
    return normalizeNumberInput(value);
  }

  return normalizeNumberInput(value);
}

function formatControlValue(controlId, value) {
  const { kind } = CONTROL_CONFIG[controlId];
  if (kind === 'percent') return value.toFixed(1).replace('.', ',') + '%';
  return fmtFull(value);
}

function formatEditableValue(controlId, value) {
  const { kind } = CONTROL_CONFIG[controlId];
  if (kind === 'percent') return value.toFixed(1).replace('.', ',');
  return formatEditableCurrency(value);
}

function isCurrencyControl(controlId) {
  return CONTROL_CONFIG[controlId].kind === 'currency';
}

function getDisplayInput(controlId) {
  return document.getElementById(CONTROL_CONFIG[controlId].displayId);
}

function clampRangeValue(controlId, value, options = {}) {
  const range = document.getElementById(controlId);
  const min = Number(range.min);
  const max = Number(range.max);
  const step = Number(range.step || 1);
  const decimals = countStepDecimals(step);
  const clamped = Math.min(max, Math.max(min, value));

  if (options.skipStepSnap) {
    return clamped;
  }

  const snapped = Math.round((clamped - min) / step) * step + min;
  return Number(snapped.toFixed(decimals));
}

function syncDisplayValues() {
  CONTROL_IDS.forEach(controlId => {
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
  const normalized = clampRangeValue(controlId, parsed, { skipStepSnap: true });
  range.value = normalized;

  if (options.recalculate !== false) calcular();
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
  CONTROL_IDS.forEach(controlId => {
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
        const formatted = numeric ? formatEditableCurrency(numeric) : '';
        display.value = formatted;
        display.setSelectionRange(formatted.length, formatted.length);
        if (numeric !== null) applyTypedValue(controlId, formatted, { recalculate: false });
      } else {
        applyTypedValue(controlId, display.value);
      }
    });

    display.addEventListener('blur', () => {
      if (!applyTypedValue(controlId, display.value)) {
        range.value = display.dataset.previousValue || range.value;
        calcular();
      }
      display.value = formatControlValue(controlId, Number(range.value));
    });

    display.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        display.blur();
      }

      if (event.key === 'Escape') {
        range.value = display.dataset.previousValue || range.value;
        display.value = formatControlValue(controlId, Number(range.value));
        calcular();
        display.blur();
      }
    });
  });
}

function setupExtraControls() {
  const list = document.getElementById('extra-list');
  const addButton = document.getElementById('add-extra');

  addButton.addEventListener('click', () => {
    extrasState.push(createDefaultExtra());
    renderExtrasList();
    calcular();
  });

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-extra-action="remove"]');
    if (!button) return;

    const item = button.closest('[data-extra-index]');
    if (!item) return;

    const index = Number(item.dataset.extraIndex);
    extrasState.splice(index, 1);
    renderExtrasList();
    calcular();
  });

  list.addEventListener('input', event => {
    const field = event.target.dataset.extraField;
    const item = event.target.closest('[data-extra-index]');
    if (!field || !item) return;

    const index = Number(item.dataset.extraIndex);
    const extra = extrasState[index];
    if (!extra) return;

    if (field === 'amount') {
      const digits = event.target.value.replace(/\D/g, '');
      const numeric = digits ? Number(digits) / 100 : null;
      extra[field] = numeric ? formatEditableCurrency(numeric) : '';
      const cursor = extra[field].length;
      event.target.value = extra[field];
      event.target.setSelectionRange(cursor, cursor);
    } else {
      extra[field] = event.target.value;
    }
    calcular();
  });

  list.addEventListener('change', event => {
    const field = event.target.dataset.extraField;
    const item = event.target.closest('[data-extra-index]');
    if (!field || !item) return;

    const index = Number(item.dataset.extraIndex);
    const extra = extrasState[index];
    if (!extra) return;

    extra[field] = event.target.value;

    if (field === 'recurrence') {
      renderExtrasList();
    }

    calcular();
  });

  list.addEventListener('focusout', event => {
    const field = event.target.dataset.extraField;
    const item = event.target.closest('[data-extra-index]');
    if (!field || !item) return;

    const index = Number(item.dataset.extraIndex);
    const extra = extrasState[index];
    if (!extra) return;

    if (field === 'amount') {
      const parsed = normalizeNumberInput(extra.amount);
      extra.amount = Number.isFinite(parsed) && parsed > 0 ? formatEditableCurrency(parsed) : '';
      renderExtrasList();
      calcular();
    }

    if (field === 'year') {
      extra.year = String(Math.min(50, Math.max(1, Number.parseInt(extra.year, 10) || 1)));
      renderExtrasList();
      calcular();
    }
  });
}

function formatEditableCurrency(value) {
  const formattedValue = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  return `R$ ${formattedValue}`;
}

function simular(inicial, aporte, taxaAnual, meta, extras = []) {
  const tm = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  let saldo = inicial, meses = 0, total = inicial;
  const pat = [], inv = [], labels = [];
  while (saldo < meta && meses < MAX_SIMULATION_MONTHS) {
    meses++;
    const mesAtual = ((meses - 1) % 12) + 1;
    const anoAtual = Math.ceil(meses / 12);
    const aporteExtra = extras.reduce((accumulator, extra) => {
      const sameMonth = extra.month === mesAtual;
      const validRecurrence = extra.recurrence === 'annual' || extra.year === anoAtual;
      return sameMonth && validRecurrence ? accumulator + extra.amount : accumulator;
    }, 0);

    saldo = saldo * (1 + tm) + aporte + aporteExtra;
    total += aporte + aporteExtra;
    if (meses % 6 === 0 || meses === 1) {
      const lbl = meses <= 12 ? meses + 'm' : Math.floor(meses / 12) + 'a' + (meses % 12 ? (meses % 12) + 'm' : '');
      labels.push(lbl); pat.push(Math.round(saldo)); inv.push(Math.round(total));
    }
  }
  return { meses, saldo, total, labels, pat, inv };
}

function mesesParaTexto(m) {
  const a = Math.floor(m / 12), r = m % 12;
  return a + ' anos' + (r ? ' e ' + r + ' meses' : '');
}

function buildTable(currentKey) {
  const tbody = document.getElementById('compare-body');
  tbody.innerHTML = '';
  if (!savedScenarios.length) {
    tbody.innerHTML = '<tr><td class="scenario-empty" colspan="10">Nenhum cenário salvo ainda.</td></tr>';
    return;
  }

  savedScenarios.forEach(scenario => {
    const extras = scenario.extras
      .map(sanitizeExtraDraft)
      .map(extra => ({
        month: Number(extra.month),
        amount: normalizeNumberInput(extra.amount) || 0,
        recurrence: extra.recurrence,
        year: extra.recurrence === 'specific' ? Number(extra.year) : null,
      }))
      .filter(extra => extra.amount > 0);

    const r = simular(scenario.inicial, scenario.aporte, scenario.taxa / 100, scenario.meta, extras);
    const tm = Math.pow(1 + scenario.taxa / 100, 1 / 12) - 1;
    const rendMes = r.saldo * tm;
    const tr = document.createElement('tr');
    if (scenario.id === currentKey) tr.className = 'current-row';
    tr.innerHTML = `
      <td>${escapeHtml(scenario.name)}</td>
      <td><input class="scenario-visible-check" type="checkbox" data-scenario-visible="${escapeHtml(scenario.id)}"${scenario.visible === false ? '' : ' checked'}></td>
      <td><input class="scenario-color-input" type="color" data-scenario-color="${escapeHtml(scenario.id)}" value="${escapeHtml(normalizeScenarioColor(scenario.color))}" aria-label="Cor do cenário ${escapeHtml(scenario.name)}"></td>
      <td class="highlight">${fmtFull(scenario.inicial)}</td>
      <td class="highlight">${fmtFull(scenario.aporte)}</td>
      <td>${scenario.taxa.toFixed(2).replace('.', ',')}% a.a.</td>
      <td>${fmtFull(scenario.meta)}</td>
      <td class="highlight">${mesesParaTexto(r.meses)}</td>
      <td class="highlight">${fmt(rendMes)}</td>
      <td><button type="button" class="scenario-delete-btn" data-scenario-delete="${escapeHtml(scenario.id)}">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function calcular() {
  const inicial = +document.getElementById('inicial').value;
  const aporte = +document.getElementById('aporte').value;
  const taxa = +document.getElementById('juros').value;
  const taxaAnual = taxa / 100;
  const meta = +document.getElementById('meta').value;
  const extras = getActiveExtras();

  saveControlValues();
  syncDisplayValues();

  const com = simular(inicial, aporte, taxaAnual, meta, extras);
  const visibleScenarios = savedScenarios.filter(scenario => scenario.visible !== false);
  const savedScenarioSeries = visibleScenarios.map(scenario => {
    const scenarioExtras = scenario.extras
      .map(sanitizeExtraDraft)
      .map(extra => ({
        month: Number(extra.month),
        amount: normalizeNumberInput(extra.amount) || 0,
        recurrence: extra.recurrence,
        year: extra.recurrence === 'specific' ? Number(extra.year) : null,
      }))
      .filter(extra => extra.amount > 0);

    const result = simular(scenario.inicial, scenario.aporte, scenario.taxa / 100, scenario.meta, scenarioExtras);
    return {
      scenario,
      result,
    };
  });

  const chartLabels = buildChartLabels(com, savedScenarioSeries.map(item => item.result));

  const anosC = Math.floor(com.meses / 12), mC = com.meses % 12;
  document.getElementById('c-tempo').textContent = anosC + ' anos' + (mC ? ' e ' + mC + ' meses' : '');
  document.getElementById('c-tempo-sub').textContent = com.meses + ' meses no total';

  document.getElementById('c-pat').textContent = fmt(com.saldo);
  document.getElementById('c-pat-sub').textContent = fmtFull(Math.round(com.saldo));

  document.getElementById('c-inv').textContent = fmt(com.total);
  document.getElementById('c-inv-sub').textContent = fmtFull(Math.round(com.total));

  const ganho = com.saldo - com.total;
  document.getElementById('c-juros').textContent = fmt(ganho);
  document.getElementById('c-juros-sub').textContent = Math.round(ganho / com.saldo * 100) + '% do patrimônio';

  const tm = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  const rMes = com.saldo * tm;
  const rAno = com.saldo * taxaAnual;
  const rDia = rAno / 365;

  document.getElementById('r-mes').textContent = fmt(rMes);
  document.getElementById('r-mes-sub').textContent = fmtFull(Math.round(rMes)) + '/mês';
  document.getElementById('r-ano').textContent = fmt(rAno);
  document.getElementById('r-ano-sub').textContent = fmtFull(Math.round(rAno)) + '/ano';
  document.getElementById('r-dia').textContent = fmt(rDia);
  document.getElementById('r-dia-sub').textContent = fmtFull(Math.round(rDia)) + '/dia';

  if (chartInst) chartInst.destroy();
  chartInst = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: [
        {
          label: 'Patrimônio projetado',
          data: alignSeriesData(com.pat, chartLabels.length),
          borderColor: '#c8f060',
          backgroundColor: 'rgba(200,240,96,0.05)',
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'Aportado',
          data: alignSeriesData(com.inv, chartLabels.length),
          borderColor: '#3a3a55',
          backgroundColor: 'transparent',
          fill: false, tension: 0, pointRadius: 0, borderWidth: 1,
          borderDash: [3, 3],
        },
        ...savedScenarioSeries.map(({ scenario, result }) => ({
          label: scenario.name,
          data: alignSeriesData(result.pat, chartLabels.length),
          borderColor: normalizeScenarioColor(scenario.color),
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 1.6,
          borderDash: [6, 4],
        }))
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#18181f',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#8a8a94',
          bodyColor: '#f0efe8',
          titleFont: { family: 'DM Mono', size: 11 },
          bodyFont: { family: 'DM Mono', size: 12 },
          callbacks: { label: ctx => ctx.dataset.label + ': R$ ' + (ctx.raw || 0).toLocaleString('pt-BR') }
        }
      },
      scales: {
        y: {
          ticks: {
            callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000) + 'k' : v,
            font: { family: 'DM Mono', size: 10 },
            color: '#55555f'
          },
          grid: { color: 'rgba(255,255,255,0.04)' },
          border: { color: 'transparent' }
        },
        x: {
          ticks: { font: { family: 'DM Mono', size: 10 }, color: '#55555f', maxTicksLimit: 10 },
          grid: { display: false },
          border: { color: 'transparent' }
        }
      }
    }
  });

  buildTable(null);
}

CONTROL_IDS.forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    normalizeSliderControlValue(id);
    calcular();
  });
});

setupEditableControls();
restoreControlValues();
renderExtrasList();
setupExtraControls();
setupScenarioControls();
calcular();
