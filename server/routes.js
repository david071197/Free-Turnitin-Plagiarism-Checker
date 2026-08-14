import { createServer } from "http";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { checkTextSchema } from "../shared/schema.js";
import {
  calculateSimilarity,
  searchWeb,
  fetchPageContentCached,
  nGramSimilarity,
  mapWithConcurrency,
  detectAI,
} from "./plagiarism.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

async function analyzeSentence(sentence) {
  const urls = await searchWeb(sentence);

  let maxSimilarity = 0;
  const matchedSources = [];

  const contents = await mapWithConcurrency(
    urls,
    5,
    (url) => fetchPageContentCached(url)
  );

  urls.forEach((url, i) => {
    const content = contents[i];
    if (!content || content.length <= 100) return;

    const cosineSim = calculateSimilarity(
      sentence,
      content
    );
    const ngramSim = nGramSimilarity(
      sentence,
      content,
      5
    );
    const similarity = Math.max(cosineSim, ngramSim);

    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }
    if (similarity > 0.15) {
      matchedSources.push({
        url,
        similarity: Math.round(similarity * 100),
      });
    }
  });

  matchedSources.sort(
    (a, b) => b.similarity - a.similarity
  );

  return {
    sentence,
    similarity: Math.round(maxSimilarity * 100),
    sources: matchedSources,
    isPlagiarized: maxSimilarity > 0.5,
  };
}

export function registerRoutes(app) {
  app.post("/api/plagiarism-check", async (req, res) => {
    try {
      const { text } = checkTextSchema.parse(req.body);

      console.log(
        "Starting plagiarism check for text length:",
        text.length
      );

      const sentences = text
        .split(/[.!?]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);

      const limit = Math.min(sentences.length, 20);
      const toCheck = sentences.slice(0, limit);

      const results = await mapWithConcurrency(
        toCheck,
        4,
        (sentence) => analyzeSentence(sentence)
      );

      const totalSimilarity = results.reduce(
        (sum, r) => sum + r.similarity,
        0
      );
      const overallScore = Math.round(
        totalSimilarity / results.length
      );
      const plagiarizedCount = results.filter(
        (r) => r.isPlagiarized
      ).length;
      const plagiarismPercentage = Math.round(
        (plagiarizedCount / results.length) * 100
      );

      const aiAnalysis = detectAI(text);

      const checkResult = {
        overallScore,
        plagiarismPercentage,
        totalSentences: results.length,
        plagiarizedSentences: plagiarizedCount,
        aiScore: aiAnalysis.aiScore,
        aiIndicators: aiAnalysis.indicators,
        results,
      };

      res.json(checkResult);
    } catch (error) {
      console.error("Error in plagiarism check:", error);
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : "An unknown error occurred",
      });
    }
  });

  app.post(
    "/api/extract-text",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res
            .status(400)
            .json({ error: "No file uploaded" });
        }

        const { originalname, buffer, mimetype } =
          req.file;
        const name = originalname.toLowerCase();
        let text = "";

        if (
          name.endsWith(".pdf") ||
          mimetype === "application/pdf"
        ) {
          const parser = new PDFParse({
            data: new Uint8Array(buffer),
          });
          const result = await parser.getText();
          text = result.text || "";
          await parser.destroy();
        } else if (name.endsWith(".docx")) {
          const result = await mammoth.extractRawText({
            buffer,
          });
          text = result.value || "";
        } else if (name.endsWith(".txt")) {
          text = buffer.toString("utf-8");
        } else {
          return res.status(400).json({
            error:
              "Unsupported file type. Use PDF, DOCX or TXT.",
          });
        }

        text = text.replace(/\s+\n/g, "\n").trim();

        if (text.length < 100) {
          return res.status(400).json({
            error:
              "Could not extract enough text from the file (minimum 100 characters).",
          });
        }

        res.json({ text, filename: originalname });
      } catch (error) {
        console.error("Error extracting text:", error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : "Failed to extract text from file",
        });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}
