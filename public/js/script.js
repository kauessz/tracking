// script.js - VERSÃO MODERNIZADA COM TABS E OCORRÊNCIAS
// =========================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getApiUrl } from './config.js';

// --------------------------------------------------
// CONFIG
// --------------------------------------------------
const API_BASE = getApiUrl();

const firebaseConfig = {
  apiKey: "AIzaSyAqz0eAaJwE38EAyTgbRk4CZryswDqvSBY",
  authDomain: "mercosul-teste.firebaseapp.com",
  projectId: "mercosul-teste",
  storageBucket: "mercosul-teste.appspot.com",
  messagingSenderId: "650943607449",
  appId: "1:650943607449:web:73ec91b430ccaa55b77e08",
  measurementId: "G-KJHFXFLJ6K"
};

// inicializa Firebase Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// --------------------------------------------------
// GERENCIAMENTO DE TABS
// --------------------------------------------------
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      
      // Remove active de todos
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Ativa o selecionado
      button.classList.add('active');
      const targetContent = document.getElementById(`tab-${tabId}`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });
}

// --------------------------------------------------
// MÁSCARAS DE INPUT
// --------------------------------------------------
function maskTelefone(value) {
  value = value.replace(/\D/g, '');
  if (value.length <= 10) {
    value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  } else {
    value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
  }
  return value;
}

function maskCPF(value) {
  value = value.replace(/\D/g, '');
  value = value.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2}).*/, '$1.$2.$3-$4');
  return value;
}

// --------------------------------------------------
// HELPERS
// --------------------------------------------------
function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function setStatus(elementId, msg, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const statusDiv = el.querySelector('div');
  if (statusDiv) {
    statusDiv.textContent = msg;
    statusDiv.className = `p-4 rounded-xl text-sm ${
      isError 
        ? 'bg-red-50 border border-red-200 text-red-700' 
        : 'bg-green-50 border border-green-200 text-green-700'
    }`;
  }
  
  el.classList.remove('hidden');
}

// --------------------------------------------------
// RENDERIZA RESULTADOS DE RASTREAMENTO
// --------------------------------------------------
function renderTracking(items) {
  const container = document.getElementById("tracking-results");
  if (!container) return;

  if (!items || !items.length) {
    container.innerHTML = `
      <p class="text-gray-500 text-sm text-center py-8">
        Nenhum resultado encontrado.
      </p>
    `;
    return;
  }

  const html = items
    .map(op => {
      return `
        <div class="border-2 border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow bg-white">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div><span class="font-semibold text-gray-700">Embarcador:</span> <span class="text-gray-900">${op.embarcador_nome || "N/A"}</span></div>
            <div><span class="font-semibold text-gray-700">Booking:</span> <span class="text-gray-900">${op.booking || "N/A"}</span></div>

            <div><span class="font-semibold text-gray-700">Container:</span> <span class="text-gray-900">${op.container || "N/A"}</span></div>
            <div><span class="font-semibold text-gray-700">Tipo Prog.:</span> <span class="text-gray-900">${op.status_operacao || "N/A"}</span></div>

            <div><span class="font-semibold text-gray-700">Previsão Início:</span> <span class="text-gray-900">${formatDateTime(op.previsao_inicio_atendimento)}</span></div>
            <div><span class="font-semibold text-gray-700">Previsão Entrega:</span> <span class="text-gray-900">${formatDateTime(op.dt_previsao_entrega_recalculada)}</span></div>

            <div><span class="font-semibold text-gray-700">Início Execução:</span> <span class="text-gray-900">${formatDateTime(op.dt_inicio_execucao)}</span></div>
            <div><span class="font-semibold text-gray-700">Fim Execução:</span> <span class="text-gray-900">${formatDateTime(op.dt_fim_execucao)}</span></div>

            <div><span class="font-semibold text-gray-700">Motorista:</span> <span class="text-gray-900">${op.nome_motorista || "N/A"}</span></div>
            <div><span class="font-semibold text-gray-700">CPF:</span> <span class="text-gray-900">${op.cpf_motorista || "N/A"}</span></div>

            <div><span class="font-semibold text-gray-700">Veículo:</span> <span class="text-gray-900">${op.placa_veiculo || "N/A"}</span></div>
            <div><span class="font-semibold text-gray-700">Reboque:</span> <span class="text-gray-900">${op.placa_carreta || "N/A"}</span></div>

            <div class="md:col-span-2 pt-2 border-t border-gray-100 mt-2">
              <span class="font-semibold text-gray-700">Justificativa Atraso:</span>
              <span class="text-gray-900">${op.justificativa_atraso || "-"}</span>
            </div>
          </div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = html;
}

// --------------------------------------------------
// CONSULTA PÚBLICA /trackingList
// --------------------------------------------------
async function runTrackingSearch() {
  const input = document.getElementById("tracking-input");
  const container = document.getElementById("tracking-results");

  const val = (input?.value || "").trim();
  if (!val) {
    container.innerHTML = `
      <p class="text-gray-500 text-sm text-center py-8">
        Informe um Booking ou Container.
      </p>`;
    return;
  }

  container.innerHTML = `
    <div class="text-center py-8">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
      <p class="text-gray-500 text-sm mt-2">Buscando...</p>
    </div>
  `;

  try {
    const resp = await fetch(
      `${API_BASE}/trackingList?booking=${encodeURIComponent(val)}`,
      { 
        method: "GET", 
        cache: "no-store",
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );

    const data = await resp.json().catch(() => null);

    if (!resp.ok || !data?.success) {
      container.innerHTML = `
        <p class="text-red-600 text-sm text-center py-8">
          ❌ Erro ao consultar. Tente novamente.
        </p>`;
      return;
    }

    renderTracking(data.items || []);
  } catch (err) {
    console.error("Erro trackingList:", err);
    container.innerHTML = `
      <p class="text-red-600 text-sm text-center py-8">
        ❌ Falha de rede. Verifique sua conexão.
      </p>`;
  }
}

// --------------------------------------------------
// REGISTRO DE OCORRÊNCIA
// --------------------------------------------------
async function handleOcorrencia(e) {
  e.preventDefault();

  const bookingEl = document.getElementById("ocorrencia-booking");
  const containerEl = document.getElementById("ocorrencia-container");
  const tipoEl = document.getElementById("ocorrencia-tipo");
  const descricaoEl = document.getElementById("ocorrencia-descricao");

  const booking = bookingEl.value.trim();
  const container = containerEl.value.trim();
  const tipo = tipoEl.value;
  const descricao = descricaoEl.value.trim();

  if (!booking || !tipo || !descricao) {
    setStatus("ocorrencia-status", "Preencha todos os campos obrigatórios.", true);
    return;
  }

  const statusDiv = document.getElementById("ocorrencia-status");
  statusDiv.innerHTML = `
    <div class="p-4 rounded-xl text-sm bg-blue-50 border border-blue-200 text-blue-700">
      📤 Enviando ocorrência...
    </div>
  `;
  statusDiv.classList.remove('hidden');

  try {
    // Busca informações da operação para preencher dados adicionais
    const trackResp = await fetch(`${API_BASE}/trackingList?booking=${encodeURIComponent(booking)}`, {
      method: "GET",
      cache: "no-store"
    });

    const trackData = await trackResp.json().catch(() => ({ items: [] }));
    const operacao = trackData.items?.[0] || {};

    const resp = await fetch(`${API_BASE}/ocorrencias/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        booking,
        container,
        embarcador_nome: operacao.embarcador_nome || "Não informado",
        porto: operacao.porto_operacao || null,
        previsao_original: operacao.previsao_inicio_atendimento || null,
        tipo_ocorrencia: tipo,
        descricao: descricao,
        nova_previsao: null
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.ok && data.success) {
      setStatus("ocorrencia-status", "✅ Ocorrência registrada com sucesso!", false);
      
      // Limpa o formulário
      bookingEl.value = "";
      containerEl.value = "";
      tipoEl.value = "";
      descricaoEl.value = "";
      
      setTimeout(() => {
        statusDiv.classList.add('hidden');
      }, 5000);
    } else {
      setStatus("ocorrencia-status", data.message || "Erro ao registrar ocorrência.", true);
    }
  } catch (err) {
    console.error("Erro handleOcorrencia:", err);
    setStatus("ocorrencia-status", "Falha ao conectar com o servidor.", true);
  }
}

// --------------------------------------------------
// REGISTRO DE USUÁRIO
// --------------------------------------------------
async function handleRegister(e) {
  e.preventDefault();

  const emailEl = document.getElementById("register-email");
  const nomeEl = document.getElementById("register-nome");
  const telefoneEl = document.getElementById("register-telefone");
  const cpfEl = document.getElementById("register-cpf");

  const email = emailEl.value.trim();
  const nome = nomeEl.value.trim();
  const telefone = telefoneEl.value.trim();
  const cpf = cpfEl.value.trim();

  if (!email || !nome || !telefone || !cpf) {
    alert("Preencha todos os campos.");
    return;
  }

  try {
    const user = auth.currentUser;
    if (!user) {
      alert("Você precisa estar autenticado primeiro. Faça login.");
      return;
    }

    const token = await user.getIdToken(true);

    const resp = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({ 
        email, 
        nome,
        telefone: telefone.replace(/\D/g, ''),
        cpf: cpf.replace(/\D/g, '')
      }),
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.status === 200 && data.success) {
      alert("✅ Cadastro enviado! Aguarde aprovação do administrador.");
      const registerForm = document.getElementById("register-form");
      if (registerForm) registerForm.style.display = "none";
      return;
    }

    if (resp.status === 400 && data.error === "user_already_registered") {
      alert("Você já está cadastrado. Aguarde aprovação.");
      return;
    }

    alert(data.message || "Erro ao processar cadastro.");
  } catch (err) {
    console.error("Erro handleRegister:", err);
    alert("Falha ao conectar com servidor.");
  }
}

// --------------------------------------------------
// LOGIN
// --------------------------------------------------
async function handleLogin(e) {
  e.preventDefault();

  const emailEl = document.getElementById("login-email");
  const passEl = document.getElementById("login-password");

  const email = emailEl.value.trim();
  const pass = passEl.value;

  if (!email || !pass) {
    setStatus("login-status", "Preencha e-mail e senha.", true);
    return;
  }

  document.getElementById("login-status").innerHTML = `
    <div class="p-4 rounded-xl text-sm bg-blue-50 border border-blue-200 text-blue-700">
      🔄 Autenticando...
    </div>
  `;
  document.getElementById("login-status").classList.remove('hidden');

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const fbUser = cred.user;
    const token = await fbUser.getIdToken(true);

    const resp = await fetch(`${API_BASE}/auth/whoami`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      cache: "no-store"
    });

    const data = await resp.json().catch(() => ({}));

    if (resp.status === 200 && data && data.success && data.user) {
      const { role, status } = data.user;

      if (status === "ativo") {
        setStatus("login-status", "✅ Login realizado com sucesso!", false);
        
        setTimeout(() => {
          if (role === "admin") {
            window.location.href = "admin.html";
          } else {
            window.location.href = "portal.html";
          }
        }, 1000);
        return;
      } else {
        setStatus("login-status", "Perfil encontrado, mas está inativo.", true);
        return;
      }
    }

    if (resp.status === 403 && data.error === "user_not_found_in_db") {
      setStatus("login-status", "", false);
      
      const registerSection = document.getElementById("register-section");
      if (registerSection) {
        registerSection.classList.remove("hidden");
        document.getElementById("register-email").value = email;
      }
      
      return;
    }

    if (resp.status === 403) {
      if (data.error === "user_not_active") {
        setStatus("login-status", "Seu cadastro está aguardando aprovação.", true);
      } else {
        setStatus("login-status", "Perfil sem permissão.", true);
      }
      return;
    }

    setStatus("login-status", "Falha na verificação de perfil.", true);
  } catch (err) {
    console.error("Falha no login:", err);

    const msgMap = {
      "auth/wrong-password": "Senha incorreta.",
      "auth/user-not-found": "Usuário não encontrado.",
      "auth/invalid-email": "E-mail inválido.",
      "auth/invalid-credential": "Credenciais inválidas.",
    };

    const fbMsg = err?.code && msgMap[err.code]
      ? msgMap[err.code]
      : "Credenciais inválidas.";

    setStatus("login-status", fbMsg, true);
  }
}

// --------------------------------------------------
// DIAGNÓSTICO /trackingPingSupabase
// --------------------------------------------------
async function loadDiagnostics() {
  const box = document.getElementById("diag-output");
  if (!box) return;

  box.textContent = "carregando...";

  try {
    const resp = await fetch(`${API_BASE}/trackingPingSupabase`, {
      method: "GET",
      cache: "no-store",
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    const data = await resp.json().catch(() => null);
    box.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    console.error("diag error:", err);
    box.textContent = "Erro ao consultar backend.";
  }
}

// --------------------------------------------------
// WIRE EVENTS / BOOT
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Inicializa tabs
  initTabs();
  
  // Rastreamento
  const btnTrack = document.getElementById("tracking-button");
  if (btnTrack) btnTrack.addEventListener("click", runTrackingSearch);

  const trackInput = document.getElementById("tracking-input");
  if (trackInput) {
    trackInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        runTrackingSearch();
      }
    });
  }

  // Ocorrências
  const ocorrenciaForm = document.getElementById("ocorrencia-form");
  if (ocorrenciaForm) ocorrenciaForm.addEventListener("submit", handleOcorrencia);

  // Login
  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  // Registro
  const registerForm = document.getElementById("register-form");
  if (registerForm) registerForm.addEventListener("submit", handleRegister);

  // Máscaras
  const telefoneInput = document.getElementById("register-telefone");
  if (telefoneInput) {
    telefoneInput.addEventListener('input', (e) => {
      e.target.value = maskTelefone(e.target.value);
    });
  }

  const cpfInput = document.getElementById("register-cpf");
  if (cpfInput) {
    cpfInput.addEventListener('input', (e) => {
      e.target.value = maskCPF(e.target.value);
    });
  }

  // Diagnóstico
  loadDiagnostics();

  // Sessão Firebase
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const token = await user.getIdToken(true);
      console.log("Sessão detectada:", user.email);
    }
  });

  console.log("✅ Script.js modernizado inicializado");
  console.log("🔗 API Base:", API_BASE);
});