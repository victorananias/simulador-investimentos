(() => {
const App = window.SimuladorApp = window.SimuladorApp || {};

const CONTROL_CONFIG = {
  inicial: { displayId: 'v-inicial', kind: 'currency' },
  aporte: { displayId: 'v-aporte', kind: 'currency' },
  juros: { displayId: 'v-juros', kind: 'percent' },
  meta: { displayId: 'v-meta', kind: 'currency' },
  retirada: { displayId: 'v-retirada', kind: 'currency' },
  lucro: { displayId: 'v-lucro', kind: 'percent' },
};

const CONTROL_IDS = Object.keys(CONTROL_CONFIG);
const STORAGE_KEY = 'simulador-investimentos:parametros';
const MAX_SIMULATION_MONTHS = 600;
const SCENARIO_EXPORT_VERSION = 1;
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

App.CONTROL_CONFIG = CONTROL_CONFIG;
App.CONTROL_IDS = CONTROL_IDS;
App.STORAGE_KEY = STORAGE_KEY;
App.MAX_SIMULATION_MONTHS = MAX_SIMULATION_MONTHS;
App.SCENARIO_EXPORT_VERSION = SCENARIO_EXPORT_VERSION;
App.EXTRA_MONTHS = EXTRA_MONTHS;
App.state = {
  chartInst: null,
  withdrawalChartInst: null,
  extrasState: [],
  savedScenarios: [],
  selectedScenarioId: null,
};

function hasFraction(value) {
  return Math.abs(value % 1) > 0.000001;
}

function fmtFull(value) {
  return 'R$ ' + value.toLocaleString('pt-BR', {
    minimumFractionDigits: hasFraction(value) ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

function fmt(value) {
  if (value >= 1000000) return 'R$ ' + (value / 1000000).toFixed(2).replace('.', ',') + ' M';
  if (value >= 1000) return 'R$ ' + (value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mil';
  return fmtFull(value);
}

function normalizeScenarioColor(color, fallback = '#4ade80') {
  const normalized = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback;
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeScenarioColor(hex);
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
  const extras = Array.isArray(scenario.extras) ? scenario.extras.map(sanitizeExtraDraft) : [];

  return {
    id: typeof scenario.id === 'string' && scenario.id ? scenario.id : crypto.randomUUID(),
    name: typeof scenario.name === 'string' && scenario.name.trim() ? scenario.name.trim() : `Cenario ${fallbackIndex + 1}`,
    color: normalizeScenarioColor(scenario.color),
    inicial: Number.isFinite(Number(scenario.inicial)) ? Number(scenario.inicial) : 0,
    aporte: Number.isFinite(Number(scenario.aporte)) ? Number(scenario.aporte) : 0,
    taxa: Number.isFinite(Number(scenario.taxa)) ? Number(scenario.taxa) : 0,
    meta: Number.isFinite(Number(scenario.meta)) ? Number(scenario.meta) : 0,
    retirada: Number.isFinite(Number(scenario.retirada)) ? Number(scenario.retirada) : 0,
    lucro: Number.isFinite(Number(scenario.lucro)) ? Number(scenario.lucro) : 0,
    visible: scenario.visible !== false,
    extras,
    createdAt: typeof scenario.createdAt === 'string' ? scenario.createdAt : new Date().toISOString(),
  };
}

function countStepDecimals(step) {
  const parts = String(step).split('.');
  return parts[1] ? parts[1].length : 0;
}

function normalizeNumberInput(value) {
  const sanitized = value.trim().replace(/[^\d,.-]/g, '');
  if (!sanitized || sanitized === '-' || sanitized === ',' || sanitized === '.') return null;

  const lastComma = sanitized.lastIndexOf(',');
  const lastDot = sanitized.lastIndexOf('.');
  const separatorIndex = Math.max(lastComma, lastDot);

  if (separatorIndex === -1) {
    const parsedInteger = Number(sanitized.replace(/[.,]/g, ''));
    return Number.isFinite(parsedInteger) ? parsedInteger : null;
  }

  const integerPart = sanitized.slice(0, separatorIndex).replace(/[.,]/g, '');
  const decimalPart = sanitized.slice(separatorIndex + 1).replace(/[.,]/g, '');
  const parsed = Number(`${integerPart || '0'}.${decimalPart}`);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEditableCurrency(value) {
  const formattedValue = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  });

  return `R$ ${formattedValue}`;
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

function getCssVarValue(name, fallback = '') {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getChartThemePalette() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  return {
    primaryLine: getCssVarValue('--accent', '#c8f060'),
    primaryFill: isLight ? 'rgba(45,106,0,0.10)' : 'rgba(200,240,96,0.05)',
    aportadoLine: isLight ? '#4b4f69' : '#8e90b5',
    axisText: isLight ? '#4d4f5f' : '#b8bacd',
    yGrid: isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
    tooltipBg: isLight ? '#f0f0ea' : '#20202a',
    tooltipBorder: isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)',
    tooltipTitle: isLight ? '#2e2f36' : '#c0c1cf',
    tooltipBody: isLight ? '#101015' : '#f7f7f2',
  };
}

function mesesParaTexto(months) {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return years + ' anos' + (remainingMonths ? ' e ' + remainingMonths + ' meses' : '');
}

Object.assign(App, {
  hasFraction,
  fmtFull,
  fmt,
  normalizeScenarioColor,
  hexToRgba,
  createDefaultExtra,
  escapeHtml,
  sanitizeExtraDraft,
  sanitizeScenarioDraft,
  countStepDecimals,
  normalizeNumberInput,
  formatEditableCurrency,
  alignSeriesData,
  buildChartLabels,
  getCssVarValue,
  getChartThemePalette,
  mesesParaTexto,
});
})();