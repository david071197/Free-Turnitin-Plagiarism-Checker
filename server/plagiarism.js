export function calculateSimilarity(text1, text2) {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);

  const allWords = [...new Set([...words1, ...words2])];

  const vector1 = allWords.map((word) => words1.filter((w) => w === word).length);
  const vector2 = allWords.map((word) => words2.filter((w) => w === word).length);

  const dotProduct = vector1.reduce((sum, val, i) => sum + val * vector2[i], 0);
  const magnitude1 = Math.sqrt(vector1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vector2.reduce((sum, val) => sum + val * val, 0));

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  return dotProduct / (magnitude1 * magnitude2);
}

export async function searchWeb(query) {
  const urls = [];

  try {
    const searchQuery = encodeURIComponent(query.slice(0, 200));
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${searchQuery}`;

    const response = await fetch(ddgUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const html = await response.text();

    const resultMatches = html.match(/uddg=([^"&]+)/g) || [];
    const ddgUrls = resultMatches
      .map((match) => {
        const encoded = match.replace("uddg=", "");
        try {
          return decodeURIComponent(encoded);
        } catch {
          return null;
        }
      })
      .filter(
        (url) => url && url.startsWith("http") && !url.includes("duckduckgo.com")
      )
      .slice(0, 8);

    urls.push(...ddgUrls.filter(url => url !== null));
  } catch (error) {
    console.error("DuckDuckGo search error:", error);
  }

  try {
    const searchQuery = encodeURIComponent(query.slice(0, 150));
    const crossrefUrl = `https://api.crossref.org/works?query=${searchQuery}&rows=5`;

    const response = await fetch(crossrefUrl);
    const data = await response.json();

    if (data.message?.items) {
      for (const item of data.message.items) {
        if (item.URL) {
          urls.push(item.URL);
        }
      }
    }
  } catch (error) {
    console.error("CrossRef search error:", error);
  }

  return [...new Set(urls)].slice(0, 10);
}

export async function fetchPageContent(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`Failed to fetch ${url}: ${response.status}`);
      return "";
    }

    const html = await response.text();

    let text = html
      .replace(/<script[^>]*>.*?<\/script>/gis, "")
      .replace(/<style[^>]*>.*?<\/style>/gis, "")
      .replace(/<nav[^>]*>.*?<\/nav>/gis, "")
      .replace(/<header[^>]*>.*?<\/header>/gis, "")
      .replace(/<footer[^>]*>.*?<\/footer>/gis, "")
      .replace(/<aside[^>]*>.*?<\/aside>/gis, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.slice(0, 5000);
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    return "";
  }
}

const pageCache = new Map();

export async function fetchPageContentCached(url) {
  if (pageCache.has(url)) return pageCache.get(url);
  const content = await fetchPageContent(url);
  if (content) {
    if (pageCache.size > 500) pageCache.clear();
    pageCache.set(url, content);
  }
  return content;
}

export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

const AI_PHRASES = [
  "in conclusion",
  "furthermore",
  "moreover",
  "it is important to note",
  "it is worth noting",
  "delve into",
  "in today's world",
  "in the realm of",
  "plays a crucial role",
  "a testament to",
  "navigating the",
  "the landscape of",
  "leverage",
  "additionally",
  "overall",
  "ultimately",
  "significantly",
  "comprehensive",
  "seamlessly",
  "en conclusión",
  "además",
  "es importante destacar",
  "cabe destacar",
  "en resumen",
  "por otro lado",
  "sin embargo",
  "juega un papel crucial",
  "en el mundo actual",
  "en el ámbito de",
];

export function detectAI(text) {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (sentences.length < 2) {
    return { aiScore: 0, indicators: [] };
  }

  const lengths = sentences.map(
    (s) => s.split(/\s+/).length
  );
  const mean =
    lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce(
      (sum, l) => sum + (l - mean) ** 2,
      0
    ) / lengths.length;
  const stdDev = Math.sqrt(variance);
  const burstiness = mean > 0 ? stdDev / mean : 0;

  const words = text
    .toLowerCase()
    .replace(/[^\wáéíóúüñ\s]/gi, "")
    .split(/\s+/)
    .filter(Boolean);
  const uniqueRatio =
    words.length > 0
      ? new Set(words).size / words.length
      : 0;

  const lowerText = text.toLowerCase();
  let phraseHits = 0;
  const foundPhrases = [];
  for (const phrase of AI_PHRASES) {
    const matches = lowerText.split(phrase).length - 1;
    if (matches > 0) {
      phraseHits += matches;
      foundPhrases.push(phrase);
    }
  }
  const phraseDensity =
    sentences.length > 0
      ? phraseHits / sentences.length
      : 0;

  // Low burstiness (uniform sentence lengths),
  // low vocabulary diversity, and high density of
  // formulaic transitions correlate with AI text.
  const burstinessScore = Math.max(
    0,
    Math.min(1, (0.55 - burstiness) / 0.55)
  );
  const diversityScore = Math.max(
    0,
    Math.min(1, (0.62 - uniqueRatio) / 0.35)
  );
  const phraseScore = Math.min(1, phraseDensity * 2.5);

  const aiScore = Math.round(
    (burstinessScore * 0.4 +
      diversityScore * 0.25 +
      phraseScore * 0.35) *
      100
  );

  const indicators = [];
  if (burstinessScore > 0.5) {
    indicators.push(
      "Longitud de oraciones muy uniforme"
    );
  }
  if (diversityScore > 0.5) {
    indicators.push("Baja diversidad de vocabulario");
  }
  if (phraseScore > 0.3) {
    indicators.push(
      `Frases típicas de IA: ${foundPhrases
        .slice(0, 5)
        .join(", ")}`
    );
  }

  return { aiScore, indicators };
}

export function nGramSimilarity(text1, text2, n = 5) {
  const createNGrams = (text) => {
    const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/);
    const ngrams = new Set();
    for (let i = 0; i <= words.length - n; i++) {
      ngrams.add(words.slice(i, i + n).join(" "));
    }
    return ngrams;
  };

  const ngrams1 = createNGrams(text1);
  const ngrams2 = createNGrams(text2);

  if (ngrams1.size === 0 || ngrams2.size === 0) return 0;

  let matches = 0;
  for (const gram of ngrams1) {
    if (ngrams2.has(gram)) matches++;
  }

  return matches / Math.max(ngrams1.size, ngrams2.size);
}
