// js/ferrovia.js - Módulo Ferrovia Completo - VERSÃO CORRIGIDA FINAL
// ✅ CORREÇÃO CRÍTICA: salvarEdicao agora está no lugar correto

import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs';
import { getApiUrl } from "./config.js";
import { Toast, Loading } from "./utilities.js";

const API_BASE = getApiUrl();
let currentAuthToken = null;
let ferroviaData = [];
let currentFilter = 'aguardando_chegada';

export function initFerrovia(apiBase, getToken) {
  currentAuthToken = getToken;
  carregarDadosFerrovia();

  // Listeners dos Cards (Abas)
  document.getElementById('kpi-ferrovia-maritimo')?.addEventListener('click', () => filtrarTabela('aguardando_chegada'));
  document.getElementById('kpi-ferrovia-porto')?.addEventListener('click', () => filtrarTabela('no_porto'));
  document.getElementById('kpi-ferrovia-terminal')?.addEventListener('click', () => filtrarTabela('terminal_apoio'));
  document.getElementById('kpi-ferrovia-transito')?.addEventListener('click', () => filtrarTabela('aguardando_entrega'));
  document.getElementById('kpi-ferrovia-entregues')?.addEventListener('click', () => filtrarTabela('entregue'));

  // Ferramentas
  document.getElementById('ferrovia-gerar-relatorio-btn')?.addEventListener('click', gerarRelatorioCompleto);
  document.getElementById('ferrovia-download-modelo-ops-btn')?.addEventListener('click', baixarModeloOperacoes);
  document.getElementById('ferrovia-download-modelo-prio-btn')?.addEventListener('click', baixarModeloPrioridades);
  document.getElementById('ferrovia-limpar-btn')?.addEventListener('click', limparOperacoes);
  
  // Inputs de arquivo
  const inputOp = document.getElementById('ferrovia-upload-file');
  if(inputOp) inputOp.addEventListener('change', (e) => handleUpload(e, 'ops'));

  const inputPrio = document.getElementById('ferrovia-upload-prioridades-file');
  if(inputPrio) inputPrio.addEventListener('change', (e) => handleUpload(e, 'prio'));

  // ✅ CORREÇÃO: Ações globais window COM salvarEdicao incluído
  window.ferroviaActions = { 
    confirmarChegadaPorto, 
    moverParaTerminal, 
    moverParaEntrega, 
    darBaixa,
    editarOperacao,
    voltarPasso,
    salvarEdicao  // ✅ AGORA ESTÁ AQUI
  };
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

function formatarDataSemHora(dateValue) {
    if (!dateValue) return '-';
    const d = new Date(dateValue);
    if (isNaN(d.getTime())) return '-';
    
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    
    return `${dd}/${mm}/${yyyy}`;
}

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
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-gray-500">Nenhum item nesta etapa</td></tr>`;
        return;
    }

    tbody.innerHTML = lista.map(op => {
        const prevChegada = formatarDataSemHora(op.dt_previsao_chegada_porto);
        
        let diasArmazenagem = 0;
        let textoArmazenagem = "-";
        
        if (op.dt_chegada_porto) {
            const inicio = new Date(op.dt_chegada_porto);
            const fim = op.dt_entrega ? new Date(op.dt_entrega) : new Date();
            const diffTime = Math.abs(fim - inicio);
            diasArmazenagem = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            textoArmazenagem = `${diasArmazenagem} dias`;
        }

        let btn = '';
        if(status === 'aguardando_chegada') {
            btn = `
                <div class="flex gap-2 justify-end">
                    <button onclick="ferroviaActions.confirmarChegadaPorto(${op.id})" 
                        class="bg-teal-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-teal-700">
                        ⚓ Chegou no Porto
                    </button>
                    <button onclick="ferroviaActions.editarOperacao(${op.id})" 
                        class="bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-600">
                        ✏️ Editar
                    </button>
                </div>
            `;
        } else if(status === 'no_porto') {
            btn = `
                <div class="flex gap-2 justify-end">
                    <button onclick="ferroviaActions.voltarPasso(${op.id}, 'aguardando_chegada')" 
                        class="bg-gray-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-gray-600">
                        ⬅️ Voltar
                    </button>
                    <button onclick="ferroviaActions.moverParaTerminal(${op.id})" 
                        class="bg-blue-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-700">
                        ⬆ Subir Terminal
                    </button>
                    <button onclick="ferroviaActions.editarOperacao(${op.id})" 
                        class="bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-600">
                        ✏️ Editar
                    </button>
                </div>
            `;
        } else if(status === 'terminal_apoio') {
            btn = `
                <div class="flex gap-2 justify-end">
                    <button onclick="ferroviaActions.voltarPasso(${op.id}, 'no_porto')" 
                        class="bg-gray-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-gray-600">
                        ⬅️ Voltar
                    </button>
                    <button onclick="ferroviaActions.moverParaEntrega(${op.id})" 
                        class="bg-orange-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-orange-600">
                        🚚 Saída Entrega
                    </button>
                    <button onclick="ferroviaActions.editarOperacao(${op.id})" 
                        class="bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-600">
                        ✏️ Editar
                    </button>
                </div>
            `;
        } else if(status === 'aguardando_entrega') {
            btn = `
                <div class="flex gap-2 justify-end">
                    <button onclick="ferroviaActions.voltarPasso(${op.id}, 'terminal_apoio')" 
                        class="bg-gray-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-gray-600">
                        ⬅️ Voltar
                    </button>
                    <button onclick="ferroviaActions.darBaixa(${op.id})" 
                        class="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-green-700">
                        ✅ Baixa
                    </button>
                    <button onclick="ferroviaActions.editarOperacao(${op.id})" 
                        class="bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-600">
                        ✏️ Editar
                    </button>
                </div>
            `;
        } else {
            btn = `
                <button onclick="ferroviaActions.editarOperacao(${op.id})" 
                    class="bg-blue-500 text-white px-3 py-1 rounded text-xs font-bold hover:bg-blue-600">
                    👁️ Ver
                </button>
            `;
        }

        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 font-bold text-gray-800">${op.container || '—'}</td>
                <td class="p-3 text-sm">${op.booking}</td>
                <td class="p-3 text-sm truncate max-w-xs" title="${op.embarcador_nome}">${op.embarcador_nome || '-'}</td>
                <td class="p-3 text-xs text-gray-600">${prevChegada}</td>
                
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

async function voltarPasso(id, statusAnterior) {
    const nomesStatus = {
        'aguardando_chegada': 'Transporte Marítimo',
        'no_porto': 'Porto',
        'terminal_apoio': 'Terminal de Apoio',
        'aguardando_entrega': 'Em Entrega'
    };
    
    if(!confirm(`Voltar para "${nomesStatus[statusAnterior] || statusAnterior}"?`)) return;
    await apiCall(`/admin/ferrovia/operacao/${id}/voltar-passo?status=${statusAnterior}`, 'Passo revertido!');
}

function editarOperacao(id) {
    const op = ferroviaData.find(o => o.id === id);
    if (!op) {
        Toast.error("Operação não encontrada");
        return;
    }

    const modalHTML = `
        <div id="modal-edit-ferrovia" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" style="z-index: 9999;">
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div class="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
                    <h2 class="text-2xl font-bold">✏️ Editar Operação</h2>
                    <p class="text-sm opacity-90 mt-2">Container: ${op.container || 'N/A'} | Booking: ${op.booking}</p>
                </div>
                
                <div class="overflow-auto flex-1 p-6">
                    <form id="form-edit-ferrovia" class="space-y-4">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-semibold mb-2">Container</label>
                                <input type="text" name="container" value="${op.container || ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" />
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2">Booking</label>
                                <input type="text" name="booking" value="${op.booking || ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" required />
                            </div>
                            
                            <div class="col-span-2">
                                <label class="block text-sm font-semibold mb-2">Embarcador</label>
                                <input type="text" name="embarcador_nome" value="${op.embarcador_nome || ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" />
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2">Previsão Chegada Porto</label>
                                <input type="date" name="dt_previsao_chegada_porto" 
                                    value="${op.dt_previsao_chegada_porto ? op.dt_previsao_chegada_porto.split('T')[0] : ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" />
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2">Data Chegada Porto</label>
                                <input type="date" name="dt_chegada_porto" 
                                    value="${op.dt_chegada_porto ? op.dt_chegada_porto.split('T')[0] : ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" />
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2">Data Entrada Terminal</label>
                                <input type="date" name="dt_entrada_terminal_apoio" 
                                    value="${op.dt_entrada_terminal_apoio ? op.dt_entrada_terminal_apoio.split('T')[0] : ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" />
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2">Data Saída Terminal</label>
                                <input type="date" name="dt_saida_terminal_apoio" 
                                    value="${op.dt_saida_terminal_apoio ? op.dt_saida_terminal_apoio.split('T')[0] : ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" />
                            </div>
                            
                            <div>
                                <label class="block text-sm font-semibold mb-2">Data Entrega</label>
                                <input type="date" name="dt_entrega" 
                                    value="${op.dt_entrega ? op.dt_entrega.split('T')[0] : ''}" 
                                    class="w-full border border-gray-300 rounded-lg p-2" />
                            </div>
                        </div>
                        
                        <input type="hidden" name="id" value="${op.id}" />
                    </form>
                </div>
                
                <div class="bg-gray-50 p-4 border-t flex gap-3 justify-end">
                    <button type="button" onclick="document.getElementById('modal-edit-ferrovia').remove()" 
                        class="bg-gray-500 text-white px-6 py-2 rounded-xl font-semibold hover:bg-gray-600">
                        Cancelar
                    </button>
                    <button type="button" onclick="ferroviaActions.salvarEdicao()" 
                        class="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-2 rounded-xl font-semibold hover:shadow-lg">
                        💾 Salvar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// ✅ CORREÇÃO: Agora é declarada como função normal para ser incluída no objeto
async function salvarEdicao() {
    const form = document.getElementById('form-edit-ferrovia');
    if (!form) return;
    
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    
    try {
        Loading.show();
        const resp = await fetch(`${API_BASE}/admin/ferrovia/operacao/${payload.id}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${currentAuthToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await resp.json();
        if (data.success) {
            Toast.success('Operação atualizada!');
            document.getElementById('modal-edit-ferrovia')?.remove();
            carregarDadosFerrovia();
        } else {
            Toast.error('Erro ao salvar: ' + (data.error || 'desconhecido'));
        }
    } catch(e) {
        Toast.error('Erro de conexão');
        console.error(e);
    } finally {
        Loading.hide();
    }
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
    
    const rows = [[
        'Container', 'Booking', 'Embarcador', 'Status',
        'Prev. Chegada Porto', 'Data Chegada Porto',
        'Data Entrada Terminal', 'Data Saída Terminal', 'Data Entrega',
        'Armazenagem Porto (dias)', 'Armazenagem Terminal (dias)', 'Armazenagem Total (dias)'
    ]];
    
    ferroviaData.forEach(op => {
        let diasPorto = 0, diasTerminal = 0;
        
        if (op.dt_chegada_porto) {
            const chegadaPorto = new Date(op.dt_chegada_porto);
            const saidaPorto = op.dt_entrada_terminal_apoio ? new Date(op.dt_entrada_terminal_apoio) : new Date();
            diasPorto = Math.ceil(Math.abs(saidaPorto - chegadaPorto) / (1000 * 60 * 60 * 24));
        }
        
        if (op.dt_entrada_terminal_apoio) {
            const entradaTerminal = new Date(op.dt_entrada_terminal_apoio);
            const saidaTerminal = op.dt_saida_terminal_apoio ? new Date(op.dt_saida_terminal_apoio) : new Date();
            diasTerminal = Math.ceil(Math.abs(saidaTerminal - entradaTerminal) / (1000 * 60 * 60 * 24));
        }
        
        rows.push([
            op.container || '', op.booking || '', op.embarcador_nome || '', op.status || '',
            formatarDataSemHora(op.dt_previsao_chegada_porto),
            formatarDataSemHora(op.dt_chegada_porto),
            formatarDataSemHora(op.dt_entrada_terminal_apoio),
            formatarDataSemHora(op.dt_saida_terminal_apoio),
            formatarDataSemHora(op.dt_entrega),
            diasPorto || 0, diasTerminal || 0, (diasPorto + diasTerminal) || 0
        ]);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 20 },
        { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
        { wch: 22 }, { wch: 25 }, { wch: 22 }
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio Ferrovia");
    XLSX.writeFile(wb, `relatorio_ferrovia_${new Date().toISOString().split('T')[0]}.xlsx`);
    Toast.success("Relatório gerado!");
}

function baixarModeloOperacoes() {
    const rows = [['Booking', 'Container', 'Embarcador', 'Previsão Chegada Porto (dd/mm/aaaa)']];
    rows.push(['BKG001', 'TCKU1234567', 'EMPRESA EXEMPLO LTDA', '10/01/2025']);
    rows.push(['BKG002', 'MSCU9876543', 'OUTRO EMBARCADOR SA', '15/01/2025']);
    rows.push(['BKG003', 'HLCU5555555', 'TERCEIRO CLIENTE ME', '20/01/2025']);
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 35 }, { wch: 30 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Operações");
    XLSX.writeFile(wb, "modelo_operacoes_ferrovia.xlsx");
    Toast.success("Modelo baixado!");
}

function baixarModeloPrioridades() {
    const rows = [['Booking', 'Prioridade', 'Observações']];
    rows.push(['BKG001', 'ALTA', 'Cliente Premium - Entrega urgente']);
    rows.push(['BKG002', 'MÉDIA', 'Entrega normal']);
    rows.push(['BKG003', 'BAIXA', 'Pode aguardar']);
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 40 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Prioridades");
    XLSX.writeFile(wb, "modelo_prioridades_ferrovia.xlsx");
    Toast.success("Modelo baixado!");
}

async function limparOperacoes() {
    if (!confirm("⚠️ ATENÇÃO! Isso irá excluir TODAS as operações do módulo Ferrovia. Deseja continuar?")) return;
    if (!confirm("Tem certeza absoluta? Esta ação não pode ser desfeita!")) return;
    
    try {
        Loading.show();
        const resp = await fetch(`${API_BASE}/admin/ferrovia/limpar`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${currentAuthToken()}` }
        });
        
        const data = await resp.json();
        if (data.success) {
            Toast.success(`${data.deleted || 0} operações excluídas!`);
            carregarDadosFerrovia();
        } else {
            Toast.error("Erro: " + (data.error || 'desconhecido'));
        }
    } catch(e) {
        Toast.error("Erro de conexão");
        console.error(e);
    } finally {
        Loading.hide();
    }
}