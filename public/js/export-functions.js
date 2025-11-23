// export-functions.js - Funções de exportação PDF e PowerPoint
// ================================================================

const { jsPDF } = window.jspdf || {};

/**
 * Exporta os KPIs de analytics para PDF
 * @param {Object} data - Dados dos KPIs
 * @param {Array} embarcadores - Lista de embarcadores selecionados
 * @param {string} dataInicio - Data de início do filtro
 * @param {string} dataFim - Data de fim do filtro
 */
export async function exportarPDF(data, embarcadores, dataInicio, dataFim) {
  try {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = margin;

    // Cabeçalho
    doc.setFillColor(11, 34, 99); // #0b2263
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Analytics', pageWidth / 2, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Mercosul Line', pageWidth / 2, 30, { align: 'center' });
    
    yPos = 50;

    // Informações do filtro
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Período:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    
    const periodoText = dataInicio && dataFim 
      ? `${formatarData(dataInicio)} a ${formatarData(dataFim)}`
      : 'Todos os períodos';
    doc.text(periodoText, margin + 25, yPos);
    
    yPos += 7;
    
    if (embarcadores && embarcadores.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text('Embarcadores:', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(embarcadores.join(', '), margin + 30, yPos);
      yPos += 7;
    }
    
    yPos += 5;

    // Resumo Geral
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234); // #667eea
    doc.text('Resumo Geral', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    
    const resumo = data.resumo || {};
    doc.text(`Total de Operações: ${resumo.total_operacoes || 0}`, margin + 5, yPos);
    yPos += 6;
    doc.text(`Total de Coletas: ${resumo.total_coletas || 0}`, margin + 5, yPos);
    yPos += 6;
    doc.text(`Total de Entregas: ${resumo.total_entregas || 0}`, margin + 5, yPos);
    yPos += 10;

    // Pontualidade Geral
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text('Pontualidade das Operações', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const pont = data.pontualidade_geral || {};
    
    const categorias = [
      { nome: 'No Prazo', key: 'no_prazo', cor: [67, 233, 123] },
      { nome: 'Até 1h', key: 'ate_1h', cor: [79, 172, 254] },
      { nome: '2-5h', key: 'de_2_a_5h', cor: [255, 216, 155] },
      { nome: '5-10h', key: 'de_5_a_10h', cor: [240, 147, 251] },
      { nome: 'Mais de 10h', key: 'mais_10h', cor: [235, 51, 73] }
    ];

    categorias.forEach(cat => {
      const catData = pont[cat.key] || {};
      const qtd = catData.quantidade || 0;
      const pct = catData.percentual || '0';
      
      doc.setFillColor(...cat.cor);
      doc.circle(margin + 2, yPos - 1, 1.5, 'F');
      
      doc.text(`${cat.nome}: ${qtd} operações (${pct}%)`, margin + 7, yPos);
      yPos += 6;
    });

    yPos += 5;

    // Nova página se necessário
    if (yPos > pageHeight - 40) {
      doc.addPage();
      yPos = margin;
    }

    // Pontualidade de Coletas
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text('Pontualidade - Coletas', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const coletas = data.pontualidade_coletas || {};
    doc.text(`Média de Pontualidade: ${coletas.media || 0}%`, margin + 5, yPos);
    yPos += 6;
    doc.text(`Operações no Prazo: ${coletas.no_prazo || 0} de ${coletas.total || 0}`, margin + 5, yPos);
    yPos += 10;

    // Pontualidade de Entregas
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text('Pontualidade - Entregas', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const entregas = data.pontualidade_entregas || {};
    doc.text(`Média de Pontualidade: ${entregas.media || 0}%`, margin + 5, yPos);
    yPos += 6;
    doc.text(`Operações no Prazo: ${entregas.no_prazo || 0} de ${entregas.total || 0}`, margin + 5, yPos);
    yPos += 10;

    // Motivos de Atraso
    if (yPos > pageHeight - 80) {
      doc.addPage();
      yPos = margin;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(102, 126, 234);
    doc.text('Principais Motivos de Atraso', margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    const motivos = data.motivos_atraso || [];
    motivos.slice(0, 10).forEach((motivo, idx) => {
      doc.text(`${idx + 1}. ${motivo.motivo}: ${motivo.quantidade} (${motivo.percentual}%)`, margin + 5, yPos);
      yPos += 6;
      
      if (yPos > pageHeight - 30) {
        doc.addPage();
        yPos = margin;
      }
    });

    // Rodapé
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text(
        `Gerado em ${new Date().toLocaleString('pt-BR')} - Página ${i} de ${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    // Salvar PDF
    const fileName = `analytics-mercosul-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    return true;
  } catch (error) {
    console.error('Erro ao exportar PDF:', error);
    throw error;
  }
}

/**
 * Exporta os KPIs para PowerPoint
 * @param {Object} data - Dados dos KPIs
 * @param {Array} embarcadores - Lista de embarcadores selecionados
 * @param {string} dataInicio - Data de início do filtro
 * @param {string} dataFim - Data de fim do filtro
 */
export async function exportarPowerPoint(data, embarcadores, dataInicio, dataFim) {
  try {
    // Importa PptxGenJS dinamicamente
    const pptxgen = new PptxGenJS();
    
    // Configurações do tema
    pptxgen.layout = 'LAYOUT_WIDE';
    pptxgen.author = 'Mercosul Line';
    pptxgen.company = 'Mercosul Line';
    pptxgen.subject = 'Analytics Report';
    pptxgen.title = 'Relatório de Analytics';

    // Slide 1: Capa
    const slideCapa = pptxgen.addSlide();
    slideCapa.background = { color: '0b2263' };
    
    slideCapa.addText('Relatório de Analytics', {
      x: 0.5,
      y: 2,
      w: 9,
      h: 1.5,
      fontSize: 44,
      bold: true,
      color: 'FFFFFF',
      align: 'center'
    });
    
    slideCapa.addText('Mercosul Line', {
      x: 0.5,
      y: 3.5,
      w: 9,
      h: 0.5,
      fontSize: 24,
      color: 'FFFFFF',
      align: 'center'
    });

    const periodoText = dataInicio && dataFim 
      ? `Período: ${formatarData(dataInicio)} a ${formatarData(dataFim)}`
      : 'Período: Todos os dados';
    
    slideCapa.addText(periodoText, {
      x: 0.5,
      y: 4.5,
      w: 9,
      h: 0.3,
      fontSize: 14,
      color: 'FFFFFF',
      align: 'center'
    });

    if (embarcadores && embarcadores.length > 0) {
      slideCapa.addText(`Embarcadores: ${embarcadores.join(', ')}`, {
        x: 0.5,
        y: 5,
        w: 9,
        h: 0.3,
        fontSize: 12,
        color: 'FFFFFF',
        align: 'center'
      });
    }

    // Slide 2: Resumo Geral
    const slideResumo = pptxgen.addSlide();
    slideResumo.background = { color: 'FFFFFF' };
    
    slideResumo.addText('Resumo Geral', {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.6,
      fontSize: 32,
      bold: true,
      color: '0b2263'
    });

    const resumo = data.resumo || {};
    
    const kpiData = [
      ['Total de Operações', resumo.total_operacoes || 0],
      ['Total de Coletas', resumo.total_coletas || 0],
      ['Total de Entregas', resumo.total_entregas || 0]
    ];

    kpiData.forEach((kpi, idx) => {
      const xPos = 1 + (idx * 3);
      
      slideResumo.addText(kpi[0], {
        x: xPos,
        y: 2,
        w: 2.5,
        h: 0.4,
        fontSize: 14,
        align: 'center',
        color: '666666'
      });
      
      slideResumo.addText(String(kpi[1]), {
        x: xPos,
        y: 2.5,
        w: 2.5,
        h: 0.8,
        fontSize: 36,
        bold: true,
        align: 'center',
        color: '667eea'
      });
    });

    // Slide 3: Pontualidade
    const slidePont = pptxgen.addSlide();
    slidePont.background = { color: 'FFFFFF' };
    
    slidePont.addText('Pontualidade das Operações', {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.6,
      fontSize: 32,
      bold: true,
      color: '0b2263'
    });

    const pont = data.pontualidade_geral || {};
    
    const pontRows = [
      ['Categoria', 'Quantidade', 'Percentual']
    ];

    const categorias = [
      { nome: 'No Prazo', key: 'no_prazo' },
      { nome: 'Até 1h', key: 'ate_1h' },
      { nome: '2-5h', key: 'de_2_a_5h' },
      { nome: '5-10h', key: 'de_5_a_10h' },
      { nome: 'Mais de 10h', key: 'mais_10h' }
    ];

    categorias.forEach(cat => {
      const catData = pont[cat.key] || {};
      pontRows.push([
        cat.nome,
        String(catData.quantidade || 0),
        `${catData.percentual || '0'}%`
      ]);
    });

    slidePont.addTable(pontRows, {
      x: 1.5,
      y: 1.5,
      w: 7,
      fontSize: 14,
      color: '363636',
      fill: { color: 'F7F8F9' },
      border: { pt: 1, color: 'CFCFCF' },
      colW: [3, 2, 2]
    });

    // Slide 4: Coletas e Entregas
    const slideColetasEntregas = pptxgen.addSlide();
    slideColetasEntregas.background = { color: 'FFFFFF' };
    
    slideColetasEntregas.addText('Pontualidade: Coletas e Entregas', {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.6,
      fontSize: 32,
      bold: true,
      color: '0b2263'
    });

    const coletas = data.pontualidade_coletas || {};
    const entregas = data.pontualidade_entregas || {};

    // Coletas
    slideColetasEntregas.addText('Coletas', {
      x: 1,
      y: 2,
      w: 4,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: '667eea'
    });

    slideColetasEntregas.addText(`Média: ${coletas.media || 0}%`, {
      x: 1,
      y: 2.6,
      w: 4,
      h: 0.3,
      fontSize: 16,
      color: '363636'
    });

    slideColetasEntregas.addText(`No Prazo: ${coletas.no_prazo || 0} de ${coletas.total || 0}`, {
      x: 1,
      y: 3.1,
      w: 4,
      h: 0.3,
      fontSize: 16,
      color: '363636'
    });

    // Entregas
    slideColetasEntregas.addText('Entregas', {
      x: 5.5,
      y: 2,
      w: 4,
      h: 0.4,
      fontSize: 20,
      bold: true,
      color: '667eea'
    });

    slideColetasEntregas.addText(`Média: ${entregas.media || 0}%`, {
      x: 5.5,
      y: 2.6,
      w: 4,
      h: 0.3,
      fontSize: 16,
      color: '363636'
    });

    slideColetasEntregas.addText(`No Prazo: ${entregas.no_prazo || 0} de ${entregas.total || 0}`, {
      x: 5.5,
      y: 3.1,
      w: 4,
      h: 0.3,
      fontSize: 16,
      color: '363636'
    });

    // Slide 5: Motivos de Atraso
    const slideMotivos = pptxgen.addSlide();
    slideMotivos.background = { color: 'FFFFFF' };
    
    slideMotivos.addText('Principais Motivos de Atraso', {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.6,
      fontSize: 32,
      bold: true,
      color: '0b2263'
    });

    const motivos = data.motivos_atraso || [];
    const motivosRows = [['Motivo', 'Quantidade', 'Percentual']];

    motivos.slice(0, 10).forEach(motivo => {
      motivosRows.push([
        motivo.motivo || 'Não informado',
        String(motivo.quantidade || 0),
        `${motivo.percentual || '0'}%`
      ]);
    });

    slideMotivos.addTable(motivosRows, {
      x: 0.5,
      y: 1.5,
      w: 9,
      fontSize: 12,
      color: '363636',
      fill: { color: 'F7F8F9' },
      border: { pt: 1, color: 'CFCFCF' },
      colW: [5, 2, 2]
    });

    // Salvar arquivo
    const fileName = `analytics-mercosul-${new Date().toISOString().split('T')[0]}.pptx`;
    await pptxgen.writeFile({ fileName });
    
    return true;
  } catch (error) {
    console.error('Erro ao exportar PowerPoint:', error);
    throw error;
  }
}

// Helper para formatar data
function formatarData(dataStr) {
  if (!dataStr) return '';
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

// Script de inicialização para carregamento dinâmico das bibliotecas
export function initExportLibraries() {
  return new Promise((resolve) => {
    // Carrega jsPDF
    if (!window.jsPDF) {
      const script1 = document.createElement('script');
      script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script1.async = true;
      document.head.appendChild(script1);
    }

    // Carrega PptxGenJS
    if (!window.PptxGenJS) {
      const script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
      script2.async = true;
      script2.onload = () => resolve();
      document.head.appendChild(script2);
    } else {
      resolve();
    }
  });
}
window.exportarPDF = exportarPDF; window.exportarPowerPoint = exportarPowerPoint;