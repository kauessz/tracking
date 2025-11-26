// js/analytics.js - VERSÃO COMPLETA CORRIGIDA
// ✅ CORREÇÕES FINAIS:
// 1. IDs dos canvas corrigidos: chart-coletas, chart-entregas, chart-motivos
// 2. Gráficos de Coletas/Entregas como rosquinhas (doughnut)
// 3. Gráfico de Motivos como barras horizontais
// 4. Gráfico Target com linha vermelha visível
// 5. Não mostra dados falsos quando não há operações

import { Toast, Loading } from "./utilities.js";
import { getApiUrl } from "./config.js";
import { calculateDelayInMinutes } from "./utils.js";

const API_BASE = getApiUrl();

// Estado global do analytics
export const analyticsState = {
  data: null,
  embarcadores: [],
  chartColetas: null,
  chartEntregas: null,
  chartMotivos: null,
  embarcadorChoices: null,
};

// Instância do gráfico Target
let targetChartInstance = null;

// Função para obter o token do módulo principal
let getAuthToken = null;

export function setAuthTokenGetter(getter) {
  getAuthToken = getter;
}

// Carregar embarcadores e criar multi-select
export async function carregarEmbarcadoresAnalytics() {
  try {
    const token = getAuthToken ? getAuthToken() : null;
    if (!token) {
      console.error("❌ Token não disponível para carregar embarcadores");
      return;
    }

    const resp = await fetch(`${API_BASE}/admin/embarcadores`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await resp.json();

    if (data.success && data.items) {
      analyticsState.embarcadores = data.items;

      const selectEl = document.getElementById("analytics-embarcador");
      if (selectEl) {
        selectEl.innerHTML = `
          <option value="">Selecione um ou mais embarcadores</option>
          ${data.items
            .map(
              (e) => `
            <option value="${e.id}">${e.nome_principal}</option> 
          `
            )
            .join("")}
        `;

        // Inicializa Choices.js para multi-select
        if (window.Choices && !analyticsState.embarcadorChoices) {
          analyticsState.embarcadorChoices = new Choices(selectEl, {
            removeItemButton: true,
            shouldSort: false,
            placeholderValue: "Selecione um ou mais embarcadores",
            searchPlaceholderValue: "Buscar...",
            noResultsText: "Nenhum resultado encontrado",
            itemSelectText: "Clique para selecionar",
          });
          console.log("✅ Multi-select de embarcadores inicializado");
        }
      }
    }
  } catch (err) {
    console.error("Erro ao carregar embarcadores:", err);
  }
}

// Buscar analytics com múltiplos embarcadores
export async function buscarAnalytics() {
  try {
    const token = getAuthToken ? getAuthToken() : null;
    if (!token) {
      Toast?.error?.("Erro de autenticação. Recarregue a página.");
      return;
    }

    Loading?.show?.('Carregando analytics...');

    // Pega os valores diretamente da instância do Choices se existir
    let embarcadorIds = [];
    
    if (analyticsState.embarcadorChoices) {
      const values = analyticsState.embarcadorChoices.getValue(true);
      if (Array.isArray(values)) {
        embarcadorIds = values;
      } else if (values) {
        embarcadorIds = [values];
      }
    } else {
      const selectEl = document.getElementById("analytics-embarcador");
      if (selectEl) {
        embarcadorIds = Array.from(selectEl.selectedOptions)
          .map(opt => opt.value)
          .filter(Boolean);
      }
    }

    const dataInicio = document.getElementById("analytics-data-inicio")?.value || "";
    const dataFim = document.getElementById("analytics-data-fim")?.value || "";

    // Construir query string
    const params = new URLSearchParams();
    
    if (embarcadorIds.length > 0) {
      params.append("embarcador_id", embarcadorIds.join(','));
    }
    
    if (dataInicio) params.append("data_inicio", dataInicio);
    if (dataFim) params.append("data_fim", dataFim);

    console.log("🔍 Buscando analytics com filtros:", { ids: embarcadorIds, inicio: dataInicio, fim: dataFim });

    const resp = await fetch(
      `${API_BASE}/admin/analytics/kpis?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const result = await resp.json();

    console.log("📊 Resposta analytics:", result);

    if (!result.success) {
      Toast?.error?.("Erro ao buscar dados: " + (result.error || "desconhecido"));
      return;
    }

    analyticsState.data = result.data;
    renderizarAnalytics();
    Toast?.success?.("Dados carregados com sucesso!");
  } catch (err) {
    console.error("❌ Erro buscarAnalytics:", err);
    Toast?.error?.("Falha ao buscar analytics: " + err.message);
  } finally {
    Loading?.hide?.();
  }
}

// Renderizar todos os dados de analytics
function renderizarAnalytics() {
  if (!analyticsState.data) {
    console.warn("Sem dados para renderizar");
    return;
  }

  const data = analyticsState.data;

  // Resumo geral - desconsidera cancelados
  const totalOpsEl = document.getElementById("kpi-total-ops-analytics");
  const totalColetasEl = document.getElementById("kpi-total-coletas");
  const totalEntregasEl = document.getElementById("kpi-total-entregas");

  const totalNaoCanceladas = (data.resumo.total_operacoes || 0) - (data.resumo.canceladas || 0);
  
  if (totalOpsEl) totalOpsEl.textContent = totalNaoCanceladas;
  if (totalColetasEl) totalColetasEl.textContent = data.resumo.total_coletas;
  if (totalEntregasEl) totalEntregasEl.textContent = data.resumo.total_entregas;

  // Pontualidade geral
  const pont = data.pontualidade_geral;

  const setPontualidade = (prefix, pontData) => {
    const qtdEl = document.getElementById(`${prefix}-qtd`);
    const pctEl = document.getElementById(`${prefix}-pct`);
    if (qtdEl) qtdEl.textContent = pontData.quantidade;
    if (pctEl) pctEl.textContent = (pontData.percentual || 0) + "%";
  };

  setPontualidade("pont-no-prazo", pont.no_prazo);
  setPontualidade("pont-ate1h", pont.ate_1h);
  setPontualidade("pont-2a5h", pont.de_2_a_5h);
  setPontualidade("pont-5a10h", pont.de_5_a_10h);
  setPontualidade("pont-mais10h", pont.mais_10h);

  // Médias de pontualidade
  const mediaColetasEl = document.getElementById("media-coletas");
  const coletasNoPrazoEl = document.getElementById("coletas-no-prazo");
  const coletasTotalEl = document.getElementById("coletas-total");

  if (mediaColetasEl)
    mediaColetasEl.textContent = data.pontualidade_coletas.media + "%";
  if (coletasNoPrazoEl)
    coletasNoPrazoEl.textContent = data.pontualidade_coletas.no_prazo;
  if (coletasTotalEl)
    coletasTotalEl.textContent = data.pontualidade_coletas.total;

  const mediaEntregasEl = document.getElementById("media-entregas");
  const entregasNoPrazoEl = document.getElementById("entregas-no-prazo");
  const entregasTotalEl = document.getElementById("entregas-total");

  if (mediaEntregasEl)
    mediaEntregasEl.textContent = data.pontualidade_entregas.media + "%";
  if (entregasNoPrazoEl)
    entregasNoPrazoEl.textContent = data.pontualidade_entregas.no_prazo;
  if (entregasTotalEl)
    entregasTotalEl.textContent = data.pontualidade_entregas.total;

  // Renderizar gráficos
  renderizarGraficoColetas();
  renderizarGraficoEntregas();
  renderizarGraficoMotivos();
  renderTargetChart();
  wireKPIClickHandlers();
}

// Handlers de click nos KPIs
function wireKPIClickHandlers() {
  const pont = analyticsState.data.pontualidade_geral;
  
  const showOperacoesModal = (categoria, ops) => {
    if (!ops || ops.length === 0) {
      Toast?.info?.(`Nenhuma operação ${categoria}`);
      return;
    }
    
    const modalHTML = `
      <div id="analytics-ops-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="z-index: 9999;">
        <div class="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div class="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
            <div class="flex items-center justify-between">
              <h2 class="text-2xl font-bold">${categoria}</h2>
              <button onclick="document.getElementById('analytics-ops-modal').remove()" 
                class="text-white hover:text-gray-200 text-3xl font-bold">&times;</button>
            </div>
            <p class="text-sm opacity-90 mt-2">Total: ${ops.length} operações</p>
          </div>
          
          <div class="overflow-auto flex-1 p-6">
            <table class="w-full">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="p-3 text-left text-sm font-bold">Booking</th>
                  <th class="p-3 text-left text-sm font-bold">Container</th>
                  <th class="p-3 text-left text-sm font-bold">Embarcador</th>
                  <th class="p-3 text-left text-sm font-bold">Tipo</th>
                  <th class="p-3 text-left text-sm font-bold">Porto</th>
                  <th class="p-3 text-left text-sm font-bold">Prev. Início</th>
                  <th class="p-3 text-left text-sm font-bold">Atraso</th>
                </tr>
              </thead>
              <tbody>
                ${ops.map(op => {
                  const atraso = calculateDelayInMinutes(op);
                  const atrasoStr = atraso > 0 ? `${Math.floor(atraso/60)}h ${atraso%60}m` : 'No Prazo';
                  const atrasoClass = atraso > 0 ? 'text-red-600 font-bold' : 'text-green-600';
                  
                  return `
                    <tr class="border-b hover:bg-gray-50">
                      <td class="p-3 text-sm">${op.booking || '-'}</td>
                      <td class="p-3 text-sm">${op.containers || op.container || '-'}</td>
                      <td class="p-3 text-sm">${op.embarcador_nome || '-'}</td>
                      <td class="p-3 text-sm">${op.tipo_programacao || '-'}</td>
                      <td class="p-3 text-sm">${op.porto_operacao || '-'}</td>
                      <td class="p-3 text-sm">${formatDate(op.previsao_inicio_atendimento)}</td>
                      <td class="p-3 text-sm ${atrasoClass}">${atrasoStr}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="bg-gray-50 p-4 border-t">
            <button onclick="document.getElementById('analytics-ops-modal').remove()" 
              class="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-xl font-semibold hover:shadow-lg transition-all">
              Fechar
            </button>
          </div>
        </div>
      </div>
    `;
    
    const oldModal = document.getElementById('analytics-ops-modal');
    if (oldModal) oldModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
  };
  
  const addClickHandler = (elementId, categoria, ops) => {
    const el = document.getElementById(elementId);
    if (el && ops && ops.length > 0) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => showOperacoesModal(categoria, ops));
    }
  };
  
  addClickHandler('pont-card-no-prazo', 'Operações no Prazo', pont.no_prazo.operacoes);
  addClickHandler('pont-card-ate1h', 'Operações com Atraso até 1h', pont.ate_1h.operacoes);
  addClickHandler('pont-card-2a5h', 'Operações com Atraso de 2 a 5h', pont.de_2_a_5h.operacoes);
  addClickHandler('pont-card-5a10h', 'Operações com Atraso de 5 a 10h', pont.de_5_a_10h.operacoes);
  addClickHandler('pont-card-mais10h', 'Operações com Atraso Maior que 10h', pont.mais_10h.operacoes);
}

// ✅ Gráfico de Coletas - Rosquinha
// js/analytics.js

// ✅ Gráfico de Coletas - Rosquinha (CORRIGIDO)
function renderizarGraficoColetas() {
  const canvas = document.getElementById('chart-coletas');
  if (!canvas) return;

  if (analyticsState.chartColetas) {
    analyticsState.chartColetas.destroy();
  }

  const pont = analyticsState.data?.pontualidade_coletas || {};
  const total = pont.total || 0;
  const noPrazo = pont.no_prazo || 0;
  // A correção é aqui: calculamos o atrasado subtraindo, pois o backend não manda o detalhe por faixa aqui
  const atrasado = total - noPrazo; 

  analyticsState.chartColetas = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['No Prazo', 'Atrasado'],
      datasets: [{
        data: [noPrazo, atrasado],
        backgroundColor: ['#10B981', '#EF4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { font: { size: 11 }, padding: 10, boxWidth: 12, boxHeight: 12 }
        },
        tooltip: { enabled: true }
      }
    }
  });
}

// ✅ Gráfico de Entregas - Rosquinha (CORRIGIDO)
function renderizarGraficoEntregas() {
  const canvas = document.getElementById('chart-entregas');
  if (!canvas) return;

  if (analyticsState.chartEntregas) {
    analyticsState.chartEntregas.destroy();
  }

  const pont = analyticsState.data?.pontualidade_entregas || {};
  const total = pont.total || 0;
  const noPrazo = pont.no_prazo || 0;
  // Correção aqui também
  const atrasado = total - noPrazo;

  analyticsState.chartEntregas = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['No Prazo', 'Atrasado'],
      datasets: [{
        data: [noPrazo, atrasado],
        backgroundColor: ['#3B82F6', '#A855F7'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { font: { size: 11 }, padding: 10, boxWidth: 12, boxHeight: 12 }
        },
        tooltip: { enabled: true }
      }
    }
  });
}

// ✅ Gráfico de Motivos - Barras Horizontais
function renderizarGraficoMotivos() {
  const canvas = document.getElementById('chart-motivos');
  if (!canvas) {
    console.error('❌ Canvas chart-motivos não encontrado!');
    return;
  }

  if (analyticsState.chartMotivos) {
    analyticsState.chartMotivos.destroy();
  }

  const motivos = analyticsState.data?.motivos_atraso || [];
  
  if (motivos.length === 0) {
    const container = canvas.parentElement;
    if (container) {
      container.innerHTML = '<p class="text-center text-gray-500 py-8">Sem dados de motivos de atraso</p>';
    }
    return;
  }

  const labels = motivos.map(m => m.motivo || 'sem justificativa');
  const valores = motivos.map(m => m.quantidade || 0);
  const colors = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#14B8A6', '#F97316'];

  analyticsState.chartMotivos = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Quantidade',
        data: valores,
        backgroundColor: colors.slice(0, valores.length),
        borderRadius: 4
      }]
    },
    plugins: [ChartDataLabels],
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: {
          display: true,
          color: 'white',
          font: { weight: 'bold', size: 11 },
          anchor: 'end',
          align: 'start',
          offset: 4,
          formatter: (val) => val
        },
        tooltip: {
          enabled: true,
          callbacks: {
            label: (context) => `${context.label}: ${context.parsed.x} ocorrências`
          }
        }
      },
      scales: {
        x: { 
          beginAtZero: true, 
          grid: { display: true, color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 } }
        },
        y: { 
          grid: { display: false },
          ticks: { font: { size: 11 } }
        }
      }
    }
  });
}

// ✅ Gráfico Target - Com Linha Vermelha 95%
export function renderTargetChart() {
  const canvas = document.getElementById('target-chart');
  if (!canvas) {
    console.error('❌ Canvas target-chart não encontrado!');
    return;
  }

  if (targetChartInstance) {
    targetChartInstance.destroy();
  }

  const dados = analyticsState.data?.target_chart || [];
  
  // Se não há dados reais, mostra mensagem
  if (dados.length === 0) {
    const parentEl = canvas.parentElement;
    if (parentEl) {
      parentEl.innerHTML = `
        <div class="flex items-center justify-center h-full">
          <div class="text-center text-white">
            <p class="text-2xl font-bold mb-4">📊 Sem Dados Disponíveis</p>
            <p class="text-lg opacity-90">Não há operações no período selecionado para gerar o gráfico Target.</p>
            <p class="text-sm opacity-75 mt-2">Selecione embarcadores e período com dados para visualizar o gráfico.</p>
          </div>
        </div>
      `;
    }
    return;
  }

  // Restaura canvas se foi substituído
  const parentEl = canvas.parentElement;
  if (!parentEl.querySelector('canvas')) {
    parentEl.innerHTML = '<canvas id="target-chart"></canvas>';
  }
  const currentCanvas = document.getElementById('target-chart');
  if (!currentCanvas) return;

  // Processa dados reais
  const labels = dados.map(d => {
    const [ano, mes] = d.mes.split('-');
    return `${getMonthName(parseInt(mes))}/${ano.slice(2)}`;
  });

  const dColeta = dados.map(d => parseFloat(d.coletaPct));
  const dEntrega = dados.map(d => parseFloat(d.entregaPct));
  const dTarget = Array(labels.length).fill(95);

  const plugins = typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [];

  targetChartInstance = new Chart(currentCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'COLETA %',
          data: dColeta,
          backgroundColor: '#10B981',
          barThickness: 60,
          maxBarThickness: 80,
          order: 2,
          datalabels: { 
            color: 'white', 
            anchor: 'center', 
            align: 'center', 
            font: {weight:'bold', size: 14}, 
            formatter: (v) => v.toFixed(1) + '%' 
          }
        },
        {
          label: 'ENTREGA %',
          data: dEntrega,
          backgroundColor: '#3B82F6',
          barThickness: 60,
          maxBarThickness: 80,
          order: 2,
          datalabels: { 
            color: 'white', 
            anchor: 'center', 
            align: 'center', 
            font: {weight:'bold', size: 14}, 
            formatter: (v) => v.toFixed(1) + '%' 
          }
        },
        {
          type: 'line',
          label: 'TARGET 95%',
          data: dTarget,
          borderColor: '#FF0000',
          backgroundColor: 'transparent',
          borderWidth: 3,
          borderDash: [10, 5],
          pointRadius: 6,
          pointBackgroundColor: '#FF0000',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          pointHoverRadius: 8,
          order: 0,
          tension: 0,
          fill: false,
          yAxisID: 'y',
          datalabels: { 
            display: true,
            color: '#FFFFFF',
            backgroundColor: '#FF0000',
            borderRadius: 6,
            padding: {top: 4, bottom: 4, left: 8, right: 8},
            font: { weight: 'bold', size: 12 },
            anchor: 'end',
            align: 'top',
            offset: 8,
            formatter: (v) => v + '%'
          }
        }
      ]
    },
    plugins: plugins,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { 
          display: true,
          position: 'top',
          labels: { 
            color: 'white', 
            font: { weight: 'bold', size: 14 },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle'
          } 
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: 'white',
          bodyColor: 'white',
          borderColor: 'white',
          borderWidth: 1,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) label += context.parsed.y.toFixed(1) + '%';
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 110,
          ticks: { 
            color: 'white', 
            callback: v => v+'%', 
            font: { size: 13, weight: 'bold' },
            stepSize: 10
          },
          grid: { 
            color: 'rgba(255,255,255,0.15)',
            lineWidth: 1
          }
        },
        x: {
          ticks: { 
            color: 'white', 
            font: { weight: 'bold', size: 13 } 
          },
          grid: { display: false }
        }
      }
    }
  });
}

function getMonthName(m) {
  return ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"][m-1];
}

// Limpar filtros
export function limparFiltros() {
  document.getElementById("analytics-data-inicio").value = "";
  document.getElementById("analytics-data-fim").value = "";
  
  if (analyticsState.embarcadorChoices) {
    analyticsState.embarcadorChoices.removeActiveItems();
  }

  Toast?.info?.("Filtros limpos");
}

// Inicialização
export function initAnalytics() {
  console.log("📊 Inicializando Analytics");

  carregarEmbarcadoresAnalytics();

  const btnBuscar = document.getElementById("analytics-buscar-btn");
  if (btnBuscar) {
    btnBuscar.addEventListener("click", buscarAnalytics);
  }

  const btnLimpar = document.getElementById("analytics-limpar-btn");
  if (btnLimpar) {
    btnLimpar.addEventListener("click", limparFiltros);
  }

  // Botões de exportação PDF e PowerPoint
  const btnPDF = document.getElementById("export-pdf-btn");
  if (btnPDF) {
    btnPDF.addEventListener("click", async () => {
      if (!analyticsState.data) {
        Toast?.error?.("Carregue os dados primeiro usando o botão Buscar");
        return;
      }

      try {
        Toast?.info?.("Gerando PDF...");
        
        const selectEl = document.getElementById("analytics-embarcador");
        const embarcadores = selectEl 
          ? Array.from(selectEl.selectedOptions).map(opt => opt.textContent)
          : [];
        
        const dataInicio = document.getElementById("analytics-data-inicio")?.value || "";
        const dataFim = document.getElementById("analytics-data-fim")?.value || "";

        const { exportarPDF } = await import("./export-functions.js");
        await exportarPDF(analyticsState.data, embarcadores, dataInicio, dataFim);
        
        Toast?.success?.("PDF gerado com sucesso!");
      } catch (error) {
        console.error("Erro ao exportar PDF:", error);
        Toast?.error?.("Erro ao gerar PDF: " + error.message);
      }
    });
  }

  const btnPPT = document.getElementById("export-ppt-btn");
  if (btnPPT) {
    btnPPT.addEventListener("click", async () => {
      if (!analyticsState.data) {
        Toast?.error?.("Carregue os dados primeiro usando o botão Buscar");
        return;
      }

      try {
        Toast?.info?.("Gerando PowerPoint...");
        
        const selectEl = document.getElementById("analytics-embarcador");
        const embarcadores = selectEl 
          ? Array.from(selectEl.selectedOptions).map(opt => opt.textContent)
          : [];
        
        const dataInicio = document.getElementById("analytics-data-inicio")?.value || "";
        const dataFim = document.getElementById("analytics-data-fim")?.value || "";

        const { exportarPowerPoint } = await import("./export-functions.js");
        await exportarPowerPoint(analyticsState.data, embarcadores, dataInicio, dataFim);
        
        Toast?.success?.("PowerPoint gerado com sucesso!");
      } catch (error) {
        console.error("Erro ao exportar PowerPoint:", error);
        Toast?.error?.("Erro ao gerar PowerPoint: " + error.message);
      }
    });
  }
}

// Exportações
export default {
  initAnalytics,
  buscarAnalytics,
  carregarEmbarcadoresAnalytics,
  limparFiltros,
  setAuthTokenGetter,
  renderTargetChart,
};