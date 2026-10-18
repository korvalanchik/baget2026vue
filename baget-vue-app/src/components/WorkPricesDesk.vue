<script setup>
import { onMounted, ref } from 'vue'
import { workPrices } from '../services/workPrices.js'

const props = defineProps({ session: { type: Object, required: true } })
const admin = props.session.roles?.includes('ROLE_ADMIN') === true
const rows = ref([])
const query = ref('')
const page = ref(0)
const busy = ref(false)
const error = ref('')
const notice = ref('')

const fields = [
  { input: 'editCost', value: 'cost', key: 'cost', label: 'Cost — собівартість', help: 'грн' },
  { input: 'editListPrice', value: 'listPrice', key: 'listPrice', label: 'ListPrice — ціна ROLE_LEVEL2', help: 'грн' },
  { input: 'editListPrice1', value: 'listPrice1', key: 'listPrice1', label: 'ListPrice_1 — ціна ROLE_COUNTER', help: 'грн' },
  { input: 'editListPrice3', value: 'listPrice3', key: 'listPrice3', label: 'ListPrice_3 — базова ціна продажу', help: 'грн' },
]
const inputValue = value => value == null ? '' : Number(value).toFixed(2)
const cents = value => value == null ? null : Math.round(Number(value) * 100)

function present(row) {
  return {
    ...row,
    editCost: inputValue(row.cost),
    editListPrice: inputValue(row.listPrice),
    editListPrice1: inputValue(row.listPrice1),
    editListPrice3: inputValue(row.listPrice3),
  }
}

async function load(reset = false) {
  if (!admin || busy.value) return
  if (reset) page.value = 0
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await workPrices(
      props.session.token,
      `?q=${encodeURIComponent(query.value)}&page=${page.value}`,
    )
    rows.value = result.rows.map(present)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function parsePrice(value, label) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!text) return null
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text) || Number(text) > 99999999.99) {
    throw new Error(`Для поля «${label}» введіть невід’ємну суму до 99 999 999,99 грн, максимум 2 знаки після коми.`)
  }
  return Number(text)
}

async function save(row) {
  if (busy.value) return
  error.value = ''
  notice.value = ''
  try {
    const payload = { version: row.version }
    for (const field of fields) {
      const raw = String(row[field.input] ?? '').trim()
      if (!raw) continue
      const value = parsePrice(raw, field.label)
      if (row[field.value] == null || cents(value) !== cents(row[field.value])) {
        payload[field.key] = value
      }
    }
    if (!Object.keys(payload).some(key => key !== 'version')) {
      throw new Error('Змініть хоча б одне поле ціни. Порожні поля не змінюють збережені значення, 0 — окрема ціна.')
    }

    busy.value = true
    const saved = await workPrices(
      props.session.token,
      `/${row.partNo}`,
      payload,
    )
    Object.assign(row, present(saved))
    notice.value = `Ціни роботи «${saved.description}» збережено.`
  } catch (e) {
    error.value = e.message
    if (e.status === 409) {
      error.value += ' Натисніть «Оновити список», щоб завантажити актуальні значення.'
    }
  } finally {
    busy.value = false
  }
}

onMounted(() => load())
</script>

<template>
  <section v-if="admin" class="work-prices">
    <h2>Собівартість і ціни робіт</h2>
    <p>Тут редагуються лише записи з <code>parts.part_kind = 'WORK'</code>. Зміна цін не змінює параметри розрахунку, матеріальні залишки чи вже збережені замовлення.</p>
    <p>Порожнє поле залишається без змін; введіть <strong>0</strong>, якщо ціна має бути нульовою. Ціни задаються у гривнях, максимум два знаки після коми.</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>

    <form class="work-price-search" @submit.prevent="load(true)">
      <label>Пошук за артикулом або назвою
        <input v-model="query" maxlength="100" placeholder="Наприклад, 33370 або Вишивка">
      </label>
      <button type="submit" :disabled="busy">Знайти</button>
      <button type="button" :disabled="busy" @click="load()">Оновити список</button>
    </form>

    <p v-if="!rows.length && !busy">Робіт за цим пошуком немає.</p>
    <article v-for="row in rows" :key="row.partNo" class="work-price-card">
      <h3>{{ row.partNo }} · {{ row.description }}</h3>
      <div class="work-price-grid">
        <label v-for="field in fields" :key="field.key">
          {{ field.label }} <span>{{ field.help }}</span>
          <input v-model="row[field.input]" inputmode="decimal" :disabled="busy" :aria-label="`${field.label}, артикул ${row.partNo}`">
        </label>
      </div>
      <div class="work-price-actions">
        <span>Версія запису: {{ row.version }}</span>
        <button type="button" :disabled="busy" @click="save(row)">Зберегти ціни</button>
      </div>
    </article>

    <div class="work-price-paging">
      <button type="button" :disabled="busy || page === 0" @click="page--; load()">Назад</button>
      <span>Сторінка {{ page + 1 }}</span>
      <button type="button" :disabled="busy || rows.length < 100" @click="page++; load()">Далі</button>
    </div>
  </section>
</template>

<style scoped>
.work-prices{min-width:0}
.work-price-search{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin:14px 0}
.work-price-search label{display:grid;gap:6px;flex:1 1 260px}
.work-price-search input,.work-price-grid input{box-sizing:border-box;width:100%;min-width:0;padding:9px;border:1px solid #bdccd4;border-radius:6px;font:inherit}
.work-price-card{border:1px solid #ccd8df;border-radius:9px;padding:14px;margin:12px 0}
.work-price-card h3{margin:0 0 12px;overflow-wrap:anywhere}
.work-price-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.work-price-grid label{display:grid;gap:6px;min-width:0}
.work-price-grid label span{font-size:12px;color:#647987}
.work-price-actions,.work-price-paging{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:12px}
.work-prices button{font:inherit;min-height:40px;padding:8px 12px;border:1px solid #bdccd4;border-radius:6px;cursor:pointer}
.work-prices button:disabled{opacity:.5;cursor:default}
.work-price-paging{justify-content:flex-start}
[role=alert]{color:#a22}
[role=status]{color:#17663a}
@media(max-width:600px){.work-price-grid{grid-template-columns:1fr}.work-price-search button{flex:1 1 140px}.work-price-actions span{width:100%}}
</style>
