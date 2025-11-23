// admin.js - VERSÃO CORRIGIDA + OCORRÊNCIAS
//
// Correções aplicadas:
// 1. KPI cards com IDs corretos para cliques funcionarem
// 2. Upload XLSX funcionando com fallback ESM
// 3. Gráfico de motivos com "sem justificativa" ao invés de "-"
// 4. Uso de APP_CONFIG.API_BASE (com fallback) e vários guards de DOM
// 5. Aba de Ocorrências integrada ao backend
// 6. Fluxo de aprovação de usuários com tipo de conta e embarcador
//

console.log("🚀 admin.js - INÍCIO DO CARREGAMENTO");

// ------------------------------------------------------
// IMPORTS FIREBASE (CDN modular)
// ------------------------------------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// ------------------------------------------------------
// IMPORTS ADICIONAIS
// ------------------------------------------------------
import { Toast, Loading, Parse, Format } from "./utilities.js";
import { APP_CONFIG, getApiUrl } from "./config.js";
import {
  initAnalytics,
  carregarEmbarcadoresAnalytics,
  buscarAnalytics,
  setAuthTokenGetter,
} from "./analytics.js";
import { calculateDelayInMinutes } from "./utils.js";

// ------------------------------------------------------
// CONFIG
// ------------------------------------------------------
const API_BASE = getApiUrl(); // ✅ CORRIGIDO: usar getApiUrl()
const firebaseConfig = JSON.parse(__firebase_config);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Token JWT Firebase que vamos mandar nas rotas protegidas
let authToken = null;

// ------------------------------------------------------
// ESTADO GLOBAL
// ------------------------------------------------------
const state = {
  allOps: [], // TODAS operações normalizadas
  viewOps: [], // operações filtradas/sort
  filters: {
    embarcadores: [], // lista (strings) selecionados
    status: "all", // all | ontime | late | canceled
    range: "all", // all | 7d | 30d
    search: "", // busca texto livre
    date: "", // yyyy-mm-dd
  },
  sort: {
    field: null,
    asc: true,
  },
  expandedBooking: null, // linha expandida
  pagination: {
    currentPage: 1,
    itemsPerPage: 25, // pode ser número ou string 'all'
    totalItems: 0,
    totalPages: 0,
  },
  charts: {
    delayChart: null,
    reasonsChart: null,
  },
  pendingUsers: [],
  // ✅ Ocorrências
  ocorrencias: [],
  ocorrenciasFilter: {
    booking: "",
    tipo: "",
  },
};

// ------------------------------------------------------
// DOM REFS
// ------------------------------------------------------

// abas
const tabsBtns = document.querySelectorAll(".tab-btn");
function activateTab(tabId) {
  tabsBtns.forEach((b) => b.classList.remove("active"));
  const btn = Array.from(tabsBtns).find((b) => b.getAttribute("data-tab") === tabId);
  if (btn) btn.classList.add("active");

  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  const el = document.getElementById(tabId);
  if (el) el.classList.add("active");
}

tabsBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tabId = btn.getAttribute("data-tab");
    activateTab(tabId);
  });
});

// filtros/ações Operações
const embarcadorSelectEl = document.getElementById("filter-embarcador");
const statusEl = document.getElementById("filter-status");
const rangeEl = document.getElementById("filter-range");
const bookingEl = document.getElementById("filter-booking");
const dateEl = document.getElementById("filter-date");
const clearFiltersBtn = document.getElementById("clear-filters");

const sendEmailBtn = document.getElementById("send-email-btn");
const copyEmailBtn = document.getElementById("copy-email-btn");
const openDiaryBtn = document.getElementById("open-diary-btn");

// tabela / alerta
const tableBodyEl = document.getElementById("results-table-body");
const tableHeadEl = document.getElementById("results-table-head");

const lateAlertBoxEl = document.getElementById("late-alert-box");
const lateAlertMsgEl = document.getElementById("late-alert-msg");

// preview de e-mail
const emailPreviewEl = document.getElementById("email-preview");
const emailDraftEl = document.getElementById("email-draft");
const closeEmailBtn = document.getElementById("close-email-preview");

// dashboard KPIs
const totalOpsEl = document.getElementById("kpi-total-value");
const onTimeOpsEl = document.getElementById("kpi-ontime-value");
const delayedOpsEl = document.getElementById("kpi-late-value");
const delayedOpsPctEl = document.getElementById("kpi-pct-value");

// ✅ CORREÇÃO 1: IDs corretos dos cards
const totalOpsCard = document.getElementById("kpi-total-ops");
const onTimeOpsCard = document.getElementById("kpi-ontime-ops"); // CORRIGIDO
const delayedOpsCard = document.getElementById("kpi-late-ops"); // CORRIGIDO

// charts
const delayChartCanvas = document.getElementById("delay-chart");
const reasonsChartCanvas = document.getElementById("reasons-chart");
const reasonsBarsEl = document.getElementById("reasons-bars");

// upload
const uploadFileEl = document.getElementById("upload-file");
const uploadStatusEl = document.getElementById("upload-status");
const clearDataBtn = document.getElementById("clear-data-btn");

// aprovações
const pendingUsersTbody = document.getElementById("pending-users-table-body");

// ✅ Refs da aba de ocorrências
const ocorrenciasSearchBtn = document.getElementById("ocorrencias-search-btn");
const ocorrenciasFilterBooking = document.getElementById("ocorrencias-filter-booking");
const ocorrenciasFilterTipo = document.getElementById("ocorrencias-filter-tipo");
const ocorrenciasList = document.getElementById("ocorrencias-list");

// logout
const logoutBtn = document.getElementById("logout-btn");

// DOM da paginação
const itemsPerPageSelect = document.getElementById("items-per-page");
const prevPageBtn = document.getElementById("prev-page");
const nextPageBtn = document.getElementById("next-page");
const currentPageDisplay = document.getElementById("current-page-display");
const showingInfoTop = document.getElementById("showing-info");
const showingInfoBottom = document.getElementById("showing-info-bottom");

// multiselect Choices.js
let embarcadorChoices = null;

// ✅ CORREÇÃO 2: Garantir carregamento de XLSX/Papa mesmo em ES modules
async function ensureLibs() {
  let XLSX = globalThis.XLSX || (typeof window !== "undefined" && window.XLSX);
  let Papa = globalThis.Papa || (typeof window !== "undefined" && window.Papa);

  // Fallback: carrega via ESM se não veio como global
  if (!XLSX) {
    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/xlsx@0.19.3/+esm");
      XLSX = mod.default ?? mod;
      console.log("✅ XLSX carregado via ESM");
    } catch (e) {
      console.error("❌ Falha ao carregar XLSX via ESM:", e);
      throw new Error("XLSX não está carregado. Inclua no HTML.");
    }
  }
  if (!Papa) {
    try {
      const mod = await import("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm");
      Papa = mod.default ?? mod;
      console.log("✅ PapaParse carregado via ESM");
    } catch (e) {
      console.error("❌ Falha ao carregar PapaParse via ESM:", e);
    }
  }
  return { XLSX, Papa };
}

// ------------------------------------------------------
// HELPERS DE DATA / ATRASO
// ------------------------------------------------------

// parse "dd/mm/aaaa hh:mm" -> Date local
function parseDateBR(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.trim().split(" ");
  if (parts.length < 2) return null;

  const [dmy, hm] = parts;
  const [dd, mm, yyyy] = dmy.split("/");
  const [HH, MM] = hm.split(":");

  if (!dd || !mm || !yyyy || !HH || !MM) return null;

  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(HH), Number(MM), 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

// ISO -> "dd/mm/aaaa hh:mm"
function isoToBR(isoVal) {
  if (!isoVal) return "";
  const d = new Date(isoVal);
  if (isNaN(d.getTime())) return isoVal;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`;
}

function formatDateForDisplay(val) {
  if (!val) return "—";
  return val;
}

function formatMinutesToHHMM(mins) {
  const positive = mins < 0 ? 0 : mins;
  const h = Math.floor(positive / 60);
  const m = positive % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}

// ------------------------------------------------------
// FUNÇÕES DE PAGINAÇÃO
// ------------------------------------------------------
function updatePagination() {
  const totalItems = state.viewOps.length;
  const itemsPerPage =
    state.pagination.itemsPerPage === "all" ? totalItems : parseInt(state.pagination.itemsPerPage);

  state.pagination.totalItems = totalItems;
  state.pagination.totalPages =
    itemsPerPage === totalItems ? 1 : Math.ceil(totalItems / Math.max(itemsPerPage, 1));

  if (state.pagination.currentPage > state.pagination.totalPages) {
    state.pagination.currentPage = Math.max(1, state.pagination.totalPages);
  }
}

function getPaginatedOps() {
  if (state.pagination.itemsPerPage === "all") {
    return state.viewOps;
  }
  const itemsPerPage = parseInt(state.pagination.itemsPerPage);
  const start = (state.pagination.currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  return state.viewOps.slice(start, end);
}

function updatePaginationUI() {
  const { currentPage, totalPages, totalItems, itemsPerPage } = state.pagination;

  const perPage = itemsPerPage === "all" ? totalItems : parseInt(itemsPerPage);
  const start = totalItems === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const end = Math.min(currentPage * perPage, totalItems);

  const infoText = totalItems === 0 ? "Mostrando 0 de 0" : `Mostrando ${start}-${end} de ${totalItems}`;

  if (showingInfoTop) showingInfoTop.textContent = infoText;
  if (showingInfoBottom) showingInfoBottom.textContent = infoText;

  if (currentPageDisplay) {
    currentPageDisplay.textContent = `Página ${currentPage} de ${totalPages}`;
  }

  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
}

function goToPage(page) {
  const { totalPages } = state.pagination;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  state.pagination.currentPage = page;
  renderOpsTable();
  updatePaginationUI();
}

function changeItemsPerPage(value) {
  state.pagination.itemsPerPage = value;
  state.pagination.currentPage = 1;
  updatePagination();
  renderOpsTable();
  updatePaginationUI();
}

// ------------------------------------------------------
// NORMALIZAÇÃO DAS OPERAÇÕES (server -> front)
// ------------------------------------------------------
function normalizeOp(raw) {
  const booking = raw.booking || raw.Booking || "";
  const embarcador = raw.embarcador_nome || raw.Cliente || "";
  const porto = raw.porto_operacao || raw.PortoOperacao || "";
  const container = raw.container || raw.Container || raw.containers || "";

  // ✅ Normaliza datas para formato BR
  const progIso =
    raw.previsao_inicio_atendimento || raw.previsao_inicio || raw.DataProgramada || "";
  const progRecalcIso =
    raw.dt_previsao_entrega_recalculada || raw.DataProgramadaRecalculada || "";
  const execInicioIso = raw.dt_inicio_execucao || raw.DataChegada || "";
  const execFimIso = raw.dt_fim_execucao || raw.DataFim || "";

  const progFmt =
    progIso && typeof progIso === "string" && progIso.includes("T") ? isoToBR(progIso) : progIso;
  const progRecalcFmt =
    progRecalcIso && typeof progRecalcIso === "string" && progRecalcIso.includes("T") ? isoToBR(progRecalcIso) : progRecalcIso;
  const execInicioFmt =
    execInicioIso && typeof execInicioIso === "string" && execInicioIso.includes("T") ? isoToBR(execInicioIso) : execInicioIso;
  const execFimFmt =
    execFimIso && typeof execFimIso === "string" && execFimIso.includes("T") ? isoToBR(execFimIso) : execFimIso;

  // ✅ Trata motivo vazio/nulo como "sem justificativa"
  let atrasoMotivo = raw.motivo_atraso || raw.justificativa_atraso || raw.JustificativaAtraso || "";
  atrasoMotivo = (atrasoMotivo || "").trim().toLowerCase();
  if (!atrasoMotivo || atrasoMotivo === "-") {
    atrasoMotivo = "sem justificativa";
  }

  const tipoProgRaw = raw.tipo_programacao || raw.TipoOperacao || raw.status_operacao || "";

  // ✅ ADICIONAR campos necessários para calculateDelayInMinutes
  const situacao = raw.SituacaoProgramacao || raw.situacao || raw.status || "";

  return {
    Booking: booking,
    Container: container,
    Cliente: embarcador,
    PortoOperacao: porto,
    DataProgramada: progFmt,
    DataProgramadaRecalculada: progRecalcFmt, // ✅ IMPORTANTE para prioridade
    DataChegada: execInicioFmt,
    DataFim: execFimFmt,
    JustificativaAtraso: atrasoMotivo,
    TipoOperacao: tipoProgRaw,
    SituacaoProgramacao: situacao, // ✅ ADICIONAR para detectar cancelamento

    // ✅ Mantém campos originais para compatibilidade com utils.js
    previsao_inicio_atendimento: progFmt,
    dt_previsao_entrega_recalculada: progRecalcFmt,
    dt_inicio_execucao: execInicioFmt,
    dt_fim_execucao: execFimFmt,
    porto_operacao: porto,
    situacao: situacao,
  };
}

// ✅ CORREÇÃO: Filtra operações canceladas durante normalização
function normalizeOpsArray(arr) {
  if (!Array.isArray(arr)) return [];
  
  return arr
    .filter(raw => {
      // ✅ CORREÇÃO: Não renderiza operações canceladas
      const situacao = raw.SituacaoProgramacao || raw.situacao || raw.status || 
                      raw.status_operacao || raw.TipoOperacao || "";
      const isCanceled = /cancel/i.test(situacao);
      
      if (isCanceled) {
        console.log(`⚠️ Operação cancelada filtrada: ${raw.booking || raw.Booking}`);
      }
      
      return !isCanceled;
    })
    .map(normalizeOp);
}

// ------------------------------------------------------
// AGRUPAMENTOS / KPIs / GRÁFICOS
// ------------------------------------------------------
function opMatchesFilters(op) {
  if (state.filters.embarcadores.length > 0) {
    if (!state.filters.embarcadores.includes(op.Cliente)) return false;
  }

  const delayMin = calculateDelayInMinutes(op);
  // ✅ Lógica corrigida: calculateDelayInMinutes sempre retorna >= 0
  // 0 = no prazo (ou sem dados), >0 = atrasado
  const isLate = delayMin > 0;
  const isOnTime = delayMin === 0 && op.DataProgramada;
  const isCanceled = /cancel/i.test(op.TipoOperacao || "") ||
    /cancel/i.test(op.SituacaoProgramacao || "");

  if (state.filters.status === "ontime" && !isOnTime) return false;
  if (state.filters.status === "late" && !isLate) return false;
  if (state.filters.status === "canceled" && !isCanceled) return false;

  if (state.filters.range !== "all") {
    const progDt = parseDateBR(op.DataProgramada);
    if (progDt) {
      const now = new Date();
      const diffDays = (now.getTime() - progDt.getTime()) / (1000 * 60 * 60 * 24);
      if (state.filters.range === "7d" && diffDays > 7) return false;
      if (state.filters.range === "30d" && diffDays > 30) return false;
    }
  }

  if (state.filters.search) {
    const txt = state.filters.search.toLowerCase();
    const hay = [op.Booking, op.Container, op.PortoOperacao, op.Cliente, op.TipoOperacao]
      .join(" ")
      .toLowerCase();
    if (!hay.includes(txt)) return false;
  }

  if (state.filters.date) {
    const progDtStr = op.DataProgramada || "";
    const [dmy] = progDtStr.split(" ");
    if (dmy) {
      const [dd, mm, yyyy] = dmy.split("/");
      const isoLike = `${yyyy}-${mm}-${dd}`;
      if (isoLike !== state.filters.date) return false;
    }
  }
  return true;
}

function applyFiltersAndSort() {
  let arr = state.allOps.filter(opMatchesFilters);

  if (state.sort.field) {
    const f = state.sort.field;
    const asc = state.sort.asc;
    arr.sort((a, b) => {
      const av = (a[f] ?? "").toString().toLowerCase();
      const bv = (b[f] ?? "").toString().toLowerCase();
      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });
  }

  state.viewOps = arr;
}

function buildKPIs(ops) {
  const total = ops.length;
  const delays = ops.map((o) => calculateDelayInMinutes(o));
  // ✅ Atrasado = delay > 0 (positivo)
  const lateOnly = delays.filter((m) => m !== null && m > 0);
  const lateCount = lateOnly.length;
  const pctLate = total > 0 ? (lateCount / total) * 100 : 0;
  return { total, lateCount, pctLate };
}

function groupLateByClient(ops) {
  const map = {};
  for (const o of ops) {
    const dmin = calculateDelayInMinutes(o);
    if (dmin <= 0) continue;
    const cli = o.Cliente || "(Sem Nome)";
    map[cli] = (map[cli] || 0) + 1;
  }
  const arr = Object.entries(map).map(([cliente, count]) => ({ cliente, count }));
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, 5);
}

function groupDelayReasons(ops, topN = 5) {
  const counts = {};
  for (const o of ops) {
    const dmin = calculateDelayInMinutes(o);
    
    // ✅ CORREÇÃO: Só conta se estiver ATRASADA (delay > 0)
    if (dmin <= 0) continue;

    // ✅ Garante que exibe "sem justificativa" (lowercase)
    let reason = (o.JustificativaAtraso || "").trim().toLowerCase();
    if (!reason || reason === "-") {
      reason = "sem justificativa";
    }

    counts[reason] = (counts[reason] || 0) + 1;
  }
  const arr = Object.entries(counts).map(([reason, count]) => ({ reason, count }));
  arr.sort((a, b) => b.count - a.count);
  return arr.slice(0, topN);
}

// ------------------------------------------------------
// TIMELINE (linha expandida da tabela)
// ------------------------------------------------------
function renderTimelineHTML(op) {
  const delayMin = calculateDelayInMinutes(op);
  let atrasoFmt, atrasoColor;
  if (delayMin === null) {
    atrasoFmt = "Aguardando";
    atrasoColor = "text-gray-500 italic";
  } else if (delayMin === 0) {
    atrasoFmt = "ON TIME";
    atrasoColor = "text-green-600 font-bold";
  } else {
    atrasoFmt = formatMinutesToHHMM(delayMin);
    atrasoColor = "text-red-600 font-bold";
  }

  const steps = [
    { title: "Programado", time: op.DataProgramada || "—", color: "bg-blue-600" },
    {
      title: "Em Execução",
      time: op.DataChegada || "—",
      color: delayMin > 0 ? "bg-red-600" : "bg-green-600",
    },
    { title: "Finalizado", time: "—", color: "bg-gray-400" },
  ];

  // oculta bloco "Motivo do Atraso" se for "sem justificativa"
  const motivo = (op.JustificativaAtraso || "").trim().toLowerCase();

  return `
    <div class="text-[13px] leading-snug text-gray-800">
      <div class="mb-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
        <div><span class="font-semibold">Booking:</span> ${op.Booking}</div>
        <div><span class="font-semibold">Container:</span> ${op.Container || op.containers || "—"}</div>
        <div><span class="font-semibold">Cliente:</span> ${op.Cliente || "-"}</div>
        <div><span class="font-semibold">Porto:</span> ${op.PortoOperacao || "-"}</div>
        <div><span class="font-semibold">Prev. Início:</span> ${formatDateForDisplay(op.DataProgramada)}</div>
        <div><span class="font-semibold">Início Exec.:</span> ${formatDateForDisplay(op.DataChegada)}</div>
        <div><span class="font-semibold">Atraso:</span>
          ${delayMin > 0
      ? `<span class="text-red-600 font-semibold">${atrasoFmt}</span>`
      : `<span class="text-green-700 font-semibold uppercase">${atrasoFmt}</span>`
    }
        </div>
        <div><span class="font-semibold">Tipo de Operação:</span> ${op.TipoOperacao || "-"}</div>
      </div>
      ${motivo && motivo !== "sem justificativa"
      ? `
        <div class="mt-2 text-[12px] text-gray-700">
          <span class="font-semibold">Motivo do Atraso:</span>
          ${op.JustificativaAtraso}
        </div>`
      : ""
    }
      <div class="flex flex-col gap-4 text-[12px] mt-4">
        ${steps
      .map(
        (s) => `
          <div class="flex items-start gap-3">
            <div class="tl-step-dot ${s.color}"></div>
            <div>
              <div class="font-semibold">${s.title}</div>
              <div class="text-gray-600">${s.time}</div>
            </div>
          </div>`
      )
      .join("")}
      </div>
    </div>
  `;
}

// ------------------------------------------------------
// RENDER TABELA (com paginação)
// ------------------------------------------------------
function renderOpsTable() {
  if (!tableBodyEl) return;

  updatePagination();
  const opsToRender = getPaginatedOps();

  if (opsToRender.length === 0) {
    tableBodyEl.innerHTML = `
      <tr>
        <td colspan="7" class="px-4 py-6 text-center text-gray-500">
          Nenhuma operação encontrada com os filtros aplicados.
        </td>
      </tr>`;
    updatePaginationUI();
    renderLateAlert();
    return;
  }

  const html = opsToRender
    .map((op) => {
      const delayMin = calculateDelayInMinutes(op);
      let atrasoText;
      if (delayMin < 0) atrasoText = "ON TIME";
      else if (delayMin === 0) atrasoText = "ON TIME";
      else atrasoText = formatMinutesToHHMM(delayMin);
      const isLate = delayMin > 0;

      const rowId = `row-${op.Booking}-${Math.random().toString(36).substr(2, 9)}`;
      const isExpanded = state.expandedBooking === op.Booking;

      let rowHtml = `
      <tr id="${rowId}" class="hover:bg-gray-50 cursor-pointer transition-colors" data-booking="${op.Booking || ""
        }">
        <td class="px-6 py-3 font-medium text-gray-900 col-booking">${op.Booking || "—"}</td>
        <td class="px-6 py-3 text-gray-700 col-shipper" title="${op.Cliente || ""}">${op.Cliente || "—"
        }</td>
        <td class="px-6 py-3 text-gray-700 col-porto" title="${op.PortoOperacao || ""}">${op.PortoOperacao || "—"
        }</td>
        <td class="px-6 py-3 text-gray-700 col-previsao">${formatDateForDisplay(
          op.DataProgramada
        )}</td>
        <td class="px-6 py-3 text-gray-700 col-exec">${formatDateForDisplay(
          op.DataChegada
        )}</td>
        <td class="px-6 py-3 text-center col-atraso ${isLate ? "text-red-600 font-bold" : "text-green-600"
        }">${atrasoText}</td>
        <td class="px-6 py-3 text-gray-600 text-sm col-motivo" title="${op.JustificativaAtraso || "Nenhum motivo informado"
        }">${op.JustificativaAtraso}</td>
      </tr>`;

      if (isExpanded) {
        rowHtml += `
        <tr class="detail-row" id="${rowId}-detail">
          <td colspan="7" class="detail-cell">${renderTimelineHTML(op)}</td>
        </tr>`;
      }
      return rowHtml;
    })
    .join("");

  tableBodyEl.innerHTML = html;

  const rows = tableBodyEl.querySelectorAll("tr[data-booking]");
  rows.forEach((row) => {
    row.addEventListener("click", () => {
      const booking = row.getAttribute("data-booking");
      state.expandedBooking = state.expandedBooking === booking ? null : booking;
      renderOpsTable();
    });
  });

  updatePaginationUI();
  renderLateAlert();
}

// ------------------------------------------------------
// ALERTA DE ATRASO
// ------------------------------------------------------
function renderLateAlert() {
  const lateOps = state.viewOps.filter((o) => calculateDelayInMinutes(o) > 0);
  if (lateOps.length === 0) {
    if (lateAlertMsgEl) lateAlertMsgEl.textContent = "Nenhuma operação atrasada no filtro atual.";
    if (lateAlertBoxEl) lateAlertBoxEl.classList.add("hidden");
  } else {
    if (lateAlertMsgEl)
      lateAlertMsgEl.textContent = `⚠ ${lateOps.length} operação(ões) em atraso neste filtro.`;
    if (lateAlertBoxEl) lateAlertBoxEl.classList.remove("hidden");
  }
}

// ------------------------------------------------------
// GRÁFICOS (Chart.js)
// ------------------------------------------------------
function initCharts() {
  if (typeof Chart === "undefined") {
    console.warn("Chart.js não está carregado no HTML.");
    return;
  }

  if (delayChartCanvas && !state.charts.delayChart) {
    state.charts.delayChart = new Chart(delayChartCanvas, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          {
            label: "Qtde de processos atrasados",
            data: [],
            backgroundColor: "rgba(59, 130, 246, 0.6)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: { legend: { display: true, labels: { font: { size: 11 } } } },
        scales: {
          x: {
            ticks: { color: "#6b7280", font: { size: 10 } },
            grid: { color: "#e5e7eb" },
          },
          y: {
            ticks: { color: "#1f2937", font: { size: 10 } },
            grid: { color: "#f3f4f6" },
          },
        },
      },
    });

    delayChartCanvas.onclick = (evt) => {
      const points = state.charts.delayChart.getElementsAtEventForMode(
        evt,
        "nearest",
        { intersect: true },
        false
      );
      if (!points.length) return;
      const firstPoint = points[0];
      const label = state.charts.delayChart.data.labels[firstPoint.index];
      if (!label) return;

      state.filters.embarcadores = [label];
      state.filters.status = "late";

      if (embarcadorChoices) {
        embarcadorChoices.removeActiveItems();
        embarcadorChoices.setValue([label]);
      }
      if (statusEl) statusEl.value = "late";

      rerenderAll();
      activateTab("tab-operacoes");
    };
  }

  if (reasonsChartCanvas && !state.charts.reasonsChart) {
    state.charts.reasonsChart = new Chart(reasonsChartCanvas, {
      type: "doughnut",
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: ["#0ea5e9", "#6366f1", "#10b981", "#facc15", "#ef4444"],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { font: { size: 11 }, color: "#374151" } },
        },
        cutout: "50%",
      },
    });
  }
}

function updateCharts() {
  if (!state.viewOps || state.viewOps.length === 0) {
    if (state.charts.delayChart) {
      state.charts.delayChart.data.labels = [];
      state.charts.delayChart.data.datasets[0].data = [];
      state.charts.delayChart.update();
    }
    if (state.charts.reasonsChart) {
      state.charts.reasonsChart.data.labels = [];
      state.charts.reasonsChart.data.datasets[0].data = [];
      state.charts.reasonsChart.update();
    }
    if (reasonsBarsEl) reasonsBarsEl.innerHTML = "";
    return;
  }

  const lateByClient = groupLateByClient(state.viewOps);
  const reasonsArr = groupDelayReasons(state.viewOps, 5);

  if (state.charts.delayChart) {
    state.charts.delayChart.data.labels = lateByClient.map((x) => x.cliente);
    state.charts.delayChart.data.datasets[0].data = lateByClient.map((x) => x.count);
    state.charts.delayChart.update();
  }

  if (state.charts.reasonsChart) {
    state.charts.reasonsChart.data.labels = reasonsArr.map((x) => x.reason);
    state.charts.reasonsChart.data.datasets[0].data = reasonsArr.map((x) => x.count);
    state.charts.reasonsChart.update();
  }

  if (reasonsBarsEl) {
    reasonsBarsEl.innerHTML = reasonsArr
      .map(
        (r) => `
        <div class="flex items-center justify-between text-[13px] px-2 py-1 bg-gray-50 rounded border border-gray-200">
          <span class="font-medium text-gray-800">${r.reason}</span>
          <span class="text-gray-600">${r.count}</span>
        </div>`
      )
      .join("");
  }
}

// ------------------------------------------------------
// KPIs do Dashboard + cliques
// ------------------------------------------------------
function renderKPIs() {
  const k = buildKPIs(state.allOps);
  if (totalOpsEl) totalOpsEl.textContent = k.total;
  if (delayedOpsEl) delayedOpsEl.textContent = k.lateCount;
  if (onTimeOpsEl) onTimeOpsEl.textContent = k.total - k.lateCount;
  if (delayedOpsPctEl) delayedOpsPctEl.textContent = k.pctLate.toFixed(1) + "%";
  updateCharts();
}

function wireKpiClicks() {
  if (totalOpsCard) {
    totalOpsCard.addEventListener("click", () => {
      state.filters = {
        embarcadores: [],
        status: "all",
        range: "all",
        search: "",
        date: "",
      };
      if (statusEl) statusEl.value = "all";
      if (rangeEl) rangeEl.value = "all";
      if (bookingEl) bookingEl.value = "";
      if (dateEl) dateEl.value = "";
      if (embarcadorChoices) embarcadorChoices.removeActiveItems();

      rerenderAll();
      activateTab("tab-operacoes");
    });
  }

  // ✅ CORREÇÃO 1: Card "on time" agora funciona corretamente
  if (onTimeOpsCard) {
    onTimeOpsCard.addEventListener("click", () => {
      state.filters.status = "ontime";
      if (statusEl) statusEl.value = "ontime";
      rerenderAll();
      activateTab("tab-operacoes");
    });
  }

  // ✅ CORREÇÃO 1: Card "atrasados" agora funciona corretamente
  if (delayedOpsCard) {
    delayedOpsCard.addEventListener("click", () => {
      state.filters.status = "late";
      if (statusEl) statusEl.value = "late";
      rerenderAll();
      activateTab("tab-operacoes");
    });
  }
}


// ------------------------------------------------------
// E-MAIL
// ------------------------------------------------------
function buildEmailTableHTML(lateOps) {
  const rowsHtml = lateOps
    .map((op) => {
      const delayMin = calculateDelayInMinutes(op);
      let atrasoFmt, atrasoColor;
      if (delayMin < 0) {
        // Programado para o futuro
        atrasoFmt = "Programado";
        atrasoColor = "text-blue-500 font-medium";
      } else if (delayMin === 0) {
        atrasoFmt = "ON TIME";
        atrasoColor = "text-green-600 font-bold";
      } else {
        atrasoFmt = formatMinutesToHHMM(delayMin);
        atrasoColor = "text-red-600 font-bold";
      }
      return `
        <tr>
          <td>${op.Booking || "-"}</td>
          <td>${op.Container || op.containers || "—"}</td>
          <td>${op.Cliente || "-"}</td>
          <td>${op.PortoOperacao || "-"}</td>
          <td>${op.TipoOperacao || "-"}</td>
          <td>${formatDateForDisplay(op.DataProgramada)}</td>
          <td>${atrasoFmt}</td>
        </tr>`;
    })
    .join("");

  return `
<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:12px;">
  <thead style="background:#f2f2f2;font-weight:bold;">
    <tr>
      <td>Booking</td>
      <td>Container</td>
      <td>Embarcador</td>
      <td>Porto</td>
      <td>Tipo de Operação</td>
      <td>Prev. Início</td>
      <td>Atraso</td>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>`.trim();
}

function buildEmailDraft(lateOps) {
  const tableHtml = buildEmailTableHTML(lateOps);
  return [
    "Prezados(as),",
    "",
    "Identificamos as operações abaixo com início em atraso em relação à previsão inicial.",
    "Nossa equipe já está atuando para mitigar o impacto operacional, ajustar recursos e confirmar uma nova previsão de chegada.",
    "Assim que tivermos uma nova confirmação de janela/atendimento, retornaremos imediatamente.",
    "",
    tableHtml,
    "",
    "Seguimos monitorando as atividades em tempo real e permanecemos à disposição para qualquer necessidade urgente.",
    "",
    "Atenciosamente,",
    "Time de Operações / Mercosul Line",
  ].join("\n");
}

function generateEmlAndDownload() {
  const lateOps = state.viewOps.filter((o) => calculateDelayInMinutes(o) > 0);
  const htmlBody = buildEmailTableHTML(lateOps);

  const subject = "Atualização de Operações em Atraso";
  const from = "tracking@mercosul-line.com";
  const to = "cliente@exemplo.com";

  const emlContent = [
    `Subject: ${subject}`,
    `From: ${from}`,
    `To: ${to}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    '<html><body style="font-family:Arial, sans-serif; font-size:12px; color:#000;">',
    "<p>Prezados(as),</p>",
    "<p>Identificamos as operações abaixo com início em atraso em relação à previsão inicial. Nossa equipe já está atuando para mitigar impacto operacional e confirmar nova previsão de chegada.</p>",
    htmlBody,
    "<p>Assim que houver nova confirmação de janela/atendimento, retornaremos.</p>",
    "<p>Atenciosamente,<br/>Time de Operações / Mercosul Line</p>",
    "</body></html>",
  ].join("\r\n");

  const blob = new Blob([emlContent], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "operacoes_atraso.eml";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openEmailPreview() {
  const lateOps = state.viewOps.filter((o) => calculateDelayInMinutes(o) > 0);
  const draft = buildEmailDraft(lateOps);
  if (emailDraftEl) emailDraftEl.value = draft;
  if (emailPreviewEl) emailPreviewEl.classList.remove("hidden");
}

function closeEmailPreviewModal() {
  if (emailPreviewEl) emailPreviewEl.classList.add("hidden");
}

// ------------------------------------------------------
// RENDER GERAL
// ------------------------------------------------------
function rerenderAll() {
  applyFiltersAndSort();
  renderOpsTable();
  renderKPIs();
}

// ------------------------------------------------------
// MULTISELECT / FILTROS / SORT / AÇÕES
// ------------------------------------------------------
function wirePagination() {
  if (itemsPerPageSelect) {
    itemsPerPageSelect.addEventListener("change", (e) => {
      changeItemsPerPage(e.target.value);
    });
  }
  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", () => {
      goToPage(state.pagination.currentPage - 1);
    });
  }
  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", () => {
      goToPage(state.pagination.currentPage + 1);
    });
  }
}

function populateEmbarcadorChoices() {
  const unique = Array.from(
    new Set(state.allOps.map((op) => op.Cliente).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  if (embarcadorSelectEl) {
    embarcadorSelectEl.innerHTML = unique
      .map(
        (cli) =>
          `<option value="${cli.replace(/"/g, "&quot;")}">${cli}</option>`
      )
      .join("");
  }
  if (embarcadorChoices) embarcadorChoices.destroy();

  // Só instancia Choices se a lib estiver carregada
  if (window?.Choices) {
    embarcadorChoices = new Choices(embarcadorSelectEl, {
      removeItemButton: true,
      shouldSort: false,
      placeholderValue: "Selecione um ou mais embarcadores",
      searchPlaceholderValue: "Buscar...",
    });
  } else {
    console.warn("Choices.js não está carregado; usando <select multiple> nativo.");
  }
}

function wireFiltersAndActions() {
  if (embarcadorSelectEl) {
    embarcadorSelectEl.addEventListener("change", () => {
      state.filters.embarcadores = Array.from(embarcadorSelectEl.selectedOptions).map(
        (o) => o.value
      );
      rerenderAll();
    });
  }
  if (statusEl) {
    statusEl.addEventListener("change", () => {
      state.filters.status = statusEl.value;
      rerenderAll();
    });
  }
  if (rangeEl) {
    rangeEl.addEventListener("change", () => {
      state.filters.range = rangeEl.value;
      rerenderAll();
    });
  }
  if (bookingEl) {
    bookingEl.addEventListener("input", () => {
      state.filters.search = bookingEl.value.trim();
      rerenderAll();
    });
  }
  if (dateEl) {
    dateEl.addEventListener("change", () => {
      state.filters.date = dateEl.value;
      rerenderAll();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      state.filters = {
        embarcadores: [],
        status: "all",
        range: "all",
        search: "",
        date: "",
      };
      if (statusEl) statusEl.value = "all";
      if (rangeEl) rangeEl.value = "all";
      if (bookingEl) bookingEl.value = "";
      if (dateEl) dateEl.value = "";
      if (embarcadorChoices) embarcadorChoices.removeActiveItems();
      rerenderAll();
    });
  }

  if (tableHeadEl) {
    const ths = tableHeadEl.querySelectorAll("th.sortable-header");
    ths.forEach((th) => {
      th.addEventListener("click", () => {
        const field = th.getAttribute("data-sort");
        if (!field) return;
        if (state.sort.field === field) state.sort.asc = !state.sort.asc;
        else {
          state.sort.field = field;
          state.sort.asc = true;
        }
        rerenderAll();
      });
    });
  }

  if (copyEmailBtn) copyEmailBtn.addEventListener("click", generateEmlAndDownload);
  if (sendEmailBtn) sendEmailBtn.addEventListener("click", openEmailPreview);
  if (openDiaryBtn)
    openDiaryBtn.addEventListener("click", () => {
      window.open("https://diario-bordo.netlify.app/", "_blank");
    });
  if (closeEmailBtn) closeEmailBtn.addEventListener("click", closeEmailPreviewModal);

  if (uploadFileEl) uploadFileEl.addEventListener("change", handleFileChosen);
  if (clearDataBtn) clearDataBtn.addEventListener("click", handleClearData);

  // ✅ Listeners da aba de Ocorrências
  if (ocorrenciasSearchBtn) {
    ocorrenciasSearchBtn.addEventListener("click", () => {
      state.ocorrenciasFilter.booking = ocorrenciasFilterBooking?.value || "";
      state.ocorrenciasFilter.tipo = ocorrenciasFilterTipo?.value || "";
      loadOcorrencias();
    });
  }

  if (ocorrenciasFilterBooking) {
    ocorrenciasFilterBooking.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        state.ocorrenciasFilter.booking = ocorrenciasFilterBooking.value || "";
        state.ocorrenciasFilter.tipo = ocorrenciasFilterTipo?.value || "";
        loadOcorrencias();
      }
    });
  }
}

// ------------------------------------------------------
// UPLOAD DE DADOS (VERSÃO CORRIGIDA)
// ------------------------------------------------------
async function handleFileChosen(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();
  const setStatus = (msg) => {
    const el = uploadStatusEl || document.getElementById("upload-status");
    if (el) el.textContent = msg;
  };

  // 1. Validação do tipo de arquivo
  const allowedExts = APP_CONFIG?.acceptedFileTypes || [".xlsx", ".xls", ".csv"];
  const isValidType = allowedExts.some((ext) => fileName.endsWith(ext));

  if (!isValidType) {
    Toast?.error?.("Formato não suportado. Use: .xlsx, .xls ou .csv");
    setStatus("Erro: formato não suportado");
    e.target.value = "";
    return;
  }

  // 2. Validação do tamanho
  const maxSize = Number(APP_CONFIG?.maxFileSize ?? 10 * 1024 * 1024); // 10MB padrão
  if (file.size > maxSize) {
    Toast?.error?.("Arquivo muito grande. Tamanho máximo: 10MB");
    setStatus("Erro: arquivo muito grande");
    e.target.value = "";
    return;
  }

  Loading?.show?.("Lendo arquivo...");
  setStatus("Lendo arquivo...");

  try {
    // 3. Garante que as libs XLSX e Papa estão carregadas
    const { XLSX, Papa } = await ensureLibs();

    let records = [];

    // 4. Processa CSV
    if (fileName.endsWith(".csv")) {
      if (!Papa) {
        throw new Error("PapaParse não está carregado. Inclua no HTML.");
      }

      const text = await file.text();
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8",
      });

      if (parsed.errors.length > 0) {
        console.warn("Avisos do PapaParse:", parsed.errors);
      }

      records = parsed.data || [];
    }
    // 5. Processa XLSX/XLS
    else {
      if (!XLSX) {
        throw new Error("XLSX não está carregado. Inclua no HTML.");
      }

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(firstSheet, { raw: false, defval: null });
    }

    // 6. Validação dos dados
    if (!records || records.length === 0) {
      Toast?.warning?.("Arquivo vazio ou sem dados válidos");
      setStatus("Aviso: arquivo vazio");
      Loading?.hide?.();
      return;
    }

    console.log(`📄 ${records.length} linhas encontradas no arquivo`);
    Loading?.show?.(`Processando ${records.length} linhas...`);

    // 7. Normaliza os dados
    const normalized = records
      .map((row, idx) => {
        try {
          return normalizeRecord(row, idx);
        } catch (err) {
          console.warn(`Linha ${idx + 1} com erro:`, err.message);
          return null;
        }
      })
      .filter(Boolean);

    if (normalized.length === 0) {
      Toast?.error?.("Nenhum registro válido encontrado no arquivo");
      setStatus("Erro: nenhum registro válido");
      Loading?.hide?.();
      return;
    }

    console.log(`✅ ${normalized.length} registros normalizados`);
    Loading?.show?.(`Enviando ${normalized.length} registros para o servidor...`);

    // 8. Envia para o backend
    const resp = await fetch(`${API_BASE}/admin/importOperations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ records: normalized }),
    });

    const data = await resp.json().catch(() => ({}));
    Loading?.hide?.();

    if (!resp.ok || !data.success) {
      console.error("Erro do backend:", data);
      Toast?.error?.(data?.error || "Falha ao importar dados");
      setStatus(`Erro: ${data?.error || "falha ao importar"}`);
      throw new Error(data?.error || "Falha ao importar");
    }

    // 9. Sucesso!
    const processed =
      data.processed ?? (data.inserted || 0) + (data.updated || 0) + (data.skipped || 0);

    Toast?.success?.(
      `✅ Importação concluída!\n${data.inserted || 0} inseridos • ${data.updated || 0
      } atualizados • ${data.skipped || 0} ignorados`,
      6000
    );

    setStatus(
      `Importação OK: ${processed} processados (${data.inserted || 0} inseridos, ${data.updated || 0
      } atualizados, ${data.skipped || 0} ignorados)`
    );

    // 10. Recarrega os dados
    await fetchAllOps();
    rerenderAll();
  } catch (err) {
    console.error("❌ Erro no upload:", err);
    Loading?.hide?.();

    const msg = err?.message || "Falha ao processar arquivo";
    Toast?.error?.(msg);
    setStatus(`Erro: ${msg}`);
  } finally {
    e.target.value = "";
  }
}

/**
 * Normaliza um registro da planilha para o formato esperado pelo backend
 */
function normalizeRecord(row, idx) {
  // ✅ CORREÇÃO: Adicionar campo NumeroProgramacao
  const numeroProgramacao =
    row["Número da programação"] ||
    row.NumeroProgramacao ||
    row.numero_programacao ||
    null;

  const booking = row.Booking || row.booking || row.BOOKING || null;

  const cliente =
    row.Embarcador ||
    row["Nome do Embarcador"] ||
    row.Cliente ||
    row.cliente ||
    row.embarcador ||
    null;

  const container =
    row.Containers ||
    row.Container ||
    row.container ||
    row.containers ||
    null;

  const tipoOp =
    row["Tipo de programação"] ||
    row["Tipo Operação"] ||
    row.TipoOperacao ||
    row.tipo_programacao ||
    row.TipoProgramacao ||
    null;

  // ✅ POL e POD separados
  const pol = row.POL || row.pol || null;
  const pod = row.POD || row.pod || null;

  let justificativa =
    row["Justificativa de atraso de programação"] ||
    row["Justificativa Atraso"] ||
    row.JustificativaAtraso ||
    row.justificativa_atraso ||
    null;

  if (!justificativa || justificativa.trim() === "" || justificativa.trim() === "-") {
    justificativa = "sem justificativa";
  } else {
    justificativa = justificativa.trim();
  }

  // ✅ Motivo de atraso
  let motivoAtraso =
    row["Tipo de ocorrência"] ||
    row.MotivoAtraso ||
    row.motivo_atraso ||
    null;

  // ✅ Status da operação
  const statusOperacao =
    row["Situação programação"] ||
    row.StatusOperacao ||
    row.status_operacao ||
    "Programado";

  // ✅ Datas adicionais
  let dataProgramada =
    row["Previsão início atendimento (BRA)"] ||
    row["Data Programada"] ||
    row.DataProgramada ||
    row.previsao_inicio_atendimento ||
    null;

  let dataInicioExec =
    row["Dt Início da Execução (BRA)"] ||
    row["Data Chegada"] ||
    row.DataChegada ||
    row.dt_inicio_execucao ||
    null;

  let dataFimExec =
    row["Dt FIM da Execução (BRA)"] ||
    row["Data Fim"] ||
    row.DataFim ||
    row.dt_fim_execucao ||
    null;

  let dataEntregaRecalc =
    row["Data de previsão de entrega recalculada (BRA)"] ||
    row["Data Entrega Recalculada"] ||
    row.DataEntregaRecalculada ||
    row.dt_previsao_entrega_recalculada ||
    null;

  // ✅ Informações do motorista e veículos
  const nomeMotorista =
    row["Nome do motorista programado"] ||
    row.NomeMotorista ||
    row.nome_motorista ||
    null;

  const cpfMotorista =
    row["CPF motorista programado"] ||
    row.CPFMotorista ||
    row.cpf_motorista ||
    null;

  const placaVeiculo =
    row["Placa do veículo"] ||
    row.PlacaVeiculo ||
    row.placa_veiculo ||
    null;

  const placaCarreta =
    row["Placa da carreta 1"] ||
    row.PlacaCarreta ||
    row.placa_carreta ||
    null;

  // Parse das datas
  if (dataProgramada) {
    const parsed = Parse?.dateAuto?.(dataProgramada);
    if (parsed) {
      dataProgramada = Format?.dateTime?.(parsed) || dataProgramada;
    } else {
      console.warn(`Linha ${idx + 1}: Data Programada inválida:`, dataProgramada);
      dataProgramada = null;
    }
  }

  if (dataInicioExec) {
    const parsed = Parse?.dateAuto?.(dataInicioExec);
    if (parsed) {
      dataInicioExec = Format?.dateTime?.(parsed) || dataInicioExec;
    } else {
      console.warn(`Linha ${idx + 1}: Data Início Execução inválida:`, dataInicioExec);
      dataInicioExec = null;
    }
  }

  if (dataFimExec) {
    const parsed = Parse?.dateAuto?.(dataFimExec);
    if (parsed) {
      dataFimExec = Format?.dateTime?.(parsed) || dataFimExec;
    } else {
      console.warn(`Linha ${idx + 1}: Data Fim Execução inválida:`, dataFimExec);
      dataFimExec = null;
    }
  }

  if (dataEntregaRecalc) {
    const parsed = Parse?.dateAuto?.(dataEntregaRecalc);
    if (parsed) {
      dataEntregaRecalc = Format?.dateTime?.(parsed) || dataEntregaRecalc;
    } else {
      console.warn(`Linha ${idx + 1}: Data Entrega Recalculada inválida:`, dataEntregaRecalc);
      dataEntregaRecalc = null;
    }
  }

  // ✅ VALIDAÇÃO: Campos obrigatórios
  if (!numeroProgramacao || !booking) {
    throw new Error(`Linha ${idx + 1}: Número da programação ou Booking ausente`);
  }

  return {
    NumeroProgramacao: numeroProgramacao,
    Booking: booking,
    Cliente: cliente,
    Container: container,
    TipoOperacao: tipoOp,
    POL: pol,
    POD: pod,
    DataProgramada: dataProgramada,
    DataChegada: dataInicioExec,
    DataFim: dataFimExec,
    DataEntregaRecalculada: dataEntregaRecalc,
    JustificativaAtraso: justificativa.toLowerCase(),
    MotivoAtraso: motivoAtraso,
    StatusOperacao: statusOperacao,
    NomeMotorista: nomeMotorista,
    CPFMotorista: cpfMotorista,
    PlacaVeiculo: placaVeiculo,
    PlacaCarreta: placaCarreta,
  };
}

async function handleClearData() {
  if (!confirm("Tem certeza? Isso vai remover TODAS as operações da base.")) return;
  try {
    const resp = await fetch(`${API_BASE}/admin/clearData`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const out = await resp.json();
    if (!out.success) {
      alert("Erro limpando dados: " + (out.error || "desconhecido"));
    } else {
      alert(`Dados removidos (${out.deleted} linhas). Vou recarregar a lista.`);
      await fetchAllOps();
      rerenderAll();
    }
  } catch (err) {
    console.error("Erro clearData:", err);
    alert("Falha na requisição de limpeza.");
  }
}

// ------------------------------------------------------
// APROVAÇÕES DE USUÁRIOS
// ------------------------------------------------------
async function renderPendingUsers() {
  if (!pendingUsersTbody) return;

  if (state.pendingUsers.length === 0) {
    pendingUsersTbody.innerHTML = `
      <tr>
        <td colspan="7" class="px-6 py-8 text-center text-gray-500">
          Nenhum usuário pendente de aprovação.
        </td>
      </tr>`;
    return;
  }

  // ✅ Buscar lista de embarcadores para o select
  let embarcadores = [];
  try {
    const resp = await fetch(`${API_BASE}/admin/embarcadores`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await resp.json();
    if (data.success) {
      embarcadores = data.items || [];
      console.log("✅ Embarcadores carregados:", embarcadores.length);
    }
  } catch (err) {
    console.warn("Erro ao carregar embarcadores:", err);
  }

  pendingUsersTbody.innerHTML = state.pendingUsers
    .map((u) => {
      // ✅ SEMPRE mostrar select de embarcadores para usuários não-admin
      const embarcadorSelect = `
        <select class="embarcador-select border border-gray-300 rounded-lg px-2 py-1 text-sm w-full" data-user-id="${u.id}">
          <option value="">Selecione uma empresa...</option>
          ${embarcadores
          .map((emb) => `<option value="${emb.id}">${emb.nome_principal || emb.nome || 'Sem nome'}</option>`)
          .join("")}
        </select>
      `;

      return `
        <tr class="hover:bg-gray-50">
          <td class="px-6 py-3 text-gray-900">${u.email || "N/A"}</td>
          <td class="px-6 py-3 text-gray-900">${u.nome || "N/A"}</td>
          <td class="px-6 py-3 text-gray-700">${u.telefone || "N/A"}</td>
          <td class="px-6 py-3 text-gray-700">${u.cpf || "N/A"}</td>
          <td class="px-6 py-3">
            <span class="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
              Pendente
            </span>
          </td>
          <td class="px-6 py-3">
            ${embarcadorSelect}
          </td>
          <td class="px-6 py-3">
            <div class="flex gap-2">
              <button class="approve-user bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" data-id="${u.id}">
                ✓ Aprovar
              </button>
              <button class="reject-user bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" data-id="${u.id}">
                ✗ Rejeitar
              </button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  // Event listeners para aprovação/rejeição
  pendingUsersTbody.querySelectorAll(".approve-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await approveUser(id);
    });
  });

  pendingUsersTbody.querySelectorAll(".reject-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      await rejectUser(id);
    });
  });
}

async function approveUser(id) {
  try {
    const pend = state.pendingUsers.find((u) => String(u.id) === String(id));
    if (!pend) {
      alert("Usuário não encontrado.");
      return;
    }

    // ✅ Por padrão, usuários são 'embarcador' a menos que seja explicitamente admin
    const asAdmin = confirm(
      `Aprovar "${pend.nome}" como ADMIN?\n\nOK = ADMIN\nCancelar = Cliente/Embarcador`
    );

    let body = { id };

    if (asAdmin) {
      body.role = "admin";
    } else {
      // ✅ SEMPRE pegar o embarcador_id do select para usuários não-admin
      const selectEl = document.querySelector(
        `.embarcador-select[data-user-id="${id}"]`
      );
      const embarcadorId = selectEl?.value;

      if (!embarcadorId) {
        alert("Por favor, selecione uma empresa/embarcador antes de aprovar.");
        return;
      }

      body.role = "embarcador";
      body.embarcador_id = parseInt(embarcadorId);
    }

    const resp = await fetch(`${API_BASE}/admin/approveUser`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(body),
    });

    const out = await resp.json();

    if (!out.success) {
      alert("Erro ao aprovar usuário: " + (out.error || out.message || "desconhecido"));
    } else {
      alert("Usuário aprovado com sucesso!");
      await fetchPendingUsers();
      renderPendingUsers();
    }
  } catch (err) {
    console.error("approveUser error:", err);
    alert("Falha na requisição de aprovação.");
  }
}

async function rejectUser(id) {
  try {
    const resp = await fetch(`${API_BASE}/admin/rejectUser`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ id }),
    });
    const out = await resp.json();
    if (!out.success) {
      alert("Erro rejeitando usuário: " + (out.error || "desconhecido"));
    } else {
      await fetchPendingUsers();
      renderPendingUsers();
    }
  } catch (err) {
    console.error("rejectUser error:", err);
    alert("Falha na requisição de rejeição.");
  }
}

// ------------------------------------------------------
// ✅ OCORRÊNCIAS
// ------------------------------------------------------
function wireOcorrenciasActions() {
  if (ocorrenciasSearchBtn) {
    ocorrenciasSearchBtn.addEventListener('click', () => {
      loadOcorrencias();
    });
  }
}

async function loadOcorrencias() {
  try {
    const booking = ocorrenciasFilterBooking?.value?.trim() || '';
    const tipo = ocorrenciasFilterTipo?.value || '';

    let url = `${API_BASE}/admin/ocorrencias?status=all`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    const data = await resp.json();

    if (!data.success) {
      console.error('Erro ao carregar ocorrências:', data);
      state.ocorrencias = [];
      renderOcorrencias();
      return;
    }

    let ocorrencias = data.items || [];

    // Filtrar localmente
    if (booking) {
      ocorrencias = ocorrencias.filter(o =>
        o.booking?.toLowerCase().includes(booking.toLowerCase())
      );
    }

    if (tipo) {
      ocorrencias = ocorrencias.filter(o => o.tipo_ocorrencia === tipo);
    }

    state.ocorrencias = ocorrencias;
    renderOcorrencias();
  } catch (err) {
    console.error('Erro loadOcorrencias:', err);
    state.ocorrencias = [];
    renderOcorrencias();
  }
}

function renderOcorrencias() {
  if (!ocorrenciasList) return;

  if (state.ocorrencias.length === 0) {
    ocorrenciasList.innerHTML = `
      <div class="text-center py-8 text-gray-500">
        Nenhuma ocorrência encontrada. Use os filtros acima para buscar.
      </div>
    `;
    return;
  }

  const tiposOcorrencia = {
    'atraso': '⏰ Atraso',
    'cancelamento': '🚫 Cancelamento',
    'mudanca_programacao': '📅 Mudança',
    'documentacao': '📄 Documentação',
    'equipamento': '🔧 Equipamento',
    'outros': '📝 Outros'
  };

  const statusLabels = {
    'pendente': { label: 'Pendente', class: 'bg-yellow-100 text-yellow-700' },
    'em_analise': { label: 'Em Análise', class: 'bg-blue-100 text-blue-700' },
    'cliente_notificado': { label: 'Cliente Notificado', class: 'bg-purple-100 text-purple-700' },
    'processada': { label: 'Processada', class: 'bg-green-100 text-green-700' },
    'rejeitada': { label: 'Rejeitada', class: 'bg-red-100 text-red-700' }
  };

  const html = state.ocorrencias
    .map((occ) => {
      const tipo = tiposOcorrencia[occ.tipo_ocorrencia] || occ.tipo_ocorrencia;
      const statusInfo = statusLabels[occ.status] || { label: occ.status, class: 'bg-gray-100 text-gray-700' };
      const dataRegistro = occ.data_criacao ? new Date(occ.data_criacao).toLocaleString('pt-BR') : 'N/A';

      return `
      <div class="bg-white rounded-lg shadow-md p-6 border border-gray-200 hover:shadow-lg transition-all">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h3 class="text-lg font-bold text-purple-700">📦 ${occ.booking}</h3>
            <p class="text-sm text-gray-600">${occ.embarcador_nome || 'N/A'}</p>
          </div>
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.class}">
            ${statusInfo.label}
          </span>
        </div>

        <div class="space-y-2 text-sm mb-4">
          <p><strong>Tipo:</strong> ${tipo}</p>
          <p><strong>Container:</strong> ${occ.container || 'N/A'}</p>
          <p><strong>Porto:</strong> ${occ.porto || 'N/A'}</p>
          <p><strong>Data Registro:</strong> ${dataRegistro}</p>
          <p><strong>Descrição:</strong> ${occ.descricao_ocorrencia || 'Sem descrição'}</p>
        </div>

        ${occ.status !== 'processada' ? `
        <div class="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
          <button class="btn-ocorrencia-status bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" 
                  data-id="${occ.id}" 
                  data-status="processada">
            ✅ Marcar como Tratada
          </button>
          <button class="btn-gerar-eml-individual bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" 
                  data-booking="${occ.booking || ''}"
                  data-container="${occ.container || ''}"
                  data-tipo="${tipo}"
                  data-descricao="${(occ.descricao_ocorrencia || '').replace(/"/g, '&quot;')}"
                  data-porto="${occ.porto || ''}"
                  data-data="${dataRegistro}"
                  data-embarcador="${occ.embarcador_nome || ''}">
            📧 Gerar EML
          </button>
          <button class="btn-ocorrencia-delete bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" 
            data-id="${occ.id}">
            🗑️ Excluir
          </button>
        </div>
        ` : `
        <div class="flex gap-2 pt-4 border-t border-gray-200">
          <button class="btn-gerar-eml-individual bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" 
                  data-booking="${occ.booking || ''}"
                  data-container="${occ.container || ''}"
                  data-tipo="${tipo}"
                  data-descricao="${(occ.descricao_ocorrencia || '').replace(/"/g, '&quot;')}"
                  data-porto="${occ.porto || ''}"
                  data-data="${dataRegistro}"
                  data-embarcador="${occ.embarcador_nome || ''}">
            📧 Gerar EML
          </button>
        </div>
        `}
      </div>
    `;
    })
    .join("");

  ocorrenciasList.innerHTML = html;

  // ✅ Adicionar event listeners nos botões
  document.querySelectorAll('.btn-ocorrencia-status').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const newStatus = btn.dataset.status;
      await updateOcorrenciaStatus(id, newStatus);
    });
  });

  document.querySelectorAll('.btn-ocorrencia-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      await deleteOcorrencia(id);
    });
  });
  // ✅ Event listeners para botões de gerar EML individual
  document.querySelectorAll('.btn-gerar-eml-individual').forEach(btn => {
    btn.addEventListener('click', () => {
      try {
        const booking = btn.dataset.booking || '';
        const container = btn.dataset.container || '';
        const tipo = btn.dataset.tipo || '';
        const descricao = btn.dataset.descricao || '';
        const porto = btn.dataset.porto || '';
        const data = btn.dataset.data || '';
        const embarcador = btn.dataset.embarcador || '';

        let corpo = `Prezados(as),\n\nSegue informação sobre ocorrência registrada:\n\n`;
        corpo += `${'='.repeat(80)}\n\n`;
        corpo += `OCORRÊNCIA\n`;
        corpo += `Booking: ${booking}\n`;
        corpo += `Container: ${container}\n`;
        corpo += `Embarcador: ${embarcador}\n`;
        corpo += `Porto: ${porto}\n`;
        corpo += `Tipo: ${tipo}\n`;
        corpo += `Data Registro: ${data}\n`;
        corpo += `Descrição: ${descricao}\n\n`;
        corpo += `${'='.repeat(80)}\n\n`;
        corpo += `Estamos trabalhando para resolver esta situação o mais breve possível.\n\n`;
        corpo += `Atenciosamente,\nCustomer Service / Mercosul Line`;

        const to = 'cliente@email.com';
        const subject = `Ocorrência - Booking ${booking} - Mercosul Line`;
        const eml = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${corpo.replace(/\n/g, '\r\n')}`;

        const blob = new Blob([eml], { type: 'message/rfc822' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ocorrencia-${booking}-${Date.now()}.eml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2500);

        Toast?.success?.('EML gerado com sucesso!');
      } catch (e) {
        console.error('Erro ao gerar EML:', e);
        Toast?.error?.('Não foi possível gerar o EML: ' + e.message);
      }
    });
  });

}

// ✅ CORREÇÃO: Função atualizada com endpoint correto
async function updateOcorrenciaStatus(id, newStatus) {
  try {
    // ✅ CORRIGIDO: usar /admin/ocorrencias/updateStatus ao invés de /process
    const resp = await fetch(`${API_BASE}/admin/ocorrencias/updateStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        id: parseInt(id),
        status: newStatus
      })
    });

    const data = await resp.json();

    if (data.success) {
      Toast?.success?.('Status atualizado com sucesso!');
      await loadOcorrencias(); // Recarrega a lista
    } else {
      Toast?.error?.('Erro ao atualizar status: ' + (data.error || 'desconhecido'));
    }
  } catch (err) {
    console.error('Erro updateOcorrenciaStatus:', err);
    Toast?.error?.('Falha ao atualizar status');
  }
}

async function deleteOcorrencia(id) {
  try {
    const confirmacao = confirm('Tem certeza que deseja excluir esta ocorrência?');
    if (!confirmacao) return;

    const resp = await fetch(`${API_BASE}/admin/ocorrencias/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ id: parseInt(id) })
    });

    const data = await resp.json();

    if (data.success) {
      Toast?.success?.('Ocorrência excluída com sucesso!');
      await loadOcorrencias(); // Recarrega a lista
    } else {
      Toast?.error?.('Erro ao excluir ocorrência: ' + (data.error || 'desconhecido'));
    }
  } catch (err) {
    console.error('Erro deleteOcorrencia:', err);
    Toast?.error?.('Falha ao excluir ocorrência');
  }
}

// ------------------------------------------------------
// ✅ CORREÇÃO: FETCH DADOS DO BACKEND COM PAGINAÇÃO SERVER-SIDE
// 🔧 FIX: Agora busca TODAS as páginas necessárias
// ------------------------------------------------------
async function fetchAllOps() {
  try {
    const pageSize = 1000; // Busca 1k por vez (limite do Supabase)
    let allOperations = [];
    let currentPage = 1;
    let hasMorePages = true;

    console.log("🔄 Iniciando carregamento de todas as operações...");

    // Loop para buscar todas as páginas
    while (hasMorePages) {
      const resp = await fetch(`${API_BASE}/admin/allOps?page=${currentPage}&pageSize=${pageSize}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      const out = await resp.json();

      if (!out.success) {
        console.error(`❌ Erro ao buscar página ${currentPage}:`, out);
        break;
      }

      // Adiciona as operações da página atual
      if (out.items && out.items.length > 0) {
        allOperations = allOperations.concat(out.items);
        console.log(`📄 Página ${currentPage}/${out.pagination?.totalPages || '?'} carregada: ${out.items.length} operações`);
      }

      // Verifica se há mais páginas
      if (out.pagination) {
        hasMorePages = out.pagination.hasNextPage;

        // Log de progresso
        if (currentPage === 1) {
          console.log(`📊 Total de operações no banco: ${out.pagination.totalItems}`);
          console.log(`📄 Total de páginas: ${out.pagination.totalPages}`);
        }
      } else {
        hasMorePages = false;
      }

      currentPage++;

      // Segurança: evita loop infinito (máximo 100 páginas)
      if (currentPage > 100) {
        console.warn("⚠️ Limite de 100 páginas atingido. Parando o carregamento.");
        break;
      }
    }

    // Normaliza e armazena todas as operações
    state.allOps = normalizeOpsArray(allOperations);

    console.log(`✅ Carregamento concluído: ${state.allOps.length} operações totais`);

    populateEmbarcadorChoices();
    applyFiltersAndSort();
  } catch (error) {
    console.error("❌ Erro fatal ao buscar operações:", error);
    state.allOps = [];
    populateEmbarcadorChoices();
    applyFiltersAndSort();
  }
}

async function fetchPendingUsers() {
  const resp = await fetch(`${API_BASE}/admin/pendingUsers`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const out = await resp.json();
  if (!out.success) {
    console.warn("Nenhum usuário pendente ou erro:", out);
    state.pendingUsers = [];
  } else {
    state.pendingUsers = out.users || [];
  }
}

// ------------------------------------------------------
// LOGOUT
// ------------------------------------------------------
function wireLogout() {
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "index.html";
  });
}

// ------------------------------------------------------
// INIT AUTH + LOAD
// ------------------------------------------------------
// ... (mantenha o código anterior do arquivo admin.js)

// ------------------------------------------------------
// INIT AUTH + LOAD
// ------------------------------------------------------

// ✅ CORREÇÃO PARA ERRO 401: Gerenciamento automático de Token
import { onIdTokenChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// Monitora alterações no token (login inicial e renovações automáticas)
onIdTokenChanged(auth, async (user) => {
  if (!user) {
    console.log("❌ Sem usuário, redirecionando...");
    window.location.href = "index.html";
    return;
  }

  // Atualiza a variável global sempre que o Firebase renovar o token
  authToken = await user.getIdToken();
  console.log("🔑 Token atualizado/renovado com sucesso.");

  // Se for a primeira carga (página acabou de abrir), executa a inicialização
  // Verifica se já carregamos para evitar reload duplo em refresh de token
  if (!window.appInitialized) {
    window.appInitialized = true;
    initApp(user);
  }
});

async function initApp(user) {
  try {
    // 1. Validação de Admin (Whoami)
    const who = await fetch(`${API_BASE}/auth/whoami`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const whoJson = await who.json();

    if (!whoJson.success || whoJson.user?.role !== "admin") {
      alert("Acesso restrito a administradores.");
      window.location.href = "index.html";
      return;
    }

    // Atualiza Header com nome
    const headerElement = document.querySelector('header .page-wrap h1');
    if (headerElement) {
      headerElement.innerHTML = `
        🎯 Painel Administrativo
        <span class="block text-sm font-normal opacity-90 mt-1">
          ${whoJson.user.nome || user.email} <span class="opacity-75">(Admin)</span>
        </span>
      `;
    }

    // 2. Carregamento de Dados
    await fetchAllOps();
    await fetchPendingUsers();
    
    // Carrega ocorrências se a função estiver disponível (no escopo global ou importada)
    // Se loadOcorrencias foi definida dentro do admin.js anterior, chame-a aqui
    if (typeof loadOcorrencias === 'function') await loadOcorrencias();

    // 3. Inicialização de Módulos
    console.log("📊 Inicializando módulo de Analytics...");
    
    // ✅ Passa uma função que sempre pega a variável authToken mais atual
    setAuthTokenGetter(() => authToken); 
    
    await carregarEmbarcadoresAnalytics();
    initAnalytics();
    await buscarAnalytics(); // Carrega gráficos iniciais

    console.log("🚂 Inicializando módulo de Ferrovia...");
    import('./ferrovia.js').then(module => {
      module.initFerrovia(API_BASE, () => authToken);
      console.log("✅ Módulo Ferrovia inicializado");
    });

    initCharts();
    wireKpiClicks();
    wireFiltersAndActions();
    wirePagination();
    wireLogout();
    wireOcorrenciasActions(); // Se essa função existir no seu admin.js

    rerenderAll();
    renderPendingUsers();

  } catch (err) {
    console.error("❌ Erro na inicialização:", err);
  }
}

// ====== Geração de .EML por ocorrência (event delegation, não quebra nada existente) ======
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest?.('.btn-gerar-eml');
  if (!btn) return;
  try {
    const to = btn.dataset.to || '';
    const subject = btn.dataset.subject || 'Aviso de Ocorrência';
    const corpo = (btn.dataset.body || btn.getAttribute('data-body') || '').replace(/\n/g, '\r\n');
    const eml = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${corpo}`;
    const blob = new Blob([eml], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocorrencia_${Date.now()}.eml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  } catch (e) {
    console.error('Falha ao gerar EML:', e);
    alert('Não foi possível gerar o EML desta ocorrência.');
  }
});
// ====== /EML ======
// ✅ NOVO: Handler para gerar EML com todas as ocorrências filtradas
const btnGerarEMLOcorrencias = document.getElementById('ocorrencias-gerar-eml-btn');
if (btnGerarEMLOcorrencias) {
  btnGerarEMLOcorrencias.addEventListener('click', () => {
    try {
      const ocorrencias = state.ocorrencias || [];

      if (ocorrencias.length === 0) {
        Toast?.warning?.('Nenhuma ocorrência para gerar e-mail. Use os filtros para buscar.');
        return;
      }

      // Monta o corpo do e-mail
      let corpo = `Prezados(as),\n\nSegue relatório de ocorrências identificadas:\n\n`;
      corpo += `${'='.repeat(80)}\n\n`;

      ocorrencias.forEach((occ, idx) => {
        corpo += `${idx + 1}. OCORRÊNCIA\n`;
        corpo += `   Booking: ${occ.booking || '—'}\n`;
        corpo += `   Container: ${occ.container || '—'}\n`;
        corpo += `   Tipo: ${occ.tipo || '—'}\n`;
        corpo += `   Data: ${occ.data_ocorrencia || '—'}\n`;
        corpo += `   Descrição: ${occ.descricao || '—'}\n`;
        corpo += `   Responsável: ${occ.responsavel || '—'}\n\n`;
      });

      corpo += `${'='.repeat(80)}\n\n`;
      corpo += `Total de ocorrências: ${ocorrencias.length}\n\n`;
      corpo += `Atenciosamente,\nCustomer Service / Mercosul Line`;

      // Gera o EML
      const to = 'cliente@email.com'; // Pode ser parametrizado
      const subject = `Relatório de Ocorrências - Mercosul Line`;
      const eml = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${corpo.replace(/\n/g, '\r\n')}`;

      const blob = new Blob([eml], { type: 'message/rfc822' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-ocorrencias-${Date.now()}.eml`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2500);

      Toast?.success?.(`EML gerado com ${ocorrencias.length} ocorrências!`);
    } catch (e) {
      console.error('Erro ao gerar EML de ocorrências:', e);
      Toast?.error?.('Não foi possível gerar o EML: ' + e.message);
    }
  });
}