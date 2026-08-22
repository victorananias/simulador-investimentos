(() => {
const App = window.SimuladorApp;

let scenarioNameAutoMode = true;

function generateScenarioName(snapshot) {
  return `${App.abbreviateAmount(snapshot.aporte)}/mês - ${App.abbreviateAmount(snapshot.meta)}`;
}

function updateAutoScenarioName() {
  if (!scenarioNameAutoMode) return;

  const nameInput = document.getElementById('scenario-name');
  nameInput.value = generateScenarioName({
    aporte: document.getElementById('aporte').value,
    meta: document.getElementById('meta').value,
  });
}

function collectCurrentScenario(controlSnapshot = null) {
  const nameInput = document.getElementById('scenario-name');
  const colorInput = document.getElementById('scenario-color');
  const snapshot = controlSnapshot || App.getControlSnapshot();

  return {
    id: crypto.randomUUID(),
    name: nameInput.value.trim() || generateScenarioName(snapshot),
    color: App.normalizeScenarioColor(colorInput.value),
    inicial: Number(snapshot.inicial),
    aporte: Number(snapshot.aporte),
    taxa: Number(snapshot.juros),
    meta: Number(snapshot.meta),
    visible: true,
    extras: App.state.extrasState.map(App.sanitizeExtraDraft),
    createdAt: new Date().toISOString(),
  };
}

function buildScenarioExportPayload() {
  return {
    app: 'simulador-investimentos',
    type: 'scenarios',
    version: App.SCENARIO_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    scenarios: App.state.savedScenarios.map((scenario, index) => App.sanitizeScenarioDraft(scenario, index)),
  };
}

function downloadJsonFile(data, fileName) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function extractImportedScenarios(parsedJson) {
  if (Array.isArray(parsedJson)) return parsedJson;
  if (parsedJson && Array.isArray(parsedJson.scenarios)) return parsedJson.scenarios;
  throw new Error('Formato JSON invalido para cenarios.');
}

function mergeImportedScenarios(rawScenarios) {
  const importedScenarios = rawScenarios.map((scenario, index) => App.sanitizeScenarioDraft(scenario, index));
  let added = 0;
  let updated = 0;
  const existingIds = new Set(App.state.savedScenarios.map(scenario => scenario.id));
  const usedImportIds = new Set();
  const existingNames = new Set(
    App.state.savedScenarios.map(scenario => scenario.name.trim().toLowerCase())
  );

  importedScenarios.forEach(importedScenario => {
    const idAlreadyUsed = usedImportIds.has(importedScenario.id) || existingIds.has(importedScenario.id);
    if (!importedScenario.id || idAlreadyUsed) {
      importedScenario.id = crypto.randomUUID();
    }
    usedImportIds.add(importedScenario.id);

    const originalName = importedScenario.name.trim() || `Cenario ${App.state.savedScenarios.length + added + 1}`;
    let candidateName = originalName;
    let suffix = 2;

    while (existingNames.has(candidateName.toLowerCase())) {
      candidateName = `${originalName} (${suffix})`;
      suffix++;
    }

    importedScenario.name = candidateName;
    existingNames.add(candidateName.toLowerCase());

    App.state.savedScenarios.push(importedScenario);
    added++;
  });

  return { added, updated, total: importedScenarios.length };
}

function loadScenarioIntoForm(scenario) {
  if (!scenario) return;

  document.getElementById('inicial').value = App.clampRangeValue('inicial', scenario.inicial, { skipStepSnap: true });
  document.getElementById('aporte').value = App.clampRangeValue('aporte', scenario.aporte, { skipStepSnap: true });
  document.getElementById('juros').value = App.clampRangeValue('juros', scenario.taxa, { skipStepSnap: true });
  document.getElementById('meta').value = App.clampRangeValue('meta', scenario.meta, { skipStepSnap: true });
  document.getElementById('lucro').value = App.clampRangeValue('lucro', scenario.taxa, { skipStepSnap: true });
  document.getElementById('retirada').value = App.clampRangeValue('retirada', App.computeSuggestedRetirada(scenario), { skipStepSnap: true });
  App.state.extrasState = scenario.extras.map(App.sanitizeExtraDraft);
  App.renderExtrasList();
  document.getElementById('scenario-name').value = scenario.name;
  document.getElementById('scenario-color').value = App.normalizeScenarioColor(scenario.color);
  scenarioNameAutoMode = false;
}

function resetScenarioForm() {
  document.getElementById('scenario-name').value = '';
  const colorInput = document.getElementById('scenario-color');
  colorInput.value = colorInput.defaultValue || '#4ade80';

  App.SCENARIO_CONTROL_IDS.forEach(controlId => {
    const range = document.getElementById(controlId);
    range.value = range.defaultValue;
  });

  App.state.extrasState = [];
  App.renderExtrasList();
  scenarioNameAutoMode = true;
}

function setupScenarioControls() {
  const saveButton = document.getElementById('save-scenario');
  const nameInput = document.getElementById('scenario-name');
  const compareBody = document.getElementById('compare-body');

  const saveScenario = () => {
    const newScenario = collectCurrentScenario(App.getControlSnapshot());
    const existingIndex = App.state.savedScenarios.findIndex(item => {
      return item.name.trim().toLowerCase() === newScenario.name.trim().toLowerCase();
    });

    if (existingIndex !== -1) {
      newScenario.id = App.state.savedScenarios[existingIndex].id;
      App.state.savedScenarios[existingIndex] = newScenario;
    } else {
      App.state.savedScenarios.push(newScenario);
    }

    App.state.selectedScenarioId = newScenario.id;

    if (existingIndex === -1) {
      resetScenarioForm();
    }

    App.calcular();
    App.syncDisplayValues();
  };

  saveButton.addEventListener('click', saveScenario);
  nameInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    saveScenario();
  });

  nameInput.addEventListener('input', () => {
    scenarioNameAutoMode = nameInput.value.trim() === '';
  });

  compareBody.addEventListener('click', event => {
    const selectButton = event.target.closest('[data-scenario-select]');
    if (!selectButton) return;

    const scenarioId = selectButton.dataset.scenarioSelect;
    const isDeselect = App.state.selectedScenarioId === scenarioId;
    App.state.selectedScenarioId = isDeselect ? null : scenarioId;

    if (!isDeselect) {
      const scenario = App.state.savedScenarios.find(item => item.id === scenarioId);
      loadScenarioIntoForm(scenario);
    } else {
      resetScenarioForm();
    }

    App.calcular();
    App.syncDisplayValues();
    App.closeScenariosModal();
  });
}

function setupScenarioTransferControls() {
  const exportButton = document.getElementById('export-scenarios');
  const importButton = document.getElementById('import-scenarios');
  const importFileInput = document.getElementById('import-scenarios-file');
  const compareBody = document.getElementById('compare-body');

  const openImportDialog = () => {
    importFileInput.value = '';
    importFileInput.click();
  };

  exportButton.addEventListener('click', () => {
    if (!App.state.savedScenarios.length) {
      alert('Nao ha cenarios salvos para exportar.');
      return;
    }

    const payload = buildScenarioExportPayload();
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    downloadJsonFile(payload, `cenarios-${datePart}-${hour}h${minute}.json`);
  });

  importButton.addEventListener('click', openImportDialog);

  compareBody.addEventListener('click', event => {
    const emptyAddButton = event.target.closest('[data-empty-add]');
    if (emptyAddButton) {
      App.closeScenariosModal();
      App.openScenarioFormModal();
      return;
    }

    const emptyImportButton = event.target.closest('[data-empty-import]');
    if (!emptyImportButton) return;
    openImportDialog();
  });

  importFileInput.addEventListener('change', async event => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedScenarios = extractImportedScenarios(JSON.parse(text));

      if (!importedScenarios.length) {
        alert('O arquivo nao contem cenarios para importar.');
        return;
      }

      const result = mergeImportedScenarios(importedScenarios);

      if (App.state.selectedScenarioId && !App.state.savedScenarios.some(scenario => scenario.id === App.state.selectedScenarioId)) {
        App.state.selectedScenarioId = null;
      }

      App.calcular();
      alert(`${result.total} cenario(s) importado(s). ${result.added} novo(s) e ${result.updated} atualizado(s).`);
    } catch {
      alert('Nao foi possivel importar o JSON. Verifique o formato do arquivo.');
    } finally {
      importFileInput.value = '';
    }
  });
}

function openScenariosModal() {
  const openBtn = document.getElementById('open-scenarios-modal');
  const closeBtn = document.getElementById('scenarios-modal-close');
  const modal = document.getElementById('scenarios-modal');
  if (!modal) return;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  if (closeBtn) closeBtn.focus();
}

function closeScenariosModal() {
  const openBtn = document.getElementById('open-scenarios-modal');
  const modal = document.getElementById('scenarios-modal');
  if (!modal) return;

  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  if (openBtn) openBtn.focus();
}

function setupScenariosModal() {
  const openBtn = document.getElementById('open-scenarios-modal');
  const closeBtn = document.getElementById('scenarios-modal-close');
  const modal = document.getElementById('scenarios-modal');
  const backdrop = modal ? modal.querySelector('[data-scenarios-close]') : null;

  if (!openBtn || !closeBtn || !modal || !backdrop) return;

  openBtn.addEventListener('click', openScenariosModal);
  closeBtn.addEventListener('click', closeScenariosModal);
  backdrop.addEventListener('click', closeScenariosModal);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeScenariosModal();
    }
  });
}

function openScenarioFormModal() {
  const openBtn = document.getElementById('open-scenario-form');
  const modal = document.getElementById('scenario-form-modal');
  const nameInput = document.getElementById('scenario-name');
  if (!modal) return;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  if (openBtn) openBtn.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  if (nameInput) nameInput.focus();
}

function closeScenarioFormModal() {
  const openBtn = document.getElementById('open-scenario-form');
  const modal = document.getElementById('scenario-form-modal');
  if (!modal) return;

  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  if (openBtn) openBtn.focus();
}

function setupScenarioFormModal() {
  const openBtn = document.getElementById('open-scenario-form');
  const closeBtn = document.getElementById('scenario-form-close');
  const modal = document.getElementById('scenario-form-modal');
  const backdrop = modal ? modal.querySelector('[data-scenario-form-close]') : null;
  const saveBtn = document.getElementById('save-scenario');
  const cancelBtn = document.getElementById('cancel-scenario-form');

  if (!openBtn || !closeBtn || !modal || !backdrop) return;

  openBtn.addEventListener('click', openScenarioFormModal);
  closeBtn.addEventListener('click', closeScenarioFormModal);
  backdrop.addEventListener('click', closeScenarioFormModal);
  if (saveBtn) saveBtn.addEventListener('click', closeScenarioFormModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeScenarioFormModal);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeScenarioFormModal();
    }
  });
}

let confirmDeleteCallback = null;

function openConfirmDeleteModal(message, onConfirm) {
  const modal = document.getElementById('confirm-delete-modal');
  const messageEl = document.getElementById('confirm-delete-message');
  if (!modal) return;

  if (messageEl && message) messageEl.textContent = message;
  confirmDeleteCallback = onConfirm;

  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeConfirmDeleteModal() {
  const modal = document.getElementById('confirm-delete-modal');
  if (!modal) return;

  modal.hidden = true;
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  confirmDeleteCallback = null;
}

function setupConfirmDeleteModal() {
  const modal = document.getElementById('confirm-delete-modal');
  const closeBtn = document.getElementById('confirm-delete-close');
  const cancelBtn = document.getElementById('confirm-delete-cancel');
  const confirmBtn = document.getElementById('confirm-delete-confirm');
  const backdrop = modal ? modal.querySelector('[data-confirm-delete-close]') : null;

  if (!modal || !closeBtn || !cancelBtn || !confirmBtn || !backdrop) return;

  closeBtn.addEventListener('click', closeConfirmDeleteModal);
  cancelBtn.addEventListener('click', closeConfirmDeleteModal);
  backdrop.addEventListener('click', closeConfirmDeleteModal);

  confirmBtn.addEventListener('click', () => {
    const callback = confirmDeleteCallback;
    closeConfirmDeleteModal();
    if (callback) callback();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeConfirmDeleteModal();
    }
  });
}

Object.assign(App, {
  openScenariosModal,
  closeScenariosModal,
  openScenarioFormModal,
  closeScenarioFormModal,
  openConfirmDeleteModal,
  closeConfirmDeleteModal,
  setupConfirmDeleteModal,
  loadScenarioIntoForm,
  resetScenarioForm,
  updateAutoScenarioName,
  collectCurrentScenario,
  buildScenarioExportPayload,
  downloadJsonFile,
  extractImportedScenarios,
  mergeImportedScenarios,
  setupScenarioControls,
  setupScenarioTransferControls,
  setupScenariosModal,
  setupScenarioFormModal,
});
})();