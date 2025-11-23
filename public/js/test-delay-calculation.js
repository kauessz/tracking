// test-delay-calculation.js
// Script para testar e debugar o cálculo de atraso
// Execute no console do navegador ou com Node.js

// ============================================
// FUNÇÃO CALCULATEDELAYINMINUTES (CÓPIA EXATA)
// ============================================

function calculateDelayInMinutes(op = {}) {
  // Helper para buscar valor em múltiplos campos possíveis
  const get = (obj, keys = []) => {
    for (const k of keys) {
      if (obj && obj[k] != null && obj[k] !== '' && obj[k] !== '—' && obj[k] !== '-') {
        return obj[k];
      }
    }
    return null;
  };

  // Helper para parse de data BR
  const parseBR = (s) => {
    if (!s || typeof s !== 'string') return null;
    const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if (!m) return null;
    const [_, dd, MM, yyyy, hh = '00', mm = '00'] = m;
    return new Date(Number(yyyy), Number(MM) - 1, Number(dd), Number(hh), Number(mm), 0, 0);
  };

  console.log('=== DEBUG calculateDelayInMinutes ===');
  console.log('Input op:', op);

  // 1. Verifica se está cancelada
  const situacao = get(op, [
    'SituacaoProgramacao',
    'situacao', 
    'status',
    'TipoOperacao',
    'tipo_programacao'
  ]);
  
  console.log('Situação:', situacao);
  
  if (situacao && situacao.toString().toLowerCase().includes('cancelad')) {
    console.log('❌ CANCELADA - retorna 0');
    return 0;
  }

  // 2. Verifica se é Manaus
  const portoStr = get(op, [
    'Porto',
    'porto',
    'PortoOperacao', 
    'porto_operacao',
    'Porto:',
    'port'
  ]);
  
  const isManaus = portoStr && portoStr.toString().toUpperCase().includes('MANAUS');
  const tolerance = isManaus ? 60 * 60000 : 0;
  
  console.log('Porto:', portoStr);
  console.log('É Manaus?', isManaus);
  console.log('Tolerância (ms):', tolerance);

  // 3. Pega a Previsão
  const previsaoRecalcStr = get(op, [
    'dt_previsao_entrega_recalculada',
    'DataProgramadaRecalculada',
    'PrevisaoRecalculada'
  ]);
  
  const previsaoOriginalStr = get(op, [
    'Previsão início atendimento (BRA)',
    'Previsao inicio atendimento (BRA)',
    'previsao_inicio_atendimento',
    'PrevisaoInicio',
    'DataProgramada',
    'Data Programada'
  ]);

  const previsaoStr = previsaoRecalcStr || previsaoOriginalStr;
  const previsao = previsaoStr ? parseBR(previsaoStr) : null;
  
  console.log('Previsão Recalculada:', previsaoRecalcStr);
  console.log('Previsão Original:', previsaoOriginalStr);
  console.log('Previsão Usada:', previsaoStr);
  console.log('Previsão (Date):', previsao);
  
  if (!previsao) {
    console.log('❌ SEM PREVISÃO - retorna 0');
    return 0;
  }

  // 4. Pega o Dt Início da Execução
  const inicioStr = get(op, [
    'Dt Início da Execução (BRA)',
    'Dt Inicio da ExecuÃ§Ã£o (BRA)',
    'Dt Inicio da Execucao (BRA)',
    'dt_inicio_execucao',
    'DataChegada',
    'Data Chegada'
  ]);

  let atualDt = inicioStr ? parseBR(inicioStr) : new Date();
  if (!atualDt) atualDt = new Date();
  
  console.log('Início Execução (string):', inicioStr);
  console.log('Início Execução (Date):', atualDt);
  console.log('Usando AGORA?', !inicioStr);

  // 5. Calcula diferença
  const diffMs = (atualDt.getTime() - previsao.getTime()) - tolerance;
  const diffMin = Math.round(diffMs / 60000);
  
  console.log('Diff (ms):', atualDt.getTime() - previsao.getTime());
  console.log('Diff - tolerância (ms):', diffMs);
  console.log('Diff (min):', diffMin);
  console.log('Resultado final:', diffMin > 0 ? diffMin : 0);
  console.log('=====================================\n');

  return diffMin > 0 ? diffMin : 0;
}

// ============================================
// TESTES COM AS OPERAÇÕES DAS IMAGENS
// ============================================

console.log('📊 TESTE 1: SANTOS (Imagem 2) - ADIANTADO');
console.log('Esperado: 0 (no prazo)');
console.log('Real no sistema: 00:01 (1 minuto) ❌\n');

const opSantos = {
  Booking: 'P10481681',
  Cliente: 'AMCOR EMBALAGENS DA AMAZONIA LTDA',
  PortoOperacao: 'SANTOS',
  DataProgramada: '15/11/2025 18:00',
  DataChegada: '15/11/2025 16:03',
  TipoOperacao: 'Entrega'
};

const atrasoSantos = calculateDelayInMinutes(opSantos);
console.log('✅ Resultado: ', atrasoSantos, 'minutos\n\n');

// ================================================

console.log('📊 TESTE 2: MANAUS (Imagem 3) - COM TOLERÂNCIA');
console.log('Esperado: ~37 minutos (1h37min - 60min tolerância)');
console.log('Real no sistema: ON TIME ✅\n');

const opManaus = {
  Booking: 'P40174849',
  Cliente: 'AMCOR EMBALAGENS DA AMAZONIA LTDA',
  PortoOperacao: 'MANAUS',
  DataProgramada: '12/11/2025 19:00',
  DataChegada: '12/11/2025 20:37',
  TipoOperacao: 'Entrega'
};

const atrasoManaus = calculateDelayInMinutes(opManaus);
console.log('✅ Resultado: ', atrasoManaus, 'minutos\n\n');

// ================================================

console.log('📊 TESTE 3: VERIFICAÇÃO DE CAMPOS ALTERNATIVOS');
console.log('Testando se os campos estão sendo lidos corretamente\n');

const opAlternativa = {
  Booking: 'TEST001',
  embarcador_nome: 'TESTE CLIENTE',
  porto_operacao: 'SANTOS',
  previsao_inicio_atendimento: '15/11/2025 18:00',
  dt_inicio_execucao: '15/11/2025 16:03',
  tipo_programacao: 'Entrega'
};

const atrasoAlternativo = calculateDelayInMinutes(opAlternativa);
console.log('✅ Resultado: ', atrasoAlternativo, 'minutos\n\n');

// ================================================

console.log('📋 RESUMO DOS TESTES');
console.log('═══════════════════════════════════════');
console.log('Teste 1 (Santos - Adiantado):');
console.log(`  Esperado: 0 min | Obtido: ${atrasoSantos} min | ${atrasoSantos === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log('');
console.log('Teste 2 (Manaus - Com tolerância):');
console.log(`  Esperado: ~37 min | Obtido: ${atrasoManaus} min | ${atrasoManaus >= 35 && atrasoManaus <= 39 ? '✅ PASS' : '⚠️ CHECK'}`);
console.log('');
console.log('Teste 3 (Campos alternativos):');
console.log(`  Esperado: 0 min | Obtido: ${atrasoAlternativo} min | ${atrasoAlternativo === 0 ? '✅ PASS' : '❌ FAIL'}`);
console.log('═══════════════════════════════════════\n');

// ================================================
// DIAGNÓSTICO
// ================================================

console.log('🔍 DIAGNÓSTICO');
console.log('─────────────────────────────────────');

if (atrasoSantos !== 0) {
  console.log('❌ PROBLEMA IDENTIFICADO: Operação adiantada mostra atraso > 0');
  console.log('');
  console.log('Possíveis causas:');
  console.log('1. Timezone: Datas podem estar sendo convertidas com timezone diferente');
  console.log('2. Formato de data: String pode estar em formato diferente do esperado');
  console.log('3. Campos: Os nomes dos campos podem estar diferentes no objeto real');
  console.log('4. Outra função: Pode haver outra função calculando o atraso');
  console.log('');
  console.log('Soluções:');
  console.log('• Verificar formato exato das datas no objeto real');
  console.log('• Adicionar logs no calculateDelayInMinutes do utils.js');
  console.log('• Verificar se há outra função fazendo o cálculo');
  console.log('• Checar se as datas no banco estão em UTC ou local');
} else {
  console.log('✅ Função calculateDelayInMinutes está CORRETA!');
  console.log('');
  console.log('Se o sistema ainda mostra atraso incorreto:');
  console.log('1. Verifique se o utils.js foi atualizado no frontend');
  console.log('2. Limpe o cache do navegador (Ctrl+F5)');
  console.log('3. Verifique se há outra versão do arquivo sendo carregada');
  console.log('4. Inspecione o objeto real no console: console.log(operacao)');
}

console.log('─────────────────────────────────────\n');

// ================================================
// EXPORT PARA USO NO NAVEGADOR
// ================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateDelayInMinutes };
}

if (typeof window !== 'undefined') {
  window.testDelayCalculation = {
    calculateDelayInMinutes,
    testSantos: () => calculateDelayInMinutes(opSantos),
    testManaus: () => calculateDelayInMinutes(opManaus)
  };
  console.log('💡 Funções disponíveis no console:');
  console.log('   window.testDelayCalculation.testSantos()');
  console.log('   window.testDelayCalculation.testManaus()');
  console.log('   window.testDelayCalculation.calculateDelayInMinutes(operacao)');
}