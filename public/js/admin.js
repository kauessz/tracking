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
import { APP_CONFIG } from "./config.js";

// ------------------------------------------------------
// CONFIG
// ------------------------------------------------------
const API_BASE = APP_CONFIG?.API_BASE ?? "http://localhost:8080"; // usa config.js com fallback
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

// atraso em minutos = Execução (ou agora) - Programado
// <=0 => on time ; >0 => atraso
function calculateDelayInMinutes(op) {
  const prog = parseDateBR(op.DataProgramada);
  if (!prog) return 0;

  const execStart = parseDateBR(op.DataChegada) || null;
  const ref = execStart || new Date();

  const diffMs = ref.getTime() - prog.getTime();
  const diffMin = Math.round(diffMs / 60000);
  return diffMin;
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

  const progIso =
    raw.previsao_inicio_atendimento || raw.previsao_inicio || raw.DataProgramada || "";
  const execIso = raw.dt_inicio_execucao || raw.DataChegada || "";

  const progFmt =
    progIso && typeof progIso === "string" && progIso.includes("T") ? isoToBR(progIso) : progIso;
  const execFmt =
    execIso && typeof execIso === "string" && execIso.includes("T") ? isoToBR(execIso) : execIso;

  // ✅ CORREÇÃO 3: Trata motivo vazio/nulo como "sem justificativa" (lowercase unificado)
  let atrasoMotivo = raw.motivo_atraso || raw.justificativa_atraso || raw.JustificativaAtraso || "";
  atrasoMotivo = (atrasoMotivo || "").trim().toLowerCase();
  if (!atrasoMotivo || atrasoMotivo === "-") {
    atrasoMotivo = "sem justificativa";
  }

  const tipoProgRaw = raw.tipo_programacao || raw.TipoOperacao || raw.status_operacao || "";

  return {
    Booking: booking,
    Container: container,
    Cliente: embarcador,
    PortoOperacao: porto,
    DataProgramada: progFmt,
    DataChegada: execFmt,
    JustificativaAtraso: atrasoMotivo,
    TipoOperacao: tipoProgRaw,
  };
}

function normalizeOpsArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeOp);
}

// ------------------------------------------------------
// AGRUPAMENTOS / KPIs / GRÁFICOS
// ------------------------------------------------------
function opMatchesFilters(op) {
  if (state.filters.embarcadores.length > 0) {
    if (!state.filters.embarcadores.includes(op.Cliente)) return false;
  }

  const delayMin = calculateDelayInMinutes(op);
  const isLate = delayMin > 0;
  const isOnTime = delayMin <= 0;
  const isCanceled = /cancel/i.test(op.TipoOperacao || "");

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
  const lateOnly = delays.filter((m) => m > 0);
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
    if (dmin <= 0) continue;

    // ✅ CORREÇÃO 3: Garante que exibe "sem justificativa" (lowercase)
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
  const atrasoFmt = delayMin > 0 ? formatMinutesToHHMM(delayMin) : "ON TIME";

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
          ${
            delayMin > 0
              ? `<span class="text-red-600 font-semibold">${atrasoFmt}</span>`
              : `<span class="text-green-700 font-semibold uppercase">${atrasoFmt}</span>`
          }
        </div>
        <div><span class="font-semibold">Tipo de Operação:</span> ${op.TipoOperacao || "-"}</div>
      </div>
      ${
        motivo && motivo !== "sem justificativa"
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
      const atrasoText = delayMin > 0 ? formatMinutesToHHMM(delayMin) : "ON TIME";
      const isLate = delayMin > 0;

      const rowId = `row-${op.Booking}-${Math.random().toString(36).substr(2, 9)}`;
      const isExpanded = state.expandedBooking === op.Booking;

      let rowHtml = `
      <tr id="${rowId}" class="hover:bg-gray-50 cursor-pointer transition-colors" data-booking="${
        op.Booking || ""
      }">
        <td class="px-6 py-3 font-medium text-gray-900 col-booking">${op.Booking || "—"}</td>
        <td class="px-6 py-3 text-gray-700 col-shipper" title="${op.Cliente || ""}">${
        op.Cliente || "—"
      }</td>
        <td class="px-6 py-3 text-gray-700 col-porto" title="${op.PortoOperacao || ""}">${
        op.PortoOperacao || "—"
      }</td>
        <td class="px-6 py-3 text-gray-700 col-previsao">${formatDateForDisplay(
          op.DataProgramada
        )}</td>
        <td class="px-6 py-3 text-gray-700 col-exec">${formatDateForDisplay(
          op.DataChegada
        )}</td>
        <td class="px-6 py-3 text-center col-atraso ${
          isLate ? "text-red-600 font-bold" : "text-green-600"
        }">${atrasoText}</td>
        <td class="px-6 py-3 text-gray-600 text-sm col-motivo" title="${
          op.JustificativaAtraso || "Nenhum motivo informado"
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
      const atrasoFmt = delayMin > 0 ? formatMinutesToHHMM(delayMin) : "ON TIME";
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
      `✅ Importação concluída!\n${data.inserted || 0} inseridos • ${
        data.updated || 0
      } atualizados • ${data.skipped || 0} ignorados`,
      6000
    );

    setStatus(
      `Importação OK: ${processed} processados (${data.inserted || 0} inseridos, ${
        data.updated || 0
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
  const booking = row.Booking || row.booking || row.BOOKING || null;
  const cliente = row.Cliente || row.cliente || row.Embarcador || row.embarcador || null;
  const container = row.Container || row.container || row.containers || null;
  const tipoOp =
    row["Tipo Operação"] ||
    row.TipoOperacao ||
    row.tipo_programacao ||
    row.TipoProgramacao ||
    null;
  const porto =
    row["Porto Operação"] || row.PortoOperacao || row.porto_operacao || null;
  let justificativa =
    row["Justificativa Atraso"] ||
    row.JustificativaAtraso ||
    row.justificativa_atraso ||
    null;

  // ✅ CORREÇÃO 3: Normaliza justificativa vazia
  if (!justificativa || justificativa.trim() === "" || justificativa.trim() === "-") {
    justificativa = "sem justificativa";
  } else {
    justificativa = justificativa.trim();
  }

  let dataProgramada =
    row["Data Programada"] ||
    row.DataProgramada ||
    row.previsao_inicio_atendimento ||
    null;
  let dataChegada =
    row["Data Chegada"] || row.DataChegada || row.dt_inicio_execucao || null;

  if (dataProgramada) {
    const parsed = Parse?.dateAuto?.(dataProgramada);
    if (parsed) {
      dataProgramada = Format?.dateTime?.(parsed) || dataProgramada;
    } else {
      console.warn(`Linha ${idx + 1}: Data Programada inválida:`, dataProgramada);
      dataProgramada = null;
    }
  }

  if (dataChegada) {
    const parsed = Parse?.dateAuto?.(dataChegada);
    if (parsed) {
      dataChegada = Format?.dateTime?.(parsed) || dataChegada;
    } else {
      console.warn(`Linha ${idx + 1}: Data Chegada inválida:`, dataChegada);
      dataChegada = null;
    }
  }

  if (!booking) {
    throw new Error(`Linha ${idx + 1}: Booking ausente`);
  }

  return {
    Booking: booking,
    Cliente: cliente,
    Container: container,
    TipoOperacao: tipoOp,
    PortoOperacao: porto,
    DataProgramada: dataProgramada,
    DataChegada: dataChegada,
    JustificativaAtraso: justificativa.toLowerCase(),
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
      embarcadores = data.embarcadores || [];
    }
  } catch (err) {
    console.warn("Erro ao carregar embarcadores:", err);
  }

  pendingUsersTbody.innerHTML = state.pendingUsers
    .map((u) => {
      const tipoLabel =
        u.tipo_conta === "internal" ? "Funcionário" : "Cliente/Embarcador";
      const tipoColor =
        u.tipo_conta === "internal"
          ? "bg-blue-100 text-blue-700"
          : "bg-green-100 text-green-700";

      // ✅ Select de embarcadores (só aparece se tipo for 'shipper')
      const embarcadorSelect =
        u.tipo_conta === "shipper"
          ? `
        <select class="embarcador-select border border-gray-300 rounded-lg px-2 py-1 text-sm" data-user-id="${
          u.id
        }">
          <option value="">Selecione...</option>
          ${embarcadores
            .map((emb) => `<option value="${emb.id}">${emb.nome}</option>`)
            .join("")}
        </select>
      `
          : '<span class="text-gray-400 text-xs">N/A</span>';

      return `
        <tr class="hover:bg-gray-50">
          <td class="px-6 py-3 text-gray-900">${u.email || "N/A"}</td>
          <td class="px-6 py-3 text-gray-900">${u.nome || "N/A"}</td>
          <td class="px-6 py-3 text-gray-700">${u.telefone || "N/A"}</td>
          <td class="px-6 py-3 text-gray-700">${u.cpf || "N/A"}</td>
          <td class="px-6 py-3">
            <span class="px-2 py-1 rounded-full text-xs font-semibold ${tipoColor}">
              ${tipoLabel}
            </span>
          </td>
          <td class="px-6 py-3">
            ${embarcadorSelect}
          </td>
          <td class="px-6 py-3">
            <div class="flex gap-2">
              <button class="approve-user bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" data-id="${
                u.id
              }">
                ✓ Aprovar
              </button>
              <button class="reject-user bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all" data-id="${
                u.id
              }">
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

    const asAdmin = confirm(
      `Aprovar "${pend.nome}" como ADMIN?\n\nOK = ADMIN\nCancelar = ${
        pend.tipo_conta === "internal" ? "Funcionário" : "Cliente/Embarcador"
      }`
    );

    let body = { id };

    if (asAdmin) {
      body.role = "admin";
    } else {
      // ✅ Se não for admin, pegar o embarcador_id do select
      if (pend.tipo_conta === "shipper") {
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
      } else {
        body.role = "funcionario";
      }
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
      alert("Erro ao aprovar usuário: " + (out.error || "desconhecido"));
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
// GESTÃO DE OCORRÊNCIAS
// ------------------------------------------------------
async function loadOcorrencias() {
  try {
    const booking = state.ocorrenciasFilter.booking;
    const tipo = state.ocorrenciasFilter.tipo;

    let url = `${API_BASE}/admin/ocorrencias/list`;
    const params = new URLSearchParams();

    if (booking) params.append("booking", booking);
    if (tipo) params.append("tipo", tipo);

    if (params.toString()) {
      url += "?" + params.toString();
    }

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    const data = await resp.json();

    if (data.success) {
      state.ocorrencias = data.ocorrencias || [];
      renderOcorrencias();
    } else {
      console.error("Erro ao carregar ocorrências:", data);
      state.ocorrencias = [];
      renderOcorrencias();
    }
  } catch (err) {
    console.error("Erro loadOcorrencias:", err);
    state.ocorrencias = [];
    renderOcorrencias();
  }
}

function renderOcorrencias() {
  if (!ocorrenciasList) return;

  if (state.ocorrencias.length === 0) {
    ocorrenciasList.innerHTML = `
      <p class="text-gray-500 text-center py-8">
        Nenhuma ocorrência encontrada. Use os filtros acima para buscar.
      </p>
    `;
    return;
  }

  const html = state.ocorrencias
    .map((occ) => {
      const tipoIcons = {
        inicio_operacao: "🚀",
        fim_operacao: "✅",
        atraso: "⏰",
        problema_operacional: "⚠️",
        observacao: "📝",
      };

      const tipoLabels = {
        inicio_operacao: "Início de Operação",
        fim_operacao: "Fim de Operação",
        atraso: "Atraso",
        problema_operacional: "Problema Operacional",
        observacao: "Observação",
      };

      const icon = tipoIcons[occ.tipo] || "📋";
      const tipoLabel = tipoLabels[occ.tipo] || occ.tipo;
      const data = new Date(occ.data_registro).toLocaleString("pt-BR");

      return `
      <div class="glass-card p-4 border-l-4 ${
        occ.tipo === "atraso" || occ.tipo === "problema_operacional"
          ? "border-red-500"
          : "border-blue-500"
      }">
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${icon}</span>
            <div>
              <h3 class="font-bold text-gray-900">${tipoLabel}</h3>
              <p class="text-xs text-gray-500">${data}</p>
            </div>
          </div>
          <span class="text-xs font-semibold px-3 py-1 rounded-full ${
            occ.tipo === "atraso" || occ.tipo === "problema_operacional"
              ? "bg-red-100 text-red-700"
              : "bg-blue-100 text-blue-700"
          }">
            ${tipoLabel}
          </span>
        </div>
        
        <div class="grid grid-cols-2 gap-4 text-sm mb-3">
          <div>
            <span class="font-semibold text-gray-700">Booking:</span>
            <span class="text-gray-900">${occ.booking || "N/A"}</span>
          </div>
          <div>
            <span class="font-semibold text-gray-700">Container:</span>
            <span class="text-gray-900">${occ.container || "N/A"}</span>
          </div>
        </div>
        
        <div class="text-sm">
          <span class="font-semibold text-gray-700">Descrição:</span>
          <p class="text-gray-900 mt-1">${occ.descricao || ""}</p>
        </div>
      </div>
    `;
    })
    .join("");

  ocorrenciasList.innerHTML = html;
}

// ------------------------------------------------------
// FETCH DADOS DO BACKEND
// ------------------------------------------------------
async function fetchAllOps() {
  const resp = await fetch(`${API_BASE}/admin/allOps`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const out = await resp.json();
  if (!out.success) {
    console.error("Erro /admin/allOps:", out);
    state.allOps = [];
  } else {
    state.allOps = normalizeOpsArray(out.items || []);
  }
  populateEmbarcadorChoices();
  applyFiltersAndSort();
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
onAuthStateChanged(auth, async (user) => {
  console.log("🔐 Admin - onAuthStateChanged disparado");
  console.log("👤 Usuário:", user ? user.email : "nenhum");

  if (!user) {
    console.log("❌ Sem usuário, redirecionando para login...");
    window.location.href = "index.html";
    return;
  }

  console.log("✅ Usuário autenticado, obtendo token...");
  authToken = await user.getIdToken(true);
  console.log("🔑 Token obtido:", authToken ? "OK" : "FALHOU");

  try {
    console.log("📡 Chamando /auth/whoami...");
    console.log("🔗 URL:", `${API_BASE}/auth/whoami`);

    const who = await fetch(`${API_BASE}/auth/whoami`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    console.log("📡 Status da resposta whoami:", who.status);

    const whoJson = await who.json();
    console.log("📦 Resposta whoami:", whoJson);

    if (!whoJson.success) {
      console.error("❌ whoami.success =", whoJson.success);
      alert("Usuário sem acesso ativo. Error: " + (whoJson.error || "desconhecido"));
      window.location.href = "index.html";
      return;
    }

    if (whoJson.user?.status !== "ativo") {
      console.error("❌ Status do usuário:", whoJson.user?.status);
      alert("Usuário sem acesso ativo. Status: " + whoJson.user?.status);
      window.location.href = "index.html";
      return;
    }

    if (whoJson.user.role !== "admin") {
      console.error("❌ Role do usuário:", whoJson.user.role);
      alert("Acesso restrito a administradores. Você é: " + whoJson.user.role);
      window.location.href = "portal.html";
      return;
    }

    console.log("✅ Validação OK! Usuário é admin ativo");
  } catch (err) {
    console.error("❌ Erro whoami:", err);
    alert("Falha ao validar acesso administrativo: " + err.message);
    window.location.href = "index.html";
    return;
  }

  await fetchAllOps();
  await fetchPendingUsers();
  // ✅ Carrega ocorrências na inicialização
  await loadOcorrencias();

  initCharts();
  wireKpiClicks();
  wireFiltersAndActions();
  wirePagination();
  wireLogout();

  rerenderAll();
  renderPendingUsers();

  console.debug("✅ Admin.js inicializado com sucesso!");
  console.debug("📊 Total de operações:", state.allOps.length);
});