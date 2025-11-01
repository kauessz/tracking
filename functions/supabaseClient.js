/**
 * functions/supabaseClient.js
 * Cliente Supabase seguro para Firebase Functions
 *
 * Produção:
 *   firebase functions:config:set supabase.url="https://SEU-PROJETO.supabase.co" supabase.service_key="CHAVE_SERVICE_ROLE"
 *
 * Local (emulator):
 *   criar functions/.env com:
 *     SUPABASE_URL=...
 *     SUPABASE_SERVICE_KEY=...
 *
 * IMPORTANTE: Essa chave NUNCA vai para o front.
 */

const { createClient } = require('@supabase/supabase-js');
const functions = require('firebase-functions');

let supabaseClient = null;

/**
 * Retorna instância singleton do Supabase Client
 * Usa service role key (acesso de escrita). Só backend!
 */
function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  // 1. Tenta via .env (local / emulator)
  // 2. Fallback: functions.config() (produção Firebase)
  let runtimeConfig = {};
  if (typeof functions.config === 'function') {
    runtimeConfig = functions.config().supabase || {};
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    runtimeConfig.url;

  const supabaseKey =
    process.env.SUPABASE_SERVICE_KEY ||
    runtimeConfig.service_key;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Supabase não configurado!\n' +
      'Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no .env (local)\n' +
      'ou rode:\n' +
      'firebase functions:config:set ' +
      'supabase.url="..." supabase.service_key="..."\n'
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

/**
 * Normaliza nome de embarcador usando aliases.
 * Ex: "AMBEV S/A" → "AMBEV".
 */
async function normalizarEmbarcador(nomeOriginal) {
  const supabase = getSupabaseClient();

  const { data: alias, error } = await supabase
    .from('aliases')
    .select('master')
    .ilike('alias', nomeOriginal.trim())
    .single();

  if (error || !alias) {
    return nomeOriginal.trim();
  }

  return alias.master;
}

/**
 * Buscar (ou criar) embarcador.
 * Retorna ID do embarcador.
 */
async function obterOuCriarEmbarcador(nomeOriginal) {
  const supabase = getSupabaseClient();

  // 1. Normaliza nome -> nomePrincipal
  const nomePrincipal = await normalizarEmbarcador(nomeOriginal);

  // 2. Procura embarcador já existente
  let { data: embarcador, error } = await supabase
    .from('embarcadores')
    .select('id, nome_principal')
    .eq('nome_principal', nomePrincipal)
    .single();

  // Se erro não for "not found", lança erro
  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  // 3. Se não existe, cria
  if (!embarcador) {
    const { data: novo, error: erroCreate } = await supabase
      .from('embarcadores')
      .insert({ nome_principal: nomePrincipal })
      .select()
      .single();

    if (erroCreate) throw erroCreate;
    embarcador = novo;

    // Se nome original != nome principal, salva alias também
    if (nomeOriginal.trim() !== nomePrincipal) {
      await supabase
        .from('embarcador_aliases')
        .insert({
          nome_alias: nomeOriginal.trim(),
          embarcador_id: embarcador.id,
        });
    }
  }

  return embarcador.id;
}

/**
 * Buscar operações (tracking) com filtros.
 * Filtros aceitos:
 *   embarcador, booking, dataInicio, dataFim, status, limite
 *
 * IMPORTANTE:
 *   booking aqui é usado como "referência digitada" pelo usuário.
 *   Agora vamos bater tanto em booking quanto em containers.
 */
async function buscarOperacoes(filtros = {}) {
  const supabase = getSupabaseClient();

  // Base select, já trazendo info do embarcador
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
      embarcador_id,
      status_operacao,
      motivo_atraso,
      data_criacao,
      data_atualizacao,
      numero_cliente,
      embarcadores!inner(
        id,
        nome_principal,
        cnpj
      )
    `)
    .order('data_criacao', { ascending: false });

  // embarcador: normalizamos e garantimos que existe
  if (filtros.embarcador) {
    const embarcadorId = await obterOuCriarEmbarcador(filtros.embarcador);
    query = query.eq('embarcador_id', embarcadorId);
  }

  // booking/container search:
  if (filtros.booking) {
    // Aqui a ideia é: o usuário digitou "P104765159" OU "MSCU1234567".
    // Vamos procurar no booking ou no campo containers.
    query = query.or(
      `booking.ilike.%${filtros.booking}%,containers.ilike.%${filtros.booking}%`
    );
  }

  // Filtros de janela de tempo:
  if (filtros.dataInicio) {
    query = query.gte('previsao_inicio_atendimento', filtros.dataInicio);
  }
  if (filtros.dataFim) {
    query = query.lte('previsao_inicio_atendimento', filtros.dataFim);
  }

  // Status específico:
  if (filtros.status) {
    query = query.eq('status_operacao', filtros.status);
  }

  // Limite de linhas:
  if (filtros.limite) {
    query = query.limit(filtros.limite);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Inserir uma nova operação no tracking.
 * Campos esperados em dadosOperacao:
 *   embarcador (string) *
 *   booking (string) *
 *   e também:
 *   numero_programacao, containers, pol, pod, tipo_programacao,
 *   previsao_inicio_atendimento, dt_inicio_execucao, dt_fim_execucao,
 *   dt_previsao_entrega_recalculada,
 *   nome_motorista, placa_veiculo, placa_carreta, cpf_motorista,
 *   justificativa_atraso, motivo_atraso,
 *   status_operacao, numero_cliente
 */
async function inserirOperacao(dadosOperacao) {
  const supabase = getSupabaseClient();

  const embarcadorId = await obterOuCriarEmbarcador(dadosOperacao.embarcador);

  const operacao = {
    numero_programacao: dadosOperacao.numero_programacao,
    booking: dadosOperacao.booking,
    containers: dadosOperacao.containers,
    pol: dadosOperacao.pol,
    pod: dadosOperacao.pod,
    tipo_programacao: dadosOperacao.tipo_programacao,
    previsao_inicio_atendimento: dadosOperacao.previsao_inicio_atendimento,
    dt_inicio_execucao: dadosOperacao.dt_inicio_execucao,
    dt_fim_execucao: dadosOperacao.dt_fim_execucao,
    dt_previsao_entrega_recalculada: dadosOperacao.dt_previsao_entrega_recalculada,
    nome_motorista: dadosOperacao.nome_motorista,
    placa_veiculo: dadosOperacao.placa_veiculo,
    placa_carreta: dadosOperacao.placa_carreta,
    cpf_motorista: dadosOperacao.cpf_motorista,
    justificativa_atraso: dadosOperacao.justificativa_atraso,
    motivo_atraso: dadosOperacao.motivo_atraso,
    status_operacao: dadosOperacao.status_operacao || 'Programado',
    numero_cliente: dadosOperacao.numero_cliente,
    embarcador_id: embarcadorId,
  };

  const { data, error } = await supabase
    .from('operacoes')
    .insert(operacao)
    .select()
    .single();

  if (error) throw error;

  // FUTURO: aqui poderíamos já inserir linha em historico_operacoes
  // com status_novo = operacao.status_operacao,
  // atualizado_por_id = <id do usuário autenticado>, etc.

  return data;
}

module.exports = {
  getSupabaseClient,
  normalizarEmbarcador,
  obterOuCriarEmbarcador,
  buscarOperacoes,
  inserirOperacao,
};