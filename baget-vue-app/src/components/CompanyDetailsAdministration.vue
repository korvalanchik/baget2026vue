<script setup>
import { computed, onMounted, ref } from 'vue'
import { fetchCompanyDetails, saveCompanyDetails } from '../services/companyDetails.js'

const props = defineProps({ session: { type: Object, required: true } })
const isAdmin = computed(() => props.session.roles?.includes('ROLE_ADMIN'))
const form = ref(emptyForm())
const warnings = ref([])
const readyForReceipts = ref(false)
const busy = ref(false)
const loaded = ref(false)
const error = ref('')
const notice = ref('')

function emptyForm() {
  return { fullName: '', edrpou: '', ipn: '', address: '' }
}

function applyDetails(details) {
  form.value = {
    fullName: details.fullName || '',
    edrpou: details.edrpou || '',
    ipn: details.ipn || '',
    address: details.address || '',
  }
  warnings.value = details.warnings || []
  readyForReceipts.value = Boolean(details.readyForReceipts)
}

async function load() {
  if (!isAdmin.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    applyDetails(await fetchCompanyDetails(props.session.token))
    loaded.value = true
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

async function save() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const details = await saveCompanyDetails(props.session.token, form.value)
    applyDetails(details)
    notice.value = readyForReceipts.value
      ? 'Реквізити суб’єкта господарювання збережено.'
      : 'Зміни збережено, але реквізити для друку чеків ще неповні.'
  } catch (e) {
    error.value = e.message
  } finally {
    busy.value = false
  }
}

onMounted(load)
</script>

<template>
  <section v-if="isAdmin" class="company-details-admin">
    <header class="company-details-admin__header">
      <div>
        <h2>Реквізити суб'єкта господарювання</h2>
        <p>Ці дані друкуються у клієнтському фіскальному чеку. Редагувати їх може лише адміністратор.</p>
      </div>
      <button type="button" :disabled="busy" @click="load">Оновити</button>
    </header>

    <p v-if="error" class="company-details-admin__error" role="alert">{{ error }}</p>
    <p v-if="notice" class="company-details-admin__notice" role="status">{{ notice }}</p>

    <div v-if="loaded && !readyForReceipts" class="company-details-admin__warning" role="alert">
      <strong>Чеки не можна коректно сформувати: реквізити неповні.</strong>
      <ul>
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
      <span>Після заповнення обов'язкових полів збережіть зміни. Повторно відкривати або фіскалізувати вже створені чеки не потрібно.</span>
    </div>
    <p v-else-if="loaded && readyForReceipts" class="company-details-admin__ready" role="status">
      Основні реквізити для клієнтських чеків заповнені.
    </p>

    <form class="company-details-admin__form" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label>
          Повне найменування суб'єкта господарювання
          <input v-model="form.fullName" maxlength="255" placeholder="ФОП / назва юридичної особи">
        </label>
        <div class="company-details-admin__grid">
          <label>
            ЄДРПОУ / РНОКПП
            <input v-model="form.edrpou" maxlength="20" inputmode="numeric" placeholder="Податковий номер">
          </label>
          <label>
            ІПН платника ПДВ
            <input v-model="form.ipn" maxlength="20" inputmode="numeric" placeholder="Заповнюється для платника ПДВ">
          </label>
        </div>
        <p class="company-details-admin__hint">Вкажіть ЄДРПОУ / РНОКПП або ІПН платника ПДВ. Якщо заповнено ІПН, у чеку він використовується як податковий номер із позначкою «ПН»; інакше використовується ЄДРПОУ / РНОКПП із позначкою «ІД».</p>
        <label>
          Юридична адреса
          <input v-model="form.address" maxlength="255" placeholder="Юридична адреса суб'єкта господарювання">
        </label>
        <p class="company-details-admin__hint">Юридична адреса зберігається окремо. У клієнтському чеку друкується адреса конкретної філії з розділу «Керування філіями».</p>
        <div class="company-details-admin__actions">
          <button type="submit" class="primary" :disabled="busy">Зберегти реквізити</button>
        </div>
      </fieldset>
    </form>
  </section>
</template>

<style scoped>
.company-details-admin{min-width:0}.company-details-admin__header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.company-details-admin h2{margin:0 0 8px}.company-details-admin p{line-height:1.55;color:#526773}.company-details-admin button,.company-details-admin input{font:inherit;padding:9px 11px;border:1px solid #bdccd4;border-radius:7px;box-sizing:border-box;max-width:100%}.company-details-admin button{cursor:pointer;background:#f4f8f9;color:#23454b}.company-details-admin button.primary{background:#185c63;color:#fff}.company-details-admin button:disabled{opacity:.55;cursor:default}.company-details-admin__form{border:1px solid #d7e1e6;border-radius:10px;padding:16px;margin-top:16px}.company-details-admin__form fieldset{border:0;padding:0;display:grid;gap:13px}.company-details-admin__form label{display:grid;gap:6px;font-weight:600}.company-details-admin__form input{width:100%;background:#fff;font-weight:400}.company-details-admin__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.company-details-admin__hint{font-size:12px;margin:-5px 0 0}.company-details-admin__actions{display:flex;justify-content:flex-end}.company-details-admin__warning{border:1px solid #d7a64a;background:#fff8e8;color:#704d12;border-radius:9px;padding:13px 16px;margin:16px 0;line-height:1.5}.company-details-admin__warning ul{margin:8px 0}.company-details-admin__warning span{font-size:13px}.company-details-admin__ready{border:1px solid #a8cbb2;background:#f1f8f2;color:#28613b;border-radius:8px;padding:10px 13px}.company-details-admin__error{color:#a22!important}.company-details-admin__notice{color:#267044!important}@media(max-width:600px){.company-details-admin__grid{grid-template-columns:1fr}}
</style>
