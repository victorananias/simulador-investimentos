(() => {
const App = window.SimuladorApp;

function simular(inicial, aporte, taxaAnual, meta, extras = []) {
  const taxaMensal = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  let saldo = inicial;
  let meses = 0;
  let total = inicial;
  const pat = [];
  const inv = [];
  const labels = [];

  while (saldo < meta && meses < App.MAX_SIMULATION_MONTHS) {
    meses++;
    const mesAtual = ((meses - 1) % 12) + 1;
    const anoAtual = Math.ceil(meses / 12);
    const aporteExtra = extras.reduce((accumulator, extra) => {
      const sameMonth = extra.month === mesAtual;
      const validRecurrence = extra.recurrence === 'annual' || extra.year === anoAtual;
      return sameMonth && validRecurrence ? accumulator + extra.amount : accumulator;
    }, 0);

    saldo = saldo * (1 + taxaMensal) + aporte + aporteExtra;
    total += aporte + aporteExtra;

    const reachedLimit = meses === App.MAX_SIMULATION_MONTHS;
    const reachedTarget = saldo >= meta;
    const shouldPlotPoint = meses % 6 === 0 || meses === 1 || reachedTarget || reachedLimit;

    if (shouldPlotPoint) {
      const label = meses <= 12 ? meses + 'm' : Math.floor(meses / 12) + 'a' + (meses % 12 ? (meses % 12) + 'm' : '');
      labels.push(label);
      pat.push(Math.round(saldo));
      inv.push(Math.round(total));
    }
  }

  return { meses, saldo, total, labels, pat, inv };
}

function simularRetirada(saldoInicial, retiradaMensal, taxaAnual) {
  const taxaMensal = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  let saldo = saldoInicial;
  let meses = 0;
  let totalRetirado = 0;
  const pat = [];
  const retiradas = [];
  const labels = [];

  if (saldoInicial <= 0) {
    return {
      meses,
      saldo,
      totalRetirado,
      labels,
      pat,
      retiradas,
      esgotado: true,
      limitadoPeloHorizonte: false,
    };
  }

  while (meses < App.MAX_SIMULATION_MONTHS) {
    meses++;

    const saldoComLucro = saldo * (1 + taxaMensal);
    const retiradaEfetiva = Math.min(retiradaMensal, saldoComLucro);
    saldo = Math.max(0, saldoComLucro - retiradaEfetiva);
    totalRetirado += retiradaEfetiva;

    const reachedLimit = meses === App.MAX_SIMULATION_MONTHS;
    const reachedZero = saldo <= 0;
    const shouldPlotPoint = meses % 6 === 0 || meses === 1 || reachedZero || reachedLimit;

    if (shouldPlotPoint) {
      const label = meses <= 12 ? meses + 'm' : Math.floor(meses / 12) + 'a' + (meses % 12 ? (meses % 12) + 'm' : '');
      labels.push(label);
      pat.push(Math.round(saldo));
      retiradas.push(Math.round(totalRetirado));
    }

    if (reachedZero) break;
  }

  return {
    meses,
    saldo,
    totalRetirado,
    labels,
    pat,
    retiradas,
    esgotado: saldo <= 0,
    limitadoPeloHorizonte: saldo > 0 && meses >= App.MAX_SIMULATION_MONTHS,
  };
}

function renderHtmlTooltip(chart, tooltip, tooltipEl) {
  if (!tooltipEl) return;

  if (!tooltip || tooltip.opacity === 0) {
    tooltipEl.style.opacity = 0;
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.dataset.visible = 'false';
    return;
  }

  const dataPoints = tooltip.dataPoints || [];
  const firstPoint = dataPoints[0];
  const formattedDate = firstPoint?.label ?? '';

  const rowsHtml = dataPoints.map(dataPoint => {
    const value = Number(dataPoint?.parsed?.y ?? dataPoint?.raw ?? 0);
    const formattedValue = App.fmtFull(value);
    const label = dataPoint?.dataset?.label ?? '';
    const color = dataPoint?.dataset?.borderColor ?? 'transparent';

    return `
      <div class="chart-tooltip__row">
        <span class="chart-tooltip__dot" style="background:${App.escapeHtml(color)}"></span>
        <span class="chart-tooltip__title">${App.escapeHtml(label)}</span>
        <span class="chart-tooltip__value">${App.escapeHtml(formattedValue)}</span>
      </div>
    `;
  }).join('');

  tooltipEl.innerHTML = `
    <div class="chart-tooltip__date">${App.escapeHtml(formattedDate)}</div>
    ${rowsHtml}
  `;

  const canvasRect = chart.canvas.getBoundingClientRect();
  const x = canvasRect.left + window.scrollX + tooltip.caretX;
  const y = canvasRect.top + window.scrollY + tooltip.caretY;
  tooltipEl.style.left = `${tooltip.caretX}px`;
  tooltipEl.style.top = `${tooltip.caretY}px`;
  tooltipEl.style.opacity = 1;
  tooltipEl.setAttribute('aria-hidden', 'false');
  tooltipEl.dataset.visible = 'true';
}

function estimarDuracaoRetiradaMeses(saldoInicial, retiradaMensal, taxaAnual) {
  if (saldoInicial <= 0) return 0;
  if (retiradaMensal <= 0) return Number.POSITIVE_INFINITY;

  const taxaMensal = Math.pow(1 + taxaAnual, 1 / 12) - 1;

  if (Math.abs(taxaMensal) < 1e-9) {
    return saldoInicial / retiradaMensal;
  }

  const razao = (saldoInicial * taxaMensal) / retiradaMensal;
  const base = 1 + taxaMensal;
  const termo = 1 - razao;

  if (base <= 0 || termo <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  const meses = -Math.log(termo) / Math.log(base);
  return Number.isFinite(meses) && meses > 0 ? meses : Number.POSITIVE_INFINITY;
}

function computeSuggestedRetirada(scenario) {
  const extras = scenario.extras
    .map(App.sanitizeExtraDraft)
    .map(extra => ({
      month: Number(extra.month),
      amount: App.normalizeNumberInput(extra.amount) || 0,
      recurrence: extra.recurrence,
      year: extra.recurrence === 'specific' ? Number(extra.year) : null,
    }))
    .filter(extra => extra.amount > 0);

  const result = simular(scenario.inicial, scenario.aporte, scenario.taxa / 100, scenario.meta, extras);
  if (result.saldo <= 0) return 0;

  const anosRetiradaAtivo = Math.max(1, Math.round(Number(document.getElementById('anosRetirada').value) || 1));
  const lucroAnualAtivo = scenario.taxa / 100;
  const taxaMensalPosMeta = Math.pow(1 + lucroAnualAtivo, 1 / 12) - 1;
  const mesesPlanejadosRetirada = Math.max(1, anosRetiradaAtivo * 12);

  let sugestao;
  if (Math.abs(taxaMensalPosMeta) < 1e-9) {
    sugestao = result.saldo / mesesPlanejadosRetirada;
  } else {
    const denominator = 1 - Math.pow(1 + taxaMensalPosMeta, -mesesPlanejadosRetirada);
    sugestao = denominator > 0 ? (result.saldo * taxaMensalPosMeta) / denominator : result.saldo / mesesPlanejadosRetirada;
  }

  return Math.max(0, sugestao);
}

function buildTable(currentKey) {
  const tbody = document.getElementById('compare-body');
  tbody.innerHTML = '';

  if (!App.state.savedScenarios.length) {
    tbody.innerHTML = `
      <tr>
        <td class="scenario-empty" colspan="6">
          <div class="scenario-empty-state">
            <span>Nenhum cenário salvo ainda.</span>
            <div class="scenario-empty-actions">
              <button type="button" class="scenario-transfer-btn scenario-empty-add-btn" data-empty-add>Adicionar</button>
              <button type="button" class="scenario-transfer-btn scenario-empty-import-btn" data-empty-import>Importar</button>
            </div>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  App.state.savedScenarios.forEach(scenario => {
    const row = document.createElement('tr');
    const isSelected = scenario.id === App.state.selectedScenarioId;

    if (scenario.id === currentKey) row.className = 'current-row';
    if (isSelected) row.className = 'selected-row';

    row.innerHTML = `
      <td>${App.escapeHtml(scenario.name)}</td>
      <td class="highlight">${App.fmtFull(scenario.inicial)}</td>
      <td class="highlight">${App.fmtFull(scenario.aporte)}</td>
      <td>${scenario.taxa.toFixed(2).replace('.', ',')}% a.a.</td>
      <td>${App.fmtFull(scenario.meta)}</td>
      <td>
        <button type="button" class="scenario-select-btn${isSelected ? ' scenario-select-btn--active' : ''}" data-scenario-select="${App.escapeHtml(scenario.id)}">${isSelected ? 'Selecionado' : 'Selecionar'}</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function calcular(options = {}) {
  const changedControlId = typeof options === 'string' ? options : options.changedControlId;
  const postGoalControlIds = new Set(['anosRetirada', 'retirada', 'lucro']);
  const shouldSkipPrimaryChartRebuild = Boolean(changedControlId && postGoalControlIds.has(changedControlId));

  const selectedScenario = App.state.selectedScenarioId
    ? App.state.savedScenarios.find(scenario => scenario.id === App.state.selectedScenarioId)
    : null;

  const anosRetirada = Number(document.getElementById('anosRetirada').value);
  const retirada = Number(document.getElementById('retirada').value);
  const lucro = Number(document.getElementById('lucro').value);

  App.saveControlValues();
  App.syncDisplayValues();

  const accumulation = selectedScenario
    ? simular(
        selectedScenario.inicial,
        selectedScenario.aporte,
        selectedScenario.taxa / 100,
        selectedScenario.meta,
        selectedScenario.extras
          .map(App.sanitizeExtraDraft)
          .map(extra => ({
            month: Number(extra.month),
            amount: App.normalizeNumberInput(extra.amount) || 0,
            recurrence: extra.recurrence,
            year: extra.recurrence === 'specific' ? Number(extra.year) : null,
          }))
          .filter(extra => extra.amount > 0)
      )
    : simular(0, 0, 0, 0, []);

  // Rendimento apos a meta segue a mesma taxa definida na fase de acumulacao.
  const taxaAnualRendimento = selectedScenario ? selectedScenario.taxa / 100 : 0;

  const anosRetiradaAtivo = Math.max(1, Math.round(anosRetirada));
  const retiradaMensalAtiva = retirada;
  const lucroAnualAtivo = lucro / 100;
  const retiradaProjection = simularRetirada(accumulation.saldo, retiradaMensalAtiva, lucroAnualAtivo);

  const allScenarioSeries = App.state.savedScenarios.map(scenario => {
    const scenarioExtras = scenario.extras
      .map(App.sanitizeExtraDraft)
      .map(extra => ({
        month: Number(extra.month),
        amount: App.normalizeNumberInput(extra.amount) || 0,
        recurrence: extra.recurrence,
        year: extra.recurrence === 'specific' ? Number(extra.year) : null,
      }))
      .filter(extra => extra.amount > 0);

    return {
      scenario,
      result: simular(scenario.inicial, scenario.aporte, scenario.taxa / 100, scenario.meta, scenarioExtras),
    };
  });

  const chartScenarioSeries = !selectedScenario
    ? allScenarioSeries.filter(item => item.scenario.visible !== false)
    : allScenarioSeries.filter(item => item.scenario.id === selectedScenario.id);
  const chartLabels = App.buildChartLabels({ labels: [] }, chartScenarioSeries.map(item => item.result));

  const chartLegendDot = document.getElementById('chart-legend-dot');
  if (chartLegendDot) {
    chartLegendDot.style.background = selectedScenario ? App.normalizeScenarioColor(selectedScenario.color) : '#c8f060';
  }

  const anosC = Math.floor(accumulation.meses / 12);
  const mC = accumulation.meses % 12;
  document.getElementById('c-tempo').textContent = anosC + ' anos' + (mC ? ' e ' + mC + ' meses' : '');
  document.getElementById('c-tempo-sub').textContent = accumulation.meses + ' meses no total';

  const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dataMetaEl = document.getElementById('c-data-meta');
  if (accumulation.meses > 0 && accumulation.meses < App.MAX_SIMULATION_MONTHS) {
    const base = App.state.lastModified ? new Date(App.state.lastModified) : new Date();
    const dataFinal = new Date(base.getFullYear(), base.getMonth() + accumulation.meses, 1);
    dataMetaEl.textContent = 'Previsão: ' + MESES_PT[dataFinal.getMonth()] + ' de ' + dataFinal.getFullYear();
  } else {
    dataMetaEl.textContent = '';
  }
  document.getElementById('c-pat').textContent = App.fmt(accumulation.saldo);
  document.getElementById('c-pat-sub').textContent = App.fmtFull(Math.round(accumulation.saldo));
  document.getElementById('c-inv').textContent = App.fmt(accumulation.total);
  document.getElementById('c-inv-sub').textContent = App.fmtFull(Math.round(accumulation.total));

  const ganho = accumulation.saldo - accumulation.total;
  const ganhoPercentual = accumulation.saldo > 0 ? Math.round(ganho / accumulation.saldo * 100) : 0;
  document.getElementById('c-juros').textContent = App.fmt(ganho);
  document.getElementById('c-juros-sub').textContent = ganhoPercentual + '% do patrimônio';

  const taxaMensalRendimento = Math.pow(1 + taxaAnualRendimento, 1 / 12) - 1;
  const rendimentoMes = accumulation.saldo * taxaMensalRendimento;
  const rendimentoAno = accumulation.saldo * taxaAnualRendimento;
  const rendimentoDia = rendimentoAno / 365;

  const taxaMensalPosMeta = Math.pow(1 + lucroAnualAtivo, 1 / 12) - 1;
  const mesesPlanejadosRetirada = Math.max(1, anosRetiradaAtivo * 12);
  let sugestaoRetiradaMensal = 0;
  if (accumulation.saldo > 0) {
    if (Math.abs(taxaMensalPosMeta) < 1e-9) {
      sugestaoRetiradaMensal = accumulation.saldo / mesesPlanejadosRetirada;
    } else {
      const denominator = 1 - Math.pow(1 + taxaMensalPosMeta, -mesesPlanejadosRetirada);
      sugestaoRetiradaMensal = denominator > 0
        ? (accumulation.saldo * taxaMensalPosMeta) / denominator
        : accumulation.saldo / mesesPlanejadosRetirada;
    }
  }

  sugestaoRetiradaMensal = Math.max(0, sugestaoRetiradaMensal);

  document.getElementById('r-mes').textContent = App.fmt(rendimentoMes);
  document.getElementById('r-mes-sub').textContent = App.fmtFull(Math.round(rendimentoMes)) + '/mês';
  document.getElementById('r-ano').textContent = App.fmt(rendimentoAno);
  document.getElementById('r-ano-sub').textContent = App.fmtFull(Math.round(rendimentoAno)) + '/ano';
  document.getElementById('r-dia').textContent = App.fmt(rendimentoDia);
  document.getElementById('r-dia-sub').textContent = App.fmtFull(Math.round(rendimentoDia)) + '/dia';

  const duracaoExataMeses = estimarDuracaoRetiradaMeses(accumulation.saldo, retiradaMensalAtiva, lucroAnualAtivo);
  const duracaoFinita = Number.isFinite(duracaoExataMeses);
  const duracaoMesesArredondada = duracaoFinita ? Math.max(1, Math.ceil(duracaoExataMeses)) : 0;
  const withdrawalYears = Math.floor(duracaoMesesArredondada / 12);
  const withdrawalMonths = duracaoMesesArredondada % 12;
  const withdrawalHorizonLabel = duracaoFinita
    ? withdrawalYears + ' anos' + (withdrawalMonths ? ' e ' + withdrawalMonths + ' meses' : '')
    : 'Não zera';

  document.getElementById('w-tempo').textContent = accumulation.saldo > 0 ? withdrawalHorizonLabel : '—';
  document.getElementById('w-tempo-sub').textContent = accumulation.saldo > 0
    ? (duracaoFinita
      ? App.fmtFull(Math.round(retiradaMensalAtiva)) + '/mês até zerar'
      : 'Com essa retirada, o patrimônio não zera no modelo')
    : 'Informe uma meta para iniciar a fase de retirada';
  document.getElementById('w-total').textContent = App.fmt(retiradaProjection.totalRetirado);
  document.getElementById('w-total-sub').textContent = App.fmtFull(Math.round(retiradaProjection.totalRetirado)) + ' acumulados';
  document.getElementById('w-saldo').textContent = App.fmt(retiradaProjection.saldo);
  document.getElementById('w-saldo-sub').textContent = retiradaProjection.limitadoPeloHorizonte
    ? 'Saldo ao fim do horizonte de 50 anos'
    : App.fmtFull(Math.round(retiradaProjection.saldo));
  document.getElementById('w-sugestao').textContent = App.fmtFull(sugestaoRetiradaMensal);
  document.getElementById('w-sugestao-sub').textContent = sugestaoRetiradaMensal > 0
    ? App.fmtFull(sugestaoRetiradaMensal) + '/mês considerando rendimento pós-meta por ' + anosRetiradaAtivo + ' anos'
    : 'Sem patrimônio para projetar sugestão de retirada';

  const chartTheme = App.getChartThemePalette();
  const chartTooltipEl = document.getElementById('chart-tooltip');
  const withdrawalChartTooltipEl = document.getElementById('withdrawal-chart-tooltip');

  const chartLegendDotAportado = document.getElementById('chart-legend-dot-aportado');
  if (chartLegendDotAportado) {
    chartLegendDotAportado.style.background = chartTheme.aportadoLine;
  }

  if (!shouldSkipPrimaryChartRebuild) {
    if (App.state.chartInst) App.state.chartInst.destroy();

    const chartDatasets = chartScenarioSeries.map(({ scenario, result }) => {
      const isSelectedSeries = scenario.id === App.state.selectedScenarioId;
      const seriesColor = App.normalizeScenarioColor(scenario.color);

      return {
        label: 'Patrimônio projetado',
        data: App.alignSeriesData(result.pat, chartLabels.length),
        borderColor: seriesColor,
        backgroundColor: isSelectedSeries ? App.hexToRgba(seriesColor, 0.16) : 'transparent',
        fill: isSelectedSeries,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: isSelectedSeries ? 2.2 : 1.6,
        borderDash: isSelectedSeries ? [] : [6, 4],
      };
    });

    if (selectedScenario && chartScenarioSeries.length) {
      chartDatasets.push({
        label: 'Total aportado',
        data: App.alignSeriesData(chartScenarioSeries[0].result.inv, chartLabels.length),
        borderColor: chartTheme.aportadoLine,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.35,
        pointRadius: 0,
        borderWidth: 1.6,
        borderDash: [4, 4],
      });
    }

    App.state.chartInst = new Chart(document.getElementById('chart'), {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: chartDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        hover: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: context => renderHtmlTooltip(context.chart, context.tooltip, chartTooltipEl),
          }
        },
        scales: {
          y: {
            ticks: {
              callback: value => value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' : value >= 1000 ? (value / 1000) + 'k' : value,
              font: { family: 'DM Mono', size: 10 },
              color: chartTheme.axisText,
            },
            grid: { color: chartTheme.yGrid },
            border: { color: 'transparent' },
          },
          x: {
            ticks: { font: { family: 'DM Mono', size: 10 }, color: chartTheme.axisText, maxTicksLimit: 10 },
            grid: { display: false },
            border: { color: 'transparent' },
          }
        }
      }
    });
  }

  const withdrawalPrimaryColor = selectedScenario ? App.normalizeScenarioColor(selectedScenario.color) : '#c8f060';

  const withdrawalLegendDotPat = document.getElementById('withdrawal-legend-dot-pat');
  if (withdrawalLegendDotPat) withdrawalLegendDotPat.style.background = withdrawalPrimaryColor;

  const withdrawalLegendDotRetirado = document.getElementById('withdrawal-legend-dot-retirado');
  if (withdrawalLegendDotRetirado) withdrawalLegendDotRetirado.style.background = chartTheme.aportadoLine;

  if (App.state.withdrawalChartInst) App.state.withdrawalChartInst.destroy();
  App.state.withdrawalChartInst = new Chart(document.getElementById('withdrawal-chart'), {
    type: 'line',
    data: {
      labels: retiradaProjection.labels,
      datasets: [
        {
          label: 'Patrimônio restante',
          data: retiradaProjection.pat,
          borderColor: withdrawalPrimaryColor,
          backgroundColor: App.hexToRgba(withdrawalPrimaryColor, 0.16),
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Total retirado',
          data: retiradaProjection.retiradas,
          borderColor: chartTheme.aportadoLine,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 1.8,
          borderDash: [6, 4],
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      hover: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: context => renderHtmlTooltip(context.chart, context.tooltip, withdrawalChartTooltipEl),
        }
      },
      scales: {
        y: {
          ticks: {
            callback: value => value >= 1000000 ? (value / 1000000).toFixed(1) + 'M' : value >= 1000 ? (value / 1000) + 'k' : value,
            font: { family: 'DM Mono', size: 10 },
            color: chartTheme.axisText,
          },
          grid: { color: chartTheme.yGrid },
          border: { color: 'transparent' },
        },
        x: {
          ticks: { font: { family: 'DM Mono', size: 10 }, color: chartTheme.axisText, maxTicksLimit: 10 },
          grid: { display: false },
          border: { color: 'transparent' },
        }
      }
    }
  });

  buildTable(null);
  renderSelectedScenarioPanel();
}

function renderSelectedScenarioPanel() {
  const container = document.getElementById('selected-scenario-content');
  if (!container) return;

  const scenario = App.state.savedScenarios.find(item => item.id === App.state.selectedScenarioId);

  if (!scenario) {
    container.innerHTML = '<p class="extra-help">Nenhum cenário selecionado. Abra "Cenários" e clique em "Selecionar" em um item da lista para ver os detalhes aqui.</p>';
    return;
  }

  const activeExtras = scenario.extras
    .map(App.sanitizeExtraDraft)
    .filter(extra => (App.normalizeNumberInput(extra.amount) || 0) > 0);

  const extrasHtml = activeExtras.length
    ? `
      <div class="compare-wrap">
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th>Valor</th>
              <th>Recorrência</th>
            </tr>
          </thead>
          <tbody>
            ${activeExtras.map(extra => `
              <tr>
                <td>${App.escapeHtml(App.EXTRA_MONTHS[extra.month - 1] || extra.month)}</td>
                <td>${App.fmtFull(App.normalizeNumberInput(extra.amount) || 0)}</td>
                <td>${extra.recurrence === 'specific' ? `Ano ${App.escapeHtml(extra.year)}` : 'Todo ano'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    : '<div class="extra-empty">Nenhum aporte extra configurado.</div>';

  container.innerHTML = `
    <div class="selected-scenario-header">
      <span class="scenario-dot" style="background:${App.escapeHtml(App.normalizeScenarioColor(scenario.color))}"></span>
      <span class="selected-scenario-name">${App.escapeHtml(scenario.name)}</span>
      <div class="selected-scenario-header-actions">
        <button type="button" class="scenario-transfer-btn" id="edit-selected-scenario">Editar</button>
        <button type="button" class="scenario-delete-btn" id="delete-selected-scenario">Excluir</button>
      </div>
    </div>

    <div class="panel-title">Parâmetros</div>
    <div class="selected-scenario-params">
      <div class="selected-scenario-param">
        <span class="selected-scenario-param-label">Capital inicial</span>
        <span class="selected-scenario-param-value">${App.fmtFull(scenario.inicial)}</span>
      </div>
      <div class="selected-scenario-param">
        <span class="selected-scenario-param-label">Aporte mensal</span>
        <span class="selected-scenario-param-value">${App.fmtFull(scenario.aporte)}</span>
      </div>
      <div class="selected-scenario-param">
        <span class="selected-scenario-param-label">Rendimento Anual</span>
        <span class="selected-scenario-param-value">${scenario.taxa.toFixed(2).replace('.', ',')}%</span>
      </div>
      <div class="selected-scenario-param">
        <span class="selected-scenario-param-label">Meta</span>
        <span class="selected-scenario-param-value">${App.fmtFull(scenario.meta)}</span>
      </div>
    </div>

    <hr class="divider">

    <div class="panel-title">Aportes extras</div>
    ${extrasHtml}
  `;

  const editBtn = document.getElementById('edit-selected-scenario');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      App.loadScenarioIntoForm(scenario);
      App.calcular();
      App.syncDisplayValues();
      App.openScenarioFormModal();
    });
  }

  const deleteBtn = document.getElementById('delete-selected-scenario');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      App.openConfirmDeleteModal(`Tem certeza que deseja excluir o cenário "${scenario.name}"? Essa ação não pode ser desfeita.`, () => {
        const index = App.state.savedScenarios.findIndex(item => item.id === scenario.id);
        if (index === -1) return;

        App.state.savedScenarios.splice(index, 1);
        App.state.selectedScenarioId = null;
        App.resetScenarioForm();
        App.calcular();
        App.syncDisplayValues();
      });
    });
  }
}

Object.assign(App, {
  simular,
  simularRetirada,
  estimarDuracaoRetiradaMeses,
  computeSuggestedRetirada,
  renderSelectedScenarioPanel,
  buildTable,
  calcular,
});
})();