<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ReceiptPayments from './ReceiptPayments.vue'
import { warehouse } from '../services/warehouse.js'
import { newRequestKey } from '../services/requestKey.js'
import { localDate, stockUnits } from '../calculation/procurement.js'
import { receiptCostPayload } from '../calculation/receiptCost.js'
const props=defineProps({session:{type:Object,required:true}})
const emit=defineEmits(['busy'])
const paymentsOpen=ref(false),paymentBusy=ref(false)
const canPay=computed(()=>props.session.roles?.some(r=>['ROLE_ADMIN','ROLE_ACCOUNTANT','ROLE_BOOKKEEPER','ROLE_COUNTER'].includes(r)))
const storageKey=`baget.priced-receipt.${props.session.nickname||props.session.username||'session'}`
const blank=()=>({requestKey:newRequestKey(),vendorNo:'',documentNo:'',documentDate:localDate(),supplierOrderId:null,expectedRevision:null,deliveryCost:'0',procurementCost:'0',note:'',lines:[]})
const draft=ref(blank()),vendors=ref([]),rows=ref([]),page=ref(0),query=ref(''),materialPage=ref(0),materials=ref([]),orderNumber=ref(''),preview=ref(null),saved=ref(null),pending=ref(null),busy=ref(false),error=ref(''),notice=ref('')
const blocked=computed(()=>busy.value||!!pending.value||paymentBusy.value)
const api=(path='',body)=>warehouse(props.session.token,`/priced-receipts${path}`,body)
const fmt=n=>n==null?'Не задано':Number(n).toLocaleString('uk-UA',{maximumFractionDigits:6})
const money=n=>Number(n||0).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})
async function run(fn){if(busy.value)return;busy.value=true;emit('busy',true);error.value='';try{await fn()}catch(e){error.value=e.message}finally{busy.value=false;emit('busy',false)}}
async function list(){rows.value=await api(`?page=${page.value}`)}
function find(reset=true){if(reset)materialPage.value=0;return run(async()=>{materials.value=await warehouse(props.session.token,`/materials?q=${encodeURIComponent(query.value)}&page=${materialPage.value}`)})}
async function line(part,qty=''){const p=await api(`/materials/${part}`);return {...p,quantity:qty,unitPrice:'',directCost:'0',openingUnitCost:''}}
function add(p){if(blocked.value||draft.value.supplierOrderId)return;return run(async()=>{if(draft.value.lines.some(l=>Number(l.partNo)===Number(p.partNo)))throw new Error('Матеріал уже додано');draft.value.lines.push(await line(p.partNo))})}
function fresh(){if(blocked.value)return;if(draft.value.lines.length&&!window.confirm('Очистити поточну чернетку накладної?'))return;draft.value=blank();saved.value=null;notice.value=''}
async function start(id){if(blocked.value)return;if(draft.value.lines.length&&!window.confirm('Замінити поточну чернетку даними замовлення постачальнику?'))return;return run(async()=>{
 if(!/^\d+$/.test(String(id)))throw new Error('Вкажіть номер замовлення постачальнику')
 const order=await warehouse(props.session.token,`/procurement/orders/${id}`);if(!['ORDERED','PARTIAL'].includes(order.status))throw new Error('Потрібне відкрите замовлення постачальнику')
 const lines=await Promise.all(order.lines.filter(l=>Number(l.remaining)>0).map(l=>line(l.partNo,l.remaining)))
 draft.value={...blank(),vendorNo:order.vendorNo,supplierOrderId:order.id,expectedRevision:order.revision,lines};saved.value=null;notice.value='Залишено непоставлені матеріали. Для часткового приходу зменшіть кількість або приберіть позиції, що не надійшли.'
})}
function refreshLine(l){if(blocked.value)return;return run(async()=>{
 const p=await api(`/materials/${l.partNo}`)
 const sameStock=p.stock!=null && l.stock!=null && Number(p.stock)===Number(l.stock)
 const keepOpening=sameStock && p.unit===l.unit && Number(p.stock)>0 && p.averageCost==null
 const hadOpening=String(l.openingUnitCost??'').trim()!==''
 Object.assign(l,{stock:p.stock,averageCost:p.averageCost,unit:p.unit,openingUnitCost:keepOpening?l.openingUnitCost:''})
 preview.value=null
 notice.value=hadOpening&&!keepOpening
  ? 'Дані складу змінилися або початкова собівартість більше не потрібна. Введене значення очищено — перевірте позицію перед розрахунком.'
  : 'Дані перечитано з бази. Змін у базу не внесено. Початкова собівартість врахується після перевірки розрахунку та проведення приходу.'
})}
function calculate(){if(blocked.value)return;return run(async()=>{preview.value=await api('/preview',receiptCostPayload(draft.value));saved.value=null})}
async function submit(){return run(async()=>{
 if(!pending.value){if(!preview.value)throw new Error('Спочатку перевірте розрахунок накладної');if(!window.confirm('Провести прихід? Залишки й складська собівартість зміняться.'))return;const request={document:preview.value.document,reviewToken:preview.value.token};sessionStorage.setItem(storageKey+'.pending',JSON.stringify(request));pending.value=request}
 try { saved.value=await api('',pending.value) }
 catch (e) {
  if ([400,403,404,409,422].includes(e.status)) {
   try { saved.value=await api('/by-key/'+pending.value.document.requestKey) }
   catch (lookup) {
    if (lookup.status===404) { pending.value=null;sessionStorage.removeItem(storageKey+'.pending');preview.value=null }
    throw e
   }
  } else throw e
 }
 pending.value=null;sessionStorage.removeItem(storageKey+'.pending');draft.value=blank();preview.value=null;notice.value='Прихід проведено. Залишки, резерви та складську собівартість оновлено.';await list()
})}
function open(id){if(blocked.value)return;return run(async()=>{paymentsOpen.value=false;saved.value=await api(`/${id}`)})}
function turn(n){if(blocked.value)return;page.value+=n;return run(list)}
watch(draft,()=>{preview.value=null;sessionStorage.setItem(storageKey+'.draft',JSON.stringify(draft.value))},{deep:true})
onMounted(()=>run(async()=>{const p=sessionStorage.getItem(storageKey+'.pending'),d=sessionStorage.getItem(storageKey+'.draft');if(d)draft.value=JSON.parse(d);if(p)pending.value=JSON.parse(p);vendors.value=await warehouse(props.session.token,'/procurement/vendors');await list()}))
defineExpose({start})
</script>
<template>
<section class="priced-receipts">
 <h1>Прихід і собівартість</h1><p>Суми у гривнях. Спільні витрати розподіляються пропорційно закупівельним сумам. Кількість — у метрах, м² або штуках. Це складська закупівельна собівартість, окремо від прайсів та накладних витрат майстерні.</p>
 <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
 <div v-if="pending" class="warning"><strong>Результат проведення ще не підтверджено.</strong><p>Не створюйте другу накладну. Повторна перевірка використовує той самий ключ.</p><button :disabled="busy" @click="submit">Перевірити результат / повторити</button></div>
 <fieldset :disabled="blocked"><legend>Накладна постачальника</legend>
  <button type="button" @click="fresh">Нова накладна</button>
  <div class="receipt-grid"><label>Постачальник<select v-model="draft.vendorNo" :disabled="!!draft.supplierOrderId"><option value="">Оберіть</option><option v-for="v in vendors" :key="v.id" :value="v.id">{{ v.name }}</option></select></label><label>Номер накладної<input v-model="draft.documentNo" maxlength="120"></label><label>Дата накладної<input v-model="draft.documentDate" type="date"></label></div>
  <p v-if="draft.supplierOrderId">За замовленням постачальнику № {{ draft.supplierOrderId }} · версія {{ draft.expectedRevision }}</p>
  <details><summary>Заповнити із замовлення постачальнику</summary><label>Номер замовлення постачальнику<input v-model="orderNumber" inputmode="numeric"></label><button @click="start(orderNumber)">Завантажити непоставлені позиції</button></details>
  <details v-if="!draft.supplierOrderId"><summary>Додати матеріали</summary><label>Артикул або назва<input v-model="query" @keydown.enter.prevent="find()"></label><button @click="find()">Знайти</button><div class="catalog"><button v-for="p in materials" :key="p.partNo" @click="add(p)">{{ p.description }} · {{ stockUnits[p.unit] || p.unit }}</button></div><button :disabled="materialPage===0" @click="materialPage--;find(false)">Попередні</button><button :disabled="materials.length<100" @click="materialPage++;find(false)">Наступні</button></details>
  <article v-for="(l,i) in draft.lines" :key="l.partNo" class="receipt-line"><strong>{{ l.description }} · {{ stockUnits[l.unit] }}</strong><div class="receipt-grid"><label>Кількість<input v-model="l.quantity" type="number" min="0.000001" :step="l.unit==='PIECE'?1:0.000001"></label><label>Ціна закупівлі за {{ stockUnits[l.unit] }}<input v-model="l.unitPrice" type="number" min="0" step="0.000001"></label><label>Витрати лише цієї позиції, грн<input v-model="l.directCost" type="number" min="0" step="0.01"></label></div><p>Закупівельна сума: {{ money(Number(l.quantity)*Number(l.unitPrice)) }} грн</p><p>Було на складі: {{ fmt(l.stock) }} · середня собівартість: {{ fmt(l.averageCost) }} грн/{{ stockUnits[l.unit] }}</p><p v-if="l.stock==null">Спочатку встановіть залишок інвентаризацією.</p><label v-if="Number(l.stock)>0 && l.averageCost==null">Початкова закупівельна собівартість наявного залишку, грн/{{ stockUnits[l.unit] }}<input v-model="l.openingUnitCost" type="number" min="0" step="0.000001"><small>Це вартість одиниці старого залишку з витратами закупівлі, без накладних витрат майстерні. Введення ще не змінює базу: натисніть «Перевірити розрахунок», потім «Провести прихід».</small></label><button @click="refreshLine(l)">Перечитати дані зі складу</button><button @click="draft.lines.splice(i,1)">Прибрати позицію</button></article>
  <div class="receipt-grid"><label>Доставка, грн<input v-model="draft.deliveryCost" type="number" min="0" step="0.01"></label><label>Інші спільні витрати закупівлі, грн<input v-model="draft.procurementCost" type="number" min="0" step="0.01"></label></div><p>Не додавайте ту саму витрату одночасно до спільних витрат і до окремої позиції. Податки автоматично не перераховуються: вводьте погоджені закупівельні суми.</p><label>Примітка / підстава початкової собівартості<textarea v-model="draft.note" maxlength="1000"></textarea></label><button @click="calculate">Перевірити розрахунок</button>
 </fieldset>
 <section v-if="preview || saved" class="receipt-review"><h2>{{ saved ? 'Проведена накладна № '+saved.snapshot.document.documentNo : 'Перевірка перед проведенням' }}</h2><template v-for="r in [saved?.snapshot || preview]" :key="r.token"><p>Закупівля: {{ money(r.purchaseTotal) }} · Витрати: {{ money(r.expenseTotal) }} · Разом: <strong>{{ money(r.total) }} грн</strong></p><article v-for="l in r.lines" :key="l.partNo" class="receipt-line"><strong>{{ l.description }}</strong><p>{{ fmt(l.quantity) }} {{ stockUnits[l.unit] }} × {{ fmt(l.unitPrice) }} = {{ money(l.net) }} грн</p><p>Частка спільних витрат: {{ money(l.sharedCost) }} · Прямі витрати: {{ money(l.directCost) }}</p><p>Вартість приходу: {{ money(l.landed) }} · за одиницю: {{ fmt(l.receiptUnitCost) }}</p><p>Залишок: {{ fmt(l.stockBefore) }} → {{ fmt(l.stockAfter) }} · Собівартість: {{ fmt(l.costBefore) }} → <strong>{{ fmt(l.averageAfter) }} грн/{{ stockUnits[l.unit] }}</strong></p><small v-if="l.openingCostUsed">Початкову собівартість старого залишку введено вручну.</small></article></template><button v-if="preview && !saved" :disabled="blocked" @click="submit">Провести прихід</button><button v-if="saved && canPay" :disabled="busy || paymentBusy" @click="paymentsOpen=!paymentsOpen">{{ paymentsOpen ? 'Закрити оплати закупівлі' : 'Оплати закупівлі' }}</button><ReceiptPayments v-if="saved && paymentsOpen && canPay" :key="saved.id" :session="session" :receipt-id="Number(saved.id)" @busy="paymentBusy=$event;emit('busy',$event)" /><p v-if="saved">Провів {{ saved.actor }} · {{ saved.createdAt }}. Документ зафіксовано.</p></section>
 <h2>Журнал проведених накладних</h2><button :disabled="blocked" @click="run(list)">Оновити журнал</button><article v-for="r in rows" :key="r.id" class="receipt-line"><strong>{{ r.documentNo }} · {{ r.documentDate }}</strong><p>{{ r.vendorName }}</p><button :disabled="blocked" @click="open(r.id)">Відкрити розрахунок</button></article><button :disabled="blocked || page===0" @click="turn(-1)">Назад</button><span> {{ page+1 }} </span><button :disabled="blocked || rows.length<50" @click="turn(1)">Далі</button>
</section>
</template>
<style scoped>
.priced-receipts{padding:16px;max-width:1200px;margin:auto;min-width:0;overflow-wrap:anywhere}.receipt-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.receipt-line,.receipt-review{border:1px solid #d5e0e6;border-radius:8px;padding:12px;margin:12px 0}label{display:grid;gap:6px;margin:10px 0}input,select,textarea,button{box-sizing:border-box;max-width:100%;min-width:0;padding:10px;min-height:44px;font:inherit;border:1px solid #bdccd4;border-radius:6px}input,select,textarea{width:100%}button{margin:5px 6px 5px 0;white-space:normal;cursor:pointer}button:disabled{opacity:.5}fieldset{min-width:0;border:1px solid #d5e0e6;border-radius:8px}summary{cursor:pointer;padding:10px 0}.catalog{display:grid;gap:6px}.warning{background:#fff4d8;padding:12px}[role=alert]{color:#a22}[role=status]{color:#276039}@media(max-width:700px){.receipt-grid{grid-template-columns:1fr}.priced-receipts{padding:10px}button{width:100%}input,select,textarea{font-size:16px}}
</style>
