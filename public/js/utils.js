/**
 * Formata um objeto Date para a string "dd/mm/yyyy, hh:mm".
 * @param {Date} dateObject O objeto Date a ser formatado.
 * @returns {string|null} A string formatada ou null se a entrada for inválida.
 */
export const formatDate = (dateObject) => {
    if (!(dateObject instanceof Date) || isNaN(dateObject)) {
        return null;
    }
    const day = String(dateObject.getDate()).padStart(2, '0');
    const month = String(dateObject.getMonth() + 1).padStart(2, '0');
    const year = dateObject.getFullYear();
    const hours = String(dateObject.getHours()).padStart(2, '0');
    const minutes = String(dateObject.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
};

/**
 * Analisa uma string de data de vários formatos para um objeto Date válido.
 * Lida com "dd/mm/yyyy, hh:mm" (nosso formato padrão) e "m/d/yy hh:mm" (formato da planilha).
 * @param {string} dateString A data a ser analisada.
 * @returns {Date|null} Um objeto Date ou null se a análise falhar.
 */
export const parseDate = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return null;

    // Tenta corresponder ao nosso formato padrão: "dd/mm/yyyy, hh:mm"
    let parts = dateString.match(/^(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})$/);
    if (parts) {
        const day = parseInt(parts[1], 10);
        const month = parseInt(parts[2], 10) - 1; // Mês em JS é 0-11
        const year = parseInt(parts[3], 10);
        const hour = parseInt(parts[4], 10);
        const minute = parseInt(parts[5], 10);
        return new Date(year, month, day, hour, minute);
    }

    // Tenta corresponder ao formato da planilha (americano): "m/d/yy h:mm"
    parts = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
    if (parts) {
        let month = parseInt(parts[1], 10) - 1; // Mês
        let day = parseInt(parts[2], 10);     // Dia
        let year = parseInt(parts[3], 10);
        const hour = parts[4] ? parseInt(parts[4], 10) : 0;
        const minute = parts[5] ? parseInt(parts[5], 10) : 0;

        if (year < 100) {
            year += 2000; // Converte '25' para '2025'
        }
        
        // Validação básica
        if (month >= 0 && month < 12 && day > 0 && day <= 31) {
             return new Date(year, month, day, hour, minute);
        }
    }

    return null; // Retorna null se nenhum formato corresponder
};


/**
 * Calcula o atraso em minutos, ajustando para o fuso horário de Manaus.
 * @param {object} operation O objeto da operação contendo as datas e a cidade.
 * @returns {number|null} O atraso em minutos ou null se as datas forem inválidas.
 */
export const calculateDelayInMinutes = (operation) => {
    const previsaoDate = parseDate(operation.DataProgramada);
    if (!previsaoDate) return null;

    let execucaoDate = parseDate(operation.DataChegada);

    // Se a data de execução estiver em falta e a data prevista já passou, usa a hora atual.
    if (!execucaoDate && previsaoDate < new Date()) {
        execucaoDate = new Date();
    }
    
    if (!execucaoDate) return null;

    let adjustedExecucaoDate = new Date(execucaoDate.getTime());

    if (operation.CidadeDescarga && operation.CidadeDescarga.toLowerCase().includes('manaus')) {
        adjustedExecucaoDate.setHours(adjustedExecucaoDate.getHours() - 1);
    }

    return (adjustedExecucaoDate.getTime() - previsaoDate.getTime()) / (1000 * 60);
};

/**
 * Formata uma string de data para exibição.
 * @param {string} dateString A string de data a ser formatada.
 * @returns {string} A string de data formatada ou 'N/A' se a entrada for inválida.
 */
export const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'N/A';
    return dateString;
};

/**
 * Formata o total de minutos numa string HH:MM ou "ON TIME".
 * @param {number} totalMinutes O total de minutos a formatar.
 * @returns {string} A string formatada.
 */
export const formatMinutesToHHMM = (totalMinutes) => {
    if (totalMinutes === null || isNaN(totalMinutes) || totalMinutes <= 0) {
        return "ON TIME";
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = Math.round(totalMinutes % 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};