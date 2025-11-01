import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
  parseDate,
  formatDateForDisplay,
  calculateDelayInMinutes,
  registerPWA
} from './utils.js';

/* >>> Prioriza exatamente o campo “CPF motorista programado” da planilha */
const pickCPF = (op) =>
  op?.["CPF motorista programado"] ||
  op?.CpfMotorista || op?.CPFMotorista || op?.CPF_Motorista ||
  op?.CPFCNPJMotorista || op?.CPFCNPJ || op?.CPF || op?.DocumentoMotorista || 'N/A';

/* -------- Portal -------- */
document.addEventListener('DOMContentLoaded', () => {
  const tableBody   = document.getElementById('operations-table-body');
  const portalTitle = document.getElementById('portal-title');
  const logoutBtn   = document.getElementById('logout-button');
  const toggleDark  = document.getElementById('toggle-dark');

  const toggleDetailsRow = (row) => {
    const idx = row.dataset.rowIndex;
    const id  = `details-row-${idx}`;
    const existing = document.getElementById(id);
    if (existing) { existing.remove(); return; }

    const d = JSON.parse(row.dataset.details.replace(/&apos;/g,"'"));
    const tr = document.createElement('tr');
    tr.id = id;
    tr.innerHTML = `
      <td colspan="6" class="px-6 py-3 bg-gray-50">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div><span class="font-medium">Porto:</span> ${d.PortoOperacao}</div>
          <div><span class="font-medium">Motorista:</span> ${d.NomeMotoristaProgramado}</div>
          <div><span class="font-medium">CPF Motorista:</span> ${d.CpfMotorista}</div>
          <div><span class="font-medium">Veículo:</span> ${d.Veiculo}</div>
          <div><span class="font-medium">Reboque:</span> ${d.Reboque}</div>
          <div><span class="font-medium">Tipo Prog.:</span> ${d.TipoProgramacao}</div>
          <div><span class="font-medium">Transportadora:</span> ${d.Transportadora}</div>
          <div><span class="font-medium">Nº Prog.:</span> ${d.NumeroProgramacao}</div>
          <div><span class="font-medium">Container:</span> ${d.Container}</div>
        </div>
      </td>`;
    row.insertAdjacentElement('afterend', tr);
  };

  const renderOperations = (operations=[]) => {
    const totalOpsEl      = document.getElementById('total-ops');
    const onTimeOpsEl     = document.getElementById('on-time-ops');
    const delayedOpsPctEl = document.getElementById('delayed-ops-pct');

    tableBody.innerHTML = '';
    if (!operations.length) {
      tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Nenhuma operação encontrada para si.</td></tr>';
      totalOpsEl.textContent = '0'; onTimeOpsEl.textContent = '0'; delayedOpsPctEl.textContent = '0%';
      return;
    }

    let delayedCount = 0;
    const frag = document.createDocumentFragment();

    operations.forEach((op, i) => {
      const delayMin = calculateDelayInMinutes(op);
      if (delayMin > 0) delayedCount++;

      const isLate = delayMin > 0;
      const tr = document.createElement('tr');
      tr.className = `main-row cursor-pointer${isLate ? ' bg-red-50' : ''}`;
      tr.dataset.rowIndex = i.toString();
      tr.dataset.details = JSON.stringify({
        PortoOperacao: op.PortoOperacao || 'N/A',
        NomeMotoristaProgramado: op.NomeMotoristaProgramado || op["Nome Motorista Programado"] || 'N/A',
        CpfMotorista: pickCPF(op),
        Veiculo: op.PlacaVeiculo || op.Carreta || 'N/A',
        Reboque: op.PlacaCarreta1 || 'N/A',
        TipoProgramacao: op.TipoProgramacao || 'N/A',
        Transportadora: op.Transportadora || 'N/A',
        NumeroProgramacao: op.NumeroProgramacao || 'N/A',
        Container: op.Container || 'N/A'
      }).replace(/'/g,"&apos;");

      tr.innerHTML = `
        <td class="px-6 py-3">${op.NumeroCliente || 'N/A'}</td>
        <td class="px-6 py-3">${op.Booking || 'N/A'}</td>
        <td class="px-6 py-3">${op.Container || 'N/A'}</td>
        <td class="px-6 py-3">${formatDateForDisplay(op.DataProgramada)}</td>
        <td class="px-6 py-3">${formatDateForDisplay(op.DataChegada)}</td>
        <td class="px-6 py-3">
          ${isLate
            ? '<span class="font-semibold text-red-700">Atrasado</span>'
            : '<span class="on-time-pill">On Time</span>'}
        </td>
      `;
      frag.appendChild(tr);
    });

    tableBody.appendChild(frag);

    tableBody.onclick = (ev) => {
      const row = ev.target.closest('tr.main-row');
      if (!row) return;
      toggleDetailsRow(row);
    };

    const total = operations.length;
    const onTime = total - delayedCount;
    const pct = total ? ((delayedCount/total)*100).toFixed(1) : 0;
    totalOpsEl.textContent = total;
    onTimeOpsEl.textContent = onTime;
    delayedOpsPctEl.textContent = `${pct}%`;
  };

  const init = async (db, user) => {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) { window.location.href = 'index.html'; return; }
    const u = snap.data();

    if (u.role === 'admin') { window.location.href = 'admin.html'; return; }
    if (u.role !== 'embarcador' || u.status !== 'approved' || !u.associatedShipper) {
      window.location.href = 'index.html'; return;
    }

    const shipper = u.associatedShipper;
    portalTitle.textContent = `Portal - ${shipper}`;

    onSnapshot(doc(db,'tracking_data','latest'), (docSnap) => {
      const all = docSnap.exists() ? (docSnap.data().records || []) : [];

      // pega só as do cliente logado
      // e remove canceladas
      const mine = all
        .filter(r =>
          (r.Cliente||'').toString().trim() === shipper.toString().trim()
        )
        .filter(r =>
          !((r.SituacaoProgramacao || '').toString().toLowerCase().includes('cancelad'))
        );

      renderOperations(mine);
    });
  };

  toggleDark?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
  });

  try {
    const app = initializeApp(JSON.parse(__firebase_config));
    const auth = getAuth(app);
    const db = getFirestore(app);

    onAuthStateChanged(auth, (u) => {
      if (u) init(db, u);
      else window.location.href = 'index.html';
    });

    logoutBtn?.addEventListener('click', () => signOut(auth).then(()=>window.location.href='index.html'));

    // === Registro PWA ===
    registerPWA();
  } catch (e) {
    console.error('Erro ao inicializar o portal:', e);
  }
});