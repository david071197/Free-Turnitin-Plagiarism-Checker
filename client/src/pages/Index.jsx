import {
  useState,
  useRef,
  useEffect,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  FileSearch,
  AlertCircle,
  Upload,
  Bot,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { checkTextSchema } from "../../../shared/schema";
import ParaphraseSuggestions from "@/components/ParaphraseSuggestions";

const DEPTH_OPTIONS = [
  {
    value: "fast",
    label: "Rápido",
    hint: "hasta 20 oraciones",
  },
  {
    value: "normal",
    label: "Normal",
    hint: "hasta 60 oraciones",
  },
  {
    value: "deep",
    label: "Profundo",
    hint: "hasta 150 oraciones",
  },
  {
    value: "full",
    label: "Documento completo",
    hint: "todas las oraciones, en segundo plano",
  },
];

const POLL_MS = 3000;

const formatEta = (seconds) => {
  if (seconds == null) return "calculando...";
  if (seconds < 60) return `${seconds} s`;

  const minutes = Math.round(seconds / 60);
  return `${minutes} min`;
};

const FILTERS = [
  { value: "all", label: "Todo" },
  { value: "plagio", label: "Solo plagio" },
  { value: "ia", label: "Solo IA" },
  { value: "clean", label: "Limpio" },
];

const matchesFilter = (item, filter) => {
  if (filter === "plagio") return item.isPlagiarized;
  if (filter === "ia") return item.isAiGenerated;
  if (filter === "clean") {
    return !item.isPlagiarized && !item.isAiGenerated;
  }
  return true;
};

const Index = () => {
  const [text, setText] = useState("");
  const [depth, setDepth] = useState("normal");
  const [filter, setFilter] = useState("all");
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [scan, setScan] = useState(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);
  const {
    toast
  } = useToast();
  const replaceFragment = (fragment, rewrite) => {
    setText((current) =>
      current.replace(fragment, rewrite)
    );
    toast({
      title: "Texto actualizado",
      description:
        "Vuelve a analizar para ver el nuevo " +
        "porcentaje.",
    });
  };

  useEffect(
    () => () => clearTimeout(pollRef.current),
    []
  );

  const pollScan = async (jobId) => {
    try {
      const response = await fetch(
        `/api/plagiarism-scan/${jobId}`
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "Scan not found"
        );
      }

      setScan(data);
      if (data.report.totalSentences > 0) {
        setResult(data.report);
      }

      if (data.status === "running") {
        pollRef.current = setTimeout(
          () => pollScan(jobId),
          POLL_MS
        );
        return;
      }

      setIsChecking(false);
      toast({
        title:
          data.status === "completed"
            ? "Escaneo completo"
            : "Escaneo detenido",
        description:
          `Analizadas ${data.done} de ${data.total} ` +
          "oraciones.",
      });
    } catch (error) {
      setIsChecking(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const startFullScan = async () => {
    setIsChecking(true);
    setResult(null);
    setScan(null);
    try {
      const response = await fetch(
        "/api/plagiarism-scan",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo iniciar el escaneo"
        );
      }

      setFilter("all");
      setScan({
        jobId: data.jobId,
        status: "running",
        done: 0,
        total: data.total,
        etaSeconds: null,
      });
      pollScan(data.jobId);
    } catch (error) {
      setIsChecking(false);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const cancelScan = async () => {
    clearTimeout(pollRef.current);
    if (scan?.jobId) {
      await fetch(
        `/api/plagiarism-scan/${scan.jobId}`,
        { method: "DELETE" }
      ).catch(() => {});
      pollScan(scan.jobId);
    }
  };

  const handleCheck = async () => {
    if (!text.trim()) {
      toast({
        title: "Error",
        description: "Please enter some text to check",
        variant: "destructive"
      });
      return;
    }

    // Validate using Zod schema
    const validation = checkTextSchema.safeParse({ text });
    if (!validation.success) {
      const errorMessage = validation.error.errors[0]?.message || "Validation failed";
      toast({
        title: "Validation Error",
        description: errorMessage,
        variant: "destructive"
      });
      return;
    }

    if (depth === "full") {
      startFullScan();
      return;
    }

    setIsChecking(true);
    setResult(null);
    setScan(null);
    try {
      const response = await fetch('/api/plagiarism-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          depth
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Failed to check plagiarism"
        );
      }
      setResult(data);
      setFilter("all");
      toast({
        title: "Check Complete",
        description: `Plagiarism score: ${data.plagiarismPercentage}%`
      });
    } catch (error) {
      console.error('Error checking plagiarism:', error);
      toast({
        title: "Error",
        description:
          error.message ||
          "Failed to check plagiarism. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsChecking(false);
    }
  };
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setFileName("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        "/api/extract-text",
        {
          method: "POST",
          body: formData,
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "Failed to extract text"
        );
      }
      setText(data.text);
      setFileName(data.filename);
      setResult(null);
      toast({
        title: "File Loaded",
        description:
          `Extracted ${data.text.length} characters ` +
          `from ${data.filename}`,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      toast({
        title: "Upload Error",
        description:
          error.message ||
          "Failed to extract text from file",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  const getScoreColor = score => {
    if (score < 20) return "text-green-600 dark:text-green-400";
    if (score < 50) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };
  return <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <FileSearch className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Academic Plagiarism Checker
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Free plagiarism detection using advanced web scraping and text similarity algorithms
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Card className="shadow-xl border-2" data-testid="card-input">
            <CardHeader>
              <CardTitle>Enter Your Text</CardTitle>
              <CardDescription>
                Paste your text below or upload a PDF,
                Word (.docx) or TXT file to check for
                plagiarism and AI-generated content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="input-file"
                />
                <Button
                  variant="outline"
                  data-testid="button-upload-file"
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  disabled={isUploading || isChecking}
                >
                  {isUploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {isUploading
                    ? "Extracting..."
                    : "Upload PDF / Word / TXT"}
                </Button>
                {fileName && (
                  <span
                    className="text-sm text-muted-foreground"
                    data-testid="text-file-name"
                  >
                    {fileName}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Profundidad del análisis
                </p>
                <div className="flex gap-2 flex-wrap">
                  {DEPTH_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      data-testid={
                        `button-depth-${option.value}`
                      }
                      variant={
                        depth === option.value
                          ? "default"
                          : "outline"
                      }
                      disabled={isChecking}
                      onClick={() =>
                        setDepth(option.value)
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {depth === "full"
                    ? "Analiza el 100% del documento en " +
                      "segundo plano con progreso; tarda " +
                      "varios minutos según su tamaño."
                    : "Las oraciones se reparten por " +
                      "todo el documento, no solo al " +
                      "inicio ("}
                  {depth !== "full" &&
                    `${
                      DEPTH_OPTIONS.find(
                        (o) => o.value === depth
                      ).hint
                    }).`}
                </p>
              </div>
              <Textarea data-testid="input-text" placeholder="Paste your text here (minimum 100 characters)..." value={text} onChange={e => setText(e.target.value)} className="min-h-[200px] text-base" />
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground" data-testid="text-character-count">
                  {text.length} characters
                </p>
                <Button data-testid="button-check-plagiarism" onClick={handleCheck} disabled={isChecking || text.length < 100} size="lg">
                  {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isChecking ? "Checking..." : "Check Plagiarism"}
                </Button>
              </div>

              {isChecking && !scan && <Alert data-testid="alert-checking">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Analyzing your text against web sources in parallel, this usually takes a few seconds...
                  </AlertDescription>
                </Alert>}

              {scan && (
                <div
                  className="space-y-2"
                  data-testid="scan-progress"
                >
                  <Progress
                    value={
                      (scan.done / scan.total) * 100
                    }
                    className="h-2"
                  />
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm text-muted-foreground">
                      Analizadas {scan.done} de{" "}
                      {scan.total} oraciones
                      {scan.status === "running" && (
                        <>
                          {" · quedan ~"}
                          {formatEta(scan.etaSeconds)}
                        </>
                      )}
                    </p>
                    {scan.status === "running" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid="button-cancel-scan"
                        onClick={cancelScan}
                      >
                        Detener y ver lo analizado
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Puedes dejar esta pestaña abierta: los
                    resultados se actualizan solos.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {result && <div className="mt-8 space-y-6">
              <Card className="shadow-xl border-2 border-red-200 dark:border-red-900" data-testid="card-report">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSearch className="h-5 w-5 text-red-600" />
                    Plagio (copiado de la web)
                  </CardTitle>
                  <CardDescription>
                    Fragmentos que coinciden con páginas
                    o artículos publicados.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="text-center p-6 bg-secondary rounded-md">
                      <p className="text-sm text-muted-foreground mb-2">
                        Fragmentos con plagio
                      </p>
                      <p className={`text-5xl font-bold ${getScoreColor(result.plagiarismPercentage)}`} data-testid="text-plagiarism-percentage">
                        {result.plagiarismPercentage}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.plagiarizedSentences} de{" "}
                        {result.totalSentences} analizados
                      </p>
                    </div>
                    <div className="text-center p-6 bg-secondary rounded-md">
                      <p className="text-sm text-muted-foreground mb-2">
                        Similitud promedio
                      </p>
                      <p className={`text-5xl font-bold ${getScoreColor(result.overallScore)}`} data-testid="text-overall-score">
                        {result.overallScore}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Parecido medio con las fuentes
                      </p>
                    </div>
                  </div>

                  <Progress value={result.plagiarizedSentences / result.totalSentences * 100} className="h-2" />

                  {result.coverage && (
                    <Alert data-testid="alert-coverage">
                      <FileSearch className="h-4 w-4" />
                      <AlertDescription>
                        Analizadas{" "}
                        {
                          result.coverage
                            .analyzedSentences
                        }{" "}
                        de{" "}
                        {
                          result.coverage
                            .documentSentences
                        }{" "}
                        oraciones (
                        {
                          result.coverage
                            .coveragePercentage
                        }
                        % del documento).{" "}
                        {result.coverage.sampled
                          ? "Muestreo repartido de " +
                            "principio a fin; usa " +
                            "Documento completo para " +
                            "analizarlo todo."
                          : "Documento completo."}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-between text-sm">
                    <span>Fragmentos analizados</span>
                    <span className="font-semibold" data-testid="text-total-sentences">{result.totalSentences}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Fragmentos con plagio</span>
                    <span className="font-semibold text-red-600 dark:text-red-400" data-testid="text-plagiarized-sentences">{result.plagiarizedSentences}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-xl border-2 border-purple-200 dark:border-purple-900" data-testid="card-ai-report">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5 text-purple-600" />
                    Contenido generado por IA
                  </CardTitle>
                  <CardDescription>
                    Estimación heurística (uniformidad de
                    oraciones, vocabulario y frases
                    plantilla). No es una prueba: no
                    busca coincidencias en la web.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="text-center p-6 bg-purple-50 dark:bg-purple-950/20 rounded-md">
                      <p className="text-sm text-muted-foreground mb-2">
                        Probabilidad global de IA
                      </p>
                      <p className={`text-5xl font-bold ${getScoreColor(result.aiScore ?? 0)}`} data-testid="text-ai-score">
                        {result.aiScore ?? 0}%
                      </p>
                    </div>
                    <div className="text-center p-6 bg-purple-50 dark:bg-purple-950/20 rounded-md">
                      <p className="text-sm text-muted-foreground mb-2">
                        Fragmentos marcados como IA
                      </p>
                      <p className={`text-5xl font-bold ${getScoreColor(result.aiSentencePercentage ?? 0)}`} data-testid="text-ai-sentence-percentage">
                        {result.aiSentencePercentage ?? 0}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.aiSentences ?? 0} de{" "}
                        {result.totalSentences} analizados
                      </p>
                    </div>
                  </div>

                  {result.aiIndicators?.length > 0 && (
                    <Alert data-testid="alert-ai-indicators">
                      <Bot className="h-4 w-4" />
                      <AlertDescription>
                        <span className="font-semibold">
                          Indicadores de IA:
                        </span>{" "}
                        {result.aiIndicators.join(" · ")}
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-xl border-2" data-testid="card-details">
                <CardHeader>
                  <CardTitle>Detalle por fragmento</CardTitle>
                  <CardDescription>
                    Cada fragmento lleva su etiqueta:
                    rojo = plagio con fuentes, violeta =
                    posible IA.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 flex-wrap mb-4">
                    {FILTERS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        data-testid={
                          `button-filter-${option.value}`
                        }
                        variant={
                          filter === option.value
                            ? "default"
                            : "outline"
                        }
                        onClick={() =>
                          setFilter(option.value)
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-4">
                    {result.results.filter((item) => matchesFilter(item, filter)).map((item, index) => <div key={index} data-testid={`result-sentence-${index}`} className={`p-4 rounded-md border-2 ${item.isPlagiarized ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" : item.isAiGenerated ? "bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-900" : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900"}`}>
                        <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                          <p className="text-sm font-medium flex-1" data-testid={`text-sentence-${index}`}>{item.sentence}</p>
                          <div className="flex items-center gap-2">
                            <span data-testid={`badge-similarity-${index}`} className={`px-3 py-1 rounded-full text-sm font-bold ${item.isPlagiarized ? "bg-red-600 text-white" : "bg-green-600 text-white"}`}>
                              Plagio {item.similarity}%
                            </span>
                            {item.aiScore !== undefined && (
                              <span data-testid={`badge-ai-${index}`} className={`px-3 py-1 rounded-full text-sm font-bold ${item.isAiGenerated ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"}`}>
                                IA {item.aiScore}%
                              </span>
                            )}
                          </div>
                        </div>
                        {item.isAiGenerated && item.aiIndicators?.length > 0 && (
                          <p className="text-xs text-purple-700 dark:text-purple-300 mb-2" data-testid={`text-ai-indicators-${index}`}>
                            {item.aiIndicators.join(" · ")}
                          </p>
                        )}
                        {(item.isPlagiarized ||
                          item.isAiGenerated) && (
                            <ParaphraseSuggestions
                              fragment={item.sentence}
                              testId={index}
                              source={
                                item.sources[0]?.url
                              }
                              reason={
                                item.isPlagiarized
                                  ? "plagio"
                                  : "ia"
                              }
                              onReplace={(rewrite) =>
                                replaceFragment(
                                  item.sentence,
                                  rewrite
                                )
                              }
                            />
                          )}
                        {item.sources.length > 0 && <div className="mt-2 pt-2 border-t border-current/20">
                            <p className="text-xs font-semibold mb-1">Fuentes posibles:</p>
                            <div className="space-y-1">
                              {item.sources.map((source, idx) => <div key={idx} className="flex items-start gap-2">
                                  <a href={source.url} target="_blank" rel="noopener noreferrer" data-testid={`link-source-${index}-${idx}`} className={`flex-1 text-xs hover:underline truncate ${source.similarity >= 50 ? "text-red-600 dark:text-red-400 font-semibold" : "text-orange-600 dark:text-orange-400"}`}>
                                    {source.url}
                                  </a>
                                  <span className={`text-xs font-bold ${source.similarity >= 50 ? "text-red-600 dark:text-red-400" : "text-orange-600 dark:text-orange-400"}`} data-testid={`text-source-similarity-${index}-${idx}`}>
                                    {source.similarity}%
                                  </span>
                                </div>)}
                            </div>
                          </div>}
                      </div>)}
                  </div>
                </CardContent>
              </Card>
            </div>}
        </div>
      </div>
    </div>;
};
export default Index;