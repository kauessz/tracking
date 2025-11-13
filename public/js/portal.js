// portal.js - PORTAL DO CLIENTE/EMBARCADOR
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
    search: ''
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

function normalizeOp(raw) {
  return {
    id: raw.id,
    booking: raw.booking || raw.Booking,
    container: raw.container || raw.Container,
    embarcador_nome: raw.embarcador_nome || raw.Cliente,
    status_operacao: raw.status_operacao || raw.StatusOperacao,
    previsao_inicio_atendimento: raw.previsao_inicio_atendimento || raw.DataProgramada,
    dt_inicio_execucao: raw.dt_inicio_execucao || raw.DataChegada,
    dt_fim_execucao: raw.dt_fim_execucao,
    dt_previsao_entrega_recalculada: raw.dt_previsao_entrega_recalculada,
    porto_operacao: raw.porto_operacao || raw.PortoOperacao,
    motorista: raw.motorista,
    cpf_motorista: raw.cpf_motorista,
    placa_veiculo: raw.placa_veiculo,
    placa_carreta: raw.placa_carreta,
    justificativa_atraso: raw.justificativa_atraso || raw.JustificativaAtraso
  };
}

// FETCH OPERAÇÕES
async function fetchMyOperations() {
  try {
    const resp = await fetch(`${API_BASE}/portal/myOperations`, {
      headers: { 
        Authorization: `Bearer ${authToken}`,
        'Cache-Control': 'no-cache'
      }
    });
    
    const data = await resp.json();
    
    if (data.success) {
      state.allOps = (data.items || []).map(normalizeOp);
      applyFilters();
      updateKPIs();
    } else {
      console.error("Erro ao carregar operações:", data);
      state.allOps = [];
      renderOperations();
    }
  } catch (err) {
    console.error("Erro fetchMyOperations:", err);
    showError("Falha ao carregar operações. Tente novamente.");
  }
}

// FILTROS
function applyFilters() {
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
  if (state.filters.range !== 'all') {
    const now = new Date();
    const days = parseInt(state.filters.range) || 30;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    filtered = filtered.filter(op => {
      const date = new Date(op.previsao_inicio_atendimento);
      return date >= cutoff;
    });
  }
  
  // Filtro de busca
  if (state.filters.search) {
    const search = state.filters.search.toLowerCase();
    filtered = filtered.filter(op => {
      return (
        (op.booking || '').toLowerCase().includes(search) ||
        (op.container || '').toLowerCase().includes(search) ||
        (op.porto_operacao || '').toLowerCase().includes(search)
      );
    });
  }
  
  state.filteredOps = filtered;
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
  if (!operationsListEl) return;
  
  if (state.filteredOps.length === 0) {
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
            <p class="text-sm text-gray-600">${op.container || 'Container não informado'}</p>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusColor}">
            ${statusText}
          </span>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <div>
            <span class="font-semibold text-gray-700">Porto:</span>
            <p class="text-gray-900">${op.porto_operacao || 'N/A'}</p>
          </div>
          
          <div>
            <span class="font-semibold text-gray-700">Previsão Início:</span>
            <p class="text-gray-900">${formatDateTime(op.previsao_inicio_atendimento)}</p>
          </div>
          
          <div>
            <span class="font-semibold text-gray-700">Início Execução:</span>
            <p class="text-gray-900">${formatDateTime(op.dt_inicio_execucao)}</p>
          </div>
          
          <div>
            <span class="font-semibold text-gray-700">Previsão Entrega:</span>
            <p class="text-gray-900">${formatDateTime(op.dt_previsao_entrega_recalculada)}</p>
          </div>
          
          <div>
            <span class="font-semibold text-gray-700">Fim Execução:</span>
            <p class="text-gray-900">${formatDateTime(op.dt_fim_execucao)}</p>
          </div>
          
          <div>
            <span class="font-semibold text-gray-700">Atraso:</span>
            <p class="${isLate ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}">
              ${delayText}
            </p>
          </div>
        </div>
        
        ${op.motorista ? `
          <div class="mt-4 pt-4 border-t border-gray-200">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span class="font-semibold text-gray-700">Motorista:</span>
                <p class="text-gray-900">${op.motorista}</p>
              </div>
              <div>
                <span class="font-semibold text-gray-700">Veículo:</span>
                <p class="text-gray-900">${op.placa_veiculo || 'N/A'}</p>
              </div>
              <div>
                <span class="font-semibold text-gray-700">Reboque:</span>
                <p class="text-gray-900">${op.placa_carreta || 'N/A'}</p>
              </div>
            </div>
          </div>
        ` : ''}
        
        ${op.justificativa_atraso && op.justificativa_atraso !== '-' ? `
          <div class="mt-4 pt-4 border-t border-gray-200">
            <span class="font-semibold text-gray-700">Justificativa de Atraso:</span>
            <p class="text-gray-900 mt-1">${op.justificativa_atraso}</p>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
  
  operationsListEl.innerHTML = html;
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
  
  if (filterBookingEl) {
    filterBookingEl.addEventListener("input", () => {
      state.filters.search = filterBookingEl.value.trim();
      applyFilters();
    });
  }
  
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      state.filters = { status: 'all', range: '30d', search: '' };
      if (filterStatusEl) filterStatusEl.value = 'all';
      if (filterRangeEl) filterRangeEl.value = '30d';
      if (filterBookingEl) filterBookingEl.value = '';
      applyFilters();
    });
  }
}

// INIT
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  
  authToken = await user.getIdToken(true);
  
  try {
    // Verifica se é um usuário ativo
    const whoResp = await fetch(`${API_BASE}/auth/whoami`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    const whoData = await whoResp.json();
    
    if (!whoData.success || whoData.user?.status !== "ativo") {
      alert("Usuário sem acesso ativo.");
      window.location.href = "index.html";
      return;
    }
    
    if (whoData.user.role === "admin") {
      window.location.href = "admin.html";
      return;
    }
    
    currentUser = whoData.user;
    
    // Atualiza nome do usuário
    if (userNameEl) {
      userNameEl.textContent = `Olá, ${currentUser.nome || user.email}`;
    }
    
    // Carrega operações
    await fetchMyOperations();
    
  } catch (err) {
    console.error("Erro na inicialização:", err);
    showError("Falha ao validar acesso. Tente fazer login novamente.");
  }
  
  setupEventListeners();
  
  console.log("✅ Portal.js inicializado");
  console.log("🔗 API Base:", API_BASE);
});