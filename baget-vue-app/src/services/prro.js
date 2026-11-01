import { apiOrigin } from "./auth.js";

export async function inspectRro(token, signatureBase64) {
  const response = await fetch(`${apiOrigin}/api/prro/diagnostics/info`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ signatureBase64 }),
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

export async function getPrroShiftStatus(token, branchNo, fiscalNumber, signatureBase64) {
  const response = await fetch(apiOrigin + "/api/prro/shift/status", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ branchNo: Number(branchNo), fiscalNumber, signatureBase64 }),
  });
  if (response.ok) return response.json();
  let message = "Не вдалося отримати стан каси ПРРО.";
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

export async function inspectLastPrroCheck(token, branchNo, fiscalNumber, signatureBase64) {
  const response = await fetch(apiOrigin + "/api/prro/shift/last-check", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ branchNo: Number(branchNo), fiscalNumber, signatureBase64 }),
  });
  if (response.ok) return response.json();
  let message = "Не вдалося отримати останній чек ПРРО від ДПС.";
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


async function adminRequest(token, path, options = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (response.ok) return response.status === 204 ? null : response.json();
  let message = "Не вдалося виконати операцію з налаштуваннями ПРРО.";
  try {
    const body = await response.json();
    message = body.message || body.detail || message;
  } catch { /* Keep fallback. */ }
  const error = new Error(message);
  error.status = response.status;
  throw error;
}

export function getPrroBranches(token) {
  return adminRequest(token, "/api/prro/branches");
}

export function getPrroDevices(token) {
  return adminRequest(token, "/api/prro/admin/devices");
}

export function savePrroDevice(token, id, device) {
  return adminRequest(token, id ? `/api/prro/admin/devices/${id}` : "/api/prro/admin/devices", {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(device),
  });
}

export function getPrroAudit(token) {
  return adminRequest(token, "/api/prro/admin/audit");
}
