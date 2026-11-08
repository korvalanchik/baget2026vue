<script setup>
import { computed, onMounted, ref } from "vue";
import { getPrroAudit, getPrroBranches, getPrroDevices, getPrroEndpoint, savePrroDevice } from "../services/prro.js";

const props = defineProps({ session: { type: Object, required: true } });
const branches = ref([]);
const devices = ref([]);
const audit = ref([]);
const endpoint = ref(null);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const notice = ref("");
const editingId = ref(null);
const form = ref(emptyForm());
const hasDevices = computed(() => devices.value.length > 0);

function emptyForm() {
  return { branchNo: "", fiscalNumber: "", displayName: "", enabled: false };
}
function edit(device) {
  editingId.value = device.id;
  form.value = {
    branchNo: device.branchNo == null ? "" : String(device.branchNo),
    fiscalNumber: device.fiscalNumber,
    displayName: device.displayName,
    enabled: device.enabled,
  };
  error.value = "";
  notice.value = "";
}
function resetForm() {
  editingId.value = null;
  form.value = emptyForm();
  error.value = "";
}
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [branchRows, deviceRows, auditRows, endpointConfig] = await Promise.all([
      getPrroBranches(props.session.token),
      getPrroDevices(props.session.token),
      getPrroAudit(props.session.token),
      getPrroEndpoint(props.session.token),
    ]);
    branches.value = branchRows;
    devices.value = deviceRows;
    audit.value = auditRows;
    endpoint.value = endpointConfig;
  } catch (reason) {
    error.value = reason.message || "Не вдалося завантажити налаштування ПРРО.";
  } finally {
    loading.value = false;
  }
}
async function submit() {
  error.value = "";
  notice.value = "";
  const fiscalNumber = form.value.fiscalNumber.trim();
  const displayName = form.value.displayName.trim();
  if (!/^\d{1,32}$/.test(fiscalNumber)) {
    error.value = "Фіскальний номер має містити лише цифри (до 32 символів).";
    return;
  }
  if (!displayName) {
    error.value = "Вкажіть назву каси.";
    return;
  }
  saving.value = true;
  try {
    await savePrroDevice(props.session.token, editingId.value, {
      branchNo: form.value.branchNo === "" ? null : Number(form.value.branchNo),
      fiscalNumber,
      displayName,
      enabled: Boolean(form.value.enabled),
    });
    notice.value = editingId.value ? "Налаштування ПРРО оновлено." : "ПРРО додано.";
    resetForm();
    await load();
  } catch (reason) {
    error.value = reason.message || "Не вдалося зберегти ПРРО.";
  } finally {
    saving.value = false;
  }
}
function branchLabel(device) {
  return device.branchName ? `${device.branchNo} · ${device.branchName}` : "Не прив'язано";
}
onMounted(load);
</script>

<template>
  <section class="prro-settings">
    <header class="settings-heading">
      <div>
        <h2>Налаштування ПРРО</h2>
        <p>Касові пристрої, їх прив'язка до філій та контроль змін конфігурації.</p>
      </div>
      <button type="button" :disabled="loading" @click="load">{{ loading ? "Оновлення…" : "Оновити" }}</button>
    </header>

    <p class="policy-note">
      Сервер ДПС для всієї інсталяції:
      <strong>{{ endpoint?.mode === "TEST" ? "TEST API" : endpoint?.mode === "PRODUCTION" ? "PRODUCTION API" : endpoint?.mode || "—" }}</strong>
      <span v-if="endpoint"> · {{ endpoint.host }}:{{ endpoint.port }} · TLS {{ endpoint.tlsEnabled ? "увімкнено" : "вимкнено" }}</span>.
      Режим задається серверною конфігурацією Cloud Run і не налаштовується окремо для кожної каси.
      На першому етапі дозволено один пристрій на одну філію. Пристрій без філії можна зберегти як чернетку, але активувати його не можна.
    </p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>

    <div class="device-list">
      <h3>Касові пристрої <span>{{ devices.length }}</span></h3>
      <p v-if="loading && !hasDevices">Завантажуємо пристрої…</p>
      <p v-else-if="!hasDevices">ПРРО ще не налаштовано.</p>
      <article v-for="device in devices" :key="device.id" class="device-row">
        <div class="device-main">
          <strong>{{ device.displayName }}</strong>
          <span>{{ branchLabel(device) }} · ФН {{ device.fiscalNumber }}</span>
          <small>Наступний локальний № {{ device.nextLocalNumber }}</small>
        </div>
        <div class="device-state">
          <span :class="['state', device.enabled ? 'active' : 'inactive']">{{ device.enabled ? "Активний" : "Вимкнений" }}</span>
          <span v-if="device.shiftOpen" class="state shift">Зміна відкрита</span>
          <button type="button" @click="edit(device)">Редагувати</button>
        </div>
      </article>
    </div>

    <form class="device-form" @submit.prevent="submit">
      <h3>{{ editingId ? "Редагування ПРРО" : "Додати касовий пристрій" }}</h3>
      <div class="fields">
        <label>Філія
          <select v-model="form.branchNo">
            <option value="">Не прив'язано (чернетка)</option>
            <option v-for="branch in branches" :key="branch.branchNo" :value="String(branch.branchNo)">
              {{ branch.branchNo }} · {{ branch.name }}
            </option>
          </select>
        </label>
        <label>Фіскальний номер ПРРО
          <input v-model="form.fiscalNumber" inputmode="numeric" maxlength="32" autocomplete="off" placeholder="Наприклад, 4000318883">
        </label>
        <label>Назва каси
          <input v-model="form.displayName" maxlength="120" placeholder="Каса філії">
        </label>
      </div>
      <label class="enabled-control"><input v-model="form.enabled" type="checkbox"> Активувати пристрій</label>
      <p class="form-hint">Зміна філії або фіскального номера заблокована під час відкритої зміни та за наявності невизначених фіскальних операцій. TEST/PRODUCTION endpoint налаштовується один раз для всього backend.</p>
      <div class="form-actions">
        <button class="primary" type="submit" :disabled="saving">{{ saving ? "Зберігаємо…" : editingId ? "Зберегти зміни" : "Додати ПРРО" }}</button>
        <button v-if="editingId" type="button" :disabled="saving" @click="resetForm">Скасувати</button>
      </div>
    </form>

    <div class="audit-list">
      <h3>Журнал змін конфігурації</h3>
      <p v-if="!audit.length">Записів поки немає.</p>
      <article v-for="event in audit" :key="event.id" class="audit-row">
        <strong>{{ event.action }}</strong>
        <span>Пристрій #{{ event.deviceId ?? "—" }} · {{ event.actor }}</span>
        <time>{{ new Date(event.createdAt).toLocaleString("uk-UA") }}</time>
      </article>
    </div>
  </section>
</template>

<style scoped>
.prro-settings{display:grid;gap:18px;min-width:0}.settings-heading{display:flex;justify-content:space-between;align-items:start;gap:12px}.settings-heading h2{margin:0 0 6px}.settings-heading p,.form-hint,.policy-note{color:#617580;line-height:1.5;margin:0}.policy-note{padding:12px 14px;border-left:3px solid #8aaab0;background:#f3f8f8;border-radius:6px}.device-list,.device-form,.audit-list{border:1px solid #dce4e9;border-radius:10px;padding:16px;min-width:0}.device-list h3,.device-form h3,.audit-list h3{margin:0 0 12px}.device-list h3 span{font-size:13px;color:#617580;font-weight:500}.device-row,.audit-row{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0;border-top:1px solid #e7edf0}.device-main{display:grid;gap:4px;min-width:0}.device-main span,.device-main small,.audit-row span,.audit-row time{color:#617580;font-size:13px;overflow-wrap:anywhere}.device-state{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.state{font-size:12px;border-radius:999px;padding:5px 9px;background:#edf1f5;color:#465568}.state.active{background:#e8f5ed;color:#24633e}.state.shift{background:#fff3d8;color:#79591b}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px}.fields label{display:grid;gap:6px}.fields input,.fields select{width:100%;min-width:0}.enabled-control{display:flex;align-items:center;gap:8px;margin:12px 0}.enabled-control input{width:18px;height:18px}.form-hint{font-size:13px}.form-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.form-actions .primary{background:#185c63;color:white}.audit-row{justify-content:flex-start;flex-wrap:wrap}.audit-row time{margin-left:auto}@media(max-width:650px){.settings-heading,.device-row{flex-direction:column;align-items:stretch}.device-state{justify-content:flex-start}.audit-row time{margin-left:0}}
</style>
