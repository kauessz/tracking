// public/js/shared.js
// Módulo de utilidades compartilhadas entre Portal e Admin.
// Mantém compatibilidade com o utils.js atual e concentra filtros/KPI/timeline.

import {
  parseDate,
  formatDateForDisplay as _fmtDate,
  calculateDelayInMinutes as _delay,
  formatMinutesToHHMM as _minToHHMM
} from './utils.js';

// Reexport dos helpers já existentes (delegando ao utils.js)
export const formatDateForDisplay = _fmtDate;
export const calculateDelayInMinutes = _delay;
export const formatMinutesToHHMM = _minToHHMM;

// -----------------------------
// Filtros compartilhados
// -----------------------------
export function filterOperationsByStatus(ops, status) {
  if (!Array.isArray(ops) || status === 'all') return ops;
  return ops.filter(op => {
    const d = _delay(op);
    const txt = (op.SituacaoProgramacao || '').toString().toLowerCase();
    const canceled = txt.includes('cancelad');
    if (status === 'canceled') return canceled;
    if (canceled) return false; // portal nunca mostra canceladas
    if (status === 'ontime') return (d ?? 0) <= 0;
    if (status === 'late')   return (d ?? 0) > 0;
    return true;
  });
}

export function filterOperationsByRange(ops, range) {
  if (!Array.isArray(ops) || range === 'all') return ops;
  const now = new Date();
  const addDays = (n) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 23, 59, 59, 999);
  const startISO = (range === '7d') ? addDays(7).toISOString() : addDays(30).toISOString();
  return ops.filter(op => {
    const d = parseDate(op?.DataProgramada);
    return d ? d.toISOString() >= startISO : true;
  });
}

export function filterOperationsBySearch(ops, text) {
  const q = (text || '').trim().toLowerCase();
  if (!q) return ops;
  return ops.filter(op => {
    const a = (op.Booking || '').toString().toLowerCase();
    const b = (op.Container || '').toString().toLowerCase();
    const c = (op.PortoOperacao || '').toString().toLowerCase();
    return a.includes(q) || b.includes(q) || c.includes(q);
  });
}

// -----------------------------
// KPI / métricas
// -----------------------------
export function buildKPIs(ops) {
  const total = ops.length;
  let atrasadas = 0;
  let somaAtraso = 0;
  ops.forEach(op => {
    const m = _delay(op) || 0;
    if (m > 0) { atrasadas += 1; somaAtraso += m; }
  });
  const pctAtraso = total ? Math.round((atrasadas / total) * 1000) / 10 : 0;
  const atrasoMedioMin = atrasadas ? Math.round(somaAtraso / atrasadas) : 0;
  return { total, atrasadas, pctAtraso, atrasoMedioMin };
}

export function groupDelayReasons(ops, topN = 3) {
  const counts = {};
  ops.forEach(op => {
    const m = _delay(op) || 0;
    if (m > 0) {
      const key = ((op.JustificativaAtraso || 'N/A') + '').trim();
      counts[key] = (counts[key] || 0) + 1;
    }
  });
  return Object.entries(counts)
    .sort((a,b) => b[1]-a[1])
    .slice(0, topN)
    .map(([reason, count]) => ({ reason, count }));
}

// -----------------------------
// Timeline por operação (HTML puro)
// -----------------------------
export function renderTimelineHTML(op) {
  const dp = op?.DataProgramada;
  const dc = op?.DataChegada;
  const ds = op?.DataSaida || op?.['Dt FIM da Execução (BRA)'] || op?.['Dt Fim da Execucao (BRA)'];
  const delay = _delay(op) || 0;

  const step = (title, dateLike, active, warn) => `
    <div class="relative pl-6">
      <div class="absolute left-0 top-1.5 w-3 h-3 rounded-full ${warn ? 'bg-red-600' : active ? 'bg-blue-600' : 'bg-gray-300'}"></div>
      <div class="text-sm">
        <div class="font-semibold ${warn ? 'text-red-700' : 'text-gray-900'}">${title}</div>
        <div class="text-xs text-gray-500">${dateLike ? _fmtDate(dateLike) : '—'}</div>
      </div>
    </div>
  `;

  const warnExec = delay > 0 && !ds; // se está atrasada e não finalizou ainda
  return `
    <div class="border-t mt-3 pt-3 space-y-3">
      ${step('Programado', dp, true, false)}
      <div class="ml-1 border-l pl-5 py-1 border-gray-200"></div>
      ${step('Em Execução', dc, !!dc, warnExec)}
      <div class="ml-1 border-l pl-5 py-1 border-gray-200"></div>
      ${step('Finalizado', ds, !!ds, false)}
    </div>
  `;
}