import { apiOrigin } from './auth.js'
export async function backups(token, path = '', body, method = 'GET') {
 const r = await fetch(`${apiOrigin}/api/settings/backups${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) })
 const data = await r.json().catch(() => null)
 if (!r.ok) throw new Error(data?.message || `Не вдалося виконати операцію резервування (HTTP ${r.status})`)
 return data
}
export async function downloadBackup(token, row) {
 const r = await fetch(`${apiOrigin}/api/settings/backups/${encodeURIComponent(row.id)}/download`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
 if (!r.ok) throw new Error('Не вдалося завантажити копію. Перевірте підключення Google Диска.')
 const blob = await r.blob()
 if (blob.size !== Number(row.bytes)) throw new Error('Файл завантажено не повністю. Спробуйте ще раз.')
 const url = URL.createObjectURL(blob), link = document.createElement('a')
 link.href = url; link.download = row.fileName || 'baget.sql.gz'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000)
}
