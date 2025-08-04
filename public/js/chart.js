import { calculateDelayInMinutes } from './utils.js';

let delayChart = null;

/**
 * Lida com cliques na tela do gráfico para identificar qual barra foi clicada.
 * @param {Event} event O evento de clique.
 * @param {function(string): void} onBarClick A função de callback.
 */
const handleChartClick = (event, onBarClick) => {
    if (!delayChart) return;
    const points = delayChart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
    if (points.length) {
        const firstPoint = points[0];
        const label = delayChart.data.labels[firstPoint.index];
        onBarClick(label);
    }
};

/**
 * Renderiza ou atualiza o gráfico de ofensores com base nos dados fornecidos.
 * @param {Array} data Os dados a serem exibidos no gráfico.
 * @param {function(string): void} onBarClick A função de callback a ser executada quando uma barra é clicada.
 */
export const renderOffendersChart = (data, onBarClick) => {
    const clientOffenses = data.reduce((acc, record) => {
        const delay = calculateDelayInMinutes(record);
        if (record.Cliente) {
            if (!acc[record.Cliente]) {
                acc[record.Cliente] = { delayedCount: 0, total: 0 };
            }
            if (delay > 0) {
                acc[record.Cliente].delayedCount++;
            }
            acc[record.Cliente].total++;
        }
        return acc;
    }, {});

    const sortedClients = Object.entries(clientOffenses)
        .sort(([, a], [, b]) => b.delayedCount - a.delayedCount)
        .slice(0, 10);

    const labels = sortedClients.map(([cliente]) => cliente);
    const chartData = sortedClients.map(([, data]) => data.delayedCount);
    const theme = localStorage.getItem('theme');
    const textColor = theme === 'dark' ? '#E5E7EB' : '#6B7280';
    const chartCanvas = document.getElementById('delay-chart');
    if (!chartCanvas) return;

    // Remove o listener anterior para evitar duplicados
    chartCanvas.onclick = null;

    if (delayChart) {
        delayChart.data.labels = labels;
        delayChart.data.datasets[0].data = chartData;
        delayChart.update();
    } else {
        const ctx = chartCanvas.getContext('2d');
        delayChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Qtd. Processos Atrasados',
                    data: chartData,
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                indexAxis: 'y',
                scales: { x: { beginAtZero: true, ticks: { color: textColor, stepSize: 1 } }, y: { ticks: { color: textColor } } },
                plugins: { legend: { display: true, labels: { color: textColor } } }
                // A opção onClick foi removida daqui para usar um método mais fiável
            }
        });
    }
    // Adiciona o novo listener de clique, mais robusto
    chartCanvas.onclick = (event) => handleChartClick(event, onBarClick);
};

/**
 * Atualiza as cores do gráfico quando o tema muda.
 */
export const updateChartTheme = () => {
    if (!delayChart) return;
    const theme = localStorage.getItem('theme');
    const textColor = theme === 'dark' ? '#E5E7EB' : '#6B7280';
    delayChart.options.scales.x.ticks.color = textColor;
    delayChart.options.scales.y.ticks.color = textColor;
    delayChart.options.plugins.legend.labels.color = textColor;
    delayChart.update();
};