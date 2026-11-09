import { apiOrigin } from './auth.js'

export async function fetchBranches(token) {
  return request(token, '/api/admin/branches')
}

export async function saveBranch(token, branch) {
  const editing = Number.isInteger(branch.branchNo)
  return request(token, editing ? `/api/admin/branches/${branch.branchNo}` : '/api/admin/branches', {
    method: editing ? 'PUT' : 'POST',
    body: JSON.stringify({
      name: branch.name,
      address: branch.address,
      active: branch.active,
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
