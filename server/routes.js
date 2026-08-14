import { createServer } from "http";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import {
  checkTextSchema,
  paraphraseSchema,
  DEPTH_LIMITS,
} from "../shared/schema.js";
import {
  paraphrase,
  isParaphraseEnabled,
} from "./paraphrase.js";
import {
  calculateSimilarity,
  searchWeb,
  fetchPageContentCached,
  nGramSimilarity,
  mapWithConcurrency,
  detectAI,
  splitSentences,
  sampleIndices,
  detectAIByWindow,
} from "./plagiarism.js";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];

// The API routes are unauthenticated and expensive
// (in-memory parsing, outbound fetches, LLM calls),
// so a simple per-IP fixed window limits abuse.
const RATE_WINDOW_MS = 60 * 1000;

function createRateLimit(maxRequests) {
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || "unknown";
    const entry = hits.get(key);

    if (!entry || now > entry.resetAt) {
      hits.set(key, {
        count: 1,
        resetAt: now + RATE_WINDOW_MS,
      });
      if (hits.size > 10000) {
        for (const [k, v] of hits) {
          if (now > v.resetAt) hits.delete(k);
        }
      }
      return next();
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil(
        (entry.resetAt - now) / 1000
      );
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        error:
          "Too many requests. Please wait a moment " +
          "and try again.",
      });
    }

    return next();
  };
}

const rateLimit = createRateLimit(10);
// Paraphrasing is a single short LLM call, so it gets
// a wider window than the scan endpoints.
const paraphraseRateLimit = createRateLimit(30);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const ok = ALLOWED_EXTENSIONS.some((ext) =>
      name.endsWith(ext)
    );
    if (ok) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Unsupported file type. Use PDF, DOCX or TXT."
        )
      );
    }
  },
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
  app.post(
    "/api/plagiarism-check",
    rateLimit,
    async (req, res) => {
      try {
        const { text, depth } =
          checkTextSchema.parse(req.body);

        const sentences = splitSentences(text);
        const indices = sampleIndices(
          sentences.length,
          DEPTH_LIMITS[depth]
        );
        const toCheck = indices.map(
          (i) => sentences[i]
        );

        console.log(
          `Plagiarism check: ${text.length} chars, ` +
            `${toCheck.length}/${sentences.length} ` +
            `sentences (depth ${depth})`
        );

        if (toCheck.length === 0) {
          return res.status(400).json({
            error:
              "No analyzable sentences found. Please provide longer sentences.",
          });
        }

        const aiByWindow = detectAIByWindow(sentences);

        const results = await mapWithConcurrency(
          toCheck,
          4,
          async (sentence, i) => {
            const analysis = await analyzeSentence(
              sentence
            );
            const ai = aiByWindow[indices[i]];

            return {
              ...analysis,
              aiScore: ai.aiScore,
              aiIndicators: ai.indicators,
              isAiGenerated: ai.aiScore >= 60,
            };
          }
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
        const aiCount = results.filter(
          (r) => r.isAiGenerated
        ).length;
        const aiSentencePercentage = Math.round(
          (aiCount / results.length) * 100
        );

        const aiAnalysis = detectAI(text);

        const checkResult = {
          coverage: {
            documentSentences: sentences.length,
            analyzedSentences: results.length,
            coveragePercentage: Math.round(
              (results.length / sentences.length) * 100
            ),
            sampled:
              results.length < sentences.length,
            depth,
          },
          overallScore,
          plagiarismPercentage,
          totalSentences: results.length,
          plagiarizedSentences: plagiarizedCount,
          aiScore: aiAnalysis.aiScore,
          aiIndicators: aiAnalysis.indicators,
          aiSentences: aiCount,
          aiSentencePercentage,
          results,
        };

        res.json(checkResult);
      } catch (error) {
        console.error("Error in plagiarism check:", error);
        if (error?.name === "ZodError") {
          return res.status(400).json({
            error:
              error.errors?.[0]?.message ||
              "Invalid request",
          });
        }
        res.status(500).json({
          error: "Failed to check plagiarism",
        });
      }
    }
  );

  const handleUpload = (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "File too large. Maximum size is 15 MB."
            : err.message ||
              "File upload failed";
        return res
          .status(400)
          .json({ error: message });
      }
      next();
    });
  };

  app.post(
    "/api/extract-text",
    rateLimit,
    handleUpload,
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
          try {
            const result = await parser.getText();
            text = result.text || "";
          } finally {
            await parser.destroy();
          }
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
          error: "Failed to extract text from file",
        });
      }
    }
  );

  app.get("/api/features", (req, res) => {
    res.json({ paraphrase: isParaphraseEnabled() });
  });

  app.post(
    "/api/paraphrase",
    paraphraseRateLimit,
    async (req, res) => {
      try {
        if (!isParaphraseEnabled()) {
          return res.status(503).json({
            error:
              "Paraphrasing is not configured. Set " +
              "OPENAI_API_KEY on the server.",
          });
        }

        const { text, reason } =
          paraphraseSchema.parse(req.body);
        const result = await paraphrase(text, reason);

        if (result.options.length === 0) {
          return res.status(502).json({
            error:
              "The model returned no suggestions. " +
              "Please try again.",
          });
        }

        res.json(result);
      } catch (error) {
        console.error("Error paraphrasing:", error);
        if (error?.name === "ZodError") {
          return res.status(400).json({
            error:
              error.errors?.[0]?.message ||
              "Invalid request",
          });
        }
        res.status(502).json({
          error: "Failed to generate suggestions",
        });
      }
    }
  );

  const httpServer = createServer(app);
  return httpServer;
}
