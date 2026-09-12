export const apiOrigin = (import.meta.env.VITE_API_URL || 'https://baget-240208334100.europe-west4.run.app').replace(/\/api$/, '')
const sessionKey = 'baget.session'

function normalize(value) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('uk-UA') }
function initials(nickname) { return nickname.split(/[.\s_-]+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'МГ' }
function permissionsFor(roles) {
  if (roles.includes('ROLE_ADMIN')) return ['*']
  const permissions = ['orders:read']
  if (roles.some((role) => ['ROLE_SELLER', 'ROLE_COUNTER', 'ROLE_FOREMAN'].includes(role))) permissions.push('orders:create')
  if (roles.includes('ROLE_FOREMAN')) permissions.push('workshop:read')
  if (roles.includes('ROLE_COUNTER')) permissions.push('finance:read')
  return permissions
}
async function responseData(response) {
  if (response.ok) return response.json()
  let message = 'Не вдалося перевірити доступ. Спробуйте ще раз.'
  try { message = (await response.json()).message || message } catch { /* Сервер не повернув JSON з повідомленням. */ }
  throw new Error(response.status === 401 ? 'Невірний нікнейм або пароль.' : message)
}
async function authorizedGet(path, token) {
  const response = await fetch(`${apiOrigin}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return responseData(response)
}

export function canAccess(session, permission) { return Boolean(session && (session.permissions.includes('*') || session.permissions.includes(permission))) }
export function restoreSession() {
  try { const saved = JSON.parse(window.sessionStorage.getItem(sessionKey)); return saved?.token && saved?.branch && Array.isArray(saved.permissions) ? saved : null } catch { return null }
}
export function clearSession() { window.sessionStorage.removeItem(sessionKey) }
export async function signIn({ nickname, password, branchName }) {
  if (!nickname.trim() || !password || !branchName.trim()) throw new Error('Введіть нікнейм, пароль і назву філії.')
  const loginResponse = await fetch(`${apiOrigin}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: nickname.trim(), password }) })
  const login = await responseData(loginResponse)
  if (!login.jwtToken) throw new Error('Сервер не повернув маркер сесії. Спробуйте увійти ще раз.')
  const [branchData, roleData] = await Promise.all([authorizedGet('/api/branch/manager', login.jwtToken), authorizedGet('/auth/check-role', login.jwtToken)])
  const managerBranches = Array.isArray(branchData) ? branchData : branchData.branches || branchData.content || []
  const branch = managerBranches.find((item) => normalize(item.name || '') === normalize(branchName))
  if (!branch) throw new Error('У вас немає доступу до цієї філії або назва введена неточно.')
  const roles = Array.isArray(roleData) ? roleData : roleData.roles || []
  const session = { token: login.jwtToken, nickname: nickname.trim(), name: nickname.trim(), initials: initials(nickname), branch: { id: branch.branchNo || branch.id || branch.name, name: branch.name, address: branch.address || '' }, permissions: permissionsFor(roles) }
  window.sessionStorage.setItem(sessionKey, JSON.stringify(session))
  return session
}
