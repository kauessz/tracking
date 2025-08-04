import { calculateDelayInMinutes, formatMinutesToHHMM, formatDateForDisplay, parseDate } from './utils.js';
import { renderOffendersChart, updateChartTheme } from './chart.js';

// --- Elementos do DOM ---
const body = document.body;
const resultsTableBody = document.getElementById('results-table-body');
const totalOpsEl = document.getElementById('total-ops');
const onTimeOpsEl = document.getElementById('on-time-ops');
const delayedOpsEl = document.getElementById('delayed-ops');
const delayedOpsPctEl = document.getElementById('delayed-ops-pct');
const modal = document.getElementById('client-detail-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalTitle = document.getElementById('modal-title');
const modalTableBody = document.getElementById('modal-table-body');

const mainView = document.getElementById('main-view');
const detailsScreen = document.getElementById('details-screen');
const detailsTitle = document.getElementById('details-title');
const detailsTableContainer = document.getElementById('details-table-container');
const detailsBackBtn = document.getElementById('details-back-btn');

let clientFilter = null;
let sortState = { key: 'DataProgramada', order: 'desc' };

// --- Funções de UI ---
export const applyTheme = () => {
    if (localStorage.getItem('theme') === 'dark') body.classList.add('dark-mode');
    else body.classList.remove('dark-mode');
    updateChartTheme();
};

export const toggleTheme = () => {
    body.classList.toggle('dark-mode');
    localStorage.setItem('theme', body.classList.contains('dark-mode') ? 'dark' : 'light');
    applyTheme();
};

const updateSortIndicators = () => {
    document.querySelectorAll('.sortable-header').forEach(header => {
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) {
            if (header.dataset.sort === sortState.key) {
                indicator.textContent = sortState.order === 'asc' ? '▲' : '▼';
            } else {
                indicator.textContent = '';
            }
        }
    });
};

export const renderData = (dataToRender, fullDataset) => {
    if (!resultsTableBody) return;

    const sortedData = [...dataToRender].sort((a, b) => {
        const key = sortState.key;
        const order = sortState.order;
        let valA = a[key] || '';
        let valB = b[key] || '';

        if (key === 'DataProgramada') {
            valA = parseDate(valA);
            valB = parseDate(valB);
        }

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });

    resultsTableBody.innerHTML = '';
    if (sortedData.length === 0) {
        resultsTableBody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">Nenhum resultado encontrado.</td></tr>';
    } else {
        sortedData.forEach((record, index) => {
            const delayMinutes = calculateDelayInMinutes(record);
            const delayDisplay = formatMinutesToHHMM(delayMinutes);
            const details = {
                Container: record.Container,
                TipoProgramacao: record.TipoProgramacao,
                Transportadora: record.Transportadora,
                NumeroProgramacao: record.NumeroProgramacao,
                NumeroCliente: record.NumeroCliente
            };
            const row = document.createElement('tr');
            row.className = 'main-row';
            row.dataset.details = JSON.stringify(details);
            row.dataset.rowIndex = index;
            if (delayMinutes > 0) row.classList.add('bg-red-50', 'dark:bg-red-900/20');

            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${record.Booking || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${record.Cliente || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${record.PortoOperacao || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(record.DataProgramada)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(record.DataChegada)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${delayMinutes > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">${delayDisplay}</td>
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">${record.JustificativaAtraso || 'N/A'}</td>
            `;
            resultsTableBody.appendChild(row);
        });
    }

    // ✅ CORREÇÃO: Os cálculos do dashboard e do gráfico agora usam os dados já filtrados (dataToRender)
    const totalOps = dataToRender.length;
    const delaysInMinutes = dataToRender.map(r => calculateDelayInMinutes(r));
    const delayedOpsCount = delaysInMinutes.filter(d => d > 0).length;
    const onTimeOpsCount = totalOps - delayedOpsCount;
    const delayedPct = totalOps > 0 ? ((delayedOpsCount / totalOps) * 100).toFixed(1) : 0;

    if (totalOpsEl) totalOpsEl.textContent = totalOps;
    if (onTimeOpsEl) onTimeOpsEl.textContent = onTimeOpsCount;
    if (delayedOpsEl) delayedOpsEl.textContent = delayedOpsCount;
    if (delayedOpsPctEl) delayedOpsPctEl.textContent = `${delayedPct}%`;
    
    updateSortIndicators();
    // O gráfico também é atualizado com base nos dados filtrados
    renderOffendersChart(dataToRender, (clientName) => showClientDetailModal(clientName, fullDataset));
};

const toggleDetailsRow = (row) => {
    const rowIndex = row.dataset.rowIndex;
    const existingDetailsRow = document.getElementById(`details-row-${rowIndex}`);
    if (existingDetailsRow) {
        existingDetailsRow.remove();
        return;
    }
    const details = JSON.parse(row.dataset.details);
    const detailsRow = document.createElement('tr');
    detailsRow.id = `details-row-${rowIndex}`;
    detailsRow.innerHTML = `
        <td colspan="7" class="p-4 bg-gray-100 dark:bg-gray-700 text-sm">
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div><strong>Container:</strong> ${details.Container || 'N/A'}</div>
                <div><strong>Tipo Prog.:</strong> ${details.TipoProgramacao || 'N/A'}</div>
                <div><strong>Transportadora:</strong> ${details.Transportadora || 'N/A'}</div>
                <div><strong>Nº Prog.:</strong> ${details.NumeroProgramacao || 'N/A'}</div>
                <div><strong>Nº Cliente:</strong> ${details.NumeroCliente || 'N/A'}</div>
            </div>
        </td>
    `;
    row.after(detailsRow);
};

const showClientDetailModal = (clientName, fullDataset) => {
    if (!modal || !modalTitle || !modalTableBody) return;
    
    const clientData = fullDataset.filter(r => r.Cliente === clientName && !r.SituacaoProgramacao?.toLowerCase().includes('cancelada'));
    const delayedOperations = clientData.filter(r => calculateDelayInMinutes(r) > 0);

    modalTitle.textContent = `Operações Atrasadas - ${clientName}`;
    
    modalTableBody.innerHTML = '';
    if (delayedOperations.length === 0) {
        modalTableBody.innerHTML = '<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">Nenhuma operação atrasada para este cliente.</td></tr>';
    } else {
        delayedOperations.forEach(record => {
            const delayMinutes = calculateDelayInMinutes(record);
            const delayDisplay = formatMinutesToHHMM(delayMinutes);
            const row = document.createElement('tr');
            row.className = 'bg-red-50 dark:bg-red-900/20';
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${record.Booking || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(record.DataProgramada)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(record.DataChegada)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${delayMinutes > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">${delayDisplay}</td>
                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">${record.JustificativaAtraso || 'N/A'}</td>
            `;
            modalTableBody.appendChild(row);
        });
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

const hideClientDetailModal = () => {
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

export const showDetailsScreen = (data, title) => {
    if (!mainView || !detailsScreen || !detailsTitle || !detailsTableContainer) return;

    detailsTitle.textContent = title;
    
    const table = document.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 dark:divide-gray-700';
    table.innerHTML = `
        <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Booking</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Embarcador</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Porto</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Previsão Início</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Início Execução</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Atraso (HH:MM)</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Motivo do Atraso</th>
            </tr>
        </thead>
        <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            ${data.map(record => {
                const delayMinutes = calculateDelayInMinutes(record);
                const delayDisplay = formatMinutesToHHMM(delayMinutes);
                return `
                    <tr class="${delayMinutes > 0 ? 'bg-red-50 dark:bg-red-900/20' : ''}">
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${record.Booking || 'N/A'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${record.Cliente || 'N/A'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${record.PortoOperacao || 'N/A'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(record.DataProgramada)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(record.DataChegada)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${delayMinutes > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">${delayDisplay}</td>
                        <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">${record.JustificativaAtraso || 'N/A'}</td>
                    </tr>
                `;
            }).join('')}
        </tbody>
    `;
    detailsTableContainer.innerHTML = '';
    detailsTableContainer.appendChild(table);

    mainView.classList.add('hidden');
    detailsScreen.classList.remove('hidden');
};

const hideDetailsScreen = () => {
    mainView.classList.remove('hidden');
    detailsScreen.classList.add('hidden');
};

export const populateClientFilter = (data) => {
    const filterEmbarcadorEl = document.getElementById('filter-embarcador');
    if (!filterEmbarcadorEl) return;
    const clients = [...new Set(data.map(r => r.Cliente).filter(Boolean))].sort();
    if (clientFilter) clientFilter.destroy();
    clientFilter = new Choices(filterEmbarcadorEl, {
        removeItemButton: true,
        placeholder: true,
        placeholderValue: 'Selecione um ou mais clientes',
        allowHTML: false,
    });
    clientFilter.setChoices(clients.map(c => ({ value: c, label: c })), 'value', 'label', true);
};

export const getFilters = () => {
    const filterBooking = document.getElementById('filter-booking');
    const filterDate = document.getElementById('filter-date');
    return {
        clients: clientFilter ? clientFilter.getValue(true) : [],
        booking: filterBooking ? filterBooking.value.trim().toLowerCase() : '',
        date: filterDate ? filterDate.value : '',
    };
};

export const clearFilters = () => {
    const filterBooking = document.getElementById('filter-booking');
    const filterDate = document.getElementById('filter-date');
    if (clientFilter) clientFilter.removeActiveItems();
    if (filterBooking) filterBooking.value = '';
    if (filterDate) filterDate.value = '';
};

// --- Event Listeners ---
export const initializeUI = (filterCallback, dashboardClickCallback) => {
    const toggleDark = document.getElementById('toggle-dark');
    const filterEmbarcadorEl = document.getElementById('filter-embarcador');
    const filterBooking = document.getElementById('filter-booking');
    const filterDate = document.getElementById('filter-date');
    const clearFiltersBtn = document.getElementById('clear-filters');
    const tableHead = document.getElementById('results-table-head');
    
    const totalCard = document.getElementById('total-ops-card');
    const onTimeCard = document.getElementById('on-time-ops-card');
    const delayedCard = document.getElementById('delayed-ops-card');

    applyTheme();
    if (toggleDark) toggleDark.addEventListener('click', toggleTheme);
    
    if (detailsBackBtn) {
        detailsBackBtn.addEventListener('click', hideDetailsScreen);
    }

    if (totalCard) {
        totalCard.addEventListener('click', () => dashboardClickCallback('all'));
    }
    if (onTimeCard) {
        onTimeCard.addEventListener('click', () => dashboardClickCallback('onTime'));
    }
    if (delayedCard) {
        delayedCard.addEventListener('click', () => dashboardClickCallback('delayed'));
    }

    if (tableHead) {
        tableHead.addEventListener('click', (e) => {
            const header = e.target.closest('.sortable-header');
            if (!header) return;
            const sortKey = header.dataset.sort;
            if (sortState.key === sortKey) {
                sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
            } else {
                sortState.key = sortKey;
                sortState.order = 'asc';
            }
            filterCallback();
        });
    }

    if (filterEmbarcadorEl) filterEmbarcadorEl.addEventListener('change', filterCallback);
    if (filterBooking) filterBooking.addEventListener('input', filterCallback);
    if (filterDate) filterDate.addEventListener('change', filterCallback);
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            clearFilters();
            filterCallback();
        });
    }

    if (resultsTableBody) {
        resultsTableBody.addEventListener('click', (e) => {
            const row = e.target.closest('.main-row');
            if (row) toggleDetailsRow(row);
        });
    }

    if (modal && modalCloseBtn) {
        modalCloseBtn.addEventListener('click', hideClientDetailModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) hideClientDetailModal();
        });
    }
};