<script setup>
import { onBeforeUnmount, ref } from "vue";
import { inspectRro } from "../services/prro.js";

const props = defineProps({ session: { type: Object, required: true } });
const fiscalNumber = ref("4000318883");
const checkedFiscalNumber = ref("");
const busy = ref(false);
const error = ref("");
const message = ref("");
const result = ref(null);
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
        <h2>ПРРО · діагностика ДПС</h2>
        <p>Перевірка доступності ПРРО через IIT SignWidget. Ця дія не фіскалізує чек.</p>
      </div>
    </header>

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
.prro-header h2 { margin: 0 0 6px; }
.prro-header p, .prro-note { color: #5d6878; margin: 0; line-height: 1.5; }
.prro-panel { background: white; border: 1px solid #dce2e8; border-radius: 12px; padding: 18px; }
.prro-panel h3, .prro-panel h4 { margin-top: 0; }
.prro-panel label { display: block; margin-bottom: 8px; font-weight: 600; }
.prro-panel input { box-sizing: border-box; width: 100%; max-width: 420px; min-height: 44px; border: 1px solid #b9c4d0; border-radius: 8px; padding: 10px 12px; font: inherit; }
.prro-actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; }
.prro-actions button { min-height: 44px; border: 0; border-radius: 8px; padding: 10px 16px; background: #2456a6; color: white; font: inherit; cursor: pointer; }
.prro-actions button.secondary { background: #edf1f5; color: #243247; }
.prro-actions button:disabled { opacity: .55; cursor: not-allowed; }
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
@media (max-width: 600px) { .iit-widget-overlay { padding: 0; } .iit-widget-dialog { height: 100dvh; border-radius: 0; } }
</style>
