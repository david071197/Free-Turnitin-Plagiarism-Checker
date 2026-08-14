import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";

const ParaphraseSuggestions = ({
  fragment,
  reason,
  source,
  testId,
  onReplace,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const handleClick = async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/paraphrase",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: fragment,
            reason,
            source,
          }),
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body.error || "No se pudo generar sugerencias"
        );
      }
      setData(body);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-current/20">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isLoading}
        data-testid={`button-paraphrase-${testId}`}
        onClick={handleClick}
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="mr-2 h-4 w-4" />
        )}
        Cómo reescribir esto
      </Button>

      {error && (
        <p
          className="text-xs text-red-600 mt-2"
          data-testid={`text-paraphrase-error-${testId}`}
        >
          {error}
        </p>
      )}

      {data && (
        <div className="mt-3 space-y-2">
          {data.options.map((option, idx) => (
            <div
              key={idx}
              className="p-3 rounded-md bg-background/70 border"
              data-testid={
                `paraphrase-option-${testId}-${idx}`
              }
            >
              <p className="text-xs font-medium mb-1">
                {option.label}
              </p>
              <p className="text-sm whitespace-pre-line">
                {option.text}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                data-testid={
                  `button-use-paraphrase-` +
                  `${testId}-${idx}`
                }
                onClick={() => onReplace(option.text)}
              >
                Reemplazar en mi texto
              </Button>
            </div>
          ))}

          {data.guide?.length > 0 && (
            <ul className="text-xs list-disc pl-5 space-y-1 text-muted-foreground">
              {data.guide.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          {data.tip && (
            <p className="text-xs text-muted-foreground">
              {data.tip}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ParaphraseSuggestions;
