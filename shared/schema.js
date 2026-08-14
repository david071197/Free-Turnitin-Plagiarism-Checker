import { z } from "zod";

export const DEPTH_LIMITS = {
  fast: 20,
  normal: 60,
  deep: 150,
};

export const checkTextSchema = z.object({
  text: z.string().min(100, "Text must be at least 100 characters long"),
  depth: z
    .enum(["fast", "normal", "deep"])
    .default("normal"),
});

export const sentenceResultSchema = z.object({
  sentence: z.string(),
  similarity: z.number(),
  sources: z.array(
    z.object({
      url: z.string(),
      similarity: z.number(),
    })
  ),
  isPlagiarized: z.boolean(),
});

export const coverageSchema = z.object({
  documentSentences: z.number(),
  analyzedSentences: z.number(),
  coveragePercentage: z.number(),
  sampled: z.boolean(),
  depth: z.string(),
});

export const checkResultSchema = z.object({
  coverage: coverageSchema,
  overallScore: z.number(),
  plagiarismPercentage: z.number(),
  totalSentences: z.number(),
  plagiarizedSentences: z.number(),
  aiScore: z.number(),
  aiIndicators: z.array(z.string()),
  results: z.array(sentenceResultSchema),
});
