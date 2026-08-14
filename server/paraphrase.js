// Rule-based rewriting help: no external API and no
// cost. The suggestions are drafts the user edits, not
// a guarantee of originality.

// Matched at the start of the fragment or after a
// sentence end, with optional accents so text copied
// from PDFs also matches.
const FILLER_SOURCES = [
  "es importante (destacar|se[ñn]alar|mencionar) que",
  "cabe (destacar|se[ñn]alar|mencionar) que",
  "en conclusi[oó]n,?",
  "en resumen,?",
  "en este sentido,?",
  "adicionalmente,?",
  "por otra parte,?",
  "it is important to note that",
  "in conclusion,?",
];

const FILLERS = FILLER_SOURCES.map(
  (source) =>
    new RegExp(`(^|\\.\\s+)${source}\\s+`, "gi")
);

const SWAPS = [
  [/\badem[áa]s\b/gi, "también"],
  [/\bpor lo tanto\b/gi, "por eso"],
  [/\bno obstante\b/gi, "pero"],
  [/\basimismo\b/gi, "igualmente"],
  [/\bcon el fin de\b/gi, "para"],
  [/\bdebido a que\b/gi, "porque"],
  [/\ben la actualidad\b/gi, "hoy"],
  [/\buna gran cantidad de\b/gi, "muchos"],
  [/\b(es capaz de|tiene la capacidad de)\b/gi, "puede"],
  [/\bjuega un papel importante en\b/gi, "influye en"],
  [/\bde manera notable\b/gi, "notablemente"],
  [/\brealizar un an[áa]lisis de\b/gi, "analizar"],
  [/\bllevar a cabo\b/gi, "hacer"],
];

const CONNECTORS =
  /,\s+(y|pero|mientras que|aunque|lo que)\s+/i;

function upperFirst(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function fixSentenceCase(text) {
  return text.replace(
    /(^|\.\s+)([a-záéíóúüñ])/g,
    (_, prefix, letter) =>
      prefix + letter.toUpperCase()
  );
}

function stripFillers(text) {
  let out = text;
  for (const re of FILLERS) {
    out = out.replace(re, "$1");
  }
  return fixSentenceCase(out.trim());
}

function applySwaps(text) {
  let out = text;
  for (const [re, word] of SWAPS) {
    out = out.replace(re, word);
  }
  return out;
}

// Breaks one long sentence in two at a connector, the
// main tell of AI-flavoured uniform prose.
function splitLong(text) {
  if (text.split(/\s+/).length < 26) return "";

  const match = text.match(CONNECTORS);
  if (!match) return "";

  const at = text.indexOf(match[0]);
  const head = text.slice(0, at).trim();
  const tail = text.slice(at + match[0].length).trim();
  if (head.length < 40 || tail.length < 40) return "";

  return `${head}. ${upperFirst(tail)}`;
}

function hostOf(source) {
  if (!source) return "";
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function citationOptions(text, source) {
  const host = hostOf(source);
  const author = host || "Autor";
  const clean = text.replace(/\s+$/, "");

  return [
    {
      label: "Cita textual con referencia",
      text:
        `"${clean}" (${author}, año, p. X).` +
        (source ? `\nFuente: ${source}` : ""),
    },
    {
      label: "Paráfrasis con atribución",
      text:
        `Según ${author} (año), ` +
        `${lowerFirst(clean)}`,
    },
  ];
}

function rewriteOptions(text) {
  const options = [];
  const simpler = fixSentenceCase(
    applySwaps(stripFillers(text))
  );

  if (simpler !== text) {
    options.push({
      label: "Reescritura con lenguaje directo",
      text: simpler,
    });
  }

  const split = splitLong(simpler);
  if (split) {
    options.push({
      label: "Dividida en dos oraciones",
      text: split,
    });
  }

  return options;
}

const TIPS = {
  plagio:
    "Si la idea no es tuya, cita la fuente; si la " +
    "reescribes, cambia la estructura, no solo " +
    "palabras sueltas.",
  ia:
    "Varía la longitud de las oraciones, evita frases " +
    "plantilla y añade ejemplos o datos propios.",
};

const GUIDES = {
  plagio: [
    "Explica la idea con tus palabras sin mirar el " +
      "original.",
    "Cambia el orden: empieza por la conclusión.",
    "Añade tu interpretación o un dato del contexto.",
  ],
  ia: [
    "Mezcla oraciones cortas y largas.",
    "Quita conectores de relleno repetidos.",
    "Incluye un ejemplo concreto de tu trabajo.",
  ],
};

export function paraphrase(text, reason, source) {
  const clean = text.replace(/\s+/g, " ").trim();
  const options = rewriteOptions(clean);

  if (reason === "plagio") {
    options.push(...citationOptions(clean, source));
  }

  return {
    options: options.slice(0, 4),
    guide: GUIDES[reason],
    tip: TIPS[reason],
  };
}
