<script setup>
import { computed, onMounted, ref } from 'vue'
import { warehouse, locations } from '../services/warehouse.js'
import { crm } from '../services/crm.js'
import OrderApprovalsDesk from './OrderApprovalsDesk.vue'
import CrmIssuePanel from './CrmIssuePanel.vue'
import ProductQrScanner from './ProductQrScanner.vue'
const props = defineProps({ session: { type: Object, required: true }, initialTab: { type: String, default: 'RECEIVE' }, initialOrderNo: { type: [Number, String], default: null } })
const tab = ref(['RECEIVE', 'READY', 'APPROVAL'].includes(props.initialTab) ? props.initialTab : 'RECEIVE'), rows = ref([]), page = ref(0), more = ref(false), query = ref('')
const detail = ref(null), selected = ref([]), busy = ref(false), locked = ref(false), error = ref(''), notice = ref(''), scanner = ref(false), issuing = ref(false), focused = ref(null)
const blocked = computed(() => busy.value || locked.value)
const truth = v => v === true || Number(v) === 1
const cancelled = computed(() => [5,10].includes(Number(detail.value?.status)))
const receivable = p => !cancelled.value && p.state === 'COMPLETED' && truth(p.confirmed) && p.pending === 'BRANCH' && p.reworkId == null
const ready = computed(() => !cancelled.value && detail.value?.products.some(p => p.state === 'COMPLETED' && truth(p.confirmed) && p.location === 'BRANCH' && p.pending == null && p.reworkId == null))
async function queue() {
 const result = await warehouse(props.session.token, `/branch-orders?state=${tab.value}&page=${page.value}`)
 rows.value = result.rows; more.value = result.hasMore
}
async function run(fn) { if (blocked.value) return; busy.value = true; error.value = ''; try { await fn() } catch(e) { error.value = e.message } finally { busy.value = false } }
function load() { return run(queue) }
function switchTab(value) { if(blocked.value)return; tab.value=value; rows.value=[]; page.value=0; detail.value=null; issuing.value=false; notice.value=''; if(value!=='APPROVAL')load() }
async function read(order, productId = null) {
 const value = await warehouse(props.session.token, `/branch-orders/${order}`)
 detail.value=value; selected.value=[]; focused.value=productId; query.value=String(value.orderNo); issuing.value=false
 if(productId && value.canReceive && value.products.some(p => Number(p.id) === productId && receivable(p)))selected.value=[productId]
 if(ready.value && (tab.value === 'READY' || productId))issuing.value=true
}
function open(order) { return run(async()=>{ notice.value=''; await read(order) }) }
function search() { if(!/^\d+$/.test(query.value.trim())){error.value='Вкажіть номер замовлення';return} return open(query.value.trim()) }
function scan(token) { return run(async()=>{ const target=await crm(props.session.token, '/issue-qr/'+encodeURIComponent(token)); await read(target.orderNo,Number(target.productId)); scanner.value=false }) }
function turn(delta) { if(blocked.value)return;page.value+=delta;load() }
function accept() { return run(async()=>{
 const products=detail.value.products.filter(p=>selected.value.includes(p.id) && receivable(p))
 if(!products.length)throw new Error('Оберіть вироби, які фактично прибули')
 const accepted=[];let failure=null
 // Reuse the existing revision-checked transfer operation for each physical product.
 for(const p of products){try{await warehouse(props.session.token,`/products/${p.trackingId}/accept`,{expectedRevision:p.revision,destination:'BRANCH',note:'Приймання з вкладки Замовлення'});accepted.push(p.productName)}catch(e){failure=`${p.productName}: ${e.message}`;break}}
 notice.value=accepted.length?`Прийнято: ${accepted.join(', ')}.`:''
 selected.value=[]
 try{await read(detail.value.orderNo);if(tab.value!=='APPROVAL')await queue()}catch(e){detail.value=null;throw new Error(`${failure || ''} Не вдалося оновити стан. Перед повторенням оновіть картку. ${e.message}`, { cause: e })}
 if(failure)throw new Error(`${failure} Стан оновлено: перевірте, які вироби ще очікують приймання.`)
 }) }
async function issued(){ notice.value='Видачу збережено. Дані картки оновлено.';try{detail.value=await warehouse(props.session.token,`/branch-orders/${detail.value.orderNo}`);if(tab.value!=='APPROVAL')await queue()}catch(e){error.value=e.message} }
onMounted(async () => { if (props.initialOrderNo) await open(props.initialOrderNo); else if (tab.value !== 'APPROVAL') await load() })
</script>
<template>
<section class="branch-orders">
 <h1>Замовлення</h1>
 <form class="branch-order-search" @submit.prevent="search"><label>Номер замовлення<input v-model="query" inputmode="numeric" placeholder="Наприклад, 42664" :disabled="blocked"></label><button :disabled="blocked">Знайти</button><button type="button" :disabled="blocked" @click="scanner=!scanner">{{ scanner ? 'Закрити сканер' : 'Сканувати QR / відкрити посилання' }}</button></form>
 <ProductQrScanner v-if="scanner" :disabled="blocked" @scan="scan" />
 <nav aria-label="Етап замовлення"><button v-for="(name,key) in {APPROVAL:'Очікують погодження',RECEIVE:'Очікують приймання на філію',READY:'Готові до видачі'}" :key="key" :aria-pressed="tab===key" :disabled="blocked" @click="switchTab(key)">{{ name }}</button></nav>
 <p v-if="busy" role="status">Завантаження / виконання операції…</p><p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
 <section v-if="detail" class="card">
  <header><div><h2>Замовлення № {{ detail.orderNo }}</h2><p>{{ detail.company }} · {{ detail.mobile || 'Телефон не вказано' }}</p><p>{{ detail.branchName }}</p></div><button :disabled="blocked" @click="detail=null;issuing=false">Закрити картку</button></header>
  <p v-if="cancelled">Замовлення скасоване.</p>
  <p v-if="!detail.products.length">Немає виробів нового формату. Приймання та видача тут недоступні.</p>
  <article v-for="p in detail.products" :key="p.id" class="product">
   <label><input v-if="detail.canReceive && receivable(p)" v-model="selected" type="checkbox" :value="p.id" :disabled="blocked"><strong>{{ p.productName }}</strong></label>
   <p>{{ locations[p.location] || p.location }}<span v-if="p.pending"> → {{ locations[p.pending] || p.pending }} (очікує приймання)</span></p><p v-if="p.widthMm && p.heightMm">{{ p.widthMm }} × {{ p.heightMm }} мм</p>
  </article>
  <button v-if="detail.canReceive && detail.products.some(receivable)" class="primary" :disabled="blocked || !selected.length" @click="accept">Прийняти вибрані на філію ({{ selected.length }})</button>
  <button :disabled="blocked" @click="open(detail.orderNo)">Оновити картку</button>
  <button v-if="ready && !issuing" class="primary" :disabled="blocked" @click="issuing=true">Оплата та видача</button>
  <CrmIssuePanel v-if="issuing" :key="detail.orderNo" :session="session" :customer="detail" :order-no="Number(detail.orderNo)" :initial-product-id="focused" @locked="locked=$event" @issued="issued" @close="issuing=false" />
 </section>
 <OrderApprovalsDesk v-if="tab==='APPROVAL' && !detail" :session="session" />
 <template v-if="tab!=='APPROVAL' && !detail">
  <p>{{ tab==='RECEIVE' ? 'Позначайте лише вироби, які фактично прибули до філії.' : 'Прийняті на філію готові вироби. Оплату перевіряємо у картці видачі.' }}</p>
  <button :disabled="blocked" @click="load">Оновити список</button>
  <p v-if="!busy && !rows.length && !error">У цьому розділі замовлень немає.</p>
  <article v-for="o in rows" :key="o.orderNo" class="card"><h2>Замовлення № {{ o.orderNo }}</h2><p>{{ o.company }} · {{ o.branchName }}</p><button :disabled="blocked" @click="open(o.orderNo)">{{ tab==='RECEIVE'?'Переглянути та прийняти':'Оплата та видача' }}</button></article>
  <div class="pages"><button :disabled="blocked || page===0" @click="turn(-1)">Назад</button><span>{{ page+1 }}</span><button :disabled="blocked || !more" @click="turn(1)">Далі</button></div>
 </template>
</section>
</template>
<style scoped>
.branch-orders{padding:16px;max-width:1100px;margin:auto;min-width:0;overflow-wrap:anywhere}.branch-order-search,nav,header,.pages{display:flex;gap:10px;flex-wrap:wrap;align-items:center}header{justify-content:space-between}label{display:flex;gap:8px;align-items:center}.branch-order-search label{display:grid;flex:1}button,input{font:inherit;padding:10px;min-height:44px;max-width:100%;box-sizing:border-box;border:1px solid #bdccd4;border-radius:7px}button{cursor:pointer;background:white;white-space:normal}button:disabled{opacity:.5}nav{margin:16px 0}nav button[aria-pressed=true],.primary{background:#185c63;color:white}.card{padding:14px;border:1px solid #cbd9df;border-radius:9px;margin:12px 0;min-width:0}h2{font-size:18px}.product{padding:8px 0;border-bottom:1px solid #e1e8ed}.product input{width:20px;min-height:20px}.card>button{margin:8px 8px 0 0}.pages{justify-content:space-between}[role=alert]{color:#a22}[role=status]{color:#276039}@media(max-width:600px){.branch-orders{padding:10px}.card{padding:10px}.branch-order-search,nav{display:grid;grid-template-columns:1fr}button{width:100%}input{font-size:16px}.pages{flex-wrap:nowrap}.pages button{width:auto}}
:deep(.orders-page > h1){display:none}

.branch-orders{width:100%;box-sizing:border-box}
.branch-order-search{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;align-items:end;width:100%;height:auto;padding:0;border:0;gap:12px}
.branch-order-search label{display:grid;min-width:0;gap:6px;align-items:start}
.branch-order-search input{display:block;width:100%;min-width:0;height:44px;background:#fff;color:#25344b}
.branch-order-search button{min-width:0;margin:0;height:auto;line-height:1.4}
.branch-orders>nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:stretch}
.branch-orders>nav button{min-width:0;height:auto;line-height:1.4}
@media(max-width:900px){.branch-order-search{grid-template-columns:minmax(0,1fr) auto}.branch-order-search>button:last-child{grid-column:1/-1}}
@media(max-width:600px){.branch-order-search,.branch-orders>nav{grid-template-columns:minmax(0,1fr)}.branch-order-search>button:last-child{grid-column:auto}.branch-order-search input{font-size:16px}.branch-orders>nav button{width:100%}}
</style>
