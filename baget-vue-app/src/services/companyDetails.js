import { apiOrigin } from './auth.js'

export async function fetchCompanyDetails(token) {
  return request(token, '/api/admin/company-details')
}

export async function saveCompanyDetails(token, details) {
  return request(token, '/api/admin/company-details', {
    method: 'PUT',
    body: JSON.stringify({
      fullName: details.fullName,
      edrpou: details.edrpou,
      ipn: details.ipn,
      address: details.address,
    }),
  })
}

async function request(token, path, options = {}) {
  const response = await fetch(`${apiOrigin}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.message || `Не вдалося виконати операцію (HTTP ${response.status}).`)
  }
  return data
}
