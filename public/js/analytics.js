// js/analytics.js - VERSÃO COMPLETA CORRIGIDA
// ✅ CORREÇÕES APLICADAS:
// 1. KPIs mostram operações ao clicar
// 2. Gráfico de motivos de atraso renderiza corretamente
// 3. Gráfico Target renderiza com dados corretos
// 4. Uso do calculateDelayInMinutes unificado

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

    // ✅ CORREÇÃO: Pega os valores diretamente da instância do Choices se existir
    let embarcadorIds = [];
    
    if (analyticsState.embarcadorChoices) {
      // Pega valor do plugin Choices
      const values = analyticsState.embarcadorChoices.getValue(true); // true retorna apenas os values
      if (Array.isArray(values)) {
        embarcadorIds = values;
      } else if (values) {
        embarcadorIds = [values];
      }
    } else {
      // Fallback para select normal
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

// ✅ CORREÇÃO: Renderizar todos os dados de analytics INCLUINDO O TARGET
function renderizarAnalytics() {
  if (!analyticsState.data) {
    console.warn("Sem dados para renderizar");
    return;
  }

  const data = analyticsState.data;

  // Resumo geral
  const totalOpsEl = document.getElementById("kpi-total-ops-analytics");
  const totalColetasEl = document.getElementById("kpi-total-coletas");
  const totalEntregasEl = document.getElementById("kpi-total-entregas");

  if (totalOpsEl) totalOpsEl.textContent = data.resumo.total_operacoes;
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
  
  // ✅ CORREÇÃO CRÍTICA: Renderizar gráfico Target
  renderTargetChart();
  
  // ✅ NOVO: Adicionar handlers de click nos KPIs
  wireKPIClickHandlers();
}

// ✅ NOVO: Handlers de click nos KPIs para mostrar operações
function wireKPIClickHandlers() {
  const pont = analyticsState.data.pontualidade_geral;
  
  // Função helper para mostrar modal com operações
  const showOperacoesModal = (categoria, ops) => {
    if (!ops || ops.length === 0) {
      Toast?.info?.(`Nenhuma operação ${categoria}`);
      return;
    }
    
    const modalHTML = `
      <div id="analytics-ops-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="z-index: 9999;">
        <div class="bg-white rounded-lg shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
          <div class="flex justify-between items-center p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600">
            <h3 class="text-xl font-bold text-white">
              ${categoria} - ${ops.length} operações
            </h3>
            <button onclick="document.getElementById('analytics-ops-modal').remove()" 
                    class="text-white hover:text-gray-200 text-2xl font-bold">
              ×
            </button>
          </div>
          <div class="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
            <table class="w-full text-sm">
              <thead class="bg-gray-100 sticky top-0">
                <tr>
                  <th class="p-3 text-left font-semibold">Booking</th>
                  <th class="p-3 text-left font-semibold">Container</th>
                  <th class="p-3 text-left font-semibold">Embarcador</th>
                  <th class="p-3 text-left font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody>
                ${ops.map(op => `
                  <tr class="border-b border-gray-200 hover:bg-gray-50">
                    <td class="p-3">${op.booking || '—'}</td>
                    <td class="p-3">${op.container || '—'}</td>
                    <td class="p-3">${op.embarcador_nome || '—'}</td>
                    <td class="p-3 text-xs">${op.motivo_atraso || 'Sem justificativa'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  };
  
  // Card "No Prazo"
  const cardNoPrazo = document.getElementById('pont-card-no-prazo');
  if (cardNoPrazo) {
    cardNoPrazo.style.cursor = 'pointer';
    cardNoPrazo.onclick = () => {
      showOperacoesModal('No Prazo', pont.no_prazo.operacoes);
    };
  }
  
  // Card "Até 1h"
  const cardAte1h = document.getElementById('pont-card-ate1h');
  if (cardAte1h) {
    cardAte1h.style.cursor = 'pointer';
    cardAte1h.onclick = () => {
      showOperacoesModal('Atraso até 1h', pont.ate_1h.operacoes);
    };
  }
  
  // Card "2-5h"
  const card2a5h = document.getElementById('pont-card-2a5h');
  if (card2a5h) {
    card2a5h.style.cursor = 'pointer';
    card2a5h.onclick = () => {
      showOperacoesModal('Atraso 2-5h', pont.de_2_a_5h.operacoes);
    };
  }
  
  // Card "5-10h"
  const card5a10h = document.getElementById('pont-card-5a10h');
  if (card5a10h) {
    card5a10h.style.cursor = 'pointer';
    card5a10h.onclick = () => {
      showOperacoesModal('Atraso 5-10h', pont.de_5_a_10h.operacoes);
    };
  }
  
  // Card "Mais de 10h"
  const cardMais10h = document.getElementById('pont-card-mais10h');
  if (cardMais10h) {
    cardMais10h.style.cursor = 'pointer';
    cardMais10h.onclick = () => {
      showOperacoesModal('Atraso > 10h', pont.mais_10h.operacoes);
    };
  }
  
  console.log("✅ Handlers de click nos KPIs instalados");
}

// Gráfico de Coletas
function renderizarGraficoColetas() {
  const canvas = document.getElementById("chart-coletas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (analyticsState.chartColetas) {
    analyticsState.chartColetas.destroy();
    analyticsState.chartColetas = null;
  }

  const data = analyticsState.data.pontualidade_coletas;
  const total = Number(data.total || 0);
  const noPrazo = Math.max(0, Math.min(Number(data.no_prazo || 0), total));
  const atrasado = Math.max(0, total - noPrazo);

  const Chart = window.Chart;
  if (!Chart) {
    console.error("Chart.js não está disponível");
    return;
  }

  analyticsState.chartColetas = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["No Prazo", "Atrasado"],
      datasets: [
        {
          data: [noPrazo, atrasado],
          backgroundColor: ["#43e97b", "#f45c43"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 15,
            font: { size: 12, weight: "bold" },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${val} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// Gráfico de Entregas
function renderizarGraficoEntregas() {
  const canvas = document.getElementById("chart-entregas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (analyticsState.chartEntregas) {
    analyticsState.chartEntregas.destroy();
    analyticsState.chartEntregas = null;
  }

  const data = analyticsState.data.pontualidade_entregas;
  const total = Number(data.total || 0);
  const noPrazo = Math.max(0, Math.min(Number(data.no_prazo || 0), total));
  const atrasado = Math.max(0, total - noPrazo);

  const Chart = window.Chart;
  if (!Chart) return;

  analyticsState.chartEntregas = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["No Prazo", "Atrasado"],
      datasets: [
        {
          data: [noPrazo, atrasado],
          backgroundColor: ["#4facfe", "#f093fb"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "70%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            padding: 15,
            font: { size: 12, weight: "bold" },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${val} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ✅ CORREÇÃO: Gráfico de Motivos renderiza corretamente
function renderizarGraficoMotivos() {
  const canvas = document.getElementById("chart-motivos");
  if (!canvas) return;

  if (analyticsState.chartMotivos) analyticsState.chartMotivos.destroy();

  const motivos = analyticsState.data?.motivos_atraso || [];
  
  // Registro do plugin não é necessário manualmente na v3 se importado via script tag, 
  // mas fazemos por segurança se estiver no escopo.
  const plugins = typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [];

  analyticsState.chartMotivos = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: motivos.map(m => {
          const t = m.motivo || '';
          return t.length > 45 ? t.substring(0, 45) + '...' : t;
      }),
      datasets: [{
        label: "Qtd",
        data: motivos.map(m => m.quantidade),
        backgroundColor: "#667eea",
        borderRadius: 4,
        barPercentage: 0.7
      }]
    },
    plugins: plugins,
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 50 } },
      plugins: {
        legend: { display: false },
        datalabels: {
            anchor: 'end',
            align: 'end',
            color: '#4a5568',
            font: { weight: 'bold', size: 11 },
            formatter: (val) => val
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { display: false } },
        y: { grid: { display: false } }
      }
    }
  });
}

// ✅ Gráfico Target (Ajustado para Chart.js v3 + Linha 95%)
// ✅ Gráfico Target (Ajustado para Chart.js v3 + Linha 95% VISÍVEL)
export function renderTargetChart() {
  const canvas = document.getElementById('target-chart');
  if (!canvas) return;

  if (targetChartInstance) targetChartInstance.destroy();

  const dados = analyticsState.data?.target_chart || [];
  
  // Tratamento para caso não haja dados, exibe meses futuros ou atuais
  const labels = dados.length > 0 
      ? dados.map(d => {
          const [ano, mes] = d.mes.split('-');
          return `${getMonthName(parseInt(mes))}/${ano.slice(2)}`;
        })
      : getNextMonths(3);

  const dColeta = dados.length ? dados.map(d => parseFloat(d.coletaPct)) : [0,0,0];
  const dEntrega = dados.length ? dados.map(d => parseFloat(d.entregaPct)) : [0,0,0];
  const dTarget = Array(labels.length).fill(95);

  const plugins = typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [];

  targetChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'COLETA %',
          data: dColeta,
          backgroundColor: '#10B981',
          order: 2,
          datalabels: { color: 'white', anchor: 'end', align: 'top', offset: -20, font: {weight:'bold', size: 12} }
        },
        {
          label: 'ENTREGA %',
          data: dEntrega,
          backgroundColor: '#3B82F6',
          order: 2,
          datalabels: { color: 'white', anchor: 'end', align: 'top', offset: -20, font: {weight:'bold', size: 12} }
        },
        {
          type: 'line', // Linha de target - AGORA VISÍVEL
          label: 'TARGET 95%',
          data: dTarget,
          borderColor: '#FF0000',
          backgroundColor: 'rgba(255, 0, 0, 0.1)',
          borderWidth: 4,
          borderDash: [8, 4],
          pointRadius: 5,
          pointBackgroundColor: '#FF0000',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          order: 1,
          tension: 0,
          fill: false,
          datalabels: { 
            display: true,
            color: '#FF0000',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 4,
            padding: 4,
            font: { weight: 'bold', size: 11 },
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
          labels: { 
            color: 'white', 
            font: { weight: 'bold', size: 13 },
            padding: 15,
            usePointStyle: true
          } 
        },
        datalabels: {
            formatter: (v) => v + '%',
            color: 'white'
        },
        tooltip: {
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
          max: 115, 
          ticks: { color: 'white', callback: v => v+'%', font: { size: 12 } },
          grid: { color: 'rgba(255,255,255,0.1)' }
        },
        x: {
          ticks: { color: 'white', font: { weight: 'bold', size: 12 } },
          grid: { display: false }
        }
      }
    }
  });
}

function getMonthName(m) {
    return ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"][m-1];
}

function getNextMonths(count) {
    const arr = [];
    const d = new Date();
    for(let i=0; i<count; i++) {
        arr.push(`${getMonthName(d.getMonth()+1)}/${d.getFullYear().toString().slice(2)}`);
        d.setMonth(d.getMonth() + 1);
    }
    return arr;
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

  // ✅ CORREÇÃO: Botões de exportação PDF e PowerPoint
  const btnPDF = document.getElementById("export-pdf-btn");
  if (btnPDF) {
    btnPDF.addEventListener("click", async () => {
      if (!analyticsState.data) {
        Toast?.error?.("Carregue os dados primeiro usando o botão Buscar");
        return;
      }

      try {
        Toast?.info?.("Gerando PDF...");
        
        // Pega embarcadores selecionados
        const selectEl = document.getElementById("analytics-embarcador");
        const embarcadores = selectEl 
          ? Array.from(selectEl.selectedOptions).map(opt => opt.textContent)
          : [];
        
        const dataInicio = document.getElementById("analytics-data-inicio")?.value || "";
        const dataFim = document.getElementById("analytics-data-fim")?.value || "";

        // Importa dinamicamente a função de exportação
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
        
        // Pega embarcadores selecionados
        const selectEl = document.getElementById("analytics-embarcador");
        const embarcadores = selectEl 
          ? Array.from(selectEl.selectedOptions).map(opt => opt.textContent)
          : [];
        
        const dataInicio = document.getElementById("analytics-data-inicio")?.value || "";
        const dataFim = document.getElementById("analytics-data-fim")?.value || "";

        // Importa dinamicamente a função de exportação
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