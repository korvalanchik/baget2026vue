import { apiOrigin } from "./auth.js";
export async function calculatedOrder(
  token,
  path = "",
  method = "GET",
  payload,
) {
  const response = await fetch(`${apiOrigin}/api/calculated-orders${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    /* Use status-based fallback. */
  }
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Сесія завершилася. Увійдіть знову."
        : data?.message || "Не вдалося виконати операцію із замовленням.",
    );
  if (!data?.orderNo || !Array.isArray(data.products))
    throw new Error("Сервер повернув некоректне замовлення.");
  return data;
}
