function fmtFull(v) { return 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }
function fmt(v) {
  if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(2).replace('.', ',') + ' M';
  if (v >= 1000) return 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + ' mil';
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
}

let chartInst;

function simular(inicial, aporte, julho, dezembro, taxaAnual, meta) {
  const tm = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  let saldo = inicial, meses = 0, total = inicial;
  const pat = [], inv = [], labels = [];
  while (saldo < meta && meses < 600) {
    meses++;
    const m = ((meses - 1) % 12) + 1;
    let extra = 0;
    if (m === 7) extra += julho;
    if (m === 12) extra += dezembro;
    saldo = saldo * (1 + tm) + aporte + extra;
    total += aporte + extra;
    if (meses % 6 === 0 || meses === 1) {
      const lbl = meses <= 12 ? meses + 'm' : Math.floor(meses / 12) + 'a' + (meses % 12 ? (meses % 12) + 'm' : '');
      labels.push(lbl); pat.push(Math.round(saldo)); inv.push(Math.round(total));
    }
  }
  return { meses, saldo, total, labels, pat, inv };
}

function simularSemExtras(inicial, aporte, taxaAnual, meta) {
  const tm = Math.pow(1 + taxaAnual, 1 / 12) - 1;
  let saldo = inicial, meses = 0;
  const pat = [];
  while (saldo < meta && meses < 600) {
    meses++;
    saldo = saldo * (1 + tm) + aporte;
    if (meses % 6 === 0 || meses === 1) pat.push(Math.round(saldo));
  }
  return { meses, pat };
}

function mesesParaTexto(m) {
  const a = Math.floor(m / 12), r = m % 12;
  return a + ' anos' + (r ? ' e ' + r + ' meses' : '');
}

const SCENARIOS = [
  { label: 'R$ 3k/mês + R$ 5k dez', aporte: 3000, julho: 1000, dezembro: 5000, taxa: 15 },
  { label: 'R$ 4k/mês + R$ 5k dez', aporte: 4000, julho: 1000, dezembro: 5000, taxa: 15 },
  { label: 'R$ 4k/mês + R$ 10k dez', aporte: 4000, julho: 1000, dezembro: 10000, taxa: 15 },
  { label: 'R$ 4k/mês + R$ 10k dez', aporte: 4000, julho: 1000, dezembro: 10000, taxa: 12 },
];

function buildTable(currentKey) {
  const tbody = document.getElementById('compare-body');
  tbody.innerHTML = '';
  const inicial = 27000, meta = 1000000;
  SCENARIOS.forEach(s => {
    const r = simular(inicial, s.aporte, s.julho, s.dezembro, s.taxa / 100, meta);
    const tm = Math.pow(1 + s.taxa / 100, 1 / 12) - 1;
    const rendMes = r.saldo * tm;
    const key = s.label + s.taxa;
    const tr = document.createElement('tr');
    if (key === currentKey) tr.className = 'current-row';
    tr.innerHTML = `
      <td>${s.label}</td>
      <td>${s.taxa}% a.a.</td>
      <td class="highlight">${mesesParaTexto(r.meses)}</td>
      <td class="highlight">${fmt(rendMes)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function calcular() {
  const inicial = +document.getElementById('inicial').value;
  const aporte = +document.getElementById('aporte').value;
  const julho = +document.getElementById('julho').value;
  const dezembro = +document.getElementById('dezembro').value;
  const taxa = +document.getElementById('juros').value;
  const taxaAnual = taxa / 100;
  const meta = +document.getElementById('meta').value;

  document.getElementById('v-inicial').textContent = fmtFull(inicial);
  document.getElementById('v-aporte').textContent = fmtFull(aporte);
  document.getElementById('v-julho').textContent = fmtFull(julho);
  document.getElementById('v-dezembro').textContent = fmtFull(dezembro);
  document.getElementById('v-juros').textContent = taxa.toFixed(1).replace('.', ',') + '%';
  document.getElementById('v-meta').textContent = fmtFull(meta);

  const com = simular(inicial, aporte, julho, dezembro, taxaAnual, meta);
  const sem = simularSemExtras(inicial, aporte, taxaAnual, meta);

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

  const semAligned = com.labels.map((_, i) => sem.pat[i] ?? null);

  if (chartInst) chartInst.destroy();
  chartInst = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      labels: com.labels,
      datasets: [
        {
          label: 'Com extras',
          data: com.pat,
          borderColor: '#c8f060',
          backgroundColor: 'rgba(200,240,96,0.05)',
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'Sem extras',
          data: semAligned,
          borderColor: '#7c6fdb',
          backgroundColor: 'transparent',
          fill: false, tension: 0.35, pointRadius: 0, borderWidth: 1.5,
          borderDash: [5, 4],
        },
        {
          label: 'Aportado',
          data: com.inv,
          borderColor: '#3a3a55',
          backgroundColor: 'transparent',
          fill: false, tension: 0, pointRadius: 0, borderWidth: 1,
          borderDash: [3, 3],
        }
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

['inicial', 'aporte', 'julho', 'dezembro', 'juros', 'meta'].forEach(id => {
  document.getElementById(id).addEventListener('input', calcular);
});

calcular();
