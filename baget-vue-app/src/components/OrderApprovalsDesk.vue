<script setup>
import { computed, onMounted, ref } from 'vue'
import { commercial } from '../services/commercial.js'
import PriceApprovalPanel from './PriceApprovalPanel.vue'
const props = defineProps({ session: { type: Object, required: true } })
const rows = ref([]), busy = ref(false), error = ref(''), loaded = ref(false), query = ref(''), revision = ref(0)
const visible = computed(() => {
  const term = query.value.trim().toLocaleLowerCase('uk-UA')
  return rows.value.filter(row => [row.orderNo, row.productName, row.branchName, row.customerName]
    .some(value => String(value ?? '').toLocaleLowerCase('uk-UA').includes(term)))
})
async function load() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { rows.value = await commercial(props.session.token, '/pending'); loaded.value = true; revision.value++ }
  catch (e) { error.value = e.message }
  finally { busy.value = false }
}
onMounted(load)
</script>
<template>
  <section class="orders-page" :aria-busy="busy">
    <h1>Замовлення</h1>
    <h2>Очікують погодження <span v-if="loaded && !error" class="count">{{ rows.length }}</span></h2>
    <p>Вироби зі зміною роздрібної ціни понад 5%, зокрема повернуті на уточнення. До погодження виготовлення призупинено.</p>
    <div class="tools">
      <label>Пошук у черзі<input v-model="query" type="search" placeholder="Замовлення, виріб, клієнт або філія"></label>
      <button type="button" :disabled="busy" @click="load">{{ busy ? 'Завантаження…' : 'Оновити' }}</button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="loaded && !rows.length" role="status">Немає виробів, що очікують погодження.</p>
    <p v-else-if="loaded && !visible.length" role="status">За вашим запитом нічого не знайдено.</p>
    <article v-for="p in visible" :key="p.productId">
      <h3>Замовлення № {{ p.orderNo }} · {{ p.productName }}</h3>
      <p>{{ p.branchName }} · {{ p.customerName }}</p>
      <PriceApprovalPanel :session="session" :product-id="Number(p.productId)" :revision="revision" :disabled="busy || Boolean(error)" @changed="load" />
    </article>
  </section>
</template>
<style scoped>
.orders-page{padding:20px clamp(12px,3vw,28px);min-width:0}
.tools{display:flex;gap:12px;align-items:end;flex-wrap:wrap}
label{display:grid;gap:6px;flex:1;min-width:0}
input,button{padding:10px;font:inherit;max-width:100%;box-sizing:border-box}
article{padding:12px;border:1px solid #cad8e2;border-radius:8px;margin:16px 0;overflow-wrap:anywhere}
h3{margin-top:0}.count{display:inline-block;padding:2px 10px;border-radius:16px;background:#e2ece6}
[role=alert]{color:#b22}
</style>
