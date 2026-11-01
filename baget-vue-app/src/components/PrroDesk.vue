<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import { getPrroShiftStatus, inspectRro } from "../services/prro.js";

const props = defineProps({ session: { type: Object, required: true } });
const isAdmin = computed(() => props.session.roles?.includes("ROLE_ADMIN") === true);
const fiscalNumber = ref("4000318883");
const branchNo = ref(/^\d+$/.test(String(props.session.branch?.id ?? "")) ? String(props.session.branch.id) : "");
const shiftStatus = ref(null);
const checkedFiscalNumber = ref("");
const busy = ref(false);
const error = ref("");
const message = ref("");
const result = ref(null);
const shiftStateLabel = computed(() => ({ OPEN: "Зміна відкрита", CLOSED: "Зміна закрита", DPS_ERROR: "Помилка відповіді ДПС", RECONCILIATION_REQUIRED: "Потрібна звірка стану" }[shiftStatus.value?.state] || "Стан не перевірено"));
const widgetVisible = ref(false);
let endUser = null;
let scriptPromise = null;

function loadConnector() {
  if (window.EndUser) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${window.location.origin}/eusign.js`;
      script.onload = () => window.EndUser ? resolve() : reject(new Error("Не знайдено API віджета ІІТ."));
      script.onerror = () => reject(new Error("Не вдалося завантажити public/eusign.js."));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

async function getWidget() {
  await loadConnector();
  if (endUser) return endUser;
  widgetVisible.value = true;
  endUser = new window.EndUser(
    "iit-widget-parent",
    "iit-sign-widget-frame",
    "https://eu.iit.com.ua/sign-widget/v20240301/",
    window.EndUser.FormType.SignFile,
    { ownCAOnly: false },
  );
  // The SignWidget performs its own initialization; allow the iframe to load
  // before sending the first command (the connector queues commands meanwhile).
  await new Promise((resolve) => window.setTimeout(resolve, 1200));
  return endUser;
}

async function refreshShift() {
  if (busy.value) return;
  error.value = ""; message.value = ""; shiftStatus.value = null;
  const number = fiscalNumber.value.trim();
  const selectedBranch = branchNo.value.trim();
  if (!/^\d{1,10}$/.test(selectedBranch) || Number(selectedBranch) <= 0) { error.value = "Вкажіть коректний номер філії для перевірки ПРРО."; return; }
  if (!/^\d{1,32}$/.test(number)) { error.value = "Введіть фіскальний номер ПРРО: лише цифри."; return; }
  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ…";
    const widget = await getWidget();
    message.value = "Зчитайте КЕП касира та підтвердьте підписання номера ПРРО.";
    await widget.ReadPrivateKey();
    const signatureBase64 = await widget.SignData(number, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311);
    if (typeof signatureBase64 !== "string" || !signatureBase64.length) throw new Error("Віджет ІІТ не повернув підпис у Base64.");
    widgetVisible.value = false;
    message.value = "Підпис отримано. Перевіряємо стан каси у ДПС…";
    shiftStatus.value = await getPrroShiftStatus(props.session.token, selectedBranch, number, signatureBase64);
    message.value = "Стан ПРРО отримано від ДПС. Перевірка не змінює стан каси.";
  } catch (e) { error.value = e.message || "Помилка підписання або перевірки стану ПРРО."; message.value = ""; }
  finally { busy.value = false; widgetVisible.value = false; }
}

async function inspect() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  result.value = null;
  checkedFiscalNumber.value = "";
  const number = fiscalNumber.value.trim();
  if (!/^\d{1,32}$/.test(number)) {
    error.value = "Введіть фіскальний номер: лише цифри.";
    return;
  }
  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ…";
    const widget = await getWidget();
    message.value = "Зчитайте КЕП у вікні ІІТ та підтвердьте підписання.";
    await widget.ReadPrivateKey();
    // Verified in the user's local test: embedded CAdES signature is accepted
    // by DPS infoRro/statusRro when sent as decoded bytes in rro_fn_sign.
    const signatureBase64 = await widget.SignData(
      number,
      false,
      true,
      window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signatureBase64 !== "string" || !signatureBase64.length) {
      throw new Error("Віджет ІІТ не повернув підпис у Base64.");
    }
    widgetVisible.value = false;
    message.value = "Підпис отримано. Запитуємо infoRro та statusRro у ДПС…";
    result.value = await inspectRro(props.session.token, signatureBase64);
    checkedFiscalNumber.value = number;
    message.value = "ДПС відповіла успішно. Це лише діагностика ПРРО — чек не фіскалізовано.";
  } catch (e) {
    error.value = e.message || "Помилка підписання або запиту до ДПС.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
  }
}

async function resetKey() {
  error.value = "";
  message.value = "";
  try {
    if (endUser) await endUser.ResetPrivateKey();
    message.value = "Ключ у віджеті ІІТ очищено.";
  } catch (e) {
    error.value = e.message || "Не вдалося очистити ключ у віджеті.";
  }
}

onBeforeUnmount(() => {
  if (endUser) endUser.destroy();
});
</script>

<template>
  <section class="prro-desk">
    <header class="prro-header">
      <div>
        <h2>Каса / ПРРО</h2>
        <p>Керування зміною ПРРО та фіскальними операціями філії.</p>
      </div>
    </header>

    <section class="prro-panel shift-panel" aria-labelledby="shift-title">
      <div class="shift-heading">
        <div>
          <p class="eyebrow">ПОТОЧНА ФІЛІЯ</p>
          <h3 id="shift-title">{{ session.branch?.name || "Філію не визначено" }}</h3>
        </div>
        <span class="status-pill status-unknown">{{ shiftStateLabel }}</span>
      </div>
      <div class="branch-field">
        <label for="prro-branch-number">Номер філії</label>
        <input id="prro-branch-number" v-model.trim="branchNo" inputmode="numeric" autocomplete="off" maxlength="10" :disabled="busy" />
      </div>
      <p class="prro-note">Для перевірки стану підписується фіскальний номер ПРРО через IIT Agent. Приватний ключ залишається на комп’ютері касира.</p>
      <div class="shift-actions">
        <button type="button" disabled title="Очікує перевірки формату підпису для check_sign">Відкрити зміну</button>
        <button type="button" class="secondary" :disabled="busy" @click="refreshShift">{{ busy ? "Перевіряємо…" : "Підписати та оновити стан" }}</button>
      </div>
      <p v-if="message" role="status" class="prro-message">{{ message }}</p>
      <p v-if="error" role="alert" class="prro-error">{{ error }}</p>
      <dl v-if="shiftStatus" class="prro-result shift-result">
        <div><dt>Фіскальний номер</dt><dd>{{ shiftStatus.fiscalNumber }}</dd></div>
        <div><dt>Середовище</dt><dd>{{ shiftStatus.environment }}</dd></div>
        <div><dt>Статус infoRro / statusRro</dt><dd>{{ shiftStatus.infoStatus }} / {{ shiftStatus.statusStatus }}</dd></div>
        <div><dt>Реєстрація ПРРО</dt><dd>{{ shiftStatus.rroRegistrationStatus }}</dd></div>
        <div><dt>Зв’язок із ДПС</dt><dd>{{ shiftStatus.online ? "Онлайн" : "Офлайн" }}</dd></div>
        <div><dt>Зміна за даними ДПС</dt><dd>{{ shiftStatus.dpsOpenShift ? "Відкрита" : "Закрита" }}</dd></div>
        <div><dt>Локальна операція відкриття</dt><dd>{{ shiftStatus.localShiftPrepared ? "Є" : "Немає" }}</dd></div>
        <div><dt>Наступний локальний номер</dt><dd>{{ shiftStatus.nextLocalNumber }}</dd></div>
        <div><dt>Останній підписувач</dt><dd>{{ shiftStatus.lastSigner || "—" }}</dd></div>
        <div><dt>Повідомлення ДПС</dt><dd>{{ shiftStatus.dpsMessage || "—" }}</dd></div>
      </dl>
      <p v-if="shiftStatus?.state === 'RECONCILIATION_REQUIRED'" class="integration-note" role="alert">Стан у ДПС не збігається з локальним станом Baget. Не відкривайте нову зміну та не фіскалізуйте чеки, доки операцію не буде звірено.</p>
    </section>

    <section class="operation-grid" aria-label="Операції ПРРО">
      <article class="prro-panel operation-card">
        <h3>Фіскалізація чеків</h3>
        <p>Фіскалізація нового надходження після збереження оплати в Baget.</p>
        <button type="button" class="secondary" disabled>Перейти до чеків</button>
      </article>
      <article class="prro-panel operation-card">
        <h3>Закриття зміни</h3>
        <p>Формування Z-звіту та закриття активної зміни ПРРО.</p>
        <button type="button" class="secondary" disabled>Закрити зміну</button>
      </article>
      <article class="prro-panel operation-card">
        <h3>Історія операцій</h3>
        <p>Перегляд фіскалізованих, відхилених і невизначених операцій.</p>
        <button type="button" class="secondary" disabled>Відкрити історію</button>
      </article>
    </section>

    <details v-if="isAdmin" class="diagnostics">
      <summary>Адміністративна діагностика ДПС</summary>
      <div class="prro-panel">
      <label for="rro-fiscal-number">Фіскальний номер ПРРО</label>
      <input id="rro-fiscal-number" v-model.trim="fiscalNumber" inputmode="numeric"
        autocomplete="off" maxlength="32" :disabled="busy" />
      <div class="prro-actions">
        <button type="button" :disabled="busy" @click="inspect">
          {{ busy ? "Виконується…" : "Підписати та перевірити infoRro" }}
        </button>
        <button type="button" class="secondary" :disabled="busy || !endUser" @click="resetKey">
          Очистити ключ ІІТ
        </button>
      </div>
      <p class="prro-note">Підписання відбувається локально через віджет ІІТ. Приватний ключ і пароль не надсилаються на бекенд; надсилається лише підпис для перевірки ДПС.</p>
      <p v-if="message" role="status" class="prro-message">{{ message }}</p>
      <p v-if="error" role="alert" class="prro-error">{{ error }}</p>
    </div>

    <div v-if="result" class="prro-panel">
      <h3>Відповідь ДПС</h3>
      <dl class="prro-result">
        <div><dt>Номер, переданий на підписання</dt><dd>{{ checkedFiscalNumber }}</dd></div>
        <div><dt>infoRro</dt><dd>{{ result.infoStatus }}</dd></div>
        <div><dt>statusRro</dt><dd>{{ result.statusStatus }}</dd></div>
        <div><dt>Статус ПРРО</dt><dd>{{ result.statusRro }}</dd></div>
        <div><dt>Онлайн</dt><dd>{{ result.online ? "Так" : "Ні" }}</dd></div>
        <div><dt>Зміна відкрита</dt><dd>{{ result.openShift ? "Так" : "Ні" }}</dd></div>
        <div><dt>Назва</dt><dd>{{ result.name || "—" }}</dd></div>
        <div><dt>Назва платника</dt><dd>{{ result.paymentName || "—" }}</dd></div>
        <div><dt>Останній підписувач</dt><dd>{{ result.lastSigner || "—" }}</dd></div>
        <div><dt>Помилка statusRro</dt><dd>{{ result.statusErrorMessage || "—" }}</dd></div>
      </dl>
      <p class="prro-note">Номер вище взято з введеного значення, яке підписував віджет ІІТ. Відповідь про ПРРО ДПС визначає за підписаними даними, а не за окремо переданим номером.</p>
      <h4>Зареєстровані оператори</h4>
      <p v-if="!result.operators?.length">ДПС не повернула список операторів.</p>
      <ul v-else class="prro-operators">
        <li v-for="operator in result.operators" :key="operator.serial">
          {{ operator.name || "Оператор" }} · статус {{ operator.status }}
          <span v-if="operator.senior">· старший касир</span>
        </li>
      </ul>
    </div>

    </details>

    <div id="iit-widget-overlay" class="iit-widget-overlay" :class="{ visible: widgetVisible }">
      <div class="iit-widget-dialog">
        <div class="iit-widget-title">Підписання КЕП · ІІТ</div>
        <div id="iit-widget-parent" class="iit-widget-parent"></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.prro-desk { padding: 20px clamp(12px, 3vw, 28px); display: grid; gap: 16px; min-width: 0; }
.shift-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.shift-heading h3 { margin: 4px 0 12px; }
.eyebrow { margin: 0; color: #697789; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
.status-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
.status-unknown { color: #596579; background: #eef1f5; }
.branch-field { margin: 12px 0; }
.branch-field label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 600; }
.branch-field input { width: min(100%, 220px); min-height: 40px; border: 1px solid #b9c4d0; border-radius: 8px; padding: 8px 10px; font: inherit; }
.shift-result { margin-top: 16px; }
.shift-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
.integration-note { margin: 14px 0 0; padding: 10px 12px; border-left: 3px solid #c58b2a; background: #fff8e9; color: #70521c; font-size: 13px; line-height: 1.5; }
.operation-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.operation-card { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.operation-card h3 { margin: 0; }
.operation-card p { flex: 1; margin: 0 0 8px; color: #5d6878; line-height: 1.5; font-size: 14px; }
.diagnostics summary { cursor: pointer; color: #34445b; font-weight: 600; padding: 8px 2px; }
.diagnostics .prro-panel { margin-top: 12px; }
.prro-header h2 { margin: 0 0 6px; }
.prro-header p, .prro-note { color: #5d6878; margin: 0; line-height: 1.5; }
.prro-panel { background: white; border: 1px solid #dce2e8; border-radius: 12px; padding: 18px; }
.prro-panel h3, .prro-panel h4 { margin-top: 0; }
.prro-panel label { display: block; margin-bottom: 8px; font-weight: 600; }
.prro-panel input { box-sizing: border-box; width: 100%; max-width: 420px; min-height: 44px; border: 1px solid #b9c4d0; border-radius: 8px; padding: 10px 12px; font: inherit; }
.prro-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
.prro-actions button, .shift-actions button, .operation-card button { min-height: 44px; border: 0; border-radius: 8px; padding: 10px 16px; background: #2456a6; color: white; font: inherit; cursor: pointer; }
.prro-actions button.secondary, .shift-actions button.secondary, .operation-card button.secondary { background: #edf1f5; color: #243247; }
.prro-actions button:disabled, .shift-actions button:disabled, .operation-card button:disabled { opacity: .55; cursor: not-allowed; }
.prro-note { font-size: 13px; }
.prro-message { color: #175d35; margin-bottom: 0; }
.prro-error { color: #a21d28; margin-bottom: 0; }
.prro-result { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.prro-result div { min-width: 0; }
.prro-result dt { color: #657184; font-size: 13px; }
.prro-result dd { margin: 4px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.prro-operators { padding-left: 20px; }
.iit-widget-overlay { position: fixed; inset: 0; z-index: 2000; display: none; align-items: center; justify-content: center; padding: 16px; background: #0c1728a8; }
.iit-widget-overlay.visible { display: flex; }
.iit-widget-dialog { width: min(900px, 100%); height: min(800px, 92vh); overflow: hidden; background: white; border-radius: 12px; display: flex; flex-direction: column; }
.iit-widget-title { padding: 12px 16px; font-weight: 600; border-bottom: 1px solid #e0e5eb; }
.iit-widget-parent { flex: 1; min-height: 0; }
@media (max-width: 600px) { .shift-heading { align-items: flex-start; } .shift-actions button { width: 100%; } .iit-widget-overlay { padding: 0; } .iit-widget-dialog { height: 100dvh; border-radius: 0; } }
</style>
