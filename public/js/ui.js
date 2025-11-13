import { calculateDelayInMinutes, formatMinutesToHHMM, formatDateForDisplay, parseDate } from './utils.js';
import { renderOffendersChart, updateChartTheme, renderDelayReasonsChart } from './chart.js';

const resultsTableHead = document.getElementById('results-table-head');
const resultsTableBody = document.getElementById('results-table-body');

const detailsView  = document.getElementById('details-view') || document.getElementById('details-screen');
const detailsTitle = document.getElementById('details-title');
const detailsBody  = document.getElementById('details-table-body');
const detailsBackBtn = document.getElementById('details-back-btn');

const totalCard   = document.getElementById('total-ops-card');
const onTimeCard  = document.getElementById('on-time-ops-card');
const delayedCard = document.getElementById('delayed-ops-card');

const totalOpsEl   = document.getElementById('total-ops');
const onTimeOpsEl  = document.getElementById('on-time-ops');
const delayedOpsEl = document.getElementById('delayed-ops');
const delayedOpsPctEl = document.getElementById('delayed-ops-pct');

const filterShipperElement = document.getElementById('filter-embarcador');
const filterBookingElement = document.getElementById('filter-booking');
const filterDateElement    = document.getElementById('filter-date');
const clearFiltersBtn      = document.getElementById('clear-filters');

let currentChoices = null;
let sortState = { key: 'Booking', order: 'asc' };
const norm = (s)=> (s??'').toString().trim().toLowerCase();

const updateSortIndicators = () => {
  document.querySelectorAll('.sortable-header').forEach(h => {
    const ind = h.querySelector('.sort-indicator');
    if (!ind) return;
    if (h.dataset.sort === sortState.key) ind.textContent = sortState.order === 'asc' ? '▲' : '▼';
    else ind.textContent = '';
  });
};

export const initializeUI = (filterCallback, dashboardClickCallback) => {
  currentChoices = new Choices(filterShipperElement, {
    removeItemButton: true, allowHTML: true, searchEnabled: true,
    placeholder: true, placeholderValue: 'Selecione um ou mais embarcadores'
  });

  const srcEl = currentChoices.passedElement.element;
  srcEl.addEventListener('change', filterCallback);
  srcEl.addEventListener('addItem', filterCallback);
  srcEl.addEventListener('removeItem', filterCallback);

  resultsTableHead?.addEventListener('click', (e) => {
    const th = e.target.closest('.sortable-header'); if (!th) return;
    const key = th.dataset.sort;
    if (sortState.key === key) sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
    else { sortState.key = key; sortState.order = 'asc'; }
    updateSortIndicators();
    filterCallback();
  });

  totalCard?.addEventListener('click', () => dashboardClickCallback('all'));
  onTimeCard?.addEventListener('click', () => dashboardClickCallback('onTime'));
  delayedCard?.addEventListener('click', () => dashboardClickCallback('delayed'));

  filterBookingElement?.addEventListener('keydown', (e)=>{ if (e.key==='Enter') filterCallback(); });
  filterBookingElement?.addEventListener('blur', filterCallback);
  filterDateElement?.addEventListener('change', filterCallback);
  clearFiltersBtn?.addEventListener('click', ()=>{ clearFilters(); filterCallback(); });

  resultsTableBody?.addEventListener('click', (e) => {
    const row = e.target.closest('tr.main-row'); if (!row) return;
    toggleDetailsRow(row, 'results');
  });

  detailsBody?.addEventListener('click', (e) => {
    const row = e.target.closest('tr.main-row'); if (!row) return;
    toggleDetailsRow(row, 'details');
  });

  detailsBackBtn?.addEventListener('click', () => {
    try { hideDetailsScreen(); } catch (e) { console.warn(e); }
  });

};

export const populateClientFilter = (data) => {
  if (!currentChoices) return;
  const shippers = [...new Set(data.map(i => i.Cliente && i.Cliente.toString().trim()).filter(Boolean))].sort();
  currentChoices.clearStore();
  currentChoices.setChoices(shippers.map(s => ({ value:s, label:s })), 'value','label', true);
};

export const getFilters = () => {
  const clients = currentChoices ? currentChoices.getValue(true) : [];
  const booking = (filterBookingElement?.value || '').trim();
  const date    = (filterDateElement?.value || '').trim();
  return { clients, booking, date };
};

export const clearFilters = () => {
  if (currentChoices) currentChoices.removeActiveItems();
  if (filterBookingElement) filterBookingElement.value = '';
  if (filterDateElement) filterDateElement.value = '';
};

const compare = (a,b,key) => {
  let x = a[key] || '', y = b[key] || '';
  if (key === 'DataProgramada') { x = parseDate(x); y = parseDate(y); }
  if (x < y) return -1; if (x > y) return 1; return 0;
};

export const renderData = (rows, full) => {
  const sorted = [...rows].sort((a,b)=>{
    const s = compare(a,b,sortState.key);
    return sortState.order === 'asc' ? s : -s;
  });

  const total   = sorted.length;
  const delayed = sorted.filter(r => calculateDelayInMinutes(r) > 0).length;
  const ontime  = total - delayed;
  const pct     = total ? Math.round((delayed/total)*1000)/10 : 0;

  totalOpsEl.textContent = total;
  onTimeOpsEl.textContent = ontime;
  delayedOpsEl.textContent = delayed;
  delayedOpsPctEl.textContent = `${pct}%`;

  updateSortIndicators();
  renderOffendersChart(sorted, (clientName) => showClientDetailModal(clientName, full));
  renderDelayReasonsChart(sorted);
  renderTableRows(resultsTableBody, sorted);
};

export const renderTableRows = (tbody, rows) => {
  if (!tbody) return;
  tbody.innerHTML = rows.map((r, idx) => {
    const delayMin  = calculateDelayInMinutes(r);
    const isLate    = delayMin > 0;
    const delayDisp = isLate
      ? `<span class="font-semibold text-red-700">${formatMinutesToHHMM(delayMin)}</span>`
      : `<span class="font-semibold text-green-700">ON TIME</span>`;

    const lateClass = isLate ? ' bg-red-50' : '';
    const lateStyle = isLate ? ' style="background-color:#fdecec;"' : '';
    
    const container = r.Container || r.containers || '-';
    const motivo = r.JustificativaAtraso || r.motivo_atraso || 'N/A';

    return `
      <tr class="main-row cursor-pointer${lateClass}"${lateStyle}
          data-row-index="${idx}"
          data-details='${JSON.stringify({
            TipoProgramacao: r.TipoProgramacao || '-',
            Transportadora: r.Transportadora || '-',
            NumeroProgramacao: r.NumeroProgramacao || '-',
            NumeroCliente: r.NumeroCliente || '-',
            Container: container
          }).replace(/'/g,"&apos;")}'>
        <td class="px-6 py-3 whitespace-nowrap">${r.Booking||'-'}</td>
        <td class="px-6 py-3 whitespace-nowrap" title="${container}">${container}</td>
        <td class="px-6 py-3 whitespace-nowrap" title="${r.Cliente||'-'}">${r.Cliente||'-'}</td>
        <td class="px-6 py-3 whitespace-nowrap" title="${r.PortoOperacao||'-'}">${r.PortoOperacao||'-'}</td>
        <td class="px-6 py-3 whitespace-nowrap font-mono tabular-nums">${formatDateForDisplay(r.DataProgramada)||'-'}</td>
        <td class="px-6 py-3 whitespace-nowrap font-mono tabular-nums">${formatDateForDisplay(r.DataChegada)||'-'}</td>
        <td class="px-6 py-3 text-center">${delayDisp}</td>
        <td class="px-6 py-3">${motivo}</td>
      </tr>`;
  }).join('');
};

export const renderDetailsRows = (rows) => {
  renderTableRows(detailsBody, rows);
};

const toggleDetailsRow = (row, which) => {
  const idx = row.dataset.rowIndex;
  const id  = `${which}-details-row-${idx}`;
  const existing = document.getElementById(id);
  if (existing) { existing.remove(); return; }
  const details = JSON.parse(row.dataset.details.replace(/&apos;/g,"'"));
  const tr = document.createElement('tr');
  tr.id = id;
  tr.innerHTML = `
    <td colspan="7" class="p-0">
      <div class="px-6 py-3 bg-gray-50">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div><span class="font-medium">Container:</span> ${details.Container}</div>
          <div><span class="font-medium">Tipo Prog.:</span> ${details.TipoProgramacao}</div>
          <div><span class="font-medium">Transportadora:</span> ${details.Transportadora}</div>
          <div><span class="font-medium">Nº Prog.:</span> ${details.NumeroProgramacao}</div>
          <div><span class="font-medium">Nº Cliente:</span> ${details.NumeroCliente}</div>
        </div>
      </div>
    </td>`;
  row.insertAdjacentElement('afterend', tr);
};

export const showDetailsScreen = (title, rows) => {
  try {
    detailsTitle.textContent = title;
    renderDetailsRows(rows || []);
    document.getElementById('main-view')?.classList.add('hidden');
    detailsView?.classList.remove('hidden');
  } catch (e) {
    console.error('Falha ao abrir detalhes', e);
    alert('Não foi possível abrir os detalhes.');
  }
};

export const hideDetailsScreen = () => {
  detailsView?.classList.add('hidden');
  document.getElementById('main-view')?.classList.remove('hidden');
};

export const showClientDetailModal = (clientName, fullDataset) => {
  const rows = fullDataset.filter(r => norm(r.Cliente) === norm(clientName));
  showDetailsScreen(`Detalhes — ${clientName}`, rows);
};

export { updateChartTheme };