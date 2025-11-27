// js/ferrovia.js - VERSÃO COM AÇÕES EM MASSA VISÍVEIS E AGENDAMENTO NO PORTO

import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs';
import { getApiUrl } from "./config.js";
import { Toast, Loading } from "./utilities.js";

const API_BASE = getApiUrl();
let currentAuthToken = null;
let ferroviaData = [];
let currentFilter = 'aguardando_chegada';
let selectedIds = new Set();

// Formatadores
function formatDateLocal(isoStr) {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '-';
    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
    const normalized = new Date(d.getTime() + userTimezoneOffset);
    return normalized.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function toInputDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
    const normalized = new Date(d.getTime() + userTimezoneOffset);
    const pad = (n) => String(n).padStart(2, '0');
    return `${normalized.getFullYear()}-${pad(normalized.getMonth()+1)}-${pad(normalized.getDate())}T${pad(normalized.getHours())}:${pad(normalized.getMinutes())}`;
}

export function initFerrovia(apiBase, getToken) {
  currentAuthToken = getToken;
  
  // Injeta a barra de ações em massa
  setupBulkActionsUI();

  carregarDadosFerrovia();

  // Listeners dos Filtros (Cards)
  const filters = {
      'kpi-ferrovia-maritimo': 'aguardando_chegada',
      'kpi-ferrovia-porto': 'no_porto',
      'kpi-ferrovia-terminal': 'terminal_apoio',
      'kpi-ferrovia-transito': 'aguardando_entrega', // Inclui agendado
      'kpi-ferrovia-entregues': 'entregue'
  };

  Object.entries(filters).forEach(([id, status]) => {
      document.getElementById(id)?.addEventListener('click', () => filtrarTabela(status));
  });

  // Ferramentas
  document.getElementById('ferrovia-gerar-relatorio-btn')?.addEventListener('click', gerarRelatorioCompleto);
  document.getElementById('ferrovia-download-modelo-ops-btn')?.addEventListener('click', baixarModeloOperacoes);
  document.getElementById('ferrovia-download-modelo-prio-btn')?.addEventListener('click', baixarModeloPrioridades);
  document.getElementById('ferrovia-limpar-btn')?.addEventListener('click', limparOperacoes);
  
  const inputOp = document.getElementById('ferrovia-upload-file');
  if(inputOp) inputOp.addEventListener('change', (e) => handleUpload(e, 'ops'));

  const inputPrio = document.getElementById('ferrovia-upload-prioridades-file');
  if(inputPrio) inputPrio.addEventListener('change', (e) => handleUpload(e, 'prio'));

  // Expondo funções globais
  window.ferroviaActions = { 
    confirmarChegadaPorto, 
    moverParaTerminal, 
    moverParaEntrega, 
    darBaixa,
    editarOperacao,
    voltarPasso,
    salvarEdicao,
    agendarEntrega,
    toggleSelect,
    toggleSelectAll,
    executarBulkAction // Função do botão da barra
  };
}

// --- BARRA DE AÇÕES EM MASSA ---
function setupBulkActionsUI() {
    const container = document.querySelector('#tab-ferrovia .glass-card');
    if(!container || document.getElementById('bulk-actions-wrapper')) return;

    // Cria a barra antes da tabela, inicialmente oculta
    const wrapper = document.createElement('div');
    wrapper.id = 'bulk-actions-wrapper';
    wrapper.className = 'hidden transition-all duration-300 ease-in-out bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex flex-wrap gap-4 items-center justify-between shadow-sm';
    
    wrapper.innerHTML = `
        <div class="flex items-center gap-4">
            <div class="flex items-center gap-2 bg-white px-3 py-1 rounded border border-indigo-100">
                <span class="text-indigo-600 font-bold text-lg">☑</span>
                <span class="font-bold text-gray-700" id="selected-count">0</span>
                <span class="text-sm text-gray-500">selecionados</span>
            </div>
            
            <div class="h-8 w-px bg-indigo-200"></div>

            <select id="bulk-action-select" class="border border-gray-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="">Selecione uma ação para todos...</option>
                <option value="chegada_porto">⚓ Marcar Chegada no Porto</option>
                <option value="ida_terminal">🏭 Mover para Terminal</option>
                <option value="agendar">📅 Agendar Entrega</option>
                <option value="saida_entrega">🚚 Saída para Entrega</option>
                <option value="baixa_massa">✅ Finalizar (Baixa)</option>
            </select>

            <input type="datetime-local" id="bulk-date" class="border border-gray-300 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none" title="Data para aplicar em massa">
        </div>

        <button onclick="ferroviaActions.executarBulkAction()" 
            class="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 hover:shadow-md transition-all flex items-center gap-2">
            <span>Aplicar a Todos</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
        </button>
    `;

    // Insere logo após o título ou no topo do card
    const header = container.querySelector('.flex.justify-between');
    if (header) {
        header.insertAdjacentElement('afterend', wrapper);
    } else {
        container.prepend(wrapper);
    }
}

function updateBulkUI() {
    const wrapper = document.getElementById('bulk-actions-wrapper');
    const countSpan = document.getElementById('selected-count');
    const checkAll = document.getElementById('check-all-ferrovia');
    
    if (selectedIds.size > 0) {
        wrapper.classList.remove('hidden');
        wrapper.classList.add('flex');
        if(countSpan) countSpan.textContent = selectedIds.size;
    } else {
        wrapper.classList.add('hidden');
        wrapper.classList.remove('flex');
        if(checkAll) checkAll.checked = false;
    }

    // Atualiza visualmente os checkboxes das linhas
    document.querySelectorAll('.row-checkbox').forEach(cb => {
        const tr = cb.closest('tr');
        if (selectedIds.has(cb.dataset.id)) {
            cb.checked = true;
            tr.classList.add('bg-indigo-50');
        } else {
            cb.checked = false;
            tr.classList.remove('bg-indigo-50');
        }
    });
}

function toggleSelect(id) {
    const strId = String(id);
    if (selectedIds.has(strId)) selectedIds.delete(strId);
    else selectedIds.add(strId);
    updateBulkUI();
}

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => selectedIds.has(cb.dataset.id));
    
    if (allChecked) {
        selectedIds.clear();
    } else {
        checkboxes.forEach(cb => selectedIds.add(cb.dataset.id));
    }
    updateBulkUI();
}

async function executarBulkAction() {
    const action = document.getElementById('bulk-action-select').value;
    const dateVal = document.getElementById('bulk-date').value;
    
    if(!action) return Toast.warning("Selecione uma ação na lista");
    if(selectedIds.size === 0) return Toast.warning("Selecione itens na tabela");

    if(!confirm(`Aplicar a ação "${action}" em ${selectedIds.size} itens selecionados?`)) return;

    try {
        Loading.show();
        const token = currentAuthToken();
        const resp = await fetch(`${API_BASE}/admin/ferrovia/bulk-action`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({
                ids: Array.from(selectedIds),
                action,
                date: dateVal || null
            })
        });
        const data = await resp.json();
        if(data.success) {
            Toast.success(`${data.count} operações atualizadas!`);
            selectedIds.clear();
            updateBulkUI();
            carregarDadosFerrovia();
        } else {
            Toast.error("Erro: " + data.error);
        }
    } catch(e) { console.error(e); Toast.error("Erro conexão"); }
    finally { Loading.hide(); }
}

// --- CARREGAMENTO DE DADOS ---

async function carregarDadosFerrovia() {
  try {
    Loading.show();
    const token = currentAuthToken();
    const resp = await fetch(`${API_BASE}/admin/ferrovia/operacoes_detalhe`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await resp.json();
    if(data.success) {
        ferroviaData = data.items || [];
        atualizarKPIs();
        filtrarTabela(currentFilter);
    }
  } catch (e) { 
    console.error('Erro carregar ferrovia:', e); 
    Toast.error('Erro ao carregar dados');
  } finally { 
    Loading.hide(); 
  }
}

function atualizarKPIs() {
    const counts = {
        maritimo: ferroviaData.filter(x => x.status === 'aguardando_chegada').length,
        porto: ferroviaData.filter(x => x.status === 'no_porto').length,
        terminal: ferroviaData.filter(x => x.status === 'terminal_apoio').length,
        transito: ferroviaData.filter(x => x.status === 'em_transito' || x.status === 'aguardando_entrega' || x.status === 'agendado').length,
        entregue: ferroviaData.filter(x => x.status === 'entregue').length
    };

    updateVal('ferrovia-maritimo', counts.maritimo);
    updateVal('ferrovia-no-porto', counts.porto);
    updateVal('ferrovia-terminal', counts.terminal);
    updateVal('ferrovia-transito', counts.transito);
    updateVal('ferrovia-entregues', counts.entregue);
}
function updateVal(id, v) { const el = document.getElementById(id); if(el) el.textContent = v; }

function filtrarTabela(status) {
    currentFilter = status;
    // Limpa seleção ao mudar de aba para evitar aplicar ação em item invisível
    selectedIds.clear();
    updateBulkUI();

    const tbody = document.getElementById('ferrovia-terminal-tbody');
    const titulo = document.getElementById('ferrovia-lista-titulo');
    if(!tbody) return;

    let lista = [];
    let tituloTxt = "";

    if(status === 'aguardando_chegada') {
        lista = ferroviaData.filter(x => x.status === 'aguardando_chegada');
        tituloTxt = "🌊 Transporte Marítimo";
    } else if(status === 'no_porto') {
        lista = ferroviaData.filter(x => x.status === 'no_porto');
        tituloTxt = "⚓ No Porto";
    } else if (status === 'terminal_apoio') {
        lista = ferroviaData.filter(x => x.status === 'terminal_apoio');
        tituloTxt = "🏭 Terminal de Apoio";
    } else if (status === 'aguardando_entrega') {
        lista = ferroviaData.filter(x => x.status === 'em_transito' || x.status === 'aguardando_entrega' || x.status === 'agendado');
        tituloTxt = "🚚 Em Entrega / Agendado";
    } else {
        lista = ferroviaData.filter(x => x.status === 'entregue');
        tituloTxt = "✅ Finalizados";
    }
    
    if(titulo) titulo.textContent = tituloTxt;

    if(lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-gray-500">Nenhum item nesta etapa</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(op => {
        let diasArmazenagem = 0;
        let textoArmazenagem = "-";
        
        // Logica de dias
        if (op.dt_chegada_porto) {
            const inicio = new Date(op.dt_chegada_porto);
            const fim = op.dt_entrega ? new Date(op.dt_entrega) : new Date();
            const diffTime = Math.abs(fim - inicio);
            diasArmazenagem = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            textoArmazenagem = `${diasArmazenagem} dias`;
        }

        const dtChegada = formatDateLocal(op.dt_chegada_porto);
        const dtTerminal = formatDateLocal(op.dt_entrada_terminal_apoio);
        const dtAgend = op.dt_agendamento_entrega ? formatDateLocal(op.dt_agendamento_entrega) : null;
        
        // Botões comuns
        const btnEdit = `<button onclick="ferroviaActions.editarOperacao(${op.id})" class="bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200" title="Editar">✏️</button>`;
        const btnAgendar = `<button onclick="ferroviaActions.agendarEntrega(${op.id})" class="bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200" title="Agendar Entrega">📅</button>`;
        const btnVoltar = (st) => `<button onclick="ferroviaActions.voltarPasso(${op.id}, '${st}')" class="bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200" title="Voltar Etapa">⬅</button>`;

        let btn = '';

        if(status === 'aguardando_chegada') {
            btn = `<div class="flex gap-1 justify-end">${btnEdit} <button onclick="ferroviaActions.confirmarChegadaPorto(${op.id})" class="bg-teal-600 text-white px-3 py-1 rounded text-xs hover:bg-teal-700">⚓ Chegou</button></div>`;
        } else if(status === 'no_porto') {
            // ✅ AQUI: Adicionado btnAgendar para saída direta
            btn = `<div class="flex gap-1 justify-end">
                    ${btnVoltar('aguardando_chegada')} 
                    ${btnEdit} 
                    ${btnAgendar} 
                    <button onclick="ferroviaActions.moverParaTerminal(${op.id})" class="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">🏭 Terminal</button>
                   </div>`;
        } else if(status === 'terminal_apoio') {
            btn = `<div class="flex gap-1 justify-end">
                    ${btnVoltar('no_porto')} 
                    ${btnEdit} 
                    ${btnAgendar} 
                    <button onclick="ferroviaActions.moverParaEntrega(${op.id})" class="bg-orange-500 text-white px-3 py-1 rounded text-xs hover:bg-orange-600">🚚 Saída</button>
                   </div>`;
        } else if(status === 'aguardando_entrega') {
            btn = `<div class="flex gap-1 justify-end">
                    ${btnVoltar('terminal_apoio')} 
                    ${btnEdit} 
                    ${btnAgendar} 
                    <button onclick="ferroviaActions.darBaixa(${op.id})" class="bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700">✅ Baixa</button>
                   </div>`;
        } else {
            btn = `<div class="flex gap-1 justify-end">${btnEdit}</div>`;
        }

        return `
            <tr class="border-b hover:bg-gray-50 transition-colors">
                <td class="p-3 text-center">
                    <input type="checkbox" class="row-checkbox w-4 h-4 cursor-pointer" 
                           data-id="${op.id}" 
                           onchange="ferroviaActions.toggleSelect(${op.id})">
                </td>
                <td class="p-3 font-bold text-gray-800">${op.container || '—'}</td>
                <td class="p-3 text-sm">${op.booking}</td>
                <td class="p-3 text-sm truncate max-w-xs" title="${op.embarcador_nome}">${op.embarcador_nome || '-'}</td>
                <td class="p-3 text-xs text-gray-600 space-y-1">
                    ${dtChegada !== '-' ? `<div class="flex items-center gap-1"><span class="text-teal-600">⚓</span> ${dtChegada}</div>` : ''}
                    ${dtTerminal !== '-' ? `<div class="flex items-center gap-1"><span class="text-blue-600">🏭</span> ${dtTerminal}</div>` : ''}
                    ${dtAgend ? `<div class="flex items-center gap-1 font-bold text-purple-700"><span>📅</span> ${dtAgend}</div>` : ''}
                </td>
                <td class="p-3 text-center font-bold ${diasArmazenagem > 10 ? 'text-red-600' : 'text-gray-600'}">
                    ${textoArmazenagem}
                </td>
                <td class="p-3 text-center">
                    <span class="px-2 py-1 rounded bg-gray-100 text-xs font-bold text-gray-700 uppercase whitespace-nowrap">
                        ${op.status ? op.status.replace('_', ' ') : '-'}
                    </span>
                </td>
                <td class="p-3 text-right">${btn}</td>
            </tr>
        `;
    }).join('');
    
    // Reaplica status dos checkboxes se houver itens selecionados
    updateBulkUI();
}

// --- AÇÕES INDIVIDUAIS ---

async function confirmarChegadaPorto(id) { if(confirm("Confirmar chegada?")) await apiCall(`/admin/ferrovia/operacao/${id}/chegada-porto`, 'Chegada confirmada!'); }
async function moverParaTerminal(id) { if(confirm("Entrada Terminal?")) await apiCall(`/admin/ferrovia/operacao/${id}/mover-terminal`, 'No Terminal!'); }
async function moverParaEntrega(id) { if(confirm("Saída Entrega?")) await apiCall(`/admin/ferrovia/operacao/${id}/mover-entrega`, 'Em entrega!'); }
async function darBaixa(id) { if(confirm("Finalizar?")) await apiCall(`/admin/ferrovia/operacao/${id}/baixa`, 'Finalizado!'); }
async function voltarPasso(id, st) { if(confirm("Voltar etapa?")) await apiCall(`/admin/ferrovia/operacao/${id}/voltar-passo?status=${st}`, 'Revertido!'); }

function agendarEntrega(id) {
    const op = ferroviaData.find(o => o.id === id);
    const dataAtual = toInputDate(new Date().toISOString());
    const modalHTML = `
        <div id="modal-agendamento" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
            <div class="bg-white p-6 rounded-lg shadow-xl w-96">
                <h3 class="font-bold text-lg mb-4">📅 Agendar Entrega</h3>
                <p class="text-sm mb-2 text-gray-600">Booking: <span class="font-bold text-black">${op.booking}</span></p>
                <p class="text-xs mb-4 text-gray-500">Isso moverá a carga para o status "Agendado"</p>
                
                <label class="block text-xs font-bold mb-1">Data/Hora Agendamento</label>
                <input type="datetime-local" id="input-agend" class="w-full border p-2 rounded mb-6" value="${dataAtual}">
                
                <div class="flex justify-end gap-2">
                    <button onclick="document.getElementById('modal-agendamento').remove()" class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded font-semibold">Cancelar</button>
                    <button onclick="salvarAgendamento(${id})" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold shadow">Salvar Agendamento</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

window.salvarAgendamento = async (id) => {
    const dataVal = document.getElementById('input-agend').value;
    if(!dataVal) return Toast.warning("Informe a data");
    
    try {
        Loading.show();
        const token = currentAuthToken();
        const resp = await fetch(`${API_BASE}/admin/ferrovia/agendar-entrega`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
            body: JSON.stringify({ id, data_agendamento: dataVal })
        });
        if(resp.ok) { Toast.success("Agendado!"); document.getElementById('modal-agendamento').remove(); carregarDadosFerrovia(); }
    } catch(e) { Toast.error("Erro"); } finally { Loading.hide(); }
};

function editarOperacao(id) {
  const op = ferroviaData.find(o => o.id === id);
  if (!op) return;

  const modalHTML = `
    <div id="modal-edit-ferrovia" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div class="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
          <h2 class="text-2xl font-bold">✏️ Editar</h2>
        </div>
        <div class="overflow-auto flex-1 p-6">
          <form id="form-edit-ferrovia" class="grid grid-cols-2 gap-4">
             <input type="hidden" name="id" value="${op.id}" />
             <div><label class="font-bold text-xs">Container</label><input class="border w-full p-2 rounded" name="container" value="${op.container||''}"></div>
             <div><label class="font-bold text-xs">Booking</label><input class="border w-full p-2 rounded" name="booking" value="${op.booking||''}"></div>
             <div class="col-span-2"><label class="font-bold text-xs">Embarcador</label><input class="border w-full p-2 rounded" name="embarcador_nome" value="${op.embarcador_nome||''}"></div>
             
             <div><label class="font-bold text-xs">Chegada Porto</label><input type="datetime-local" class="border w-full p-2 rounded" name="dt_chegada_porto" value="${toInputDate(op.dt_chegada_porto)}"></div>
             <div><label class="font-bold text-xs">Entrada Terminal</label><input type="datetime-local" class="border w-full p-2 rounded" name="dt_entrada_terminal_apoio" value="${toInputDate(op.dt_entrada_terminal_apoio)}"></div>
             <div><label class="font-bold text-xs">Agendamento</label><input type="datetime-local" class="border w-full p-2 rounded" name="dt_agendamento_entrega" value="${toInputDate(op.dt_agendamento_entrega)}"></div>
             <div><label class="font-bold text-xs">Entrega</label><input type="datetime-local" class="border w-full p-2 rounded" name="dt_entrega" value="${toInputDate(op.dt_entrega)}"></div>
          </form>
        </div>
        <div class="bg-gray-50 p-4 border-t flex justify-end gap-2">
           <button onclick="document.getElementById('modal-edit-ferrovia').remove()" class="bg-gray-500 text-white px-4 py-2 rounded">Cancelar</button>
           <button onclick="ferroviaActions.salvarEdicao()" class="bg-blue-600 text-white px-4 py-2 rounded">Salvar</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function salvarEdicao() {
  const form = document.getElementById('form-edit-ferrovia');
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  
  // Recalculo simples de status
  if(payload.dt_entrega) payload.status = 'entregue';
  else if(payload.dt_agendamento_entrega) payload.status = 'agendado';
  else if(payload.dt_entrada_terminal_apoio) payload.status = 'terminal_apoio';
  else if(payload.dt_chegada_porto) payload.status = 'no_porto';
  
  try {
    Loading.show();
    const resp = await fetch(`${API_BASE}/admin/ferrovia/operacao/${payload.id}/editar`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${currentAuthToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const d = await resp.json();
    if(d.success) { Toast.success('Salvo!'); document.getElementById('modal-edit-ferrovia').remove(); carregarDadosFerrovia(); }
  } catch(e) { Toast.error('Erro'); } finally { Loading.hide(); }
}

async function apiCall(url, msg) {
  try { Loading.show(); const resp = await fetch(`${API_BASE}${url}`, { method: 'PUT', headers: { Authorization: `Bearer ${currentAuthToken()}` } });
  const d = await resp.json(); if(d.success) { Toast.success(msg); carregarDadosFerrovia(); } else Toast.error(d.error); } catch(e) { Toast.error("Erro"); } finally { Loading.hide(); }
}

async function handleUpload(e, type) { 
    const file = e.target.files[0];
    if(!file) return;
    const endpoint = type === 'ops' ? '/admin/ferrovia/import' : '/admin/prioridades/import';
    
    const fd = new FormData(); fd.append('file', file);
    try {
        Loading.show();
        const resp = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${currentAuthToken()}` },
            body: fd
        });
        const res = await resp.json();
        if(res.success) { Toast.success("Importado com sucesso!"); carregarDadosFerrovia(); }
        else { Toast.error("Erro: " + res.error); }
    } catch(e) { console.error(e); Toast.error("Erro ao importar"); }
    finally { Loading.hide(); e.target.value = ''; }
}

function gerarRelatorioCompleto() {
    if(!ferroviaData.length) { Toast.warning("Sem dados"); return; }
    const rows = [[ 'Container', 'Booking', 'Embarcador', 'Status', 'Prev. Chegada Porto', 'Data Chegada Porto', 'Data Entrada Terminal', 'Data Saída Terminal', 'Data Agendamento', 'Data Entrega' ]];
    
    ferroviaData.forEach(op => {
        rows.push([
            op.container || '', op.booking || '', op.embarcador_nome || '', op.status || '',
            formatDateLocal(op.dt_previsao_chegada_porto), formatDateLocal(op.dt_chegada_porto),
            formatDateLocal(op.dt_entrada_terminal_apoio), formatDateLocal(op.dt_saida_terminal_apoio), 
            formatDateLocal(op.dt_agendamento_entrega), formatDateLocal(op.dt_entrega)
        ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, `relatorio_ferrovia_${new Date().toISOString().split('T')[0]}.xlsx`);
    Toast.success("Relatório gerado!");
}

function baixarModeloOperacoes() {
    const rows = [['Booking', 'Container', 'Embarcador', 'Data Chegada Porto', 'Data Entrada Terminal', 'Data Agendamento', 'Data Entrega']];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Ops");
    XLSX.writeFile(wb, "modelo_ferrovia.xlsx");
}

function baixarModeloPrioridades() {
    const rows = [['Container', 'Booking', 'Data Chegada Terminal Apoio', 'Prioridade']];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Prio");
    XLSX.writeFile(wb, "modelo_prioridades.xlsx");
}

async function limparOperacoes() {
    if (!confirm("⚠️ ATENÇÃO! Isso irá excluir TODAS as operações. Deseja continuar?")) return;
    try {
        Loading.show();
        const resp = await fetch(`${API_BASE}/admin/ferrovia/limpar`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${currentAuthToken()}` }
        });
        const data = await resp.json();
        if (data.success) { Toast.success("Operações excluídas!"); carregarDadosFerrovia(); }
    } catch(e) { Toast.error("Erro"); } finally { Loading.hide(); }
}