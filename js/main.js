(() => {
const App = window.SimuladorApp;

function setupTheme() {
  const themeKey = 'simulador-investimentos:theme';
  const html = document.documentElement;
  const toggleBtn = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  const themeBtn = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeLabel = document.getElementById('theme-label');

  function applyTheme(theme) {
    if (theme === 'light') {
      html.setAttribute('data-theme', 'light');
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Tema escuro';
      return;
    }

    html.removeAttribute('data-theme');
    themeIcon.textContent = '☀️';
    themeLabel.textContent = 'Tema claro';
  }

  applyTheme(localStorage.getItem(themeKey) || 'dark');
  App.calcular();

  toggleBtn.addEventListener('click', event => {
    event.stopPropagation();
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    toggleBtn.setAttribute('aria-expanded', String(isHidden));
  });

  themeBtn.addEventListener('click', () => {
    const current = html.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem(themeKey, next);
    App.calcular();
  });

  document.addEventListener('click', event => {
    if (!document.getElementById('settings-fab').contains(event.target)) {
      panel.hidden = true;
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });
}

function init() {
  App.CONTROL_IDS.forEach(controlId => {
    document.getElementById(controlId).addEventListener('input', () => {
      App.normalizeSliderControlValue(controlId);
      App.calcular();
    });
  });

  App.setupEditableControls();
  App.restoreControlValues();
  App.renderExtrasList();
  App.setupExtraControls();
  App.setupScenarioControls();
  App.setupScenarioTransferControls();
  App.calcular();
  setupTheme();
}

init();
})();