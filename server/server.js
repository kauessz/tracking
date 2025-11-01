// server/server.js
//
// API Express que vai rodar no Render.
// Foco atual:
// - rotas públicas para consulta de operações por booking/container
// - rotas seguras para portal/admin com login
// - registro de novo evento/linha de operação
//
// IMPORTANTE: configure .env no Render com:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOWED_ORIGINS,
// e opcionalmente FIREBASE_SERVICE_ACCOUNT (JSON string)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { supabase } = require('./supabaseClient');
const { authGuard } = require('./authMiddleware');

const app = express();
const PORT = process.env.PORT || 8080;

// CORS dinâmico baseado em ALLOWED_ORIGINS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // permitir chamadas sem origin (ex: curl, server-side)
    if (!origin) return callback(null, true);

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: true,
}));

app.use(express.json());

/**
 * GET /health
 * Ping simples pra ver se o servidor está de pé
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API online',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /trackingPingSupabase
 * Faz uma query leve em `operacoes` só pra testar Supabase.
 */
app.get('/trackingPingSupabase', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('operacoes')
      .select('id, booking, status_operacao')
      .limit(3);

    if (error) throw error;

    res.json({
      success: true,
      message: 'trackingPingSupabase OK',
      total: data?.length || 0,
      data,
    });
  } catch (err) {
    console.error('trackingPingSupabase error', err);
    res.status(500).json({
      success: false,
      error: 'Falha ao consultar o banco.',
    });
  }
});

/**
 * GET /trackingList?booking=XXXX[&limite=20]
 *
 * Uso público: pesquisa por booking/container parcial.
 * Retorna várias operações com campos que você quer exibir
 * no "Consulta de Carga" público.
 */
app.get('/trackingList', async (req, res) => {
  const ref = (req.query.booking || '').trim();
  const limiteRaw = req.query.limite;
  const limite = Number.isFinite(Number(limiteRaw))
    ? parseInt(limiteRaw, 10)
    : 20;

  if (!ref) {
    return res.status(400).json({
      success: false,
      error: 'Parâmetro "booking" (booking ou container) é obrigatório.',
    });
  }

  try {
    const { data, error } = await supabase
      .from('operacoes')
      .select(`
        id,
        numero_programacao,
        booking,
        containers,
        pol,
        pod,
        tipo_programacao,
        previsao_inicio_atendimento,
        dt_inicio_execucao,
        dt_fim_execucao,
        dt_previsao_entrega_recalculada,
        nome_motorista,
        placa_veiculo,
        placa_carreta,
        cpf_motorista,
        justificativa_atraso,
        embarcadores:embarcador_id (
          nome_principal
        ),
        status_operacao,
        data_criacao,
        data_atualizacao,
        numero_cliente
      `)
      // busca parcial em booking ou containers
      .or(`booking.ilike.%${ref}%,containers.ilike.%${ref}%`)
      .order('previsao_inicio_atendimento', { ascending: true })
      .limit(limite);

    if (error) throw error;

    res.json({
      success: true,
      total: data?.length || 0,
      data,
    });
  } catch (err) {
    console.error('trackingList error', err);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar operações.',
    });
  }
});

/**
 * POST /trackingEvent
 *
 * Uso público por enquanto (depois vamos fechar atrás de authGuard).
 * Cria/insere uma nova linha em `operacoes` e amarra ao embarcador.
 *
 * body esperado:
 * {
 *   "embarcador": "AMAZONIA INDUSTRIA DE PLASTICOS LTDA",
 *   "booking": "P10482561",
 *   "status_operacao": "Programado" | "Em Andamento" | ...
 *   "nome_motorista": "...",
 *   "placa_veiculo": "...",
 *   "placa_carreta": "...",
 *   "previsao_inicio_atendimento": "2025-10-31T08:30:00-03:00"
 * }
 */
app.post('/trackingEvent', async (req, res) => {
  try {
    const {
      embarcador,
      booking,
      status_operacao,
      nome_motorista,
      placa_veiculo,
      placa_carreta,
      previsao_inicio_atendimento,
    } = req.body || {};

    if (!embarcador || !booking) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: embarcador, booking.',
      });
    }

    // 1. Resolver embarcador_id (cria se não existir)
    let { data: embRow, error: embErr } = await supabase
      .from('embarcadores')
      .select('id')
      .ilike('nome_principal', embarcador)
      .limit(1)
      .single();

    // Tratamento "não encontrado" do PostgREST/Supabase
    if (embErr && embErr.code === 'PGRST116') {
      embRow = null;
      embErr = null;
    }
    if (embErr) throw embErr;

    if (!embRow) {
      const ins = await supabase
        .from('embarcadores')
        .insert({ nome_principal: embarcador })
        .select('id')
        .single();
      if (ins.error) throw ins.error;
      embRow = ins.data;
    }

    const embarcador_id = embRow.id;

    // 2. Inserir operação
    const nowIso = new Date().toISOString();
    const insertObj = {
      booking: booking,
      embarcador_id,
      status_operacao: status_operacao || 'Programado',
      nome_motorista: nome_motorista || null,
      placa_veiculo: placa_veiculo || null,
      placa_carreta: placa_carreta || null,
      previsao_inicio_atendimento: previsao_inicio_atendimento
        ? new Date(previsao_inicio_atendimento).toISOString()
        : null,
      data_criacao: nowIso,
      data_atualizacao: nowIso,
    };

    const { data: opData, error: opErr } = await supabase
      .from('operacoes')
      .insert(insertObj)
      .select('*')
      .single();

    if (opErr) throw opErr;

    res.json({
      success: true,
      message: 'Evento registrado',
      operacao: opData,
    });
  } catch (err) {
    console.error('trackingEvent error', err);
    res.status(500).json({
      success: false,
      error: 'Erro ao registrar evento.',
    });
  }
});

/**
 * GET /trackingListSecure
 * Igual ao trackingList, mas:
 *  - exige token Firebase (authGuard)
 *  - se role != admin, filtra por embarcador_id do usuário
 *  - se role == admin, vê tudo
 */
app.get('/trackingListSecure', authGuard, async (req, res) => {
  try {
    const ref = (req.query.booking || '').trim();
    const limiteRaw = req.query.limite;
    const limite = Number.isFinite(Number(limiteRaw))
      ? parseInt(limiteRaw, 10)
      : 50;

    // base query
    let query = supabase
      .from('operacoes')
      .select(`
        id,
        numero_programacao,
        booking,
        containers,
        pol,
        pod,
        tipo_programacao,
        previsao_inicio_atendimento,
        dt_inicio_execucao,
        dt_fim_execucao,
        dt_previsao_entrega_recalculada,
        nome_motorista,
        placa_veiculo,
        placa_carreta,
        cpf_motorista,
        justificativa_atraso,
        embarcadores:embarcador_id (
          nome_principal
        ),
        status_operacao,
        data_criacao,
        data_atualizacao,
        numero_cliente,
        embarcador_id
      `)
      .order('previsao_inicio_atendimento', { ascending: true })
      .limit(limite);

    // Se não for admin, força filtro por embarcador_id do usuário logado
    if (req.userContext.role !== 'admin') {
      query = query.eq('embarcador_id', req.userContext.embarcador_id);
    }

    // Filtro de booking/container opcional
    if (ref) {
      query = query.or(`booking.ilike.%${ref}%,containers.ilike.%${ref}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      success: true,
      total: data?.length || 0,
      data,
    });
  } catch (err) {
    console.error('trackingListSecure error', err);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar operações (secure).',
    });
  }
});

/**
 * POST /adminApproveUser
 * Aprova um usuário na tabela `usuarios` do Supabase.
 * Apenas admin pode chamar.
 *
 * body esperado:
 * {
 *   "email": "cliente@empresa.com",
 *   "embarcador_id": 123,       // opcional se role = admin
 *   "role": "embarcador" | "admin"
 * }
 */
app.post('/adminApproveUser', authGuard, async (req, res) => {
  try {
    if (req.userContext.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Somente admin pode aprovar usuários.',
      });
    }

    const { email, embarcador_id, role } = req.body || {};
    if (!email || !role) {
      return res.status(400).json({
        success: false,
        error: 'email e role são obrigatórios.',
      });
    }

    const updateObj = {
      status: 'ativo',
      role: role,
    };
    if (embarcador_id) {
      updateObj.embarcador_id = embarcador_id;
    }

    const { data: updData, error: updErr } = await supabase
      .from('usuarios')
      .update(updateObj)
      .eq('email', email)
      .select('id,email,role,status,embarcador_id')
      .single();

    if (updErr) throw updErr;

    res.json({
      success: true,
      updated: updData,
    });
  } catch (err) {
    console.error('adminApproveUser error', err);
    res.status(500).json({
      success: false,
      error: 'Erro ao aprovar usuário.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚚 API Tracking rodando na porta ${PORT}`);
});
