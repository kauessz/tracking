// public/js/utils.js - VERSÃO CORRIGIDA FINAL
// =====================================================
// ✅ CORREÇÕES APLICADAS:
// 1. Removida tolerância especial de Manaus (todos portos iguais)
// 2. Cálculo de atraso unificado e consistente
// 3. Valores negativos (adiantados) retornam 0
// 4. REMOVIDO: Uso de "Data de previsão de entrega recalculada"
// 5. REMOVIDO: Todos os console.log de debug

// Helpers de data
function excelSerialToDate(val) {
  const serial = Number(val);
  if (!isFinite(serial)) return null;
  const base = new Date(1899, 11, 30);
  const wholeDays = Math.floor(serial);
  const frac = serial - wholeDays;

  const d = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + wholeDays,
    0, 0, 0, 0
  );

  const totalSeconds = Math.round(frac * 24 * 60 * 60);
  d.setSeconds(totalSeconds);
  return d;
}

function parseBrDateTime(str) {
  if (typeof str !== "string") return null;
  const m = str.trim().match(
    /^(\d{2})[\/\-](\d{2})[\/\-](\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "00", min = "00", ss = "00"] = m;
  const d = new Date(
    Number(yyyy), Number(mm) - 1, Number(dd),
    Number(hh), Number(min), Number(ss), 0
  );
  return isNaN(d.getTime()) ? null : d;
}

export function parseDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;

  if (typeof v === "number") {
    const d = excelSerialToDate(v);
    if (d) return d;
  }

  if (typeof v === "string") {
    const tryBr = parseBrDateTime(v);
    if (tryBr) return tryBr;
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatDateForDisplay(dateLike) {
  const d = parseDate(dateLike);
  if (!d) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

// ============================================================================
// ✅ CÁLCULO DE ATRASO CORRIGIDO
// ============================================================================
// REGRAS:
// 1. Usa APENAS "Previsão início atendimento (BRA)" - NUNCA a recalculada
// 2. Se não tiver "Dt Início da Execução", usa hora atual
// 3. Número da programação é único por operação
// 4. SEM console.log de debug (limpo)
// ============================================================================

export function calculateDelayInMinutes(op = {}) {
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

  // 1. Verifica se está cancelada
  const situacao = get(op, [
    'SituacaoProgramacao',
    'situacao', 
    'status',
    'TipoOperacao',
    'tipo_programacao'
  ]);
  
  if (situacao && situacao.toString().toLowerCase().includes('cancelad')) {
    return 0;
  }

  // 2. ✅ CORREÇÃO CRÍTICA: Pega APENAS a previsão ORIGINAL
  // NÃO usar previsão recalculada - ela é apenas informativa
  const previsaoOriginalStr = get(op, [
    'Previsão início atendimento (BRA)',
    'Previsao inicio atendimento (BRA)',
    'previsao_inicio_atendimento',
    'PrevisaoInicio',
    'DataProgramada',
    'Data Programada'
  ]);

  const previsao = previsaoOriginalStr ? parseBR(previsaoOriginalStr) : null;
  
  if (!previsao) {
    return 0; // Sem previsão, sem atraso
  }

  // 3. Pega o Dt Início da Execução OU usa hora atual
  const inicioStr = get(op, [
    'Dt Início da Execução (BRA)',
    'Dt Inicio da Execução (BRA)',
    'Dt Inicio da Execucao (BRA)',
    'dt_inicio_execucao',
    'DataChegada',
    'Data Chegada'
  ]);

  // ✅ Se não tiver início da execução, usa HORA ATUAL
  let atualDt = inicioStr ? parseBR(inicioStr) : new Date();
  if (!atualDt) atualDt = new Date();

  // 4. Calcula diferença (SEM tolerância)
  const diffMs = atualDt.getTime() - previsao.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  // Se diffMin for negativo (adiantado), retorna 0
  return diffMin > 0 ? diffMin : 0;
}

// Expor globalmente para uso no admin.js e outros módulos
if (typeof window !== 'undefined') {
  window.calculateDelayInMinutes = calculateDelayInMinutes;
}

export function formatMinutesToHHMM(mins) {
  const total = Math.max(0, Number(mins) || 0);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

// PWA
export function registerPWA() {
  try {
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "./manifest.webmanifest";
      document.head.appendChild(link);
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch((err) => {
        console.warn("SW registration failed:", err);
      });
    }
  } catch (err) {
    console.warn("registerPWA error:", err);
  }
}

// Corpo de e-mail (texto)
export function buildAlertEmailBody(ops, clienteNome = "Cliente") {
  const atrasadas = Array.isArray(ops)
    ? ops.filter((o) => (calculateDelayInMinutes(o) || 0) > 0)
    : [];

  if (!atrasadas.length) {
    return {
      subject: `Status das operações - ${clienteNome}`,
      body: `Prezados(as),\n\nNo momento não identificamos operações com atraso.\n\nAgradecemos a compreensão.\n\nAtenciosamente,\nCustomer Service / Mercosul Line`
    };
  }

  let bodyLines = [];
  bodyLines.push("Prezados(as),", "", 
    "Gostaríamos de informar que identificamos um atraso nas operações listadas abaixo.", "",
    "Pedimos desculpas pelo ocorrido. Nossa equipe já está atuando para mitigar qualquer impacto operacional e trabalhando ativamente para confirmar uma nova previsão de chegada.", "",
    "Assim que tivermos essa confirmação, entraremos em contato imediatamente.", "",
    "=".repeat(80), "");

  atrasadas.forEach((op, idx) => {
    const atrasoMin = calculateDelayInMinutes(op) || 0;
    const container = op.Container || op.containers || op.container || "—";
    const motivo = op.JustificativaAtraso || op.motivo_atraso || "Não informado";
    const embarcador = op.Cliente || op.embarcador_nome || clienteNome;
    const porto = op.PortoOperacao || op.porto_operacao || "—";
    const tipo = op.TipoOperacao || op.TipoProgramacao || op.tipo_programacao || "—";
    const prev = op.DataProgramada ?? op.previsao_inicio_atendimento;

    bodyLines.push(`${idx + 1}. OPERAÇÃO`);
    bodyLines.push(`   Booking: ${op.Booking || op.booking || "—"}`);
    bodyLines.push(`   Container: ${container}`);
    bodyLines.push(`   Embarcador: ${embarcador}`);
    bodyLines.push(`   Porto: ${porto}`);
    bodyLines.push(`   Tipo Programação: ${tipo}`);
    bodyLines.push(`   Previsão Início: ${formatDateForDisplay(prev)}`);
    bodyLines.push(`   Atraso: ${formatMinutesToHHMM(atrasoMin)}`);
    bodyLines.push(`   Motivo: ${motivo}`, "");
  });

  bodyLines.push("=".repeat(80), "", "Agradecemos a compreensão.", "", "Atenciosamente,", "Customer Service / Mercosul Line");

  return { subject: `⚠️ Alerta de Atraso - ${clienteNome}`, body: bodyLines.join("\n") };
}

// Criação de arquivo EML (HTML + Texto)
export function createEMLFile(
  ops,
  clienteNome = "Cliente",
  fromEmail = "operacao@mercosulline.com.br",
  toEmail = "cliente@email.com"
) {
  const atrasadas = Array.isArray(ops)
    ? ops.filter((o) => (calculateDelayInMinutes(o) || 0) > 0)
    : [];
  if (!atrasadas.length) return null;

  const subject = `Alerta de Atraso - ${clienteNome}`;
  const boundary = "----=_Part_" + Date.now();
  const now = new Date().toUTCString();

  let htmlBody = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; line-height:1.6; color:#333; max-width:800px; margin:0 auto; padding:20px;}
  .intro{background:#fff3cd; border-left:4px solid #ffc107; padding:15px; margin:20px 0;}
  table{border-collapse:collapse; width:100%; margin:20px 0; box-shadow:0 2px 4px rgba(0,0,0,.1);}
  th{background:#0b2263; color:#fff; padding:12px 8px; text-align:left; font-size:13px; font-weight:600;}
  td{border:1px solid #ddd; padding:10px 8px; font-size:13px;}
  tr:nth-child(even){background:#f8f9fa;}
  .atraso-cell{color:#c53030; font-weight:bold;}
</style>
</head><body>
<div class="intro">
  <p><strong>Gostaríamos de informar que identificamos um atraso nas operações listadas abaixo.</strong></p>
  <p>Pedimos desculpas pelo ocorrido. Nossa equipe já está atuando para mitigar qualquer impacto operacional e trabalhando ativamente para confirmar uma nova previsão de chegada.</p>
  <p>Assim que tivermos essa confirmação, entraremos em contato imediatamente.</p>
</div>
<table><thead><tr>
  <th>Booking</th><th>Container</th><th>Embarcador</th><th>Porto</th>
  <th>Tipo Prog.</th><th>Previsão Início</th><th>Atraso</th><th>Motivo</th>
</tr></thead><tbody>`;

  atrasadas.forEach((op) => {
    const atrasoMin = calculateDelayInMinutes(op) || 0;
    const container = op.Container || op.containers || op.container || "—";
    const motivo = op.JustificativaAtraso || op.motivo_atraso || "Não informado";
    const embarcador = op.Cliente || op.embarcador_nome || clienteNome;
    const porto = op.PortoOperacao || op.porto_operacao || "—";
    const tipo = op.TipoOperacao || op.TipoProgramacao || op.tipo_programacao || "—";
    const prev = op.DataProgramada ?? op.previsao_inicio_atendimento;

    htmlBody += `
<tr>
  <td>${op.Booking || op.booking || "—"}</td>
  <td>${container}</td>
  <td>${embarcador}</td>
  <td>${porto}</td>
  <td>${tipo}</td>
  <td>${formatDateForDisplay(prev)}</td>
  <td class="atraso-cell">${formatMinutesToHHMM(atrasoMin)}</td>
  <td>${motivo}</td>
</tr>`;
  });

  htmlBody += `</tbody></table>
<p>Agradecemos a compreensão.</p>
<p><strong>Atenciosamente,</strong><br/>Customer Service / Mercosul Line</p>
</body></html>`;

  const textBody = buildAlertEmailBody(atrasadas, clienteNome).body;

  const emlContent = `From: ${fromEmail}
To: ${toEmail}
Subject: ${subject}
Date: ${now}
MIME-Version: 1.0
Content-Type: multipart/alternative; boundary="${boundary}"

--${boundary}
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

${textBody}

--${boundary}
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

${htmlBody}

--${boundary}--
`;
  return emlContent;
}

export function formatDate(isoStr) {
    if (!isoStr) return '-';
    // Cria o objeto data
    const d = new Date(isoStr);
    
    // Verifica se é data válida
    if (isNaN(d.getTime())) return '-';

    // Pega o deslocamento do fuso horário do usuário (em minutos) e converte para ms
    // Isso "cancela" a conversão automática do navegador se a data veio como UTC mas era pra ser local
    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
    const normalized = new Date(d.getTime() + userTimezoneOffset);

    return normalized.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

export function downloadEML(emlContent, filename = "alerta-atrasos.eml") {
  const blob = new Blob([emlContent], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Mantém compatibilidade com código antigo
export const calculateDelayInMinutes_programacao = calculateDelayInMinutes;