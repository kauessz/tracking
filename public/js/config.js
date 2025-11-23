// config.js - Configuração centralizada da aplicação
// ====================================================

// Configuração do Firebase (mesma para todos os ambientes)
export const firebaseConfig = {
  apiKey: "AIzaSyAqz0eAaJwE38EAyTgbRk4CZryswDqvSBY",
  authDomain: "mercosul-teste.firebaseapp.com",
  projectId: "mercosul-teste",
  storageBucket: "mercosul-teste.appspot.com",
  messagingSenderId: "650943607449",
  appId: "1:650943607449:web:73ec91b430ccaa55b77e08",
  measurementId: "G-KJHFXFLJ6K"
};

// URL da API - muda conforme ambiente
export const getApiUrl = () => {
  // Em produção, use a URL do seu backend no Render/Railway/etc
  const isProduction = window.location.hostname !== 'localhost' && 
                       window.location.hostname !== '127.0.0.1';
  
  if (isProduction) {
    // TODO: Substituir pela URL real do backend em produção
    return 'https://tracking-api-1zxi.onrender.com';
  }
  
  return 'http://localhost:8080';
};

// Constantes da aplicação
export const APP_CONFIG = {
  name: 'Rastreamento Mercosul Line',
  version: '2.0.0',
  
  // Limites
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxOperationsPerPage: 25,
  
  // Timeouts
  requestTimeout: 30000, // 30s
  
  // Formatos aceitos para upload
  acceptedFileTypes: ['.xlsx', '.xls', '.csv'],
  
  // Mensagens
  messages: {
    uploadSuccess: 'Arquivo importado com sucesso!',
    uploadError: 'Erro ao importar arquivo. Verifique o formato.',
    saveSuccess: 'Dados salvos com sucesso!',
    deleteConfirm: 'Tem certeza que deseja remover estes dados?',
    sessionExpired: 'Sua sessão expirou. Faça login novamente.',
    accessDenied: 'Você não tem permissão para acessar esta área.',
  },
  
  // Cores do tema
  colors: {
    primary: '#0b2263',
    secondary: '#1f3fa4',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  }
};

// Roles de usuário
export const USER_ROLES = {
  ADMIN: 'admin',
  EMBARCADOR: 'embarcador',
  OPERADOR: 'operador'
};

// Status de operações
export const OPERATION_STATUS = {
  PROGRAMADO: 'Programado',
  EM_ANDAMENTO: 'Em Andamento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  ATRASADO: 'Atrasado'
};

// Status de usuários
export const USER_STATUS = {
  PENDENTE: 'pendente',
  ATIVO: 'ativo',
  INATIVO: 'inativo',
  REJEITADO: 'rejeitado'
};

// Validações
export const VALIDATION_RULES = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\(\d{2}\)\s?\d{4,5}-\d{4}$/,
  cpf: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
  cnpj: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
  password: {
    minLength: 6,
    requireUppercase: false,
    requireNumber: false,
    requireSpecial: false
  }
};

// Mapeamento de colunas da planilha
export const SPREADSHEET_COLUMNS = {
  Booking: 'booking',
  Cliente: 'embarcador_nome',
  Container: 'container',
  'Tipo Operação': 'tipo_programacao',
  'Porto Operação': 'porto_operacao',
  'Data Programada': 'previsao_inicio_atendimento',
  'Data Chegada': 'dt_inicio_execucao',
  'Justificativa Atraso': 'justificativa_atraso',
  TipoProgramacao: 'tipo_programacao',
  PortoOperacao: 'porto_operacao',
  DataProgramada: 'previsao_inicio_atendimento',
  DataChegada: 'dt_inicio_execucao',
  JustificativaAtraso: 'justificativa_atraso'
};

// URLs externas
export const EXTERNAL_URLS = {
  website: 'http://mercosul-line.com.br',
  schedule: 'http://mercosul-line.com.br/servicos/rotas/programacao',
  dashboard: 'https://dashboard.mercosul-line.com.br/access/login',
  support: 'mailto:atendimento@mercosul-line.com.br'
};

export default {
  firebaseConfig,
  getApiUrl,
  APP_CONFIG,
  USER_ROLES,
  OPERATION_STATUS,
  USER_STATUS,
  VALIDATION_RULES,
  SPREADSHEET_COLUMNS,
  EXTERNAL_URLS
};