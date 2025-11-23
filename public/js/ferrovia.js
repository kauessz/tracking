// js/ferrovia.js - Módulo Ferrovia Completo
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs';
import { getApiUrl } from "./config.js";
import { Toast, Loading } from "./utilities.js";

const API_BASE = getApiUrl();
let currentAuthToken = null;
let ferroviaData = [];
let currentFilter = 'aguardando_chegada'; // Padrão alterado para Marítimo

export function initFerrovia(apiBase, getToken) {
  currentAuthToken = getToken;
  carregarDadosFerrovia();

  // Listeners dos Cards (Abas)
  // Novo KPI: Marítimo
  document.getElementById('kpi-ferrovia-maritimo')?.addEventListener('click', () => filtrarTabela('aguardando_chegada'));
  document.getElementById('kpi-ferrovia-porto')?.addEventListener('click', () => filtrarTabela('no_porto'));
  document.getElementById('kpi-ferrovia-terminal')?.addEventListener('click', () => filtrarTabela('terminal_apoio'));
  document.getElementById('kpi-ferrovia-transito')?.addEventListener('click', () => filtrarTabela('aguardando_entrega'));
  document.getElementById('kpi-ferrovia-entregues')?.addEventListener('click', () => filtrarTabela('entregue'));

  // Ferramentas
  document.getElementById('ferrovia-gerar-relatorio-btn')?.addEventListener('click', gerarRelatorioCompleto);
  
  // Inputs de arquivo
  const inputOp = document.getElementById('ferrovia-upload-file');
  if(inputOp) inputOp.addEventListener('change', (e) => handleUpload(e, 'ops'));

  const inputPrio = document.getElementById('ferrovia-upload-prioridades-file');
  if(inputPrio) inputPrio.addEventListener('change', (e) => handleUpload(e, 'prio'));

  // Ações globais window
  window.ferroviaActions = { confirmarChegadaPorto, moverParaTerminal, moverParaEntrega, darBaixa };
}

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
  } catch (e) { console.error(e); } finally { Loading.hide(); }
}

function atualizarKPIs() {
    const counts = {
        maritimo: ferroviaData.filter(x => x.status === 'aguardando_chegada').length,
        porto: ferroviaData.filter(x => x.status === 'no_porto').length,
        terminal: ferroviaData.filter(x => x.status === 'terminal_apoio').length,
        transito: ferroviaData.filter(x => x.status === 'em_transito' || x.status === 'aguardando_entrega').length,
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
    const tbody = document.getElementById('ferrovia-terminal-tbody');
    const titulo = document.getElementById('ferrovia-lista-titulo');
    if(!tbody) return;

    let lista = [];
    let tituloTxt = "";

    if(status === 'aguardando_chegada') {
        lista = ferroviaData.filter(x => x.status === 'aguardando_chegada');
        tituloTxt = "🌊 Transporte Marítimo (Aguardando Chegada no Porto)";
    } else if(status === 'no_porto') {
        lista = ferroviaData.filter(x => x.status === 'no_porto');
        tituloTxt = "⚓ Containers no Porto";
    } else if (status === 'terminal_apoio') {
        lista = ferroviaData.filter(x => x.status === 'terminal_apoio');
        tituloTxt = "🏭 Terminal de Apoio";
    } else if (status === 'aguardando_entrega') {
        lista = ferroviaData.filter(x => x.status === 'em_transito' || x.status === 'aguardando_entrega');
        tituloTxt = "🚚 Em Entrega";
    } else {
        lista = ferroviaData.filter(x => x.status === 'entregue');
        tituloTxt = "✅ Finalizados";
    }
    
    if(titulo) titulo.textContent = tituloTxt;

    if(lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-gray-500">Nenhum item nesta etapa</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(op => {
        const prevChegada = op.dt_previsao_chegada_porto ? new Date(op.dt_previsao_chegada_porto).toLocaleDateString('pt-BR') : '-';
        
        // ✅ CÁLCULO DE ARMAZENAGEM (Recuperado)
        let diasArmazenagem = 0;
        let textoArmazenagem = "-";
        
        // Só calcula se já chegou no porto
        if (op.dt_chegada_porto) {
            const inicio = new Date(op.dt_chegada_porto);
            const fim = op.dt_entrega ? new Date(op.dt_entrega) : new Date();
            const diffTime = Math.abs(fim - inicio);
            diasArmazenagem = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            textoArmazenagem = `${diasArmazenagem} dias`;
        }

        let btn = '';
        if(status === 'aguardando_chegada') {
            btn = `<button onclick="ferroviaActions.confirmarChegadaPorto(${op.id})" class="bg-teal-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-teal-700">⚓ Chegou no Porto</button>`;
        } else if(status === 'no_porto') {
            btn = `<button onclick="ferroviaActions.moverParaTerminal(${op.id})" class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-700">⬆ Subir Terminal</button>`;
        } else if(status === 'terminal_apoio') {
            btn = `<button onclick="ferroviaActions.moverParaEntrega(${op.id})" class="bg-orange-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-orange-600">🚚 Saída Entrega</button>`;
        } else if(status === 'aguardando_entrega') {
            btn = `<button onclick="ferroviaActions.darBaixa(${op.id})" class="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-green-700">✅ Baixa</button>`;
        }

        // ✅ Renderiza as 7 colunas na ordem do cabeçalho
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 font-bold text-gray-800">${op.container || '—'}</td>
                <td class="p-3 text-sm">${op.booking}</td>
                <td class="p-3 text-sm truncate max-w-xs" title="${op.embarcador_nome}">${op.embarcador_nome || '-'}</td>
                <td class="p-3 text-xs text-gray-600">Prev: ${prevChegada}</td>
                
                <td class="p-3 text-center font-bold ${diasArmazenagem > 10 ? 'text-red-600' : 'text-gray-600'}">
                    ${textoArmazenagem}
                </td>

                <td class="p-3 text-center">
                    <span class="px-2 py-1 rounded bg-gray-100 text-xs font-bold text-gray-700 uppercase">
                        ${op.status ? op.status.replace('_', ' ') : '-'}
                    </span>
                </td>

                <td class="p-3 text-right">${btn}</td>
            </tr>
        `;
    }).join('');
}

// --- NOVAS ACTIONS ---
// Maritimo -> Porto (Isso requer um endpoint novo no server ou reutilizar update generico)
// Como não criei endpoint especifico, vou usar o mover-terminal como base mas preciso de um endpoint real
// VAMOS ADICIONAR O ENDPOINT NO SERVER.JS ABAIXO PARA ISSO FUNCIONAR
async function confirmarChegadaPorto(id) {
    if(!confirm("Confirmar chegada do navio/container no Porto?")) return;
    await apiCall(`/admin/ferrovia/operacao/${id}/chegada-porto`, 'Chegada confirmada!');
}

async function moverParaTerminal(id) {
    if(!confirm("Confirmar entrada no Terminal de Apoio?")) return;
    await apiCall(`/admin/ferrovia/operacao/${id}/mover-terminal`, 'Movido para Terminal!');
}

async function moverParaEntrega(id) {
    if(!confirm("Confirmar saída para Entrega?")) return;
    await apiCall(`/admin/ferrovia/operacao/${id}/mover-entrega`, 'Em entrega!');
}

async function darBaixa(id) {
    if(!confirm("Finalizar operação?")) return;
    await apiCall(`/admin/ferrovia/operacao/${id}/baixa`, 'Finalizado!');
}

async function apiCall(url, msg) {
    try {
        Loading.show();
        const resp = await fetch(`${API_BASE}${url}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${currentAuthToken()}` }
        });
        const d = await resp.json();
        if(d.success) { Toast.success(msg); carregarDadosFerrovia(); }
        else { Toast.error("Erro: " + d.error); }
    } catch(e) { Toast.error("Erro de conexão"); } 
    finally { Loading.hide(); }
}

// --- UPLOADS E RELATÓRIO (Mantidos igual) ---
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
        else { alert("Erro: " + res.error); }
    } catch(e) { console.error(e); } finally { Loading.hide(); e.target.value = ''; }
}

function gerarRelatorioCompleto() {
    if(!ferroviaData.length) { Toast.warning("Sem dados"); return; }
    const rows = [['Container','Booking','Embarcador','Status','Prev. Chegada Porto','Data Chegada Porto','Data Entrada Terminal','Data Saída Terminal']];
    ferroviaData.forEach(op => {
        rows.push([
            op.container, op.booking, op.embarcador_nome, op.status,
            op.dt_previsao_chegada_porto, op.dt_chegada_porto, op.dt_entrada_terminal_apoio, op.dt_saida_terminal_apoio
        ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio");
    XLSX.writeFile(wb, "relatorio_ferrovia.xlsx");
}