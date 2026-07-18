(() => {
const App = window.SimuladorApp;

function collectCurrentScenario(controlSnapshot = null) {
  const nameInput = document.getElementById('scenario-name');
  const colorInput = document.getElementById('scenario-color');
  const snapshot = controlSnapshot || App.getControlSnapshot();

  return {
    id: crypto.randomUUID(),
    name: nameInput.value.trim() || `Cenario ${App.state.savedScenarios.length + 1}`,
    color: App.normalizeScenarioColor(colorInput.value),
    inicial: Number(snapshot.inicial),
    aporte: Number(snapshot.aporte),
    taxa: Number(snapshot.juros),
    meta: Number(snapshot.meta),
    anosRetirada: Number(snapshot.anosRetirada),
    retirada: Number(snapshot.retirada),
    lucro: Number(snapshot.lucro),
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
      if (App.state.selectedScenarioId === App.state.savedScenarios[existingIndex].id) {
        App.state.selectedScenarioId = newScenario.id;
      }
      App.state.savedScenarios[existingIndex] = newScenario;
    } else {
      App.state.savedScenarios.push(newScenario);
      nameInput.value = '';
      App.CONTROL_IDS.forEach(controlId => {
        if (controlId === 'anosRetirada') return;
        const range = document.getElementById(controlId);
        range.value = range.defaultValue;
      });
      App.state.extrasState = [];
      App.renderExtrasList();
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

  compareBody.addEventListener('change', event => {
    const checkbox = event.target.closest('[data-scenario-visible]');
    const colorInput = event.target.closest('[data-scenario-color]');
    const renameInput = event.target.closest('[data-scenario-rename]');

    if (renameInput) {
      const scenario = App.state.savedScenarios.find(item => item.id === renameInput.dataset.scenarioRename);
      if (!scenario) return;

      const nextName = renameInput.value.trim();
      scenario.name = nextName || scenario.name;

      if (App.state.selectedScenarioId === scenario.id) {
        document.getElementById('scenario-name').value = scenario.name;
      }

      App.touchLastModified();
      App.calcular();
      return;
    }

    if (checkbox) {
      const scenario = App.state.savedScenarios.find(item => item.id === checkbox.dataset.scenarioVisible);
      if (!scenario) return;
      scenario.visible = checkbox.checked;
      App.calcular();
      return;
    }

    if (colorInput) {
      const scenario = App.state.savedScenarios.find(item => item.id === colorInput.dataset.scenarioColor);
      if (!scenario) return;
      scenario.color = App.normalizeScenarioColor(colorInput.value, scenario.color);
      App.calcular();
    }
  });

  compareBody.addEventListener('input', event => {
    const colorInput = event.target.closest('[data-scenario-color]');
    if (!colorInput) return;

    const scenario = App.state.savedScenarios.find(item => item.id === colorInput.dataset.scenarioColor);
    if (!scenario) return;
    scenario.color = App.normalizeScenarioColor(colorInput.value, scenario.color);
    App.calcular();
  });

  compareBody.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-scenario-delete]');
    if (deleteButton) {
      const scenarioId = deleteButton.dataset.scenarioDelete;
      const index = App.state.savedScenarios.findIndex(item => item.id === scenarioId);
      if (index === -1) return;

      App.state.savedScenarios.splice(index, 1);
      if (App.state.selectedScenarioId === scenarioId) App.state.selectedScenarioId = null;
      App.calcular();
      return;
    }

    const selectButton = event.target.closest('[data-scenario-select]');
    if (!selectButton) return;

    const scenarioId = selectButton.dataset.scenarioSelect;
    const isDeselect = App.state.selectedScenarioId === scenarioId;
    App.state.selectedScenarioId = isDeselect ? null : scenarioId;

    if (!isDeselect) {
      const scenario = App.state.savedScenarios.find(item => item.id === scenarioId);
      if (scenario) {
        document.getElementById('inicial').value = App.clampRangeValue('inicial', scenario.inicial, { skipStepSnap: true });
        document.getElementById('aporte').value = App.clampRangeValue('aporte', scenario.aporte, { skipStepSnap: true });
        document.getElementById('juros').value = App.clampRangeValue('juros', scenario.taxa, { skipStepSnap: true });
        document.getElementById('meta').value = App.clampRangeValue('meta', scenario.meta, { skipStepSnap: true });
        App.state.extrasState = scenario.extras.map(App.sanitizeExtraDraft);
        App.renderExtrasList();
        document.getElementById('scenario-name').value = scenario.name;
        document.getElementById('scenario-color').value = App.normalizeScenarioColor(scenario.color);
      }
    }

    App.calcular();
    App.syncDisplayValues();
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

Object.assign(App, {
  collectCurrentScenario,
  buildScenarioExportPayload,
  downloadJsonFile,
  extractImportedScenarios,
  mergeImportedScenarios,
  setupScenarioControls,
  setupScenarioTransferControls,
});
})();