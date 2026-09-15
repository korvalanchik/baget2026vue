export const apiOrigin = (
  import.meta.env.VITE_API_URL ||
  "https://baget-240208334100.europe-west4.run.app"
).replace(/\/api$/, "");
const sessionKey = "baget.session";

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA");
}
function initials(nickname) {
  return (
    nickname
      .split(/[.\s_-]+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "МГ"
  );
}
function normalizeRoles(value) {
  const roles = Array.isArray(value) ? value : value?.roles || [];
  return roles.map((role) => String(role).trim().toUpperCase()).filter(Boolean);
}
const adminPermissions = [
  "orders:read",
  "customers:read",
  "customers:finance:read",
  "workshop:read",
  "materials:read",
  "scanning:read",
  "finance:read",
];
const branchOrderRoles = [
  "ROLE_MANAGER",
  "ROLE_SELLER",
  "ROLE_LEVEL2",
  "ROLE_COUNTER",
  "ROLE_FOREMAN",
];
const accountantRoles = ["ROLE_ACCOUNTANT", "ROLE_BOOKKEEPER", "ROLE_COUNTER"];

function permissionsFor(roles) {
  // Адміністратор працює над філіями: переглядає всі розділи, але не створює
  // замовлення, бо ціна та наявність матеріалів визначаються прайсом філії.
  if (roles.includes("ROLE_ADMIN")) return adminPermissions;

  // Сканування не прив'язане до прайсу чи конкретної філії.
  const permissions = ["scanning:read"];
  if (roles.some((role) => branchOrderRoles.includes(role)))
    permissions.push("orders:create", "orders:read", "customers:read");
  if (roles.includes("ROLE_FOREMAN")) permissions.push("workshop:read");
  if (roles.some((role) => accountantRoles.includes(role)))
    permissions.push("finance:read", "customers:finance:read");
  return permissions;
}
async function responseData(response) {
  if (response.ok) return response.json();
  let message = "Не вдалося перевірити доступ. Спробуйте ще раз.";
  try {
    message = (await response.json()).message || message;
  } catch {
    /* Сервер не повернув JSON з повідомленням. */
  }
  throw new Error(
    response.status === 401 ? "Невірний нікнейм або пароль." : message,
  );
}
async function authorizedGet(path, token) {
  const response = await fetch(`${apiOrigin}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return responseData(response);
}

export function canAccess(session, permission) {
  return Boolean(session?.permissions?.includes(permission));
}
export function restoreSession() {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(sessionKey));
    if (!saved?.token || !saved?.branch || !Array.isArray(saved.permissions))
      return null;
    // Міграція сесії зі старої моделі, де ROLE_ADMIN мав повний доступ ('*').
    if (saved.permissions.includes("*")) {
      saved.permissions = adminPermissions;
      saved.roles = ["ROLE_ADMIN"];
    }
    // Права не є джерелом істини: вони мають завжди відповідати ролям із
    // останнього входу. Стару сесію без ролей не можна коректно відновити.
    if (!Array.isArray(saved.roles)) {
      window.sessionStorage.removeItem(sessionKey);
      return null;
    }
    saved.roles = normalizeRoles(saved.roles);
    saved.permissions = permissionsFor(saved.roles);
    window.sessionStorage.setItem(sessionKey, JSON.stringify(saved));
    return saved;
  } catch {
    return null;
  }
}
export function clearSession() {
  window.sessionStorage.removeItem(sessionKey);
}
export async function signIn({ nickname, password, branchName }) {
  if (!nickname.trim() || !password)
    throw new Error("Введіть нікнейм і пароль.");
  const loginResponse = await fetch(`${apiOrigin}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: nickname.trim(), password }),
  });
  const login = await responseData(loginResponse);
  if (!login.jwtToken)
    throw new Error(
      "Сервер не повернув маркер сесії. Спробуйте увійти ще раз.",
    );
  const roleData = await authorizedGet("/auth/check-role", login.jwtToken);
  const roles = normalizeRoles(roleData);
  const isAdmin = roles.includes("ROLE_ADMIN");
  let branch;
  if (isAdmin) {
    branch = { id: null, name: "Усі філії", address: "Глобальний доступ" };
  } else {
    if (!branchName.trim()) throw new Error("Оберіть або введіть назву філії.");
    const branchData = await authorizedGet(
      "/api/branch/manager",
      login.jwtToken,
    );
    const managerBranches = Array.isArray(branchData)
      ? branchData
      : branchData.branches || branchData.content || [];
    branch = managerBranches.find(
      (item) => normalize(item.name || "") === normalize(branchName),
    );
    if (!branch)
      throw new Error(
        "У вас немає доступу до цієї філії або назва введена неточно.",
      );
    branch = {
      id: branch.branchNo || branch.id || branch.name,
      name: branch.name,
      address: branch.address || "",
    };
  }
  const session = {
    token: login.jwtToken,
    nickname: nickname.trim(),
    name: nickname.trim(),
    initials: initials(nickname),
    branch,
    permissions: permissionsFor(roles),
    roles,
  };

  window.sessionStorage.setItem(sessionKey, JSON.stringify(session));
  return session;
}
