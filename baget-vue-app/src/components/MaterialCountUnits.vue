<script setup>
import { ref, watch } from 'vue'
import { warehouse } from '../services/warehouse.js'
const props=defineProps({session:{type:Object,required:true},partNo:{type:Number,required:true},unit:{type:String,default:''},input:{type:Object,default:null},disabled:Boolean,settingsOnly:Boolean})
const emit=defineEmits(['apply','busy'])
const data=ref(null),error=ref(''),busy=ref(false),label=ref(''),factor=ref(''),remainder=ref('0'),entries=ref([]),result=ref(null)
const units={METER:'м',SQUARE_METER:'м²',PIECE:'шт'}
const path=()=>`/materials/${props.partNo}/count-units`
async function run(fn){if(busy.value||props.disabled)return;busy.value=true;emit('busy',true);error.value='';try{await fn()}catch(e){error.value=e.message}finally{busy.value=false;emit('busy',false)}}
function load(){return run(async()=>{data.value=await warehouse(props.session.token,path())})}
function configure(){return run(async()=>{if(!label.value.trim()||!Number.isFinite(Number(factor.value))||Number(factor.value)<=0)throw new Error('Вкажіть назву одиниці й додатний коефіцієнт');data.value=await warehouse(props.session.token,path(),{label:label.value.trim(),factor:Number(factor.value)});label.value='';factor.value=''})}
function payload(){return {remainder:remainder.value===''?null:Number(remainder.value),entries:entries.value.map(e=>({presetId:e.presetId===''?null:Number(e.presetId),count:e.count===''?null:Number(e.count),widthMm:e.presetId===''?(e.widthMm===''?null:Number(e.widthMm)):null,heightMm:e.presetId===''?(e.heightMm===''?null:Number(e.heightMm)):null}))}}
function apply(){return run(async()=>{result.value=await warehouse(props.session.token,path()+'/preview',payload());emit('apply',result.value)})}
function add(cut=false){entries.value.push({presetId:cut?'':data.value.presets.find(p=>p.active===true||Number(p.active)===1)?.id ?? '',count:1,widthMm:'',heightMm:''});result.value=null}
watch(()=>[props.partNo,props.input],()=>{remainder.value=String(props.input?.remainder??0);entries.value=(props.input?.entries||[]).map(e=>({...e,presetId:e.presetId??'',widthMm:e.widthMm??'',heightMm:e.heightMm??''}));result.value=null;load()},{immediate:true})
</script>
<template>
 <section class="count-units">
  <p v-if="error" role="alert">{{ error }}</p><p v-if="busy">Обчислення / завантаження…</p>
  <button v-if="!data" type="button" :disabled="busy || disabled" @click="load">Завантажити одиниці</button>
  <template v-if="data">
   <template v-if="!settingsOnly">
    <p>Порахуйте весь фактичний залишок: цілі одиниці плюс залишки. Обліковий залишок сюди не додається.</p>
    <fieldset :disabled="busy || disabled">
     <div v-for="(e,i) in entries" :key="i" class="count-entry">
      <label>Одиниця<select v-model="e.presetId"><option v-if="data.unit==='SQUARE_METER'" value="">Прямокутний обрізок</option><option v-for="p in data.presets.filter(p=>p.active===true || Number(p.active)===1 || Number(p.id)===Number(e.presetId))" :key="p.id" :value="p.id">{{ p.label }} · {{ p.factor }} {{ units[data.unit] }}{{ p.active===false || Number(p.active)===0?' (попередня версія)':'' }}</option></select></label>
      <template v-if="e.presetId==='' && data.unit==='SQUARE_METER'"><label>Ширина, мм<input v-model="e.widthMm" type="number" min="0.001" step="0.001"></label><label>Висота, мм<input v-model="e.heightMm" type="number" min="0.001" step="0.001"></label></template>
      <label>Кількість цілих одиниць<input v-model="e.count" type="number" min="0" step="1"></label><button type="button" @click="entries.splice(i,1)">Прибрати рядок</button>
     </div>
     <button type="button" :disabled="!data.presets.some(p=>p.active===true||Number(p.active)===1)" @click="add()">Додати рейки / листи / упаковки</button><button v-if="data.unit==='SQUARE_METER'" type="button" @click="add(true)">Додати обрізки за розміром</button>
     <label>Додатковий залишок у {{ units[data.unit] }}<input v-model="remainder" type="number" min="0" :step="data.unit==='PIECE'?1:0.000001"></label>
     <button type="button" @click="apply">Обчислити й перенести в підрахунок</button>
    </fieldset>
   </template>
   <details :open="settingsOnly"><summary>Налаштування одиниць цього матеріалу</summary>
    <p v-for="p in data.presets.filter(p=>p.active===true||Number(p.active)===1)" :key="p.id">1 {{ p.label }} = {{ p.factor }} {{ units[data.unit] }}</p>
    <p>Для зміни коефіцієнта введіть ту саму назву. Створиться нова версія; попередні підрахунки збережуть свій коефіцієнт. Для іншого формату задайте іншу назву.</p>
    <fieldset :disabled="busy || disabled"><label>Назва (наприклад, Рейка 2,9 м)<input v-model="label" maxlength="100"></label><label>Кількість {{ units[data.unit] }} в одній одиниці<input v-model="factor" type="number" min="0.000001" :step="data.unit==='PIECE'?1:0.000001"></label><button type="button" @click="configure">Зберегти одиницю</button></fieldset>
   </details>
  </template>
 </section>
</template>
<style scoped>
.count-units{min-width:0;border:1px solid #d6e1e7;border-radius:8px;padding:12px;margin:10px 0;overflow-wrap:anywhere}.count-entry{padding:10px;margin-bottom:10px;background:#f1f6f8;border-radius:6px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}fieldset{border:0;padding:0;min-width:0}label{display:grid;gap:5px;margin:8px 0}input,select,button{box-sizing:border-box;font:inherit;min-width:0;max-width:100%;padding:9px;min-height:44px;border:1px solid #bdccd4;border-radius:6px}input,select{width:100%}button{margin:4px 4px 4px 0;white-space:normal}button:disabled{opacity:.5}summary{cursor:pointer;padding:10px 0}[role=alert]{color:#a22}@media(max-width:600px){.count-entry{grid-template-columns:1fr}button{width:100%}input,select{font-size:16px}}
</style>
