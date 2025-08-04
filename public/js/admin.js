// --- Módulos Principais ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, where, getDocs, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Módulos da Aplicação ---
import { initializeUI, renderData, populateClientFilter, getFilters, clearFilters, showDetailsScreen } from './ui.js';
import { formatDate, parseDate, calculateDelayInMinutes, formatMinutesToHHMM } from './utils.js';

// --- Estado Global ---
let allData = [];
let currentlyDisplayedData = [];

// --- Lógica de Gestão de Utilizadores (sem alterações) ---
const updateUserStatus = async (db, uid, newStatus, details = {}) => {
    const userDocRef = doc(db, "users", uid);
    try {
        const updateData = { status: newStatus };
        if (newStatus === 'approved') {
            if (details.role) updateData.role = details.role;
            if (details.associatedShipper) {
                updateData.associatedShipper = details.associatedShipper;
                updateData.role = 'embarcador';
            }
        }
        await updateDoc(userDocRef, updateData);
        displayPendingUsers(db);
    } catch (error) {
        console.error("Erro ao atualizar o estado do utilizador:", error);
    }
};

const displayPendingUsers = async (db) => {
    const tableBody = document.getElementById('pending-users-table-body');
    const q = query(collection(db, "users"), where("status", "==", "pending"));
    const querySnapshot = await getDocs(q);
    const uniqueShippers = [...new Set(allData.map(item => item.Cliente).filter(Boolean))].sort();
    tableBody.innerHTML = '';
    if (querySnapshot.empty) {
        tableBody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500">Nenhum pedido de registo pendente.</td></tr>';
        return;
    }
    querySnapshot.forEach((doc) => {
        const user = doc.data();
        const uid = doc.id;
        let optionsHtml = '';
        if (user.accountType === 'shipper') {
            const shipperOptions = uniqueShippers.map(shipper => `<option value="${shipper}">${shipper}</option>`).join('');
            optionsHtml = `<select class="approval-details w-full rounded-md border-gray-300 dark:bg-gray-600" data-type="shipper" data-uid="${uid}"><option value="">Selecione um embarcador...</option>${shipperOptions}</select>`;
        } else {
            optionsHtml = `<select class="approval-details w-full rounded-md border-gray-300 dark:bg-gray-600" data-type="internal" data-uid="${uid}"><option value="user">Utilizador (Funcionário)</option><option value="admin">Administrador</option></select>`;
        }
        const row = document.createElement('tr');
        row.innerHTML = `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${user.email}</td><td class="px-6 py-4">${optionsHtml}</td><td class="px-6 py-4 whitespace-nowrap text-sm font-medium"><button data-uid="${uid}" class="approve-btn text-green-600 hover:text-green-900 mr-4">Aprovar</button><button data-uid="${uid}" class="reject-btn text-red-600 hover:text-red-900">Rejeitar</button></td>`;
        tableBody.appendChild(row);
    });
    document.querySelectorAll('.approve-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const uid = e.target.dataset.uid;
            const select = document.querySelector(`.approval-details[data-uid="${uid}"]`);
            if (!select.value) { alert('Por favor, selecione uma opção para aprovar o utilizador.'); return; }
            const details = {};
            if (select.dataset.type === 'shipper') details.associatedShipper = select.value;
            else details.role = select.value;
            updateUserStatus(db, uid, 'approved', details);
        });
    });
    document.querySelectorAll('.reject-btn').forEach(button => {
        button.addEventListener('click', (e) => updateUserStatus(db, e.target.dataset.uid, 'rejected'));
    });
};

// --- Lógica de Negócio ---
const applyFiltersAndRender = () => {
    const filters = getFilters();
    let filteredData = allData.filter(r => !r.SituacaoProgramacao?.toLowerCase().includes('cancelada'));
    if (filters.clients.length > 0) {
        filteredData = filteredData.filter(r => r.Cliente && filters.clients.includes(r.Cliente));
    }
    if (filters.booking) {
        filteredData = filteredData.filter(r => r.Booking && r.Booking.toLowerCase().includes(filters.booking));
    }
    if (filters.date) {
        filteredData = filteredData.filter(r => {
            if (!r.DataProgramada) return false;
            const recordDate = parseDate(r.DataProgramada);
            if (!recordDate) return false;
            const recordDateString = recordDate.toISOString().split('T')[0];
            return recordDateString === filters.date;
        });
    }
    currentlyDisplayedData = filteredData;
    renderData(filteredData, allData);
};

const handleDashboardClick = (filterType) => {
    // ✅ CORREÇÃO: Usa os dados atualmente na tela (currentlyDisplayedData) como base.
    const baseData = currentlyDisplayedData;
    let dataToRender = baseData;
    let title = "Detalhes das Operações (Filtro Ativo)";

    if (filterType === 'onTime') {
        dataToRender = baseData.filter(r => calculateDelayInMinutes(r) <= 0);
        title = "Detalhes - Operações On Time (Filtro Ativo)";
    } else if (filterType === 'delayed') {
        dataToRender = baseData.filter(r => calculateDelayInMinutes(r) > 0);
        title = "Detalhes - Operações com Atraso (Filtro Ativo)";
    }
    
    // A função não limpa mais os filtros, preservando o estado da UI.
    showDetailsScreen(dataToRender, title);
};

const exportToExcel = () => {
    const dataToExport = currentlyDisplayedData.map(record => ({
        'Booking': record.Booking || 'N/A',
        'Cliente': record.Cliente || 'N/A',
        'Porto': record.PortoOperacao || 'N/A',
        'Previsão Início': record.DataProgramada || 'N/A',
        'Início Execução': record.DataChegada || 'N/A',
        'Fim Execução': record.DataSaida || 'N/A',
        'Atraso (HH:MM)': formatMinutesToHHMM(calculateDelayInMinutes(record)),
        'Motivo do Atraso': record.JustificativaAtraso || 'N/A',
        'Container': record.Container || 'N/A',
        'Tipo Programação': record.TipoProgramacao || 'N/A',
        'Transportadora': record.Transportadora || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "RelatorioOperacoes");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Relatorio_Operacoes_${today}.xlsx`);
};

const handleFileUpload = async (event, db, dataRef) => {
    const uploadInput = document.getElementById('upload-file');
    const uploadStatus = document.getElementById('upload-status');
    const file = event.target.files[0];
    if (!file) return;

    uploadStatus.textContent = 'A ler o ficheiro...';
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            uploadStatus.textContent = 'A processar dados...';
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const excelData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

            if (excelData.length < 2) throw new Error("A planilha está vazia.");
            const headers = excelData[0].map(h => String(h).trim().toLowerCase());
            const dataRows = excelData.slice(1);

            const headerMap = {
                TipoProgramacao: ['tipo de programação'],
                Embarcador: ['embarcador'],
                Booking: ['booking'],
                Containers: ['containers'],
                PrevisaoInicioAtendimento: ['previsão início atendimento (bra)'],
                DtInicioExecucao: ['dt início da execução (bra)'],
                DtFimExecucao: ['dt fim da execução (bra)'],
                DataPrevisaoEntregaRecalculada: ['data de previsão de entrega recalculada (bra)'],
                NomeMotoristaProgramado: ['nome do motorista programado'],
                PlacaVeiculo: ['placa do veículo'],
                PlacaCarreta1: ['placa da carreta 1'],
                JustificativaAtrasoProgramacao: ['justificativa de atraso de programação'],
                Transportadora: ['transportadora'],
                NumeroProgramacao: ['número da programação'],
                NumeroCliente: ['número cliente'],
                SituacaoProgramacao: ['situação programação'],
                CidadeDescarga: ['cidade de descarga', 'cidade local de atendimento'],
                POL: ['pol'],
                POD: ['pod']
            };

            const columnIndexMap = {};
            for (const key in headerMap) {
                for (const possibleName of headerMap[key]) {
                    const index = headers.indexOf(possibleName);
                    if (index !== -1) {
                        columnIndexMap[key] = index;
                        break;
                    }
                }
            }

            if (columnIndexMap.Booking === undefined) throw new Error('A coluna "Booking" é obrigatória e não foi encontrada.');

            const newRecords = dataRows.filter(r => r && r[columnIndexMap.Booking]).map(r => {
                const row = {};
                for (const key in headerMap) {
                    if (key === 'POL' || key === 'POD') continue;

                    const index = columnIndexMap[key];
                    let value = index !== undefined ? r[index] : '';
                    
                    const keyMap = {
                        Embarcador: "Cliente",
                        PrevisaoInicioAtendimento: "DataProgramada",
                        DtInicioExecucao: "DataChegada",
                        DtFimExecucao: "DataSaida",
                        JustificativaAtrasoProgramacao: "JustificativaAtraso",
                        Containers: "Container"
                    };
                    const finalKey = keyMap[key] || key;

                    if (value instanceof Date) {
                        value = formatDate(value);
                    }
                    row[finalKey] = value || '';
                }

                let porto = '';
                const tipoProg = row.TipoProgramacao?.toLowerCase() || '';
                if (tipoProg.includes('coleta')) {
                    porto = columnIndexMap.POL !== undefined ? r[columnIndexMap.POL] : '';
                } else if (tipoProg.includes('entrega')) {
                    porto = columnIndexMap.POD !== undefined ? r[columnIndexMap.POD] : '';
                }
                row.PortoOperacao = porto || '';

                return row;
            });

            uploadStatus.textContent = 'A sincronizar com a base de dados...';
            
            const existingDataMap = new Map();
            allData.forEach(record => {
                const uniqueId = `${record.Booking}-${record.Container}`;
                existingDataMap.set(uniqueId, record);
            });

            newRecords.forEach(newRecord => {
                const uniqueId = `${newRecord.Booking}-${newRecord.Container}`;
                existingDataMap.set(uniqueId, newRecord);
            });

            const mergedData = Array.from(existingDataMap.values());

            await setDoc(dataRef, { records: mergedData, lastUpdate: new Date() });
            uploadStatus.textContent = `✅ Sincronização concluída! A base de dados tem agora ${mergedData.length} registos.`;

        } catch (err) {
            uploadStatus.textContent = `❌ Erro: ${err.message}`;
        } finally {
            setTimeout(() => { uploadInput.value = ''; }, 4000);
        }
    };
    reader.readAsArrayBuffer(file);
};

const handleClearData = async (db, dataRef) => {
    const confirmation = window.confirm("Tem a certeza de que quer apagar TODAS as programações? Esta ação é irreversível.");
    if (confirmation) {
        try {
            await setDoc(dataRef, { records: [], lastUpdate: new Date() });
            alert("Todos os dados de programação foram limpos com sucesso.");
        } catch (error) {
            console.error("Erro ao limpar os dados:", error);
            alert("Ocorreu um erro ao tentar limpar os dados.");
        }
    }
};

// --- Ponto de Entrada Principal ---
const initializeAdminPage = async (auth, db, user) => {
    initializeUI(applyFiltersAndRender, handleDashboardClick);
    const userDocRef = doc(db, "users", user.uid);
    const userDoc = await getDoc(userDocRef);
    const isAdmin = userDoc.exists() && userDoc.data().role === 'admin';

    if (isAdmin) {
        document.getElementById('user-management-section').classList.remove('hidden');
    }

    const logoutButton = document.getElementById('logout-button');
    logoutButton.addEventListener('click', () => signOut(auth).then(() => window.location.href = 'index.html'));

    const uploadInput = document.getElementById('upload-file');
    const dataRef = doc(db, 'tracking_data', 'latest');
    uploadInput.addEventListener('change', (event) => handleFileUpload(event, db, dataRef));
    
    const clearDataBtn = document.getElementById('clear-data-btn');
    if(clearDataBtn) {
        clearDataBtn.addEventListener('click', () => handleClearData(db, dataRef));
    }
    
    const exportBtn = document.getElementById('export-excel-btn');
    if(exportBtn) {
        exportBtn.addEventListener('click', exportToExcel);
    }

    onSnapshot(dataRef, (docSnap) => {
        if (docSnap.exists()) {
            allData = docSnap.data().records || [];
            currentlyDisplayedData = allData.filter(r => !r.SituacaoProgramacao?.toLowerCase().includes('cancelada'));
            const validData = allData.filter(r => !r.SituacaoProgramacao?.toLowerCase().includes('cancelada'));
            populateClientFilter(validData);
            applyFiltersAndRender();
            if (isAdmin) {
                displayPendingUsers(db);
            }
        }
    });
};

const checkAuth = () => {
    try {
        const config = JSON.parse(__firebase_config);
        const app = initializeApp(config);
        const auth = getAuth(app);
        const db = getFirestore(app);
        onAuthStateChanged(auth, (user) => {
            if (user) {
                initializeAdminPage(auth, db, user);
            } else {
                window.location.href = 'index.html';
            }
        });
    } catch (error) {
        console.error("Erro ao inicializar o Firebase:", error);
    }
};

document.addEventListener('DOMContentLoaded', checkAuth);