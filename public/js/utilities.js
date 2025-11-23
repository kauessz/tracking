// utilities.js - Funções utilitárias da aplicação
// ================================================

import { APP_CONFIG, VALIDATION_RULES } from './config.js';

// ============================================
// TOAST NOTIFICATIONS
// ============================================

export const Toast = {
  container: null,
  
  init() {
    if (this.container) return;
    
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.className = 'fixed top-4 right-4 z-50 space-y-2';
    document.body.appendChild(this.container);
  },
  
  show(message, type = 'info', duration = 4000) {
    this.init();
    
    const toast = document.createElement('div');
    const colors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500'
    };
    
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };
    
    toast.className = `${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg 
                       transform transition-all duration-300 ease-in-out
                       flex items-center gap-3 min-w-[300px] animate-slide-in`;
    
    toast.innerHTML = `
      <span class="text-xl font-bold">${icons[type]}</span>
      <span class="flex-1">${message}</span>
      <button class="ml-2 hover:opacity-70 transition-opacity" onclick="this.parentElement.remove()">
        ✕
      </button>
    `;
    
    this.container.appendChild(toast);
    
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('animate-slide-out');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
    
    return toast;
  },
  
  success(message, duration) {
    return this.show(message, 'success', duration);
  },
  
  error(message, duration) {
    return this.show(message, 'error', duration);
  },
  
  warning(message, duration) {
    return this.show(message, 'warning', duration);
  },
  
  info(message, duration) {
    return this.show(message, 'info', duration);
  }
};

// ============================================
// LOADING OVERLAY
// ============================================

export const Loading = {
  overlay: null,
  
  show(message = 'Carregando...') {
    if (this.overlay) return;
    
    this.overlay = document.createElement('div');
    this.overlay.id = 'loading-overlay';
    this.overlay.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    this.overlay.innerHTML = `
      <div class="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center gap-4">
        <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p class="text-gray-700 font-medium">${message}</p>
      </div>
    `;
    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden';
  },
  
  hide() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      document.body.style.overflow = '';
    }
  }
};

// ============================================
// MODAL DIALOG
// ============================================

export const Modal = {
  show(title, content, buttons = []) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4';
      
      const buttonHtml = buttons.map((btn, idx) => `
        <button 
          data-action="${idx}" 
          class="${btn.className || 'bg-gray-500 hover:bg-gray-600'} text-white px-4 py-2 rounded-lg transition-colors"
        >
          ${btn.label}
        </button>
      `).join('');
      
      modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full animate-scale-in">
          <div class="p-6 border-b border-gray-200">
            <h3 class="text-xl font-bold text-gray-900">${title}</h3>
          </div>
          <div class="p-6">
            ${content}
          </div>
          <div class="p-6 border-t border-gray-200 flex gap-3 justify-end">
            ${buttonHtml}
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      modal.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = parseInt(btn.dataset.action);
          modal.remove();
          resolve(action);
        });
      });
      
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
          resolve(-1);
        }
      });
    });
  },
  
  confirm(title, message) {
    return new Promise((resolve) => {
      this.show(
        title,
        `<p class="text-gray-700">${message}</p>`,
        [
          { label: 'Cancelar', className: 'bg-gray-500 hover:bg-gray-600' },
          { label: 'Confirmar', className: 'bg-blue-600 hover:bg-blue-700' }
        ]
      ).then(action => resolve(action === 1));
    });
  },
  
  alert(title, message) {
    return this.show(
      title,
      `<p class="text-gray-700">${message}</p>`,
      [{ label: 'OK', className: 'bg-blue-600 hover:bg-blue-700' }]
    );
  }
};

// ============================================
// VALIDAÇÕES
// ============================================

export const Validator = {
  email(email) {
    return VALIDATION_RULES.email.test(email);
  },
  
  password(password) {
    const rules = VALIDATION_RULES.password;
    if (password.length < rules.minLength) {
      return { valid: false, message: `Senha deve ter no mínimo ${rules.minLength} caracteres` };
    }
    return { valid: true };
  },
  
  required(value, fieldName = 'Campo') {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return { valid: false, message: `${fieldName} é obrigatório` };
    }
    return { valid: true };
  },
  
  form(formData, rules) {
    const errors = {};
    
    for (const [field, validators] of Object.entries(rules)) {
      const value = formData[field];
      
      for (const validator of validators) {
        const result = validator(value, field);
        if (!result.valid) {
          errors[field] = result.message;
          break;
        }
      }
    }
    
    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }
};

// ============================================
// FORMATAÇÃO DE DADOS
// ============================================

export const Format = {
  // Converte Date para dd/mm/aaaa HH:mm
  dateTime(date) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  },
  
  // Converte Date para dd/mm/aaaa
  date(date) {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    return `${day}/${month}/${year}`;
  },
  
  // Converte minutos para HH:mm
  duration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  },
  
  // Formata moeda BRL
  currency(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  },
  
  // Formata número com separador de milhares
  number(value, decimals = 0) {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  }
};

// ============================================
// PARSE DE DATAS
// ============================================

export const Parse = {
  // Converte dd/mm/aaaa HH:mm para Date
  dateTimeBR(str) {
    if (!str || typeof str !== 'string') return null;
    
    const match = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) return null;
    
    const [, day, month, year, hour, minute] = match;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(minute)
    );
    
    return isNaN(date.getTime()) ? null : date;
  },
  
  // Converte dd/mm/aaaa para Date
  dateBR(str) {
    if (!str || typeof str !== 'string') return null;
    
    const match = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    
    const [, day, month, year] = match;
    const date = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day)
    );
    
    return isNaN(date.getTime()) ? null : date;
  },
  
  // Converte número serial do Excel para Date
  excelSerial(serial) {
    if (typeof serial !== 'number' || !isFinite(serial)) return null;
    
    const baseDate = new Date(1899, 11, 30);
    const days = Math.floor(serial);
    const fraction = serial - days;
    
    const date = new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + days
    );
    
    const totalSeconds = Math.round(fraction * 24 * 60 * 60);
    date.setSeconds(totalSeconds);
    
    return date;
  },
  
  // Tenta converter qualquer formato de data
  dateAuto(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    
    // Tenta como número (Excel)
    if (typeof value === 'number') {
      return this.excelSerial(value);
    }
    
    // Tenta como string brasileira
    if (typeof value === 'string') {
      let date = this.dateTimeBR(value);
      if (date) return date;
      
      date = this.dateBR(value);
      if (date) return date;
      
      // Tenta como ISO
      date = new Date(value);
      if (!isNaN(date.getTime())) return date;
    }
    
    return null;
  }
};

// ============================================
// CÁLCULO DE ATRASOS - CORRIGIDO FINAL
// ============================================

export const Delay = {
  // ✅ CORREÇÃO FINAL: Operações finalizadas contabilizam atraso
  calculateMinutes(operation) {
    // Verifica se está cancelada
    const situacao = (operation.SituacaoProgramacao || '').toString().toLowerCase();
    if (situacao.includes('cancelad')) return 0;

    const scheduled = Parse.dateAuto(
      operation.DataProgramada ?? 
      operation.previsao_inicio_atendimento
    );
    
    if (!scheduled) return 0;

    // Verifica se já finalizou
    const finished = Parse.dateAuto(
      operation.DataSaida || 
      operation['Dt FIM da Execução (BRA)'] || 
      operation['Dt Fim da Execucao (BRA)'] ||
      operation.dt_fim_execucao
    );

    // ✅ Se finalizou, calcula atraso baseado em quando CHEGOU
    if (finished) {
      const actual = Parse.dateAuto(
        operation.DataChegada ?? 
        operation.dt_inicio_execucao
      );
      if (!actual) return 0;
      
      const diffMs = actual.getTime() - scheduled.getTime();
      const diffMin = Math.round(diffMs / 60000);
      return diffMin > 0 ? diffMin : 0;
    }
    
    // Se em execução ou aguardando, usa chegada ou agora
    const actual = Parse.dateAuto(
      operation.DataChegada ?? 
      operation.dt_inicio_execucao
    ) || new Date();
    
    const diffMs = actual.getTime() - scheduled.getTime();
    const diffMin = Math.round(diffMs / 60000);
    
    return diffMin > 0 ? diffMin : 0;
  },
  
  // Verifica se está atrasado
  isLate(operation) {
    return this.calculateMinutes(operation) > 0;
  },
  
  // Retorna status do atraso
  getStatus(operation) {
    const delayMin = this.calculateMinutes(operation);
    
    if (delayMin === 0) return { status: 'on-time', label: 'No Prazo', color: 'green' };
    if (delayMin < 60) return { status: 'slight', label: 'Leve Atraso', color: 'yellow' };
    if (delayMin < 240) return { status: 'moderate', label: 'Atraso Moderado', color: 'orange' };
    return { status: 'severe', label: 'Atraso Grave', color: 'red' };
  }
};

// ============================================
// DEBOUNCE
// ============================================

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// COPY TO CLIPBOARD
// ============================================

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    Toast.success('Copiado para a área de transferência!');
    return true;
  } catch (err) {
    Toast.error('Erro ao copiar');
    return false;
  }
}

// ============================================
// DOWNLOAD FILE
// ============================================

export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// SAFE API CALL
// ============================================

export async function apiCall(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Erro na requisição');
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('API Error:', error);
    return { 
      success: false, 
      error: error.message || 'Erro de conexão'
    };
  }
}

// ============================================
// LOCAL STORAGE HELPERS
// ============================================

export const Storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },
  
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  
  remove(key) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
  
  clear() {
    try {
      localStorage.clear();
      return true;
    } catch {
      return false;
    }
  }
};

// Adiciona animações CSS necessárias
const style = document.createElement('style');
style.textContent = `
  @keyframes slide-in {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slide-out {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  @keyframes scale-in {
    from {
      transform: scale(0.9);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  
  .animate-slide-in {
    animation: slide-in 0.3s ease-out;
  }
  
  .animate-slide-out {
    animation: slide-out 0.3s ease-in;
  }
  
  .animate-scale-in {
    animation: scale-in 0.2s ease-out;
  }
`;
document.head.appendChild(style);

export default {
  Toast,
  Loading,
  Modal,
  Validator,
  Format,
  Parse,
  Delay,
  debounce,
  copyToClipboard,
  downloadFile,
  apiCall,
  Storage
};