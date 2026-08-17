import { jsPDF } from "jspdf";

const MARGIN = 15;
const LINE = 5;

const label = (item) => {
  if (item.isPlagiarized) return "PLAGIO";
  if (item.isAiGenerated) return "IA";
  return "Limpio";
};

export function downloadReportPdf(result) {
  const doc = new jsPDF();
  const pageWidth =
    doc.internal.pageSize.getWidth();
  const pageHeight =
    doc.internal.pageSize.getHeight();
  const width = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const writeLines = (text, size, style) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    const lines = doc.splitTextToSize(
      text,
      width
    );
    for (const line of lines) {
      ensureSpace(LINE);
      doc.text(line, MARGIN, y);
      y += LINE;
    }
  };

  writeLines(
    "Informe de plagio e IA",
    16,
    "bold"
  );
  writeLines(
    `Generado: ${new Date().toLocaleString()}`,
    9,
    "normal"
  );
  y += 3;

  const c = result.coverage;
  writeLines("Resumen", 13, "bold");
  writeLines(
    `Fragmentos con plagio: ` +
      `${result.plagiarismPercentage}% ` +
      `(${result.plagiarizedSentences} de ` +
      `${result.totalSentences})`,
    10,
    "normal"
  );
  writeLines(
    `Similitud promedio: ` +
      `${result.overallScore}%`,
    10,
    "normal"
  );
  writeLines(
    `Probabilidad global de IA: ` +
      `${result.aiScore ?? 0}%`,
    10,
    "normal"
  );
  writeLines(
    `Fragmentos marcados como IA: ` +
      `${result.aiSentencePercentage ?? 0}% ` +
      `(${result.aiSentences ?? 0} de ` +
      `${result.totalSentences})`,
    10,
    "normal"
  );
  if (c) {
    writeLines(
      `Cobertura: ${c.analyzedSentences} de ` +
        `${c.documentSentences} oraciones ` +
        `(${c.coveragePercentage}% del ` +
        `documento)`,
      10,
      "normal"
    );
  }
  if (result.aiIndicators?.length) {
    writeLines(
      "Indicadores de IA: " +
        result.aiIndicators.join(" - "),
      10,
      "normal"
    );
  }
  y += 3;

  writeLines(
    "Fragmentos marcados",
    13,
    "bold"
  );
  const flagged = result.results.filter(
    (item) =>
      item.isPlagiarized || item.isAiGenerated
  );
  if (flagged.length === 0) {
    writeLines(
      "Ningún fragmento fue marcado como " +
        "plagio o IA.",
      10,
      "normal"
    );
  }
  flagged.forEach((item, index) => {
    y += 2;
    writeLines(
      `${index + 1}. [${label(item)}] ` +
        `Plagio ${item.similarity}% - ` +
        `IA ${item.aiScore ?? 0}%`,
      10,
      "bold"
    );
    writeLines(item.sentence, 9, "normal");
    for (const source of item.sources || []) {
      writeLines(
        `Fuente (${source.similarity}%): ` +
          source.url,
        8,
        "italic"
      );
    }
  });

  doc.save("informe-plagio-ia.pdf");
}
