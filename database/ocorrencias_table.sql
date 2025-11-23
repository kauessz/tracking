-- =====================================================
-- TABELA: ocorrencias
-- Descrição: Armazena ocorrências reportadas no sistema
-- =====================================================

CREATE TABLE IF NOT EXISTS public.ocorrencias (
  id BIGSERIAL PRIMARY KEY,

  -- Informações da operação
  booking VARCHAR(100),
  container VARCHAR(100),
  embarcador_nome VARCHAR(255),
  porto VARCHAR(255),
  previsao_inicio_atendimento TIMESTAMPTZ,
  nova_previsao TIMESTAMPTZ,

  -- Dados da ocorrência
  tipo_ocorrencia VARCHAR(100) NOT NULL,
  descricao_ocorrencia TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pendente',

  -- Auditoria
  criado_por VARCHAR(255),
  data_criacao TIMESTAMPTZ DEFAULT NOW(),
  data_processamento TIMESTAMPTZ,

  -- Índices para melhor performance
  CONSTRAINT ocorrencias_tipo_check CHECK (tipo_ocorrencia IN (
    'inicio_operacao',
    'fim_operacao',
    'atraso',
    'problema_operacional',
    'observacao'
  )),

  CONSTRAINT ocorrencias_status_check CHECK (status IN (
    'pendente',
    'processada',
    'rejeitada'
  ))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ocorrencias_booking ON public.ocorrencias(booking);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON public.ocorrencias(status);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_tipo ON public.ocorrencias(tipo_ocorrencia);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_data_criacao ON public.ocorrencias(data_criacao DESC);

-- RLS (Row Level Security) - Desabilitado para permitir inserção pública
ALTER TABLE public.ocorrencias DISABLE ROW LEVEL SECURITY;

-- Comentários
COMMENT ON TABLE public.ocorrencias IS 'Registros de ocorrências operacionais';
COMMENT ON COLUMN public.ocorrencias.tipo_ocorrencia IS 'Tipo: inicio_operacao, fim_operacao, atraso, problema_operacional, observacao';
COMMENT ON COLUMN public.ocorrencias.status IS 'Status: pendente, processada, rejeitada';
COMMENT ON COLUMN public.ocorrencias.criado_por IS 'Email do usuário ou "Formulário Público"';
