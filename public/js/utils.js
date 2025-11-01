/**
 * utils.js — parsing/format de datas + cálculo de atrasos
 * Saída padronizada: "dd/mm/aaaa hh:mm" (hora LOCAL, sem aplicar fuso indevido)
 */

const pad2 = (n) => String(n).padStart(2, "0");

/* ---------------------- Helpers de data ---------------------- */

/**
 * Converte Excel Serial para Date **em horário local** (sem -3h).
 * Excel conta dias a partir de 1899-12-30. Aqui quebramos em parte inteira (dia)
 * e fração (horas/min/seg), e montamos Date local sem passar por UTC.
 */
const excelSerialToDate = (val) => {
  const serial = Number(val);
  if (!isFinite(serial)) return null;

  const base = new Date(1899, 11, 30); // 1899-12-30 (LOCAL)
  const wholeDays = Math.floor(serial);
  const frac = serial - wholeDays;

  // Avança dia local
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + wholeDays);

  // Converte fração do dia em h:m:s (arredondado a segundos)
  const totalSecs = Math.round(frac * 86400);
  const hh = Math.floor(totalSecs / 3600);
  const mm = Math.floor((totalSecs % 3600) / 60);
  const ss = totalSecs % 60;

  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm, ss, 0);
};

// dd/mm/aaaa [hh:mm]
const parseBrazil = (txt) => {
  const m = String(txt).trim().match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/
  );
  if (!m) return null;
  let [, dd, mm, yyyy, hh, mi] = m;
  dd = parseInt(dd, 10);
  mm = parseInt(mm, 10) - 1;
  yyyy = parseInt(yyyy, 10);
  if (yyyy < 100) yyyy += 2000;
  hh = hh ? parseInt(hh, 10) : 0;
  mi = mi ? parseInt(mi, 10) : 0;
  const d = new Date(yyyy, mm, dd, hh, mi);
  return isNaN(d) ? null : d;
};

/* ---------------------- API Pública ---------------------- */

/** Formata Date para "dd/mm/aaaa hh:mm" (LOCAL) */
export const formatDate = (dateObject) => {
  if (!(dateObject instanceof Date) || isNaN(dateObject)) return null;
  const dd = pad2(dateObject.getDate());
  const mm = pad2(dateObject.getMonth() + 1);
  const yyyy = dateObject.getFullYear();
  const hh = pad2(dateObject.getHours());
  const mi = pad2(dateObject.getMinutes());
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
};

/**
 * Analisa vários formatos: Excel serial (number/string), "dd/mm/aaaa hh:mm",
 * e fallback de Date (cautela). Tudo interpretado como **horário local**.
 */
export const parseDate = (value) => {
  if (value === null || value === undefined || value === "") return null;

  // número (Excel) ou string numérica (Excel)
  if (typeof value === "number") return excelSerialToDate(value);
  const trimmed = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return excelSerialToDate(trimmed);

  // BR
  const br = parseBrazil(trimmed);
  if (br) return br;

  // Fallback genérico
  const d = new Date(trimmed);
  return isNaN(d) ? null : d;
};

/**
 * Calcula o atraso em minutos, com ajuste -1h para Manaus:
 * - COLETA + POL=Manaus, ou
 * - ENTREGA + POD=Manaus
 * Mantém fallback: se CidadeDescarga contiver "manaus", também aplica -1h.
 */
export const calculateDelayInMinutes = (operation) => {
  const previsaoDate = parseDate(operation?.DataProgramada);
  if (!previsaoDate) return null;

  let execucaoDate = parseDate(operation?.DataChegada);

  // Se falta execução e a previsão já passou, usa "agora"
  if (!execucaoDate && previsaoDate < new Date()) execucaoDate = new Date();
  if (!execucaoDate) return null;

  let adjusted = new Date(execucaoDate.getTime());

  const tipo = (operation?.TipoProgramacao || "").toString().toLowerCase();
  const pol  = (operation?.POL || "").toString().toLowerCase();
  const pod  = (operation?.POD || "").toString().toLowerCase();
  const isManaus = (s) => s.includes("manaus");

  if ((tipo.includes("coleta")  && isManaus(pol)) ||
      (tipo.includes("entrega") && isManaus(pod)) ||
      ((operation?.CidadeDescarga || "").toString().toLowerCase().includes("manaus"))) {
    adjusted = new Date(adjusted.getTime() - 60 * 60 * 1000);
  }

  return Math.round((adjusted.getTime() - previsaoDate.getTime()) / 60000);
};

/** Formata valor de data aceito por parseDate para exibição. */
export const formatDateForDisplay = (value) => {
  const d = parseDate(value);
  if (!d) return "N/A";
  return formatDate(d);
};

/** Converte minutos em "HH:MM" ou "ON TIME" (<=0). */
export const formatMinutesToHHMM = (totalMinutes) => {
  if (totalMinutes === null || isNaN(totalMinutes) || totalMinutes <= 0) {
    return "ON TIME";
  }
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${pad2(h)}:${pad2(m)}`;
};

/* ---------------------- PWA helper ---------------------- */
export const registerPWA = () => {
  try {
    // injeta manifest se não estiver no HTML
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/manifest.webmanifest';
      document.head.appendChild(link);
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e)=>console.warn('SW fail:', e));
    }
  } catch (e) {
    console.warn('PWA register skipped:', e);
  }
};