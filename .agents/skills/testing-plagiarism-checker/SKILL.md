---
name: testing-plagiarism-checker
description: How to run and end-to-end test the Free Turnitin Plagiarism Checker (Express + Vite) locally
---

# Testing the Plagiarism Checker

## Run
- `npm install` (once), then `npm run dev` — serves frontend + API together on http://localhost:5000 (no separate Vite port).
- Restart the server after any change under `server/` — there is no hot reload for backend code (`pkill -f "node server/index.js"` then `npm run dev`).
- Server logs go to stdout; `POST /api/plagiarism-check 200 in XXXXms` lines are the reliable timing evidence for perf claims.

## Key UI paths (client/src/pages/Index.jsx)
- Textarea `data-testid=input-text`; "Check Plagiarism" button disabled until text ≥100 chars.
- "Upload PDF / Word / TXT" button (`button-upload-file`) posts to `/api/extract-text`; success fills the textarea, shows filename and a "File Loaded" toast; failures show a destructive "Upload Error" toast.
- Results: three cards (Overall Plagiarism, Similarity Score, AI Content `text-ai-score`) plus `alert-ai-indicators` when indicators exist.

## Test data tips
- Generate fixtures with `pip3 install fpdf2 python-docx` and a tiny Python script (FPDF + Document). pdf-parse includes a "-- 1 of 1 --" page marker in extracted PDF text — expected, not a bug.
- To drive the AI score up, use formulaic phrases ("es importante destacar", "in conclusion", "furthermore", "delve into") with uniform sentence lengths; natural text scores near 0-5%.
- Web search uses live DuckDuckGo/CrossRef — source URLs and similarity % vary between runs; CrossRef "Unexpected end of JSON input" errors and 403s on doi.org fetches in the log are handled and non-fatal.
- Negative upload cases: file <100 extractable chars → "Could not extract enough text..." toast; non pdf/docx/txt → "Unsupported file type. Use PDF, DOCX or TXT." toast.
