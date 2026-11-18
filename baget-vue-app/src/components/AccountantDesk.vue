<script setup>
import CashAccountPicker from './CashAccountPicker.vue'
import PartnerReceivables from './PartnerReceivables.vue'
import PartnerReconciliation from './PartnerReconciliation.vue'
import { newRequestKey } from '../services/requestKey.js'
import { computed, onMounted, ref } from 'vue'
import { paymentAmounts, normalizeInvoicePaymentPayload } from '../calculation/billing.js'
import { productInvoices, productInvoicePdf } from '../services/productInvoices.js'
const props = defineProps({ session: { type: Object, required: true }, initialTab: { type: String, default: 'ready' } })
const tab = ref(['ready', 'invoices', 'receivables', 'reconciliation'].includes(props.initialTab) ? props.initialTab : 'ready'), ready = ref([]), invoices = ref([]), page = ref(0), picked = ref([]), chosenInvoices = ref([])
const busy = ref(false), error = ref(''), message = ref(''), detail = ref(null), options = ref({ branches: [], payers: [], partners: [] })
const cashAccount = ref(null), cashAccountKind = ref(null), paymentInstrument = ref('')
const partnerFilter = ref(''), reconciliationPartner = ref(null)
const payerSearch = ref(''), payer = ref(null), branch = ref(''), note = ref(''), amount = ref(''), advance = ref(''), paymentPending = ref(false)
let retry = null, paymentRetry = null
const paymentKey = () => `baget.invoice-payment.${props.session.username || props.session.nickname || 'session'}.${detail.value?.id}`
function restorePayment() {
 const storageKey = paymentKey()
 try {
  const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
  paymentRetry = normalizeInvoicePaymentPayload(stored)
  if (paymentRetry && paymentRetry !== stored) sessionStorage.setItem(storageKey, JSON.stringify(paymentRetry))
 } catch {
  sessionStorage.removeItem(storageKey)
  paymentRetry = null
 }
 paymentPending.value = !!paymentRetry
 amount.value = paymentRetry?.amount ?? ''; advance.value = paymentRetry?.allocationAmount ?? ''; cashAccount.value = null; cashAccountKind.value = null; paymentInstrument.value = paymentRetry?.paymentInstrument ?? ''
}
const money = n => Number(n || 0).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const status = { ISSUED: 'Виставлено', PARTIALLY_PAID: 'Частково оплачено', PAID: 'Оплачено', CANCELLED: 'Скасовано' }
const selectedTotal = computed(() => ready.value.filter(p => picked.value.includes(p.productId)).reduce((s, p) => s + Number(p.amount), 0))
const selectedRows = computed(() => ready.value.filter(p => picked.value.includes(p.productId)))
const resellerOwner = computed(() => tab.value === 'ready'
  ? selectedRows.value.find(p => p.commerceMode === 'RESELLER')?.partnerId
  : invoices.value.find(i => chosenInvoices.value.includes(i.id) && i.partnerId)?.partnerId)
const billingBranches = computed(() => resellerOwner.value ? options.value.branches.filter(b => b.mode === 'OWN') : options.value.branches)
function choosePartner() {
  page.value = 0
  const partner = options.value.partners?.find(p => Number(p.id) === Number(partnerFilter.value))
  payer.value = partner || null
  if (partner) branch.value = options.value.branches.find(b => b.mode === 'OWN')?.id || ''
  refresh()
}
const mergeTotal = computed(() => invoices.value.filter(i => chosenInvoices.value.includes(i.id)).reduce((s, i) => s + Number(i.debt), 0))
async function run(fn) { if (busy.value) return; busy.value = true; error.value = ''; message.value = ''; try { await fn() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function load() { if (!['ready', 'invoices'].includes(tab.value)) return; if (tab.value === 'ready') ready.value = await productInvoices(props.session.token, `/ready?page=${page.value}${partnerFilter.value ? `&partnerId=${partnerFilter.value}` : ''}`); else invoices.value = await productInvoices(props.session.token, `?page=${page.value}`) }
function refresh() { picked.value = []; chosenInvoices.value = []; return run(load) }
function changeTab(t) { if (busy.value) return; tab.value = t; page.value = 0; if (['ready', 'invoices'].includes(t)) refresh() }
function reconcilePartner(id) { reconciliationPartner.value = Number(id); tab.value = 'reconciliation' }
function openReceivable(id) { return run(async () => { detail.value = await productInvoices(props.session.token, `/${id}`); amount.value = ''; advance.value = ''; restorePayment(); note.value = ''; tab.value = 'invoice' }) }
function turn(n) { page.value += n; refresh() }
function findPayer() { return run(async () => { options.value = await productInvoices(props.session.token, `/options?q=${encodeURIComponent(payerSearch.value)}`) }) }
function useOwner(p) {
 if (p.commerceMode === 'RESELLER') {
  payer.value = options.value.partners?.find(v => Number(v.id) === Number(p.partnerId)) || { id: p.partnerId, name: `Фірма № ${p.partnerId}` }
  branch.value = options.value.branches.find(b => b.mode === 'OWN')?.id || ''
 } else { payer.value = { id: p.customerId, name: p.customerName }; branch.value = p.branchNo }
}
function open(id) { return run(async () => { detail.value = await productInvoices(props.session.token, `/${id}`); amount.value = ''; advance.value = ''; restorePayment() }) }
function submit(merge = false) { return run(async () => {
  if (!payer.value || !branch.value) throw new Error('Оберіть платника та філію обліку.')
  if ((!merge && !picked.value.length) || (merge && chosenInvoices.value.length < 2)) throw new Error(merge ? 'Оберіть щонайменше два рахунки з боргом.' : 'Оберіть вироби.')
  if (resellerOwner.value) {
    if (Number(payer.value.id) !== Number(resellerOwner.value)) throw new Error('Платником має бути фірма-посередник обраних виробів або рахунків.')
    if (!billingBranches.value.some(b => Number(b.id) === Number(branch.value))) throw new Error('Оберіть власну філію обліку підприємства.')
    const selected = merge ? invoices.value.filter(i => chosenInvoices.value.includes(i.id)) : selectedRows.value
    if (selected.some(p => Number(p.partnerId) !== Number(resellerOwner.value))) throw new Error('Оберіть позиції лише однієї фірми-посередника.')
  }
  const payload = { payerId: Number(payer.value.id), branchNo: Number(branch.value), note: note.value, ...(merge ? { invoiceIds: [...chosenInvoices.value].sort((a, b) => a - b) } : { products: ready.value.filter(p => picked.value.includes(p.productId)).map(p => ({ productId: p.productId, confirmedRevision: p.confirmedRevision })) }) }
  const signature = JSON.stringify([merge, payload]); if (!retry || retry.signature !== signature) retry = { signature, requestKey: newRequestKey() }
  if (!window.confirm(`${merge ? 'Перенести залишки боргу в об’єднаний рахунок' : 'Виставити рахунок'} для «${payer.value.name}»? Сума за поточними даними: ${money(merge ? mergeTotal.value : selectedTotal.value)} грн.`)) return
  detail.value = await productInvoices(props.session.token, merge ? '/merge' : '', { ...payload, requestKey: retry.requestKey })
  retry = null; picked.value = []; chosenInvoices.value = []; message.value = `Створено рахунок № ${detail.value.invoiceNo}.`; restorePayment(); await load()
}) }
function payment() { return run(async () => {
  if (!paymentRetry) {
    const { cash, advance: allocated } = paymentAmounts(amount.value, advance.value, detail.value.debt, detail.value.availableAdvance)
    if (cash > 0 && !cashAccount.value) throw new Error('Оберіть касу або рахунок для надходження')
    if (cash > 0 && cashAccountKind.value === 'BANK' && !paymentInstrument.value) throw new Error('Для банківського рахунку оберіть фактичний засіб оплати')
    if (!window.confirm(`Підтвердити оплату ${money(cash)} грн і зарахування авансу ${money(allocated)} грн?`)) return
    const payload = { cashAccountId: cash > 0 ? cashAccount.value : null, paymentInstrument: cash > 0 && cashAccountKind.value === 'BANK' ? paymentInstrument.value : null, amount: cash, allocationAmount: allocated, expectedDebt: detail.value.debt, note: note.value, requestKey: newRequestKey() }
    sessionStorage.setItem(paymentKey(), JSON.stringify(payload)); paymentRetry = payload
  }
  paymentPending.value = true
  try {
    detail.value = await productInvoices(props.session.token, `/${detail.value.id}/payment`, paymentRetry)
    sessionStorage.removeItem(paymentKey()); paymentRetry = null; paymentPending.value = false; amount.value = ''; advance.value = ''; cashAccount.value = null; cashAccountKind.value = null; paymentInstrument.value = ''; message.value = 'Операцію проведено.'; await load()
  } catch (e) {
    if ([400, 403, 404, 409, 422].includes(e.status)) { sessionStorage.removeItem(paymentKey()); paymentRetry = null; paymentPending.value = false }
    throw e
  }
}) }
function pdf() { return run(() => productInvoicePdf(props.session.token, detail.value.id)) }
onMounted(() => run(async () => { options.value = await productInvoices(props.session.token, '/options'); if (options.value.branches.length === 1) branch.value = options.value.branches[0].id; await load() }))
</script>
