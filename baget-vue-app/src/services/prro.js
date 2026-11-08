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

export function getPrroEndpoint(token) {
  return adminRequest(token, "/api/prro/admin/endpoint");
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

export function getPrroDeviceForBranch(token, branchNo) {
  return adminRequest(token, `/api/prro/branches/${Number(branchNo)}/device`);
}

export function preparePrroShiftOpen(token, request) {
  return adminRequest(token, "/api/prro/shift/open/prepare", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function submitPrroShiftOpen(token, request) {
  return adminRequest(token, "/api/prro/shift/open/submit", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function cancelPrroPreparedShiftOpen(token, request) {
  return adminRequest(token, "/api/prro/shift/open/cancel-prepared", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function preparePrroShiftClose(token, request) {
  return adminRequest(token, "/api/prro/shift/close/prepare", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function submitPrroShiftClose(token, request) {
  return adminRequest(token, "/api/prro/shift/close/submit", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function preparePrroTestCheck(token, request) {
  return adminRequest(token, "/api/prro/test-check/prepare", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function submitPrroTestCheck(token, request) {
  return adminRequest(token, "/api/prro/test-check/submit", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getPrroRecentPayments(token, branchNo) {
  return adminRequest(token, `/api/prro/payments/recent?branchNo=${Number(branchNo)}`);
}

export function preparePrroPaymentCheck(token, paymentRequestKey, request) {
  return adminRequest(token, `/api/prro/payments/${encodeURIComponent(paymentRequestKey)}/prepare-check`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function submitPrroPaymentCheck(token, paymentRequestKey, request) {
  return adminRequest(token, `/api/prro/payments/${encodeURIComponent(paymentRequestKey)}/submit-check`, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function getPrroFiscalDocuments(token, filters = {}) {
  const params = new URLSearchParams();
  if (filters.branchNo != null) params.set("branchNo", String(Number(filters.branchNo)));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.query) params.set("query", filters.query);
  params.set("page", String(filters.page ?? 0));
  params.set("size", String(filters.size ?? 30));
  return adminRequest(token, "/api/prro/documents?" + params.toString());
}

export function getPrroFiscalDocument(token, documentId) {
  return adminRequest(token, "/api/prro/documents/" + encodeURIComponent(documentId));
}
