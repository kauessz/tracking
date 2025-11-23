// portal.js - PORTAL DO CLIENTE/EMBARCADOR - VERSÃO CORRIGIDA
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getApiUrl } from './config.js';

// CONFIG
const API_BASE = getApiUrl();
const firebaseConfig = JSON.parse(__firebase_config);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let authToken = null;
let currentUser = null;

// ESTADO
const state = {
  allOps: [],
  filteredOps: [],
  filters: {
    status: 'all',
    range: '30d',
    search: '',
    date: '' // ✅ NOVO: filtro por data específica
  }
};

// DOM REFS
const userNameEl = document.getElementById("user-name");
const logoutBtn = document.getElementById("logout-btn");

const kpiTotalEl = document.getElementById("kpi-total");
const kpiLateEl = document.getElementById("kpi-late");
const kpiInProgressEl = document.getElementById("kpi-inprogress");
const kpiCompletedEl = document.getElementById("kpi-completed");

const filterStatusEl = document.getElementById("filter-status");
const filterRangeEl = document.getElementById("filter-range");
const filterBookingEl = document.getElementById("filter-booking");
const filterDateEl = document.getElementById("filter-date"); // ✅ NOVO
const clearFiltersBtn = document.getElementById("clear-filters");

const operationsListEl = document.getElementById("operations-list");

// HELPERS
function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function calculateDelayInMinutes(op) {
  const programada = op.previsao_inicio_atendimento || op.DataProgramada;
  const chegada = op.dt_inicio_execucao || op.DataChegada;
  
  if (!programada || !chegada) return 0;
  
  const dtProg = new Date(programada);
  const dtCheg = new Date(chegada);
  
  if (isNaN(dtProg.getTime()) || isNaN(dtCheg.getTime())) return 0;
  
  const diffMs = dtCheg.getTime() - dtProg.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

function formatMinutesToHHMM(minutes) {
  if (minutes <= 0) return "ON TIME";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

// ✅ CORREÇÃO PROBLEMA 1: Normalizar operação com mapeamento correto
function normalizeOp(raw) {
  return {
    id: raw.id,
    booking: raw.booking || raw.Booking || null,
    // ✅ CORRIGIDO: backend retorna 'containers' (plural)
    containers: raw.containers || raw.container || raw.Container || null,
    embarcador_nome: raw.embarcador_nome || raw.Cliente || raw.embarcador || null,
    status_operacao: raw.status_operacao || raw.StatusOperacao || raw.tipo_programacao || null,
    previsao_inicio_atendimento: raw.previsao_inicio_atendimento || raw.DataProgramada || null,
    dt_inicio_execucao: raw.dt_inicio_execucao || raw.DataChegada || null,
    dt_fim_execucao: raw.dt_fim_execucao || null,
    dt_previsao_entrega_recalculada: raw.dt_previsao_entrega_recalculada || null,
    porto_operacao: raw.porto_operacao || raw.PortoOperacao || null,
    motorista: raw.motorista || raw.nome_motorista || null,
    cpf_motorista: raw.cpf_motorista || null,
    placa_veiculo: raw.placa_veiculo || null,
    placa_carreta: raw.placa_carreta || null,
    justificativa_atraso: raw.justificativa_atraso || raw.JustificativaAtraso || null,
    motivo_atraso: raw.motivo_atraso || null
  };
}

// FETCH OPERAÇÕES
async function fetchMyOperations() {
  try {
    console.log("🔄 Buscando operações do portal...");
    console.log("🔗 URL:", `${API_BASE}/portal/myOps`);
    console.log("🔑 Token:", authToken ? "presente" : "ausente");

    const resp = await fetch(`${API_BASE}/portal/myOps`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Cache-Control': 'no-cache'
      }
    });

    console.log("📡 Response status:", resp.status);

    const data = await resp.json();
    console.log("📦 Data recebida:", data);

    if (data.success) {
      console.log("✅ Sucesso! Total de itens:", data.items?.length || 0);
      state.allOps = (data.items || []).map(normalizeOp);
      console.log("🗂️ Operações normalizadas:", state.allOps.length);
      applyFilters();
      updateKPIs();
    } else {
      console.error("❌ Erro no backend:", data);
      state.allOps = [];
      renderOperations();
    }
  } catch (err) {
    console.error("❌ Erro fetchMyOperations:", err);
    showError("Falha ao carregar operações. Tente novamente.");
  }
}

// FILTROS
function applyFilters() {
  console.log("🔍 Aplicando filtros...");
  console.log("📊 Total de operações antes dos filtros:", state.allOps.length);

  let filtered = [...state.allOps];

  // Filtro de status
  if (state.filters.status !== 'all') {
    filtered = filtered.filter(op => {
      const delay = calculateDelayInMinutes(op);
      const hasEnd = !!op.dt_fim_execucao;

      switch (state.filters.status) {
        case 'ontime':
          return delay <= 0 && !hasEnd;
        case 'late':
          return delay > 0 && !hasEnd;
        case 'inprogress':
          return !!op.dt_inicio_execucao && !hasEnd;
        case 'completed':
          return hasEnd;
        default:
          return true;
      }
    });
  }

  // Filtro de período
  if (state.filters.range !== 'all' && !state.filters.date) {
    const now = new Date();
    const days = parseInt(state.filters.range) || 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    filtered = filtered.filter(op => {
      const date = new Date(op.previsao_inicio_atendimento);
      return date >= cutoff;
    });
  }

  // ✅ NOVO: Filtro de data específica (tem prioridade sobre período)
  if (state.filters.date) {
    const targetDate = new Date(state.filters.date);
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    filtered = filtered.filter(op => {
      const opDate = new Date(op.previsao_inicio_atendimento);
      opDate.setHours(0, 0, 0, 0);
      return opDate.getTime() === targetDate.getTime();
    });
  }

  // Filtro de busca
  if (state.filters.search) {
    const search = state.filters.search.toLowerCase();
    filtered = filtered.filter(op => {
      return (
        (op.booking || '').toLowerCase().includes(search) ||
        (op.containers || '').toLowerCase().includes(search) ||
        (op.porto_operacao || '').toLowerCase().includes(search)
      );
    });
  }

  state.filteredOps = filtered;
  console.log("✅ Operações após filtros:", state.filteredOps.length);
  renderOperations();
}

// ATUALIZAR KPIs
function updateKPIs() {
  const total = state.allOps.length;
  const late = state.allOps.filter(op => calculateDelayInMinutes(op) > 0 && !op.dt_fim_execucao).length;
  const inProgress = state.allOps.filter(op => op.dt_inicio_execucao && !op.dt_fim_execucao).length;
  const completed = state.allOps.filter(op => op.dt_fim_execucao).length;
  
  if (kpiTotalEl) kpiTotalEl.textContent = total;
  if (kpiLateEl) kpiLateEl.textContent = late;
  if (kpiInProgressEl) kpiInProgressEl.textContent = inProgress;
  if (kpiCompletedEl) kpiCompletedEl.textContent = completed;
}

// RENDERIZAR OPERAÇÕES
function renderOperations() {
  console.log("🎨 Renderizando operações...");
  console.log("📋 Elemento operations-list:", operationsListEl ? "encontrado" : "NÃO ENCONTRADO");
  console.log("📊 Operações filtradas:", state.filteredOps.length);

  if (!operationsListEl) {
    console.error("❌ Elemento #operations-list não encontrado no DOM!");
    return;
  }

  if (state.filteredOps.length === 0) {
    console.log("⚠️ Nenhuma operação para exibir");
    operationsListEl.innerHTML = `
      <p class="text-gray-500 text-center py-12">
        Nenhuma operação encontrada com os filtros aplicados.
      </p>
    `;
    return;
  }
  
  const html = state.filteredOps.map(op => {
    const delay = calculateDelayInMinutes(op);
    const delayText = delay > 0 ? formatMinutesToHHMM(delay) : "ON TIME";
    const isLate = delay > 0;
    const isCompleted = !!op.dt_fim_execucao;

    const statusColor = isCompleted
      ? 'bg-gray-100 text-gray-700'
      : isLate
        ? 'bg-red-100 text-red-700'
        : 'bg-green-100 text-green-700';

    const statusText = isCompleted
      ? '✅ Concluída'
      : isLate
        ? '⏰ Em Atraso'
        : '🚢 No Prazo';

    return `
      <div class="glass-card p-5 border-l-4 ${isCompleted ? 'border-gray-400' : isLate ? 'border-red-500' : 'border-green-500'}">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-xl font-bold text-gray-900">${op.booking || 'N/A'}</h3>
            <p class="text-sm text-gray-600">${op.containers || 'Container não informado'}</p>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusColor}">
            ${statusText}
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <span class="font-semibold text-gray-700">Embarcador:</span>
            <span class="text-gray-900 ml-2">${op.embarcador_nome || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Booking:</span>
            <span class="text-gray-900 ml-2">${op.booking || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Container:</span>
            <span class="text-gray-900 ml-2">${op.containers || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Tipo Prog.:</span>
            <span class="text-gray-900 ml-2">${op.status_operacao || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Porto Operação:</span>
            <span class="text-gray-900 ml-2">${op.porto_operacao || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Previsão Início:</span>
            <span class="text-gray-900 ml-2">${formatDateTime(op.previsao_inicio_atendimento)}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Previsão Entrega:</span>
            <span class="text-gray-900 ml-2">${formatDateTime(op.dt_previsao_entrega_recalculada)}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Início Execução:</span>
            <span class="text-gray-900 ml-2">${formatDateTime(op.dt_inicio_execucao)}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Fim Execução:</span>
            <span class="text-gray-900 ml-2">${formatDateTime(op.dt_fim_execucao)}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Motorista:</span>
            <span class="text-gray-900 ml-2">${op.motorista || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">CPF:</span>
            <span class="text-gray-900 ml-2">${op.cpf_motorista || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Veículo:</span>
            <span class="text-gray-900 ml-2">${op.placa_veiculo || 'N/A'}</span>
          </div>

          <div>
            <span class="font-semibold text-gray-700">Reboque:</span>
            <span class="text-gray-900 ml-2">${op.placa_carreta || 'N/A'}</span>
          </div>

          <div class="md:col-span-2 pt-2 border-t border-gray-100 mt-2">
            <span class="font-semibold text-gray-700">Justificativa Atraso:</span>
            <span class="text-gray-900 ml-2">${op.justificativa_atraso || '-'}</span>
          </div>
          
          ${op.motivo_atraso ? `
          <div class="md:col-span-2">
            <span class="font-semibold text-gray-700">Motivo Atraso:</span>
            <span class="text-gray-900 ml-2">${op.motivo_atraso}</span>
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  console.log("✅ HTML gerado, atualizando DOM...");
  operationsListEl.innerHTML = html;
  console.log("✅ DOM atualizado com sucesso!");
}

// MOSTRAR ERRO
function showError(message) {
  if (operationsListEl) {
    operationsListEl.innerHTML = `
      <div class="glass-card p-8 text-center border-l-4 border-red-500">
        <p class="text-red-600 font-semibold mb-2">❌ Erro</p>
        <p class="text-gray-700">${message}</p>
        <button onclick="location.reload()" class="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl btn-modern font-semibold">
          Tentar Novamente
        </button>
      </div>
    `;
  }
}

// EVENT LISTENERS
function setupEventListeners() {
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "index.html";
    });
  }
  
  if (filterStatusEl) {
    filterStatusEl.addEventListener("change", () => {
      state.filters.status = filterStatusEl.value;
      applyFilters();
    });
  }
  
  if (filterRangeEl) {
    filterRangeEl.addEventListener("change", () => {
      state.filters.range = filterRangeEl.value;
      applyFilters();
    });
  }
  
  // ✅ NOVO: Event listener para filtro de data
  if (filterDateEl) {
    filterDateEl.addEventListener("change", () => {
      state.filters.date = filterDateEl.value;
      applyFilters();
    });
  }
  
  if (filterBookingEl) {
    filterBookingEl.addEventListener("input", () => {
      state.filters.search = filterBookingEl.value.trim();
      applyFilters();
    });
  }
  
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      state.filters = { status: 'all', range: '30d', search: '', date: '' };
      if (filterStatusEl) filterStatusEl.value = 'all';
      if (filterRangeEl) filterRangeEl.value = '30d';
      if (filterBookingEl) filterBookingEl.value = '';
      if (filterDateEl) filterDateEl.value = ''; // ✅ NOVO
      applyFilters();
    });
  }
}

// INIT
onAuthStateChanged(auth, async (user) => {
  console.log("🎬 Portal - onAuthStateChanged disparado");
  console.log("👤 Usuário:", user ? user.email : "nenhum");

  if (!user) {
    console.log("❌ Sem usuário, redirecionando...");
    window.location.href = "index.html";
    return;
  }

  console.log("✅ Obtendo token...");
  authToken = await user.getIdToken(true);
  console.log("🔑 Token:", authToken ? "OK" : "FALHOU");

  try {
    console.log("📡 Validando acesso via /auth/whoami...");

    // Verifica se é um usuário ativo
    const whoResp = await fetch(`${API_BASE}/auth/whoami`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    console.log("📡 Status whoami:", whoResp.status);

    const whoData = await whoResp.json();
    console.log("📦 Dados whoami:", whoData);

    if (!whoData.success || whoData.user?.status !== "ativo") {
      console.error("❌ Usuário sem acesso ativo:", whoData);
      alert("Usuário sem acesso ativo.");
      window.location.href = "index.html";
      return;
    }

    if (whoData.user.role === "admin") {
      console.log("🔀 Usuário é admin, redirecionando...");
      window.location.href = "admin.html";
      return;
    }

    console.log("✅ Usuário é embarcador ativo!");
    currentUser = whoData.user;

    // ✅ CORREÇÃO PROBLEMA 5: Atualiza nome do usuário E ROLE
    if (userNameEl) {
      const roleDisplay = currentUser.role === 'embarcador' ? 'Embarcador' : 
                         currentUser.role === 'operador' ? 'Operador' : 
                         'Usuário';
      userNameEl.innerHTML = `
        <span class="font-semibold">${currentUser.nome || user.email}</span>
        <span class="opacity-75 text-xs ml-2">(${roleDisplay})</span>
      `;
    }

    console.log("🚀 Chamando fetchMyOperations...");
    // Carrega operações
    await fetchMyOperations();
    console.log("✅ fetchMyOperations concluído");

  } catch (err) {
    console.error("❌ Erro na inicialização:", err);
    console.error("❌ Stack:", err.stack);
    showError("Falha ao validar acesso. Tente fazer login novamente.");
  }

  setupEventListeners();

  console.log("✅ Portal.js inicializado");
  console.log("🔗 API Base:", API_BASE);
});