<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchBranches, saveBranch } from '../services/branches.js'

const props = defineProps({ session: { type: Object, required: true } })
const isAdmin = computed(() => props.session.roles?.includes('ROLE_ADMIN'))
const rows = ref([])
const form = ref(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')

function emptyForm() {
  return { branchNo: null, name: '', address: '', active: true }
}

async function load() {
  if (!isAdmin.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    rows.value = await fetchBranches(props.session.token)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

function create() {
  form.value = emptyForm()
  error.value = ''
  notice.value = ''
}

function edit(row) {
  form.value = { ...row }
  error.value = ''
  notice.value = ''
}

function cancel() {
  form.value = null
  error.value = ''
}

async function save() {
  if (!form.value || busy.value) return
  const name = form.value.name.trim()
  if (!name) {
    error.value = 'Вкажіть назву філії.'
    return
  }
  if (!window.confirm(form.value.active
    ? 'Зберегти налаштування філії?'
    : 'Деактивувати філію? Вона зникне зі списку доступних філій, але її історичні дані збережуться.')) return

  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await saveBranch(props.session.token, { ...form.value, name })
    form.value = null
    notice.value = 'Налаштування філії збережено.'
    rows.value = await fetchBranches(props.session.token)
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section v-if="isAdmin" class="branch-admin">
    <header class="branch-admin__header">
      <div>
        <h2>Керування філіями</h2>
        <p>Назва й адреса використовуються в даних філії. Неактивні філії залишаються в історичних записах, але не доступні для нового вибору.</p>
      </div>
      <div class="branch-admin__actions">
        <button type="button" :disabled="busy" @click="load">Оновити</button>
        <button type="button" class="primary" :disabled="busy" @click="create">Додати філію</button>
      </div>
    </header>

    <p v-if="error" class="branch-admin__error" role="alert">{{ error }}</p>
    <p v-if="notice" class="branch-admin__notice" role="status">{{ notice }}</p>

    <form v-if="form" class="branch-admin__form" @submit.prevent="save">
      <h3>{{ form.branchNo ? `Філія №${form.branchNo}` : 'Нова філія' }}</h3>
      <fieldset :disabled="busy">
        <label v-if="form.branchNo">Номер філії<input :value="form.branchNo" readonly></label>
        <label>Назва філії<input v-model="form.name" required maxlength="50" placeholder="Наприклад, Студія"></label>
        <label>Адреса філії<input v-model="form.address" maxlength="255" placeholder="Місто, вулиця, будинок"></label>
        <label class="branch-admin__active"><input v-model="form.active" type="checkbox"> Філія активна</label>
        <p class="branch-admin__hint">Адреса тут — адреса конкретної філії, не юридична адреса підприємства з company_details.</p>
        <div class="branch-admin__actions">
          <button type="submit" class="primary">Зберегти</button>
          <button type="button" @click="cancel">Скасувати</button>
        </div>
      </fieldset>
    </form>

    <p v-if="!rows.length && !busy">Філій не знайдено.</p>
    <article v-for="row in rows" :key="row.branchNo" class="branch-admin__row">
      <div class="branch-admin__details">
        <strong>{{ row.name }}</strong>
        <span>№ {{ row.branchNo }}</span>
        <span>{{ row.address || 'Адресу ще не вказано' }}</span>
      </div>
      <div class="branch-admin__row-actions">
        <span :class="['branch-admin__status', row.active ? 'is-active' : 'is-inactive']">{{ row.active ? 'Активна' : 'Неактивна' }}</span>
        <button type="button" :disabled="busy" @click="edit(row)">Редагувати</button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.branch-admin{min-width:0}.branch-admin__header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.branch-admin h2{margin:0 0 8px}.branch-admin p{line-height:1.55;color:#526773}.branch-admin__actions,.branch-admin__row-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.branch-admin button,.branch-admin input{font:inherit;padding:9px 11px;border:1px solid #bdccd4;border-radius:7px;box-sizing:border-box;max-width:100%}.branch-admin button{cursor:pointer;background:#f4f8f9;color:#23454b}.branch-admin button.primary{background:#185c63;color:#fff}.branch-admin button:disabled{opacity:.55;cursor:default}.branch-admin__form{border:1px solid #91b6bc;background:#f5f9fa;padding:16px;border-radius:10px;margin:18px 0}.branch-admin__form h3{margin-top:0}.branch-admin__form fieldset{border:0;padding:0;display:grid;gap:12px}.branch-admin__form label{display:grid;gap:6px}.branch-admin__form input:not([type=checkbox]){width:100%;background:#fff}.branch-admin__form .branch-admin__active{display:flex;align-items:center;gap:8px}.branch-admin__form .branch-admin__active input{width:18px;height:18px;padding:0}.branch-admin__hint{font-size:12px;margin:0}.branch-admin__row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px;border:1px solid #d7e1e6;border-radius:9px;margin:10px 0}.branch-admin__details{display:grid;gap:5px;min-width:0}.branch-admin__details span{font-size:13px;color:#607580;overflow-wrap:anywhere}.branch-admin__status{font-size:12px;font-weight:600}.is-active{color:#267044}.is-inactive{color:#8b5b36}.branch-admin__error{color:#a22!important}.branch-admin__notice{color:#267044!important}@media(max-width:600px){.branch-admin__row{align-items:flex-start;flex-direction:column}.branch-admin__row-actions{width:100%;justify-content:space-between}}
</style>
