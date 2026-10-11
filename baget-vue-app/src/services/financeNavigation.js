export const isFinanceEditor = session => (session?.roles || []).some(role => ['ROLE_ADMIN', 'ROLE_ACCOUNTANT', 'ROLE_BOOKKEEPER', 'ROLE_COUNTER'].includes(role))
export const isAdministrator = session => (session?.roles || []).includes('ROLE_ADMIN')
export function financeTabs(session) {
 if (!isFinanceEditor(session)) return [{ id: 'rewards', label: 'Моя винагорода' }]
 return [
  { id: 'flow', label: 'Зведення' }, { id: 'day-end', label: 'Підсумки дня' }, { id: 'expenses', label: 'Витрати' },
  { id: 'purchases', label: 'Оплати закупівель' }, { id: 'rewards', label: 'Винагороди' },
  ...(isAdministrator(session) ? [{ id: 'reports', label: 'Звіти' }, { id: 'differences', label: 'Розбіжності кас' }] : []),
 ]
}
export function financeTarget(target) {
 if (target.section === 'rewards') return { ...target, section: 'finance', tab: 'rewards' }
 if (target.section === 'owner-results') return { ...target, section: 'finance', tab: 'reports' }
 return target
}
