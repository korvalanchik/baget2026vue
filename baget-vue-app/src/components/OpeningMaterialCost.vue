<script setup>
import { computed, onMounted, ref } from 'vue'
import { warehouse } from '../services/warehouse.js'
import { newRequestKey } from '../services/requestKey.js'
const props = defineProps({ session: { type: Object, required: true }, partNo: { type: Number, required: true } })
const emit = defineEmits(['saved'])
const material = ref(null), history = ref([]), page = ref(0), cost = ref(''), note = ref(''), busy = ref(false), error = ref(''), notice = ref(''), pending = ref(null)
const storageKey = `baget.opening-cost.${props.session.username || props.session.nickname}.${props.partNo}`
const api = (path = '', body) => warehouse(props.session.token, `/materials/${props.partNo}/opening-cost${path}`, body)
const unit = computed(() => ({ METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт.' })[material.value?.unit] || '')
const allowed = computed(() => material.value?.unitCost == null && Number(material.value?.stock) > 0 && !!unit.value)
const fmt = x => x == null ? 'Не задано' : Number(x).toLocaleString('uk-UA', { maximumFractionDigits: 6 })
async function refresh() { material.value = await api(); history.value = await api(`/history?page=${page.value}`); cost.value = ''; note.value = '' }
async function load() { if (busy.value || pending.value) return; busy.value = true; error.value = ''; try { await refresh() } catch (e) { error.value = e.message } finally { busy.value = false } }
async function save() {
 if (busy.value || pending.value || !allowed.value) return
 error.value = ''; notice.value = ''
 const value = String(cost.value).trim().replace(',', '.')
 if (!/^\d{1,9}(\.\d{1,6})?$/.test(value)) { error.value = 'Вкажіть невід’ємну вартість, не більше шести знаків після коми.'; return }
 if (!note.value.trim()) { error.value = 'Вкажіть джерело або підставу оцінки.'; return }
 if (!window.confirm(`Встановити ${value} грн/${unit.value} для залишку ${fmt(material.value.stock)} ${unit.value}? Кількість матеріалу не зміниться.`)) return
 const request = { requestKey: newRequestKey(), version: material.value.version, stock: material.value.stock, unit: material.value.unit, unitCost: value, note: note.value.trim() }
 try { sessionStorage.setItem(storageKey, JSON.stringify(request)); pending.value = request } catch { error.value = 'Не вдалося зберегти запит у браузері. Зміни не надіслано.'; return }
 await retry()
}
async function retry() {
 if (busy.value || !pending.value) return
 busy.value = true; error.value = ''
 try {
  await api('', pending.value); pending.value = null; sessionStorage.removeItem(storageKey)
  notice.value = 'Початкову собівартість збережено. Кількість матеріалу не змінено.'
  await refresh(); emit('saved')
 } catch (e) {
  error.value = e.message
  if ([400, 403, 404, 409, 422].includes(e.status)) { pending.value = null; sessionStorage.removeItem(storageKey); material.value = null }
 } finally { busy.value = false }
}
async function turn(delta) { page.value += delta; await load() }
onMounted(async () => { try { const saved = sessionStorage.getItem(storageKey); if (saved) pending.value = JSON.parse(saved) } catch { error.value = 'Не вдалося прочитати збережений запит.' } if (!pending.value) await load() })
</script>
<template>
 <section class="opening-cost">
  <p>Встановлення вартості вже наявного матеріалу без приходу. Вкажіть закупівельну вартість з доставкою, без накладних витрат майстерні. Parts.Cost та прайси не змінюються.</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <div v-if="pending"><p>Результат ще не підтверджено. Повторення цього запиту не створить дубліката.</p><button :disabled="busy" @click="retry">Перевірити / повторити</button></div>
  <button :disabled="busy || !!pending" @click="load">Перечитати дані</button>
  <template v-if="material">
   <p>Залишок: <strong>{{ fmt(material.stock) }} {{ unit }}</strong> · Собівартість: <strong>{{ fmt(material.unitCost) }} грн/{{ unit }}</strong></p>
   <fieldset v-if="allowed" :disabled="busy || !!pending"><label>Початкова собівартість, грн/{{ unit }}<input v-model="cost" inputmode="decimal" placeholder="Наприклад, 125,50"></label><label>Підстава оцінки<textarea v-model="note" maxlength="1000" placeholder="Наприклад, остання накладна постачальника №…"></textarea></label><button @click="save">Зберегти початкову собівартість</button></fieldset>
   <p v-else>{{ material.unitCost != null ? 'Собівартість вже відома. Повторне встановлення недоступне.' : 'Потрібен додатний залишок та налаштована одиниця вимірювання. Перевірте інвентаризацію.' }}</p>
  </template>
  <h4>Історія встановлення початкової собівартості</h4><p v-if="!history.length">Записів немає.</p>
  <article v-for="entry in history" :key="entry.id"><strong>{{ fmt(entry.snapshot.unitCost) }} грн/{{ { METER:'м',SQUARE_METER:'м²',PIECE:'шт.' }[entry.snapshot.unit] }}</strong><p>Залишок на момент встановлення: {{ fmt(entry.snapshot.stock) }} · Вартість залишку: {{ fmt(entry.snapshot.totalCost) }} грн</p><p>{{ entry.snapshot.note }}</p><small>{{ entry.createdAt }} · {{ entry.actor }}</small></article>
  <div class="paging"><button :disabled="busy || !!pending || !page" @click="turn(-1)">Назад</button><span>{{ page + 1 }}</span><button :disabled="busy || !!pending || history.length < 20" @click="turn(1)">Далі</button></div>
 </section>
</template>
<style scoped>
.opening-cost{padding:12px;background:#f5f8fa;border-radius:8px;overflow-wrap:anywhere}.opening-cost fieldset{border:0;padding:12px 0;min-width:0;display:grid;gap:12px}.opening-cost label{display:grid;gap:6px}.opening-cost input,.opening-cost textarea{box-sizing:border-box;width:100%;max-width:100%;padding:10px;font:inherit;border:1px solid #bdccd4;border-radius:6px}.opening-cost textarea{min-height:72px}.opening-cost button{font:inherit;padding:10px;border:1px solid #bdccd4;border-radius:6px;cursor:pointer;min-height:44px;white-space:normal}.opening-cost button:disabled{opacity:.5}.opening-cost article{border-top:1px solid #ccd5dd;padding:12px 0}.paging{display:flex;align-items:center;gap:12px}[role=alert]{color:#a22}
</style>
