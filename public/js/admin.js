// --- Módulos Firebase ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, onSnapshot, collection, query, where,
  getDocs, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI/Utils ---
import {
  initializeUI, renderData, populateClientFilter, getFilters,
  clearFilters, showDetailsScreen
} from "./ui.js";
import {
  formatDateForDisplay,
  parseDate,
  calculateDelayInMinutes,
  formatMinutesToHHMM
} from "./utils.js";

/* ------------------------------------------------------------------ */
/* ESTADO GLOBAL                                                       */
/* ------------------------------------------------------------------ */
let allData = [];
let currentlyDisplayedData = [];

/* ------------------------------------------------------------------ */
/* NORMALIZAÇÃO                                                        */
/* ------------------------------------------------------------------ */

// pega primeiro valor existente dentro de uma lista de chaves
const by = (row, keys) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
};

const pickCPFfromRow = (row) =>
  row?.["CPF motorista programado"] ??
  row?.["CPF Motorista Programado"] ??
  row?.["CPF_Motorista_Programado"] ??
  row?.["CPF Motorista"] ??
  row?.CPFMotorista ??
  row?.CpfMotorista ??
  row?.CPF ??
  row?.Cpf ??
  null;

/** Normaliza uma linha vinda da planilha para o nosso schema */
const normalizeRowKeys = (r) => {
  const clean = (v) => (v ?? "").toString().trim();

  const out = { ...r };

  // ---------- Chaves principais ----------
  out.NumeroProgramacao =
    out.NumeroProgramacao ??
    clean(by(r, ["Número da programação", "Numero da Programacao", "Nº Programação", "Nº Prog."]));

  out.Booking = out.Booking ?? clean(by(r, ["Booking", "Booking "]));
  out.Container = out.Container ?? clean(by(r, ["Containers", "Container"]));

  // Embarcador (vira Cliente no app)
  out.Cliente = out.Cliente ?? clean(by(r, ["Embarcador", "Cliente"]));
  out.NumeroCliente = out.NumeroCliente ?? clean(by(r, ["Número cliente", "Numero cliente", "Nº Cliente"]));

  // Datas (mantemos como string/número; utils.parseDate trata os casos)
  out.DataProgramada =
    out.DataProgramada ??
    by(r, ["Previsão início atendimento (BRA)", "Previsao inicio atendimento (BRA)", "Previsão Início", "Previsao Inicio"]);

  out.DataChegada =
    out.DataChegada ??
    by(r, ["Dt Início da Execução (BRA)", "Dt Inicio da Execucao (BRA)", "Início Execução", "Inicio Execucao"]);

  out.DataSaida =
    out.DataSaida ??
    by(r, ["Dt FIM da Execução (BRA)", "Dt Fim da Execucao (BRA)", "Fim Execução", "Fim Execucao"]);

  out.DataPrevisaoEntregaRecalculada =
    out.DataPrevisaoEntregaRecalculada ??
    by(r, ["Data de previsão de entrega recalculada (BRA)", "Data de previsao de entrega recalculada (BRA)"]);

  // Diversos
  out.TipoProgramacao =
    out.TipoProgramacao ??
    clean(by(r, ["Tipo de programação", "Tipo Programação", "Tipo"]));

  out.SituacaoProgramacao =
    out.SituacaoProgramacao ??
    clean(by(r, ["Situação programação", "Situacao programacao", "Situação", "Situacao"]));

  out.SituacaoPrazoProgramacao =
    out.SituacaoPrazoProgramacao ??
    clean(by(r, ["Situação prazo programação", "Situacao prazo programacao"]));

  out.Transportadora = out.Transportadora ?? clean(by(r, ["Transportadora"]));
  out.JustificativaAtraso = out.JustificativaAtraso ?? clean(by(r, ["Justificativa de atraso de programação", "Justificativa de atraso"]));

  out.CidadeDescarga =
    out.CidadeDescarga ??
    clean(by(r, ["Cidade local de atendimento", "Cidade", "Cidade Descarga"]));

  out.NomeLocalAtendimento = out.NomeLocalAtendimento ?? clean(by(r, ["Nome local de atendimento"]));

  // Motorista / veículos
  out.NomeMotoristaProgramado =
    out.NomeMotoristaProgramado ??
    clean(by(r, ["Nome do motorista programado", "Nome Motorista Programado", "Nome Motorista", "Motorista"]));

  const cpf = pickCPFfromRow(r);
  if (cpf) out.CpfMotorista = String(cpf).replace(/[^\d]/g, "");

  out.PlacaVeiculo = out.PlacaVeiculo ?? clean(by(r, ["Placa do veículo", "Placa do veiculo"]));
  out.PlacaCarreta1 = out.PlacaCarreta1 ?? clean(by(r, ["Placa da carreta 1"]));
  out.PlacaCarreta2 = out.PlacaCarreta2 ?? clean(by(r, ["Placa da carreta 2"]));

  // POL / POD
  out.POL = out.POL ?? clean(by(r, ["POL", "Pol", "Porto Origem"]));
  out.POD = out.POD ?? clean(by(r, ["POD", "Pod", "Porto Destino"]));

  // Porto da Operação (coleta => POL, entrega => POD, senão primeiro disponível)
  if (!out.PortoOperacao) {
    const tipo = clean(out.TipoProgramacao).toLowerCase();
    const pol = clean(out.POL);
    const pod = clean(out.POD);
    if (tipo.includes("coleta")) out.PortoOperacao = pol || pod || "";
    else if (tipo.includes("entrega")) out.PortoOperacao = pod || pol || "";
    else out.PortoOperacao = pol || pod || "";
  }

  for (const k of Object.keys(out)) {
    if (out[k] === undefined) out[k] = null;
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* APROVAÇÃO DE USUÁRIOS (igual ao anterior)                          */
/* ------------------------------------------------------------------ */
const updateUserStatus = async (db, uid, newStatus, details = {}) => {
  try {
    const userDocRef = doc(db, "users", uid);
    const updateData = { status: newStatus, ...details };
    await updateDoc(userDocRef, updateData);
    displayPendingUsers(db);
  } catch (error) {
    console.error("Erro ao atualizar o estado do utilizador:", error);
  }
};

const displayPendingUsers = async (db) => {
  const tableBody = document.getElementById("pending-users-table-body");
  if (!tableBody) return;

  const q = query(collection(db, "users"), where("status", "==", "pending"));
  const querySnapshot = await getDocs(q);

  const uniqueShippers = [...new Set(allData.map(i => i.Cliente).filter(Boolean))].sort();

  tableBody.innerHTML = "";
  if (querySnapshot.empty) {
    tableBody.innerHTML =
      '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500">Nenhum pedido de registo pendente.</td></tr>';
    return;
  }

  querySnapshot.forEach((snap) => {
    const user = snap.data();
    const tr = document.createElement("tr");

    const tdEmail = document.createElement("td");
    tdEmail.className = "px-6 py-4 text-sm";
    tdEmail.textContent = user.email || "";
    tr.appendChild(tdEmail);

    const tdSelect = document.createElement("td");
    tdSelect.className = "px-6 py-4 text-sm";

    const shipperSelect = document.createElement("select");
    shipperSelect.className = "border rounded px-2 py-1 mr-2";
    const roleSelect = document.createElement("select");
    roleSelect.className = "border rounded px-2 py-1";

    const def = document.createElement("option");
    def.value = "";
    def.textContent = "Selecionar Embarcador";
    shipperSelect.appendChild(def);
    uniqueShippers.forEach((s) => {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = s;
      shipperSelect.appendChild(o);
    });

    ["embarcador", "admin"].forEach((r) => {
      const o = document.createElement("option");
      o.value = r;
      o.textContent = r;
      roleSelect.appendChild(o);
    });

    tdSelect.appendChild(shipperSelect);
    tdSelect.appendChild(roleSelect);
    tr.appendChild(tdSelect);

    const tdActions = document.createElement("td");
    tdActions.className = "px-6 py-4 text-sm";

    const approve = document.createElement("button");
    approve.className = "bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded mr-2";
    approve.textContent = "Aprovar";
    approve.onclick = async () => {
      if (!shipperSelect.value || !roleSelect.value)
        return alert("Selecione um embarcador e uma função.");
      await updateUserStatus(db, snap.id, "approved", {
        associatedShipper: shipperSelect.value,
        role: roleSelect.value,
      });
    };

    const reject = document.createElement("button");
    reject.className = "bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded";
    reject.textContent = "Rejeitar";
    reject.onclick = async () => {
      await updateUserStatus(db, snap.id, "rejected");
    };

    tdActions.appendChild(approve);
    tdActions.appendChild(reject);
    tr.appendChild(tdActions);

    tableBody.appendChild(tr);
  });
};

/* ------------------------------------------------------------------ */
/* UPLOAD/LIMPAR                                                       */
/* ------------------------------------------------------------------ */
const ensureXLSX = async () => {
  if (window.XLSX) return window.XLSX;

  for (let i = 0; i < 20; i++) {
    if (window.XLSX) return window.XLSX;
    await new Promise(r => setTimeout(r, 100));
  }

  const tryLoad = (url) => new Promise((resolve) => {
    const prev = document.getElementById("xlsx-lib");
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

    const s = document.createElement("script");
    s.id = "xlsx-lib";
    s.src = url;
    s.async = true;
    s.crossOrigin = "anonymous";
    document.head.appendChild(s);

    const timeout = setTimeout(() => resolve(null), 5000);
    s.onload = () => { clearTimeout(timeout); resolve(window.XLSX || null); };
    s.onerror = () => { clearTimeout(timeout); resolve(null); };
  });

  let lib = await tryLoad("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.full.min.js");
  if (!lib) lib = await tryLoad("https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js");

  return lib;
};

// Remove/normaliza qualquer undefined (profundamente)
const stripUndefinedDeep = (val) => {
  if (Array.isArray(val)) {
    // normaliza cada item e remove itens 100% undefined
    return val.map(stripUndefinedDeep).filter(v => v !== undefined);
  }
  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      const sv = stripUndefinedDeep(v);
      if (sv !== undefined) out[k] = sv; // não escreve chaves undefined
    }
    return out;
  }
  // em folhas: converte undefined -> null (Firestore permite null)
  return val === undefined ? null : val;
};

const handleFileUpload = async (event, db, dataRef) => {
  const input = event.target;
  const file = input.files && input.files[0];
  const statusEl = document.getElementById("upload-status");
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };

  if (!file) { setStatus("Nenhum ficheiro selecionado."); return; }

  try {
    setStatus("Carregando biblioteca XLSX...");
    const XLSX = await ensureXLSX();
    if (!XLSX) throw new Error("Falha ao carregar a biblioteca XLSX (CDN bloqueada?).");

    setStatus(`Lendo arquivo: ${file.name} ...`);
    const buffer = await file.arrayBuffer();

    setStatus("Processando planilha...");
    const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
    const sheetName = workbook.SheetNames?.[0];
    const sheet = sheetName ? workbook.Sheets[sheetName] : null;
    if (!sheet) throw new Error("Planilha vazia ou inválida.");

    const rawRows = XLSX.utils.sheet_to_json(sheet);
    if (!Array.isArray(rawRows) || rawRows.length === 0)
      throw new Error("Nenhuma linha encontrada na planilha.");

    // normaliza cada linha
    const normRows = rawRows.map(normalizeRowKeys)
      // descartamos linhas totalmente vazias (sem nº programação e sem booking/container)
      .filter(r => {
        const hasKey = (r.NumeroProgramacao && r.NumeroProgramacao !== "") ||
          (r.Booking && r.Booking !== "") ||
          (r.Container && r.Container !== "");
        return hasKey;
      });

    // chave principal = Número da programação; fallback = Booking-Container
    const makeKey = (row) => {
      const prog = (row.NumeroProgramacao || "").toString().trim();
      if (prog) return `prog:${prog}`;
      const b = (row.Booking || "").toString().trim();
      const c = (row.Container || "").toString().trim();
      return `bc:${b}-${c}`;
    };

    // dentro do arquivo, mesclamos registros com a mesma chave (último ganha)
    const uploadMap = new Map();
    normRows.forEach((r) => {
      const k = makeKey(r);
      uploadMap.set(k, { ...uploadMap.get(k), ...r });
    });

    setStatus("Mesclando com dados existentes...");
    const snap = await getDoc(dataRef);
    const existing = snap.exists() ? (snap.data().records || []) : [];

    const finalMap = new Map();
    // 1) carrega existentes normalizados
    existing.forEach((r) => {
      const nr = normalizeRowKeys(r);
      finalMap.set(makeKey(nr), nr);
    });
    // 2) sobrescreve/insere com o que veio no upload
    for (const [k, r] of uploadMap.entries()) {
      const prev = finalMap.get(k) || {};
      finalMap.set(k, { ...prev, ...r });
    }

    const finalRows = Array.from(finalMap.values());

    const finalRowsClean = finalRows.map(stripUndefinedDeep);

    setStatus("Gravando no Firestore...");
    await setDoc(
      dataRef,
      { updatedAt: new Date().toISOString(), records: finalRowsClean },
      { merge: true }
    );

    setStatus(`✅ Importados/atualizados ${uploadMap.size} registros. Total agora: ${finalRows.length}.`);
    console.log("Upload concluído:", { atualizados: uploadMap.size, total: finalRows.length });
  } catch (err) {
    console.error("Falha no upload:", err);
    setStatus(`❌ Erro no upload: ${err.message || err}`);
  } finally {
    try { input.value = ""; } catch (_) { }
  }
};

const handleClearData = async (db, dataRef) => {
  if (!confirm("Tem certeza? Esta ação é irreversível.")) return;
  await setDoc(
    dataRef,
    { updatedAt: new Date().toISOString(), records: [] },
    { merge: true }
  );
  alert("Dados limpos com sucesso.");
};

/* ------------------------------------------------------------------ */
/* FILTROS + RENDER                                                    */
/* ------------------------------------------------------------------ */
const norm = (s) => (s ?? "").toString().trim().toLowerCase();

const applyFiltersAndRender = () => {
  const { clients, booking, date } = getFilters();

  // remove operações Canceladas ANTES de qualquer cálculo/render
  let filtered = [...allData].filter(
    (r) => !norm(r.SituacaoProgramacao).includes("cancelada")
  );

  if (clients.length) {
    const set = new Set(clients.map(norm));
    filtered = filtered.filter((r) => set.has(norm(r.Cliente)));
  }

  if (booking) {
    const t = norm(booking);
    filtered = filtered.filter(
      (r) =>
        norm(r.Booking).includes(t) ||
        norm(r.Container).includes(t) ||
        norm(r.PortoOperacao).includes(t)
    );
  }

  if (date) {
    filtered = filtered.filter((r) => {
      if (!r.DataProgramada) return false;
      const d = parseDate(r.DataProgramada);
      return d && d.toISOString().slice(0, 10) === date;
    });
  }

  currentlyDisplayedData = filtered;
  renderData(filtered, allData);
};

const handleDashboardClick = (type) => {
  if (type === "all") {
    showDetailsScreen("Detalhes das Operações (Filtro Ativo)", currentlyDisplayedData);
  } else if (type === "onTime") {
    const ontime = currentlyDisplayedData.filter((r) => calculateDelayInMinutes(r) <= 0);
    showDetailsScreen("Detalhes - Operações On Time (Filtro Ativo)", ontime);
  } else if (type === "delayed") {
    const delayed = currentlyDisplayedData.filter((r) => calculateDelayInMinutes(r) > 0);
    showDetailsScreen("Detalhes - Operações com Atraso (Filtro Ativo)", delayed);
  }
};

/* ------------------------------------------------------------------ */
/* E-MAIL .EML (download)                                             */
/* ------------------------------------------------------------------ */
const downloadBlob = (name, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const rowsToEmailTable = (rows) => {
  const th = (t) => `<th style="border:1px solid #e5e7eb;padding:8px;background:#f9fafb;text-align:left">${t}</th>`;
  const td = (t) => `<td style="border:1px solid #e5e7eb;padding:8px">${t ?? ""}</td>`;

  const header =
    `<tr>
      ${th("Booking")}${th("Cliente")}${th("Container")}${th("Porto")}
      ${th("Previsão Início")}${th("Início Execução")}${th("Atraso")}
    </tr>`;

  const body = rows.map(r => {
    const m = calculateDelayInMinutes(r);
    const atraso = (m ?? 0) > 0 ? formatMinutesToHHMM(m) : "ON TIME";
    return `<tr>
      ${td(r.Booking || "-")}${td(r.Cliente || "-")}${td(r.Container || "-")}${td(r.PortoOperacao || "-")}
      ${td(formatDateForDisplay(r.DataProgramada) || "-")}
      ${td(formatDateForDisplay(r.DataChegada) || "-")}
      ${td(atraso)}
    </tr>`;
  }).join("");

  return `<table style="border-collapse:collapse;width:100%;font-family:Inter,Arial,sans-serif;font-size:14px;margin:12px 0">
            <thead>${header}</thead><tbody>${body}</tbody></table>`;
};

const generateDelayedEmailEML = () => {
  const { clients } = getFilters();
  const source = clients.length ? currentlyDisplayedData : allData;

  const delayed = source.filter(r => (calculateDelayInMinutes(r) ?? 0) > 0);
  if (!delayed.length) {
    alert("Nenhuma operação atrasada para compor o e-mail.");
    return;
  }

  let subjectClient = "Operações";
  if (clients.length === 1) {
    subjectClient = clients[0];
  } else {
    const uniq = [...new Set(delayed.map(r => r.Cliente).filter(Boolean))];
    subjectClient = uniq.length === 1 ? uniq[0] : "Clientes Diversos";
  }

  const subject = `Aviso de Atraso - ${subjectClient}`;
  const bodyHtml = `
  <div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">
    <p>Prezada equipe ${subjectClient},</p>
    <p>Gostaríamos de informar que identificamos atraso nas seguintes operações:</p>
    ${rowsToEmailTable(delayed)}
    <p>Estamos trabalhando para apurar a nova previsão de chegada. Você receberá um e-mail subsequente com a previsão atualizada assim que a informação for confirmada.</p>
    <p>Atenciosamente,<br/>Mercosul Line</p>
  </div>`.trim();

  const headers = [
    "From: Mercosul Line <no-reply@mercosulline.local>",
    "To: destinatario@exemplo.com",
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8"
  ].join("\r\n");

  const eml = `${headers}\r\n\r\n${bodyHtml}`;
  const slug = subjectClient.toLowerCase().replace(/[^\w]+/g, "-");
  downloadBlob(`aviso_atraso_${slug}.eml`, new Blob([eml], { type: "message/rfc822" }));
};

/* ------------------------------------------------------------------ */
/* DIÁRIO DE BORDO (substitui Exportar Excel)                          */
/* ------------------------------------------------------------------ */
const wireLogbookLink = () => {
  const btn = document.getElementById("export-excel");
  if (!btn) return;

  // abrimos direto no link fixo do Diário de Bordo
  const url = "https://diario-bordo.netlify.app/";

  btn.textContent = "Abrir Diário de Bordo";
  btn.addEventListener("click", () => {
    window.open(url, "_blank");
  });
};

/* ------------------------------------------------------------------ */
/* INICIALIZAÇÃO                                                       */
/* ------------------------------------------------------------------ */
const initializeAdminPage = (auth, db, user) => {
  getDoc(doc(db, "users", user.uid)).then((snap) => {
    const d = snap.data();
    if (d?.role === "admin") {
      const sec = document.getElementById("user-management-section");
      if (sec) sec.classList.remove("hidden");
    }
  });

  const logoutButton = document.getElementById("logout-button");
  if (logoutButton) logoutButton.addEventListener("click", () => signOut(auth).then(() => (window.location.href = "index.html")));

  const dataRef = doc(db, "tracking_data", "latest");

  const uploadInput = document.getElementById("upload-file");
  if (uploadInput) uploadInput.addEventListener("change", (e) => handleFileUpload(e, db, dataRef));

  const clearDataBtn = document.getElementById("clear-data-btn");
  if (clearDataBtn) clearDataBtn.addEventListener("click", () => handleClearData(db, dataRef));

  document.getElementById("compose-email-btn")?.addEventListener("click", generateDelayedEmailEML);
  document.getElementById("send-email-btn")?.addEventListener("click", generateDelayedEmailEML);

  wireLogbookLink();

  initializeUI(applyFiltersAndRender, (type) => {
    if (type === "all") handleDashboardClick("all");
    if (type === "onTime") handleDashboardClick("onTime");
    if (type === "delayed") handleDashboardClick("delayed");
  });

  onSnapshot(dataRef, (snap) => {
    const data = snap.exists() ? (snap.data().records || []) : [];
    allData = Array.isArray(data) ? data : [];
    populateClientFilter(allData);
    applyFiltersAndRender();
    displayPendingUsers(db);
  });
};

const checkAuth = async () => {
  try {
    const config = JSON.parse(__firebase_config);
    const app = initializeApp(config);
    const auth = getAuth(app);
    const db = getFirestore(app);

    onAuthStateChanged(auth, (user) => {
      if (user) initializeAdminPage(auth, db, user);
      else window.location.href = "index.html";
    });
  } catch (err) {
    console.error("Erro ao inicializar o Firebase:", err);
  }
};

document.addEventListener("DOMContentLoaded", checkAuth);