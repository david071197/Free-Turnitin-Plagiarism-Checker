import { detectAI } from "./plagiarism.js";

// Aggregates per-sentence analyses into the report the
// UI renders. Shared by the synchronous check and the
// background full-document scan (which calls it with
// partial results while it progresses).
export function buildReport({
  text,
  documentSentences,
  results,
  depth,
}) {
  const analyzed = results.length;
  const totalSimilarity = results.reduce(
    (sum, r) => sum + r.similarity,
    0
  );
  const plagiarizedCount = results.filter(
    (r) => r.isPlagiarized
  ).length;
  const aiCount = results.filter(
    (r) => r.isAiGenerated
  ).length;
  const aiAnalysis = detectAI(text);
  const ratio = (count) =>
    analyzed === 0
      ? 0
      : Math.round((count / analyzed) * 100);

  return {
    coverage: {
      documentSentences,
      analyzedSentences: analyzed,
      coveragePercentage:
        documentSentences === 0
          ? 0
          : Math.round(
              (analyzed / documentSentences) * 100
            ),
      sampled: analyzed < documentSentences,
      depth,
    },
    overallScore:
      analyzed === 0
        ? 0
        : Math.round(totalSimilarity / analyzed),
    plagiarismPercentage: ratio(plagiarizedCount),
    totalSentences: analyzed,
    plagiarizedSentences: plagiarizedCount,
    aiScore: aiAnalysis.aiScore,
    aiIndicators: aiAnalysis.indicators,
    aiSentences: aiCount,
    aiSentencePercentage: ratio(aiCount),
    results,
  };
}
