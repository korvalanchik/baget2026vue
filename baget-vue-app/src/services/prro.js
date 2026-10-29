import { apiOrigin } from "./auth.js";

export async function inspectRro(token, fiscalNumber, signatureBase64) {
  const response = await fetch(`${apiOrigin}/api/prro/diagnostics/info`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fiscalNumber, signatureBase64 }),
  });
  if (response.ok) return response.json();

  let message = "Не вдалося отримати інформацію про ПРРО.";
  try {
    const body = await response.json();
    message = body.message || body.detail || message;
  } catch {
    // Keep the safe fallback when the server response is not JSON.
  }
  const error = new Error(message);
  error.status = response.status;
  throw error;
}
