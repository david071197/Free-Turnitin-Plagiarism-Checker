const OPENAI_URL =
  "https://api.openai.com/v1/chat/completions";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const TIMEOUT_MS = 25000;

export function isParaphraseEnabled() {
  return Boolean(process.env.OPENAI_API_KEY);
}

const PROMPTS = {
  plagio:
    "El fragmento coincide con fuentes publicadas. " +
    "Reescríbelo con estructura y vocabulario " +
    "propios, conservando el significado y los datos.",
  ia:
    "El fragmento parece generado por IA. " +
    "Reescríbelo con estilo humano: varía la longitud " +
    "de las oraciones y elimina frases plantilla " +
    "como 'es importante destacar' o 'en conclusión'.",
};

function buildMessages(text, reason) {
  return [
    {
      role: "system",
      content:
        "Eres un editor académico. Devuelves JSON " +
        '{"options":["..."],"tip":"..."} con tres ' +
        "reescrituras en el mismo idioma del texto, " +
        "sin inventar datos ni añadir citas falsas. " +
        "'tip' es un consejo breve de una frase.",
    },
    {
      role: "user",
      content:
        `${PROMPTS[reason]}\n\nFragmento:\n"""${text}"""`,
    },
  ];
}

function parseOptions(content) {
  const parsed = JSON.parse(content);
  const options = Array.isArray(parsed.options)
    ? parsed.options
        .filter((o) => typeof o === "string")
        .map((o) => o.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    options,
    tip: typeof parsed.tip === "string" ? parsed.tip : "",
  };
}

// Asks OpenAI for rewrites of a flagged fragment. The
// caller decides whether to use them; nothing is
// rewritten automatically.
export async function paraphrase(text, reason) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS
  );

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.8,
        response_format: { type: "json_object" },
        messages: buildMessages(text, reason),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenAI ${response.status}: ` +
          detail.slice(0, 300)
      );
    }

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content || "{}";

    return parseOptions(content);
  } finally {
    clearTimeout(timeoutId);
  }
}
