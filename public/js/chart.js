// chart.js
// Gráficos do dashboard com Chart.js

let delayChartInstance = null;
let reasonsChartInstance = null;

// Cores para os gráficos
const CHART_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40'
];

/**
 * Renderiza gráfico de barras horizontal com os embarcadores que mais têm atrasos
 * @param {Array} operations - Array de operações
 * @param {Function} onBarClick - Callback quando clicar em uma barra
 */
export function renderOffendersChart(operations, onBarClick) {
  const canvas = document.getElementById('delay-chart');
  if (!canvas) return;

  // Agrupa operações atrasadas por embarcador
  const delaysByShipper = {};
  operations.forEach(op => {
    const shipper = op.Cliente || 'Sem embarcador';
    const delayMin = calculateDelayInMinutes(op);
    
    if (delayMin > 0) {
      if (!delaysByShipper[shipper]) {
        delaysByShipper[shipper] = 0;
      }
      delaysByShipper[shipper]++;
    }
  });

  // Ordena por quantidade de atrasos (descendente) e pega top 10
  const sorted = Object.entries(delaysByShipper)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = sorted.map(([name]) => name);
  const data = sorted.map(([, count]) => count);

  // Destrói chart anterior se existir
  if (delayChartInstance) {
    delayChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  delayChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Operações com Atraso',
        data: data,
        backgroundColor: CHART_COLORS[0],
        borderColor: CHART_COLORS[0],
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y', // Faz o gráfico ser horizontal
      responsive: true,
      maintainAspectRatio: false,
      onClick: (event, elements) => {
        if (elements.length > 0 && onBarClick) {
          const index = elements[0].index;
          const shipperName = labels[index];
          onBarClick(shipperName);
        }
      },
      plugins: {
        legend: {
          display: false
        },
        title: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.parsed.x} operações atrasadas`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            stepSize: 1
          },
          grid: {
            display: true
          }
        },
        y: {
          grid: {
            display: false
          }
        }
      }
    }
  });
}

/**
 * Renderiza gráfico de pizza com os principais motivos de atraso
 * @param {Array} operations - Array de operações
 */
export function renderDelayReasonsChart(operations) {
  const canvas = document.getElementById('reasons-chart');
  if (!canvas) return;

  // Agrupa por motivo de atraso
  const reasonCounts = {};
  operations.forEach(op => {
    const delayMin = calculateDelayInMinutes(op);
    if (delayMin > 0) {
      let reason = op.JustificativaAtraso || op.motivo_atraso || 'Não informado';
      reason = reason.trim() || 'Não informado';
      
      if (!reasonCounts[reason]) {
        reasonCounts[reason] = 0;
      }
      reasonCounts[reason]++;
    }
  });

  // Ordena por frequência e pega top 8
  const sorted = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const labels = sorted.map(([reason]) => {
    // Trunca labels muito longos
    return reason.length > 40 ? reason.substring(0, 37) + '...' : reason;
  });
  const data = sorted.map(([, count]) => count);

  // Destrói chart anterior se existir
  if (reasonsChartInstance) {
    reasonsChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  reasonsChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: CHART_COLORS,
        borderColor: '#ffffff',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          align: 'center',
          labels: {
            boxWidth: 15,
            padding: 10,
            font: {
              size: 11
            },
            generateLabels: function(chart) {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                return data.labels.map((label, i) => {
                  const value = data.datasets[0].data[i];
                  const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                  const percentage = ((value / total) * 100).toFixed(1);
                  
                  return {
                    text: `${label} (${percentage}%)`,
                    fillStyle: data.datasets[0].backgroundColor[i],
                    hidden: false,
                    index: i
                  };
                });
              }
              return [];
            }
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ${value} (${percentage}%)`;
            }
          }
        }
      },
      layout: {
        padding: {
          left: 20,
          right: 20,
          top: 20,
          bottom: 20
        }
      }
    }
  });
}

/**
 * Atualiza o tema dos gráficos (para modo escuro/claro)
 * @param {string} theme - 'light' ou 'dark'
 */
export function updateChartTheme(theme) {
  const textColor = theme === 'dark' ? '#e5e7eb' : '#374151';
  const gridColor = theme === 'dark' ? '#374151' : '#e5e7eb';

  if (delayChartInstance) {
    delayChartInstance.options.scales.x.ticks.color = textColor;
    delayChartInstance.options.scales.y.ticks.color = textColor;
    delayChartInstance.options.scales.x.grid.color = gridColor;
    delayChartInstance.options.scales.y.grid.color = gridColor;
    delayChartInstance.update();
  }

  if (reasonsChartInstance) {
    reasonsChartInstance.options.plugins.legend.labels.color = textColor;
    reasonsChartInstance.update();
  }
}

// Helper para calcular atraso (duplicado do utils.js para este módulo funcionar standalone)
function calculateDelayInMinutes(op) {
  const sched = parseDate(op?.DataProgramada);
  if (!sched) return 0;

  const actual = parseDate(op?.DataChegada) || new Date();
  const diffMs = actual.getTime() - sched.getTime();
  const diffMin = Math.round(diffMs / 60000);

  return diffMin > 0 ? diffMin : 0;
}

function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  // se veio número tipo Excel
  if (typeof v === "number") {
    const d = excelSerialToDate(v);
    if (d) return d;
  }

  // se é string dd/mm/aaaa...
  if (typeof v === "string") {
    const tryBr = parseBrDateTime(v);
    if (tryBr) return tryBr;

    // tenta ISO / Date nativo
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function excelSerialToDate(val) {
  const serial = Number(val);
  if (!isFinite(serial)) return null;
  const base = new Date(1899, 11, 30);
  const wholeDays = Math.floor(serial);
  const frac = serial - wholeDays;
  const d = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + wholeDays,
    0, 0, 0, 0
  );
  const totalSeconds = Math.round(frac * 24 * 60 * 60);
  d.setSeconds(totalSeconds);
  return d;
}

function parseBrDateTime(str) {
  if (typeof str !== "string") return null;
  const m = str.trim().match(
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "00", min = "00", ss = "00"] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
    0
  );
  return isNaN(d.getTime()) ? null : d;
}