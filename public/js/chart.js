import { calculateDelayInMinutes } from './utils.js';

let delayChart = null;
let reasonsChart = null;

const handleChartClick = (event, onBarClick) => {
  if (!delayChart) return;
  const points = delayChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
  if (points.length) {
    const first = points[0];
    const label = delayChart.data.labels[first.index];
    onBarClick(label);
  }
};

export const renderOffendersChart = (data, onBarClick) => {
  const el = document.getElementById('delay-chart');
  if (!el) return;

  const counts = {};
  data.forEach(item => {
    const delay = calculateDelayInMinutes(item);
    if (delay > 0 && item.Cliente) counts[item.Cliente] = (counts[item.Cliente]||0)+1;
  });

  const labels = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]);
  const values = labels.map(l=>counts[l]);

  if (delayChart) delayChart.destroy();
  delayChart = new Chart(el.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Qtde com Atraso', data: values, borderWidth: 1 }] },
    options: {
      maintainAspectRatio:false,
      indexAxis: 'y',
      responsive: true,
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
      plugins: { legend: { display: true } }
    }
  });

  el.onclick = (e) => handleChartClick(e, onBarClick);
};

export const renderDelayReasonsChart = (data) => {
  const el = document.getElementById('reasons-chart');
  if (!el) return;
  const counts = {};
  data.forEach(r => {
    const d = calculateDelayInMinutes(r);
    if (d > 0) {
      const k = (r.JustificativaAtraso || 'N/A').trim();
      counts[k] = (counts[k]||0)+1;
    }
  });
  const labels = Object.keys(counts);
  const values = labels.map(l=>counts[l]);

  if (reasonsChart) reasonsChart.destroy();
  reasonsChart = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values }] },
    options: { maintainAspectRatio:false, responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
};

export const updateChartTheme = () => {
  if (delayChart) delayChart.update();
  if (reasonsChart) reasonsChart.update();
};