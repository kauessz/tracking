// public/js/script.js

// importa utilidades de data/hora e CPF formatado
import { formatDateForDisplay } from "./utils.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, onSnapshot, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
  // Utilitário
  const $ = (id) => document.getElementById(id);

  // Rastreamento (público)
  const trackingInput    = $('tracking-input');
  const trackingButton   = $('tracking-button');
  const resultsContainer = $('tracking-results');

  // Login (IDs atuais OU antigos)
  const loginForm    = $('login-form'); // existe no seu index.html
  const emailInput   = $('email-input')    || $('email');
  const passwordInput= $('password-input') || $('password');
  const loginButton  = $('login-button');

  // Caixa de erro (cria se não existir no HTML)
  let errorBox = $('login-error');
  if (!errorBox && loginForm) {
    errorBox = document.createElement('p');
    errorBox.id = 'login-error';
    errorBox.className = 'mt-2 text-sm text-red-600';
    loginForm.appendChild(errorBox);
  }

  // helper CPF motorista igual usamos no portal
  const pickCPF = (op) =>
    op?.["CPF motorista programado"] ||
    op?.CpfMotorista || op?.CPFMotorista || op?.CPF_Motorista ||
    op?.CPFCNPJMotorista || op?.CPFCNPJ || op?.CPF || op?.DocumentoMotorista || 'N/A';

  // Firebase
  const app  = initializeApp(JSON.parse(__firebase_config));
  const auth = getAuth(app);
  const db   = getFirestore(app);

  // Estado em memória dos dados públicos
  let latestData = [];
  const norm = (s)=> (s ?? '').toString().trim().toLowerCase();

  // Render de resultados de rastreio (página pública)
  const renderDetailed = (records = []) => {
    resultsContainer.innerHTML = '';
    if (!records.length) {
      resultsContainer.innerHTML = '<p class="text-gray-600">Nenhum resultado encontrado.</p>';
      return;
    }
    const frag = document.createDocumentFragment();

    records.forEach(result => {
      const cpfMotorista = pickCPF(result);
      const cpfTxt = cpfMotorista && cpfMotorista !== 'N/A'
        ? ` (CPF: ${cpfMotorista})`
        : '';

      const card = document.createElement('div');
      card.className = "card mb-4";
      card.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div><strong>Embarcador:</strong> ${result.Cliente || 'N/A'}</div>
          <div><strong>Booking:</strong> ${result.Booking || 'N/A'}</div>
          <div><strong>Container:</strong> ${result.Container || 'N/A'}</div>

          <div><strong>Tipo Prog.:</strong> ${result.TipoProgramacao || 'N/A'}</div>
          <div><strong>Previsão Início:</strong> ${formatDateForDisplay(result.DataProgramada)}</div>
          <div><strong>Início Execução:</strong> ${formatDateForDisplay(result.DataChegada)}</div>

          <div><strong>Fim Execução:</strong> ${formatDateForDisplay(result.DataSaida)}</div>
          <div><strong>Previsão Entrega:</strong> ${formatDateForDisplay(result.DataPrevisaoEntregaRecalculada)}</div>

          <div><strong>Motorista:</strong> ${result.NomeMotoristaProgramado || 'N/A'}${cpfTxt}</div>
          <div><strong>Cavalo:</strong> ${result.PlacaVeiculo || 'N/A'}</div>
          <div><strong>Reboque:</strong> ${result.PlacaCarreta1 || 'N/A'}</div>
        </div>`;
      frag.appendChild(card);
    });
    resultsContainer.appendChild(frag);
  };

  // Busca pública por booking/container
  const doSearch = () => {
    const term = norm(trackingInput?.value || '');
    if (!term) return renderDetailed([]);
    const filtered = latestData.filter(r =>
      norm(r?.Booking || '').includes(term) || norm(r?.Container || '').includes(term)
    );
    renderDetailed(filtered);
  };
  trackingButton?.addEventListener('click', doSearch);
  trackingInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  // Login
  const doLogin = async (evt) => {
    if (evt?.preventDefault) evt.preventDefault();

    const email = (emailInput?.value || '').trim();
    const pass  = (passwordInput?.value || '').trim();

    if (!email || !pass) {
      if (errorBox) errorBox.textContent = 'Informe e-mail e senha.';
      return;
    }
    if (errorBox) errorBox.textContent = '';

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const uid  = cred.user.uid;

      // Busca o documento do usuário para direcionar por role/status
      const snap = await getDoc(doc(db, 'users', uid));
      const u = snap.exists() ? snap.data() : {};

      const status = u.status || 'approved';
      const role   = u.role   || 'embarcador';

      if (status !== 'approved') {
        if (errorBox) {
          errorBox.textContent = (status === 'pending')
            ? 'Sua conta está pendente de aprovação.'
            : 'Sua conta foi rejeitada.';
        }
        return;
      }

      window.location.href = (role === 'admin') ? 'admin.html' : 'portal.html';
    } catch (e) {
      console.error('Erro no login:', e);
      if (errorBox) errorBox.textContent = 'Credenciais inválidas.';
    }
  };

  // Garante que o submit do form não recarrega a página
  loginForm?.addEventListener('submit', doLogin);
  loginButton?.addEventListener('click', doLogin);

  // Feed em tempo real do dataset público
  onSnapshot(doc(db, 'tracking_data', 'latest'), (snap) => {
    latestData = snap.data()?.records || [];
  });
});