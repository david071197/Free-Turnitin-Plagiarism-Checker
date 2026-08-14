import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Wand2 } from "lucide-react";

const ParaphraseSuggestions = ({
  fragment,
  reason,
  testId,
  onReplace,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [options, setOptions] = useState([]);
  const [tip, setTip] = useState("");
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
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "No se pudo parafrasear"
        );
      }
      setOptions(data.options);
      setTip(data.tip || "");
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
        {options.length > 0
          ? "Otras sugerencias"
          : "Sugerir reescritura"}
      </Button>

      {error && (
        <p
          className="text-xs text-red-600 mt-2"
          data-testid={`text-paraphrase-error-${testId}`}
        >
          {error}
        </p>
      )}

      {options.length > 0 && (
        <div className="mt-3 space-y-2">
          {options.map((option, idx) => (
            <div
              key={idx}
              className="p-3 rounded-md bg-background/70 border"
              data-testid={
                `paraphrase-option-${testId}-${idx}`
              }
            >
              <p className="text-sm">{option}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="mt-2"
                data-testid={
                  `button-use-paraphrase-` +
                  `${testId}-${idx}`
                }
                onClick={() => onReplace(option)}
              >
                Reemplazar en mi texto
              </Button>
            </div>
          ))}
          {tip && (
            <p className="text-xs text-muted-foreground">
              {tip}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ParaphraseSuggestions;
