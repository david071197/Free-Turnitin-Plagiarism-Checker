import { randomUUID } from "crypto";
import { detectAIByWindow } from "./plagiarism.js";
import { buildReport } from "./report.js";

// A full-document scan needs one web search per
// sentence (~2-4 s each), so it cannot run inside an
// HTTP request. Jobs live in memory: they are lost on
// restart and the client polls for progress.
export const MAX_SENTENCES = 3000;
export const MAX_RUNNING_JOBS = 2;
const CONCURRENCY = 4;
const JOB_TTL_MS = 30 * 60 * 1000;

const jobs = new Map();

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const age = now - (job.finishedAt || job.startedAt);
    if (job.status !== "running" && age > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

export function runningJobCount() {
  let count = 0;
  for (const job of jobs.values()) {
    if (job.status === "running") count += 1;
  }
  return count;
}

async function processJob(job, analyzeSentence) {
  const aiByWindow = detectAIByWindow(job.sentences);
  let next = 0;

  const worker = async () => {
    while (next < job.sentences.length) {
      if (job.cancelled) return;

      const index = next;
      next += 1;

      try {
        const analysis = await analyzeSentence(
          job.sentences[index]
        );
        const ai = aiByWindow[index];

        job.results[index] = {
          ...analysis,
          aiScore: ai.aiScore,
          aiIndicators: ai.indicators,
          isAiGenerated: ai.aiScore >= 60,
        };
      } catch (error) {
        console.error(
          `Scan ${job.id}: sentence ${index} failed`,
          error
        );
      }

      job.done += 1;
    }
  };

  await Promise.all(
    Array.from({ length: CONCURRENCY }, worker)
  );
}

export function createJob(text, sentences, analyzeSentence) {
  pruneJobs();

  const job = {
    id: randomUUID(),
    text,
    sentences,
    // Sparse until every sentence finishes, so results
    // keep document order instead of finish order.
    results: new Array(sentences.length),
    done: 0,
    total: sentences.length,
    status: "running",
    cancelled: false,
    startedAt: Date.now(),
    finishedAt: null,
    error: null,
  };

  jobs.set(job.id, job);

  processJob(job, analyzeSentence)
    .then(() => {
      job.status = job.cancelled
        ? "cancelled"
        : "completed";
    })
    .catch((error) => {
      console.error(`Scan ${job.id} failed`, error);
      job.status = "failed";
      job.error = "Scan failed";
    })
    .finally(() => {
      job.finishedAt = Date.now();
    });

  return job;
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return false;

  job.cancelled = true;
  return true;
}

function etaSeconds(job) {
  if (job.done === 0 || job.status !== "running") {
    return null;
  }

  const elapsed = Date.now() - job.startedAt;
  const perSentence = elapsed / job.done;
  const remaining = job.total - job.done;

  return Math.round((perSentence * remaining) / 1000);
}

// Progress plus a report over whatever finished so far,
// so the UI can show partial numbers while scanning.
export function getJobSnapshot(id) {
  const job = jobs.get(id);
  if (!job) return null;

  return {
    jobId: job.id,
    status: job.status,
    done: job.done,
    total: job.total,
    etaSeconds: etaSeconds(job),
    error: job.error,
    report: buildReport({
      text: job.text,
      documentSentences: job.sentences.length,
      results: job.results.filter(Boolean),
      depth: "full",
    }),
  };
}
