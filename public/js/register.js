// register.js - VERSÃO ATUALIZADA SEM CAMPO EMPRESA
// ===================================================
// A empresa será vinculada pelo administrador durante a aprovação

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { firebaseConfig, getApiUrl } from './config.js';
import { Toast, Loading, Validator } from './utilities.js';

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const API_BASE = getApiUrl();

// Elementos do DOM
const nameInput = document.getElementById("register-nome");
const emailInput = document.getElementById("register-email");
const telefoneInput = document.getElementById("register-telefone");
const cpfInput = document.getElementById("register-cpf");
const passInput = document.getElementById("register-password");
const radioInterno = document.getElementById("type_internal");
const radioCliente = document.getElementById("type_shipper");
const registerBtn = document.getElementById("register-button");
const errorEl = document.getElementById("register-error");
const successEl = document.getElementById("register-success");

// MÁSCARAS DE INPUT
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

// VALIDAÇÕES
function validateTelefone(telefone) {
  const cleaned = telefone.replace(/\D/g, '');
  if (cleaned.length < 10 || cleaned.length > 11) {
    return { valid: false, message: 'Telefone deve ter 10 ou 11 dígitos' };
  }
  return { valid: true };
}

function validateCPF(cpf) {
  const cleaned = cpf.replace(/\D/g, '');
  
  if (cleaned.length !== 11) {
    return { valid: false, message: 'CPF deve ter 11 dígitos' };
  }
  
  if (/^(\d)\1{10}$/.test(cleaned)) {
    return { valid: false, message: 'CPF inválido' };
  }
  
  let sum = 0;
  let remainder;
  
  for (let i = 1; i <= 9; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (11 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned.substring(9, 10))) {
    return { valid: false, message: 'CPF inválido' };
  }
  
  sum = 0;
  for (let i = 1; i <= 10; i++) {
    sum += parseInt(cleaned.substring(i - 1, i)) * (12 - i);
  }
  
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned.substring(10, 11))) {
    return { valid: false, message: 'CPF inválido' };
  }
  
  return { valid: true };
}

// Função para exibir feedback
function setFeedback(msg, isError = false) {
  if (isError) {
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }
    if (successEl) {
      successEl.classList.add('hidden');
    }
  } else {
    if (successEl) {
      successEl.textContent = msg;
      successEl.classList.remove('hidden');
    }
    if (errorEl) {
      errorEl.classList.add('hidden');
    }
  }
}

// Aplicar máscaras em tempo real
telefoneInput?.addEventListener('input', (e) => {
  e.target.value = maskTelefone(e.target.value);
});

cpfInput?.addEventListener('input', (e) => {
  e.target.value = maskCPF(e.target.value);
});

// Validação em tempo real
function setupRealTimeValidation() {
  emailInput?.addEventListener('blur', () => {
    const email = emailInput.value.trim();
    if (email && !Validator.email(email)) {
      emailInput.classList.add('border-red-500');
      Toast.warning('Email inválido');
    } else {
      emailInput.classList.remove('border-red-500');
    }
  });
  
  passInput?.addEventListener('input', () => {
    const senha = passInput.value;
    const result = Validator.password(senha);
    
    if (!result.valid) {
      passInput.classList.add('border-red-500');
    } else {
      passInput.classList.remove('border-red-500');
    }
  });
  
  nameInput?.addEventListener('blur', () => {
    const nome = nameInput.value.trim();
    if (!nome) {
      nameInput.classList.add('border-red-500');
    } else {
      nameInput.classList.remove('border-red-500');
    }
  });
  
  telefoneInput?.addEventListener('blur', () => {
    const telefone = telefoneInput.value.trim();
    const result = validateTelefone(telefone);
    if (!result.valid) {
      telefoneInput.classList.add('border-red-500');
      Toast.warning(result.message);
    } else {
      telefoneInput.classList.remove('border-red-500');
    }
  });
  
  cpfInput?.addEventListener('blur', () => {
    const cpf = cpfInput.value.trim();
    const result = validateCPF(cpf);
    if (!result.valid) {
      cpfInput.classList.add('border-red-500');
      Toast.warning(result.message);
    } else {
      cpfInput.classList.remove('border-red-500');
    }
  });
}

// Handler do registro
async function handleRegister(evt) {
  evt.preventDefault();
  
  if (errorEl) errorEl.classList.add('hidden');
  if (successEl) successEl.classList.add('hidden');

  const nome = (nameInput?.value || "").trim();
  const email = (emailInput?.value || "").trim();
  const telefone = (telefoneInput?.value || "").trim();
  const cpf = (cpfInput?.value || "").trim();
  const senha = passInput?.value || "";
  
  const tipoInterno = radioInterno?.checked === true;
  const tipoConta = tipoInterno ? "internal" : "shipper";

  // Validações
  const errors = [];
  
  if (!nome) {
    errors.push('Nome é obrigatório');
    nameInput?.classList.add('border-red-500');
  }
  
  if (!email) {
    errors.push('Email é obrigatório');
    emailInput?.classList.add('border-red-500');
  } else if (!Validator.email(email)) {
    errors.push('Email inválido');
    emailInput?.classList.add('border-red-500');
  }
  
  if (!telefone) {
    errors.push('Telefone é obrigatório');
    telefoneInput?.classList.add('border-red-500');
  } else {
    const telefoneValidation = validateTelefone(telefone);
    if (!telefoneValidation.valid) {
      errors.push(telefoneValidation.message);
      telefoneInput?.classList.add('border-red-500');
    }
  }
  
  if (!cpf) {
    errors.push('CPF é obrigatório');
    cpfInput?.classList.add('border-red-500');
  } else {
    const cpfValidation = validateCPF(cpf);
    if (!cpfValidation.valid) {
      errors.push(cpfValidation.message);
      cpfInput?.classList.add('border-red-500');
    }
  }
  
  const passValidation = Validator.password(senha);
  if (!passValidation.valid) {
    errors.push(passValidation.message);
    passInput?.classList.add('border-red-500');
  }
  
  if (errors.length > 0) {
    setFeedback(errors.join('. '), true);
    return;
  }

  if (registerBtn) {
    registerBtn.disabled = true;
    registerBtn.textContent = "Processando...";
    registerBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }

  Loading.show('Criando sua conta...');

  try {
    // 1. Cria no Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    console.log('✅ Usuário criado no Firebase Auth:', cred.user.uid);

    // 2. Pega token para chamar backend
    const idToken = await cred.user.getIdToken();

    // 3. Envia dados para o backend (SEM empresa - será vinculado no admin)
    const resp = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        email,
        nome,
        telefone: telefone.replace(/\D/g, ''),
        cpf: cpf.replace(/\D/g, ''),
        tipoConta,
        // empresa: null - será vinculado pelo admin
      }),
    });

    const data = await resp.json();
    console.log('Resposta do backend:', data);

    Loading.hide();

    if (!resp.ok || !data.success) {
      console.error("Erro backend /auth/register:", data);
      
      try {
        await cred.user.delete();
        console.log('Usuário removido do Firebase após falha no backend');
      } catch (deleteErr) {
        console.warn("Não foi possível deletar usuário do Firebase:", deleteErr);
      }
      
      Toast.error(data.message || "Erro ao enviar cadastro para aprovação.");
      setFeedback(data.message || "Erro ao enviar cadastro para aprovação.", true);
      return;
    }

    // 4. Sucesso!
    Toast.success('Cadastro enviado! Aguarde aprovação do administrador.', 5000);
    setFeedback(
      "✅ Cadastro enviado para aprovação! O administrador irá vincular sua conta à empresa e liberar o acesso.",
      false
    );

    // Limpa os campos
    if (nameInput) nameInput.value = "";
    if (emailInput) emailInput.value = "";
    if (telefoneInput) telefoneInput.value = "";
    if (cpfInput) cpfInput.value = "";
    if (passInput) passInput.value = "";
    
    [nameInput, emailInput, telefoneInput, cpfInput, passInput].forEach(el => {
      el?.classList.remove('border-red-500');
    });

    await signOut(auth);
    console.log('Logout forçado - aguardando aprovação');
    
    setTimeout(() => {
      window.location.href = "index.html";
    }, 3000);
    
  } catch (err) {
    console.error("Erro de registro:", err);
    Loading.hide();

    let errorMessage = 'Falha ao registrar. Tente novamente.';
    
    if (err.code === "auth/email-already-in-use" || 
        /email.*in.*use/i.test(err.message || "")) {
      errorMessage = 'Este e-mail já está em uso.';
    } else if (err.code === "auth/weak-password") {
      errorMessage = 'Senha muito fraca (mínimo 6 caracteres).';
    } else if (err.code === "auth/invalid-email") {
      errorMessage = 'E-mail inválido.';
    } else if (err.code === "auth/network-request-failed") {
      errorMessage = 'Erro de conexão. Verifique sua internet.';
    }
    
    Toast.error(errorMessage);
    setFeedback(errorMessage, true);
    
  } finally {
    if (registerBtn) {
      registerBtn.disabled = false;
      registerBtn.textContent = "Solicitar Acesso";
      registerBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

// Configuração dos event listeners
function setupEventListeners() {
  if (registerBtn) {
    registerBtn.addEventListener("click", handleRegister);
  }
  
  [nameInput, emailInput, telefoneInput, cpfInput, passInput].forEach(el => {
    el?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRegister(e);
      }
    });
  });
  
  document.getElementById('toggle-password')?.addEventListener('click', () => {
    const input = document.getElementById('register-password');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  
  setupRealTimeValidation();
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  console.log('✅ Register.js inicializado (SEM campo empresa - vinculação no admin)');
  console.log('🔗 API Base:', API_BASE);
});