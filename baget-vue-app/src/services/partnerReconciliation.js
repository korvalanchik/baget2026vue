import { apiOrigin } from './auth.js'
export async function partnerReconciliation(token, path) {
 const response = await fetch(`${apiOrigin}/api/partner-reconciliation${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
 if (!response.ok) { const data = await response.json().catch(() => null); throw new Error(data?.message || `Не вдалося сформувати звірку (HTTP ${response.status})`) }
 return path.startsWith('/pdf?') ? response.blob() : response.json()
}
