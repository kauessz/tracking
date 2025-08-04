import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Funções utilitárias (sem alterações)
const parseDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;
    let parts = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})$/);
    if (parts) {
        const day = parseInt(parts[1], 10);
        const month = parseInt(parts[2], 10) - 1;
        const year = parseInt(parts[3], 10);
        const hour = parseInt(parts[4], 10);
        const minute = parseInt(parts[5], 10);
        return new Date(year, month, day, hour, minute);
    }
    parts = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
    if (parts) {
        let month = parseInt(parts[1], 10) - 1;
        let day = parseInt(parts[2], 10);
        let year = parseInt(parts[3], 10);
        const hour = parts[4] ? parseInt(parts[4], 10) : 0;
        const minute = parts[5] ? parseInt(parts[5], 10) : 0;
        if (year < 100) year += 2000;
        if (month >= 0 && month < 12 && day > 0 && day <= 31) {
             return new Date(year, month, day, hour, minute);
        }
    }
    return null;
};
const calculateDelayInMinutes = (operation) => {
    const previsaoDate = parseDate(operation.DataProgramada);
    if (!previsaoDate) return null;
    let execucaoDate = parseDate(operation.DataChegada);
    if (!execucaoDate && previsaoDate < new Date()) execucaoDate = new Date();
    if (!execucaoDate) return null;
    if (operation.CidadeDescarga && operation.CidadeDescarga.toLowerCase().includes('manaus')) {
        execucaoDate.setHours(execucaoDate.getHours() - 1);
    }
    return (execucaoDate.getTime() - previsaoDate.getTime()) / (1000 * 60);
};
const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    return dateString;
};

document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.getElementById('operations-table-body');
    const portalTitle = document.getElementById('portal-title');
    const logoutButton = document.getElementById('logout-button');
    const toggleDark = document.getElementById('toggle-dark');
    const totalOpsEl = document.getElementById('total-ops');
    const onTimeOpsEl = document.getElementById('on-time-ops');
    const delayedOpsPctEl = document.getElementById('delayed-ops-pct');

    const applyTheme = () => {
        if (localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
        else document.body.classList.remove('dark-mode');
    };
    const toggleTheme = () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    };
    applyTheme();
    toggleDark.addEventListener('click', toggleTheme);

    const renderOperations = (operations) => {
        tableBody.innerHTML = '';
        if (operations.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">Nenhuma operação encontrada para si.</td></tr>';
            totalOpsEl.textContent = '0';
            onTimeOpsEl.textContent = '0';
            delayedOpsPctEl.textContent = '0%';
            return;
        }
        let delayedCount = 0;
        operations.forEach(op => {
            const delayMinutes = calculateDelayInMinutes(op);
            if (delayMinutes > 0) delayedCount++;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${op.NumeroCliente || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">${op.Booking || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${op.Container || 'N/A'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(op.DataProgramada)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">${formatDateForDisplay(op.DataChegada)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${delayMinutes > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}">${delayMinutes > 0 ? 'Atrasado' : 'On Time'}</td>
            `;
            tableBody.appendChild(row);
        });
        const totalOps = operations.length;
        const onTimeOps = totalOps - delayedCount;
        const delayedPct = totalOps > 0 ? ((delayedCount / totalOps) * 100).toFixed(1) : 0;
        totalOpsEl.textContent = totalOps;
        onTimeOpsEl.textContent = onTimeOps;
        delayedOpsPctEl.textContent = `${delayedPct}%`;
    };

    const initializePortal = async (db, user) => {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        if (!userDoc.exists() || !userDoc.data().associatedShipper) return;
        const shipperName = userDoc.data().associatedShipper;
        portalTitle.textContent = `Portal - ${shipperName}`;
        
        // ✅ CORREÇÃO: Usar o caminho simplificado que corresponde às regras de segurança.
        const trackingDataRef = doc(db, 'tracking_data', 'latest');
        
        onSnapshot(trackingDataRef, (docSnap) => {
            if (docSnap.exists()) {
                const allRecords = docSnap.data().records || [];
                const shipperRecords = allRecords.filter(record => record.Cliente === shipperName);
                renderOperations(shipperRecords);
            }
        });
    };

    try {
        const config = JSON.parse(__firebase_config);
        const app = initializeApp(config);
        const auth = getAuth(app);
        const db = getFirestore(app);
        onAuthStateChanged(auth, (user) => {
            if (user) initializePortal(db, user);
            else window.location.href = 'index.html';
        });
        logoutButton.addEventListener('click', () => signOut(auth).then(() => window.location.href = 'index.html'));
    } catch (error) {
        console.error("Erro ao inicializar o portal:", error);
    }
});