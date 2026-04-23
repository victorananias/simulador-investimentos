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

function buildTable(currentKey) {
  const tbody = document.getElementById('compare-body');
  tbody.innerHTML = '';

  if (!App.state.savedScenarios.length) {
    tbody.innerHTML = `
      <tr>
        <td class="scenario-empty" colspan="10">
          <div class="scenario-empty-state">
            <span>Nenhum cenário salvo ainda.</span>
            <button type="button" class="scenario-transfer-btn scenario-empty-import-btn" data-empty-import>Importar JSON</button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  App.state.savedScenarios.forEach(scenario => {
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
    const taxaMensalPosMeta = Math.pow(1 + scenario.lucro / 100, 1 / 12) - 1;
    const rendMes = result.saldo * taxaMensalPosMeta;
    const row = document.createElement('tr');
    const isSelected = scenario.id === App.state.selectedScenarioId;

    if (scenario.id === currentKey) row.className = 'current-row';
    if (isSelected) row.className = 'selected-row';

    row.innerHTML = `
      <td>${App.escapeHtml(scenario.name)}</td>
      <td><input class="scenario-visible-check" type="checkbox" data-scenario-visible="${App.escapeHtml(scenario.id)}"${scenario.visible === false ? '' : ' checked'}></td>
      <td><input class="scenario-color-input" type="color" data-scenario-color="${App.escapeHtml(scenario.id)}" value="${App.escapeHtml(App.normalizeScenarioColor(scenario.color))}" aria-label="Cor do cenário ${App.escapeHtml(scenario.name)}"></td>
      <td class="highlight">${App.fmtFull(scenario.inicial)}</td>
      <td class="highlight">${App.fmtFull(scenario.aporte)}</td>
      <td>${scenario.taxa.toFixed(2).replace('.', ',')}% a.a.</td>
      <td>${App.fmtFull(scenario.meta)}</td>
      <td class="highlight">${App.mesesParaTexto(result.meses)}</td>
      <td class="highlight">${App.fmt(rendMes)}</td>
      <td>
        <button type="button" class="scenario-select-btn${isSelected ? ' scenario-select-btn--active' : ''}" data-scenario-select="${App.escapeHtml(scenario.id)}">${isSelected ? 'Selecionado' : 'Selecionar'}</button>
        <button type="button" class="scenario-delete-btn" data-scenario-delete="${App.escapeHtml(scenario.id)}">Excluir</button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function calcular() {
  const selectedScenario = App.state.selectedScenarioId
    ? App.state.savedScenarios.find(scenario => scenario.id === App.state.selectedScenarioId)
    : null;

  const inicial = Number(document.getElementById('inicial').value);
  const aporte = Number(document.getElementById('aporte').value);
  const taxaAnual = Number(document.getElementById('juros').value) / 100;
  const meta = Number(document.getElementById('meta').value);
  const retirada = Number(document.getElementById('retirada').value);
  const lucro = Number(document.getElementById('lucro').value);
  const extras = App.getActiveExtras();

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
    : simular(inicial, aporte, taxaAnual, meta, extras);

  const retiradaMensalAtiva = selectedScenario ? selectedScenario.retirada : retirada;
  const lucroAnualAtivo = (selectedScenario ? selectedScenario.lucro : lucro) / 100;
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

  const savedScenarioSeries = allScenarioSeries.filter(item => item.scenario.visible !== false);
  const chartLabels = App.buildChartLabels({ labels: [] }, savedScenarioSeries.map(item => item.result));

  const anosC = Math.floor(accumulation.meses / 12);
  const mC = accumulation.meses % 12;
  document.getElementById('c-tempo').textContent = anosC + ' anos' + (mC ? ' e ' + mC + ' meses' : '');
  document.getElementById('c-tempo-sub').textContent = accumulation.meses + ' meses no total';
  document.getElementById('c-pat').textContent = App.fmt(accumulation.saldo);
  document.getElementById('c-pat-sub').textContent = App.fmtFull(Math.round(accumulation.saldo));
  document.getElementById('c-inv').textContent = App.fmt(accumulation.total);
  document.getElementById('c-inv-sub').textContent = App.fmtFull(Math.round(accumulation.total));

  const ganho = accumulation.saldo - accumulation.total;
  const ganhoPercentual = accumulation.saldo > 0 ? Math.round(ganho / accumulation.saldo * 100) : 0;
  document.getElementById('c-juros').textContent = App.fmt(ganho);
  document.getElementById('c-juros-sub').textContent = ganhoPercentual + '% do patrimônio';

  const taxaMensalPosMeta = Math.pow(1 + lucroAnualAtivo, 1 / 12) - 1;
  const rendimentoMes = accumulation.saldo * taxaMensalPosMeta;
  const rendimentoAno = accumulation.saldo * lucroAnualAtivo;
  const rendimentoDia = rendimentoAno / 365;

  document.getElementById('r-mes').textContent = App.fmt(rendimentoMes);
  document.getElementById('r-mes-sub').textContent = App.fmtFull(Math.round(rendimentoMes)) + '/mês';
  document.getElementById('r-ano').textContent = App.fmt(rendimentoAno);
  document.getElementById('r-ano-sub').textContent = App.fmtFull(Math.round(rendimentoAno)) + '/ano';
  document.getElementById('r-dia').textContent = App.fmt(rendimentoDia);
  document.getElementById('r-dia-sub').textContent = App.fmtFull(Math.round(rendimentoDia)) + '/dia';

  const withdrawalYears = Math.floor(retiradaProjection.meses / 12);
  const withdrawalMonths = retiradaProjection.meses % 12;
  const withdrawalHorizonLabel = retiradaProjection.limitadoPeloHorizonte
    ? 'Mais de 50 anos'
    : withdrawalYears + ' anos' + (withdrawalMonths ? ' e ' + withdrawalMonths + ' meses' : '');

  document.getElementById('w-tempo').textContent = retiradaProjection.meses ? withdrawalHorizonLabel : '—';
  document.getElementById('w-tempo-sub').textContent = retiradaProjection.meses
    ? (retiradaProjection.esgotado ? 'Patrimônio zerado ao final da projeção' : 'Patrimônio ainda positivo ao fim da projeção')
    : 'Informe uma meta para iniciar a fase de retirada';
  document.getElementById('w-total').textContent = App.fmt(retiradaProjection.totalRetirado);
  document.getElementById('w-total-sub').textContent = App.fmtFull(Math.round(retiradaProjection.totalRetirado)) + ' acumulados';
  document.getElementById('w-saldo').textContent = App.fmt(retiradaProjection.saldo);
  document.getElementById('w-saldo-sub').textContent = retiradaProjection.limitadoPeloHorizonte
    ? 'Saldo ao fim do horizonte de 50 anos'
    : App.fmtFull(Math.round(retiradaProjection.saldo));

  const chartTheme = App.getChartThemePalette();

  if (App.state.chartInst) App.state.chartInst.destroy();
  App.state.chartInst = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      labels: chartLabels,
      datasets: savedScenarioSeries.map(({ scenario, result }) => {
        const isSelectedSeries = scenario.id === App.state.selectedScenarioId;
        const seriesColor = App.normalizeScenarioColor(scenario.color);

        return {
          label: scenario.name,
          data: App.alignSeriesData(result.pat, chartLabels.length),
          borderColor: seriesColor,
          backgroundColor: isSelectedSeries ? App.hexToRgba(seriesColor, 0.16) : 'transparent',
          fill: isSelectedSeries,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: isSelectedSeries ? 2.2 : 1.6,
          borderDash: isSelectedSeries ? [] : [6, 4],
        };
      })
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme.tooltipBg,
          borderColor: chartTheme.tooltipBorder,
          borderWidth: 1,
          titleColor: chartTheme.tooltipTitle,
          bodyColor: chartTheme.tooltipBody,
          titleFont: { family: 'DM Mono', size: 11 },
          bodyFont: { family: 'DM Mono', size: 12 },
          callbacks: {
            label: context => context.dataset.label + ': R$ ' + (context.raw || 0).toLocaleString('pt-BR')
          }
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

  if (App.state.withdrawalChartInst) App.state.withdrawalChartInst.destroy();
  App.state.withdrawalChartInst = new Chart(document.getElementById('withdrawal-chart'), {
    type: 'line',
    data: {
      labels: retiradaProjection.labels,
      datasets: [
        {
          label: 'Patrimônio restante',
          data: retiradaProjection.pat,
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.14)',
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Total retirado',
          data: retiradaProjection.retiradas,
          borderColor: '#4ade80',
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
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: chartTheme.tooltipBg,
          borderColor: chartTheme.tooltipBorder,
          borderWidth: 1,
          titleColor: chartTheme.tooltipTitle,
          bodyColor: chartTheme.tooltipBody,
          titleFont: { family: 'DM Mono', size: 11 },
          bodyFont: { family: 'DM Mono', size: 12 },
          callbacks: {
            label: context => context.dataset.label + ': R$ ' + (context.raw || 0).toLocaleString('pt-BR')
          }
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
}

Object.assign(App, {
  simular,
  simularRetirada,
  buildTable,
  calcular,
});
})();