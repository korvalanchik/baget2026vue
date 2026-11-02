<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getPrroBranches, getPrroDeviceForBranch, getPrroShiftStatus, inspectLastPrroCheck, inspectRro, preparePrroShiftOpen, submitPrroShiftOpen, preparePrroShiftClose, submitPrroShiftClose } from "../services/prro.js";

const props = defineProps({ session: { type: Object, required: true } });
const canRunDiagnostics = computed(() => props.session.roles?.some(role => ["ROLE_ADMIN", "ROLE_SENIOR_CASHIER"].includes(role)) === true);
const fiscalNumber = ref("");
const branches = ref([]);
const deviceName = ref("");
const branchNo = ref(/^\d+$/.test(String(props.session.branch?.id ?? "")) ? String(props.session.branch.id) : "");
const shiftStatus = ref(null);
const lastCheck = ref(null);
const checkedFiscalNumber = ref("");
const busy = ref(false);
const error = ref("");
const message = ref("");
const result = ref(null);
const fixtureXml = ref("");
const fixtureKind = ref("");
const fixtureResult = ref(null);
const selectedSignerKeyId = ref("");
const shiftOpenResult = ref(null);
const shiftOpenIdempotencyKey = ref("");
const shiftCloseResult = ref(null);
const shiftCloseIdempotencyKey = ref("");
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

async function loadBranches() {
  try {
    branches.value = await getPrroBranches(props.session.token);
    if (!branchNo.value && branches.value.length) branchNo.value = String(branches.value[0].branchNo);
    if (branchNo.value) await loadDeviceForBranch();
  } catch (e) {
    error.value = e.message || "Не вдалося завантажити доступні філії ПРРО.";
  }
}

async function loadDeviceForBranch() {
  const selectedBranch = branchNo.value.trim();
  fiscalNumber.value = "";
  deviceName.value = "";
  shiftStatus.value = null;
  lastCheck.value = null;
  result.value = null;
  selectedSignerKeyId.value = "";
  shiftOpenResult.value = null;
  shiftOpenIdempotencyKey.value = "";
  shiftCloseResult.value = null;
  shiftCloseIdempotencyKey.value = "";
  if (!selectedBranch) return;
  try {
    const device = await getPrroDeviceForBranch(props.session.token, selectedBranch);
    fiscalNumber.value = device.fiscalNumber;
    deviceName.value = device.displayName;
  } catch (e) {
    if (e.status !== 404) error.value = e.message || "Не вдалося завантажити налаштування каси.";
  }
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
    if (shiftStatus.value.state === "CLOSED") {
      selectedSignerKeyId.value = "";
    } else if (shiftStatus.value.state === "OPEN" && shiftStatus.value.lastSigner
      && result.value?.operators?.some(operator => operator.serial === shiftStatus.value.lastSigner)) {
      selectedSignerKeyId.value = shiftStatus.value.lastSigner;
    }
    message.value = "Стан ПРРО отримано від ДПС. Перевірка не змінює стан каси.";
  } catch (e) { error.value = e.message || "Помилка підписання або перевірки стану ПРРО."; message.value = ""; }
  finally { busy.value = false; widgetVisible.value = false; }
}

async function inspectLastCheck() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  lastCheck.value = null;
  const number = fiscalNumber.value.trim();
  const selectedBranch = branchNo.value.trim();
  if (!/^\d{1,10}$/.test(selectedBranch) || Number(selectedBranch) <= 0) {
    error.value = "Вкажіть коректний номер філії для перевірки ПРРО.";
    return;
  }
  if (!/^\d{1,32}$/.test(number)) {
    error.value = "Введіть фіскальний номер ПРРО: лише цифри.";
    return;
  }
  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ…";
    const widget = await getWidget();
    message.value = "Зчитайте КЕП касира та підтвердьте підписання номера ПРРО.";
    await widget.ReadPrivateKey();
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
    message.value = "Підпис отримано. Виконуємо lastChk у ДПС…";
    lastCheck.value = await inspectLastPrroCheck(
      props.session.token, selectedBranch, number, signatureBase64,
    );
    message.value = "Отримано відповідь lastChk. Документ не змінювався та не надсилався.";
  } catch (e) {
    error.value = e.message || "Помилка підписання або запиту lastChk.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
  }
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

async function openShiftOnTest() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  shiftOpenResult.value = null;

  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  const signerKeyId = selectedSignerKeyId.value.trim();
  if (shiftStatus.value?.state !== "CLOSED" || shiftStatus.value?.environment !== "TEST") {
    error.value = "Спочатку перевірте, що вибраний TEST-ПРРО має закриту зміну.";
    return;
  }
  if (!signerKeyId) {
    error.value = "Спочатку отримайте список операторів через адміністративну діагностику та виберіть сертифікат касира.";
    return;
  }

  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ…";
    const widget = await getWidget();
    message.value = "Зчитайте КЕП касира. Спочатку підпишемо фіскальний номер для підготовки XML.";
    await widget.ReadPrivateKey();
    const rroSignatureBase64 = await widget.SignData(
      number, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof rroSignatureBase64 !== "string" || !rroSignatureBase64.length) {
      throw new Error("ІIT не повернув підпис фіскального номера.");
    }

    if (!shiftOpenIdempotencyKey.value) {
      shiftOpenIdempotencyKey.value = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : "shift-open-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    }
    message.value = "Baget готує XML SERVICECHK та перевіряє попередній документ у ДПС…";
    const prepared = await preparePrroShiftOpen(props.session.token, {
      branchNo: Number(selectedBranch),
      fiscalNumber: number,
      rroSignatureBase64,
      signerKeyId,
      idempotencyKey: shiftOpenIdempotencyKey.value,
    });

    const binary = window.atob(prepared.signingInputBase64);
    const xmlBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const xml = new TextDecoder("windows-1251").decode(xmlBytes);
    message.value = "XML отримано. Підтвердьте його підписання у віджеті IIT…";
    const signedPayloadBase64 = await widget.SignData(
      xml, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signedPayloadBase64 !== "string" || !signedPayloadBase64.length) {
      throw new Error("IIT не повернув підписаний XML у Base64.");
    }

    widgetVisible.value = false;
    message.value = "Підпис отримано. Надсилаємо SERVICECHK на тестовий сервер ДПС…";
    shiftOpenResult.value = await submitPrroShiftOpen(props.session.token, {
      operationId: prepared.operationId,
      signerKeyId,
      signedPayloadBase64,
    });
    if (shiftOpenResult.value.status === "FISCALIZED") {
      message.value = "Тестовий сервер ДПС прийняв SERVICECHK. Перевірте відповідь і стан ПРРО.";
    } else if (shiftOpenResult.value.status === "REJECTED") {
      message.value = "ДПС відхилила SERVICECHK. Нижче наведено код і повідомлення відповіді.";
      shiftOpenIdempotencyKey.value = "";
    } else {
      message.value = "Результат надсилання неоднозначний. Повторно не надсилайте — спочатку звіримо стан.";
    }
  } catch (e) {
    error.value = e.message || "Не вдалося підготувати, підписати або надіслати SERVICECHK.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
  }
}


async function closeShiftOnTest() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  shiftCloseResult.value = null;

  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  const signerKeyId = selectedSignerKeyId.value.trim();
  if (shiftStatus.value?.state !== "OPEN" || shiftStatus.value?.environment !== "TEST") {
    error.value = "Спочатку перевірте, що вибраний TEST-ПРРО має відкриту зміну.";
    return;
  }
  if (!signerKeyId) {
    error.value = "Оберіть сертифікат касира, яким було відкрито цю зміну.";
    return;
  }

  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ…";
    const widget = await getWidget();
    message.value = "Зчитайте КЕП касира. Підпишемо фіскальний номер для підготовки Z-звіту.";
    await widget.ReadPrivateKey();
    const rroSignatureBase64 = await widget.SignData(
      number, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof rroSignatureBase64 !== "string" || !rroSignatureBase64.length) {
      throw new Error("ІIT не повернув підпис фіскального номера.");
    }

    if (!shiftCloseIdempotencyKey.value) {
      shiftCloseIdempotencyKey.value = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : "shift-close-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    }
    message.value = "Baget перевіряє стан зміни, lastChk та готує ZREPORT…";
    const prepared = await preparePrroShiftClose(props.session.token, {
      branchNo: Number(selectedBranch),
      fiscalNumber: number,
      rroSignatureBase64,
      signerKeyId,
      idempotencyKey: shiftCloseIdempotencyKey.value,
    });

    const binary = window.atob(prepared.signingInputBase64);
    const xmlBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    const xml = new TextDecoder("windows-1251").decode(xmlBytes);
    message.value = "ZREPORT сформовано. Підтвердьте підписання XML у віджеті IIT…";
    const signedPayloadBase64 = await widget.SignData(
      xml, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signedPayloadBase64 !== "string" || !signedPayloadBase64.length) {
      throw new Error("IIT не повернув підписаний ZREPORT у Base64.");
    }

    widgetVisible.value = false;
    message.value = "Підпис отримано. Надсилаємо ZREPORT на тестовий сервер ДПС…";
    shiftCloseResult.value = await submitPrroShiftClose(props.session.token, {
      operationId: prepared.operationId,
      signerKeyId,
      signedPayloadBase64,
    });

    if (shiftCloseResult.value.status === "FISCALIZED") {
      // A new shift must use new idempotency keys for both open and close operations.
      shiftOpenIdempotencyKey.value = "";
      shiftCloseIdempotencyKey.value = "";
      message.value = "ZREPORT прийнято. Перевіряємо statusRro та lastChk у ДПС…";
      try {
        const [updatedStatus, updatedLastCheck] = await Promise.all([
          getPrroShiftStatus(props.session.token, selectedBranch, number, rroSignatureBase64),
          inspectLastPrroCheck(props.session.token, selectedBranch, number, rroSignatureBase64),
        ]);
        shiftStatus.value = updatedStatus;
        lastCheck.value = updatedLastCheck;
        if (updatedStatus.state === "CLOSED"
          && updatedLastCheck.dataSignSha256 === shiftCloseResult.value.signedPayloadSha256) {
          message.value = "ДПС підтвердила закриття зміни. SHA-256 lastChk збігається з підписаним ZREPORT.";
          selectedSignerKeyId.value = "";
        } else {
          message.value = "ZREPORT фіскалізовано, але контрольна звірка statusRro/lastChk потребує уваги. Не відкривайте наступну зміну до звірки.";
        }
      } catch (verificationError) {
        message.value = "ZREPORT фіскалізовано. Не вдалося автоматично завершити контрольну перевірку: "
          + (verificationError.message || "невідома помилка");
      }
    } else if (shiftCloseResult.value.status === "REJECTED") {
      message.value = "ДПС відхилила ZREPORT. Зміна залишається відкритою; не повторюйте надсилання без аналізу відповіді.";
    } else {
      message.value = "Результат надсилання неоднозначний. Не надсилайте ZREPORT повторно — спочатку звіримо statusRro та lastChk.";
    }
  } catch (e) {
    error.value = e.message || "Не вдалося підготувати, підписати або надіслати ZREPORT.";
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

function loadShiftOpenFixture() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");

  fixtureKind.value = "SHIFT_OPEN";
  fixtureResult.value = null;
  fixtureXml.value =
    '<?xml version="1.0" encoding="windows-1251"?>' +
    '<RQ V="1">' +
    '<DAT FN="4538765845" TN="ПН 345612052809" ZN="" DI="238" V="1">' +
    '<C T="108"></C><TS>' + timestamp + '</TS></DAT>' +
    '<MAC ID=""></MAC></RQ>';
  error.value = "";
  message.value = "Завантажено приклад відкриття зміни з опису API ДПС від 01.09.2021. Це тестовий документ; надсилання вимкнено.";
}

function loadSaleCheckFixture() {
  fixtureKind.value = "SALE_CHECK";
  fixtureResult.value = null;
  fixtureXml.value =
    '<DAT FN="4538765845" TN="ПН 345612052809" ZN="АА57506761" DI="238" V="1">' +
    '<C T="0">' +
    '<P N="1" C="0760557812166" NM="T.sonic 615" SM="800" TX="1"></P>' +
    '<M N="2" T="0" NM="ГОТІВКА" SM="800"></M>' +
    '<E N="3" NO="19" SM="800" SE="667" FN="4538765845" TS="20110801112601" ' +
    'TX="1" TXPR="20.00" TXSM="133" DTPR="0.00" DTSM="0" TXTY="0" TXAL="0" CS="1"></E>' +
    '</C><TS>20110801112601</TS></DAT>';
  error.value = "";
  message.value = "Завантажено приклад чека продажу з протоколу 2.2.3, редакція 3.1. Це DAT-фрагмент без MAC/ланцюжка попереднього документа; надсилання вимкнено.";
}

async function signFixture() {
  if (busy.value || !fixtureXml.value.trim()) return;
  error.value = "";
  fixtureResult.value = null;
  busy.value = true;
  try {
    message.value = "Завантажуємо наявний IIT SignWidget…";
    const widget = await getWidget();
    message.value = "Зчитайте тестовий КЕП касира у віджеті ІІТ та підтвердьте підписання XML.";
    await widget.ReadPrivateKey();
    const signatureBase64 = await widget.SignData(
      fixtureXml.value,
      false,
      true,
      window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signatureBase64 !== "string" || !signatureBase64.length) {
      throw new Error("Віджет ІІТ не повернув підпис у Base64.");
    }

    const binary = window.atob(signatureBase64);
    const signatureBytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    let signatureSha256 = null;
    if (window.crypto?.subtle) {
      const digest = await window.crypto.subtle.digest("SHA-256", signatureBytes);
      signatureSha256 = Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    }

    fixtureResult.value = {
      kind: fixtureKind.value,
      signatureBytesLength: signatureBytes.length,
      signatureSha256,
      signatureBase64Prefix: signatureBase64.slice(0, 48),
    };
    widgetVisible.value = false;
    message.value = "IIT SignWidget підписав тестовий XML. Підпис не передавався до ДПС.";
  } catch (e) {
    error.value = e.message || "Не вдалося підписати тестовий XML через IIT SignWidget.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
  }
}

onMounted(loadBranches);

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
        <label for="prro-branch-number">Філія / каса</label>
        <select id="prro-branch-number" v-model="branchNo" :disabled="busy" @change="loadDeviceForBranch">
          <option value="" disabled>Оберіть філію</option>
          <option v-for="branch in branches" :key="branch.branchNo" :value="String(branch.branchNo)">{{ branch.branchNo }} · {{ branch.name }}</option>
        </select>
        <small v-if="deviceName">{{ deviceName }} · ФН {{ fiscalNumber }}</small>
      </div>
      <p class="prro-note">Для перевірки стану фіскальний номер ПРРО підписується через вбудований IIT SignWidget. Приватний ключ залишається на комп’ютері касира. Тестове відкриття доступне лише для TEST-ПРРО.</p>
      <div v-if="canRunDiagnostics && result?.operators?.length" class="branch-field">
        <label for="prro-signer-serial">Сертифікат касира, зареєстрований у ДПС</label>
        <select id="prro-signer-serial" v-model="selectedSignerKeyId" :disabled="busy">
          <option value="">Оберіть сертифікат</option>
          <option v-for="operator in result.operators" :key="operator.serial" :value="operator.serial">
            {{ operator.name || "Оператор" }} · {{ operator.serial }} · статус {{ operator.status }}
          </option>
        </select>
      </div>
      <div class="shift-actions">
        <button type="button" :disabled="busy || shiftStatus?.state !== 'CLOSED' || shiftStatus?.environment !== 'TEST' || !selectedSignerKeyId" @click="openShiftOnTest">Відкрити зміну (тест)</button>
        <button type="button" class="secondary" :disabled="busy" @click="refreshShift">{{ busy ? "Перевіряємо…" : "Підписати та оновити стан" }}</button>
        <button type="button" class="secondary" :disabled="busy" @click="inspectLastCheck">{{ busy ? "Виконуємо…" : "Перевірити останній чек (lastChk)" }}</button>
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
      <dl v-if="lastCheck" class="prro-result shift-result">
        <div><dt>Відповідь lastChk</dt><dd>{{ lastCheck.responseStatus }} ({{ lastCheck.responseCode }})</dd></div>
        <div><dt>ID документа ДПС</dt><dd>{{ lastCheck.fiscalDocumentId || "—" }}</dd></div>
        <div><dt>Розмір data_sign</dt><dd>{{ lastCheck.dataSignLength }} байт</dd></div>
        <div><dt>Починається з XML</dt><dd>{{ lastCheck.dataSignStartsWithXml ? "Так" : "Ні" }}</dd></div>
        <div><dt>SHA-256 data_sign</dt><dd>{{ lastCheck.dataSignSha256 || "—" }}</dd></div>
        <div><dt>Повідомлення ДПС</dt><dd>{{ lastCheck.dpsMessage || "—" }}</dd></div>
      </dl>
      <dl v-if="shiftOpenResult" class="prro-result shift-result">
        <div><dt>Операція</dt><dd>{{ shiftOpenResult.operationId }}</dd></div>
        <div><dt>Стан</dt><dd>{{ shiftOpenResult.status }}</dd></div>
        <div><dt>Код ДПС</dt><dd>{{ shiftOpenResult.responseCode ?? "—" }}</dd></div>
        <div><dt>ID документа ДПС</dt><dd>{{ shiftOpenResult.fiscalDocumentId || "—" }}</dd></div>
        <div><dt>SHA-256 підпису</dt><dd>{{ shiftOpenResult.signedPayloadSha256 || "—" }}</dd></div>
        <div><dt>Повідомлення ДПС</dt><dd>{{ shiftOpenResult.responseMessage || "—" }}</dd></div>
      </dl>
      <dl v-if="shiftCloseResult" class="prro-result shift-result">
        <div><dt>Операція закриття</dt><dd>{{ shiftCloseResult.operationId }}</dd></div>
        <div><dt>Стан</dt><dd>{{ shiftCloseResult.status }}</dd></div>
        <div><dt>Код ДПС</dt><dd>{{ shiftCloseResult.responseCode ?? "—" }}</dd></div>
        <div><dt>ID документа ДПС</dt><dd>{{ shiftCloseResult.fiscalDocumentId || "—" }}</dd></div>
        <div><dt>SHA-256 підписаного ZREPORT</dt><dd>{{ shiftCloseResult.signedPayloadSha256 || "—" }}</dd></div>
        <div><dt>Повідомлення ДПС</dt><dd>{{ shiftCloseResult.responseMessage || "—" }}</dd></div>
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
        <button type="button" class="secondary"
          :disabled="busy || shiftStatus?.state !== 'OPEN' || shiftStatus?.environment !== 'TEST' || !selectedSignerKeyId"
          @click="closeShiftOnTest">Закрити зміну (TEST)</button>
      </article>
      <article class="prro-panel operation-card">
        <h3>Історія операцій</h3>
        <p>Перегляд фіскалізованих, відхилених і невизначених операцій.</p>
        <button type="button" class="secondary" disabled>Відкрити історію</button>
      </article>
    </section>

    <details v-if="canRunDiagnostics" class="diagnostics">
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

      <div class="prro-panel fixture-panel">
        <h3>Тестові приклади XML · IIT SignWidget</h3>
        <p class="prro-note">
          Приклади взято з документів ДПС: відкриття зміни — API від 01.09.2021;
          продаж — протокол 2.2.3, редакція 3.1 від 18.02.2025.
          Це діагностика підписання, а не готова команда фіскалізації.
        </p>
        <div class="prro-actions">
          <button type="button" class="secondary" :disabled="busy" @click="loadShiftOpenFixture">
            Приклад відкриття зміни (SERVICECHK)
          </button>
          <button type="button" class="secondary" :disabled="busy" @click="loadSaleCheckFixture">
            Приклад продажу (CHK)
          </button>
          <button type="button" :disabled="busy || !fixtureXml" @click="signFixture">
            {{ busy ? "Підписуємо…" : "Підписати XML через IIT" }}
          </button>
        </div>
        <p v-if="fixtureKind === 'SALE_CHECK'" class="prro-note">
          У прикладі продажу показано лише DAT. MAC і точний ланцюжок попереднього документа
          навмисно не підставляються навмання.
        </p>
        <textarea v-if="fixtureXml" v-model="fixtureXml" class="fixture-xml"
          rows="12" spellcheck="false" :disabled="busy"></textarea>
        <dl v-if="fixtureResult" class="prro-result">
          <div><dt>Тип тесту</dt><dd>{{ fixtureResult.kind }}</dd></div>
          <div><dt>Розмір підпису</dt><dd>{{ fixtureResult.signatureBytesLength }} байт</dd></div>
          <div><dt>SHA-256 підпису</dt><dd>{{ fixtureResult.signatureSha256 || "WebCrypto недоступний" }}</dd></div>
          <div><dt>Початок Base64</dt><dd>{{ fixtureResult.signatureBase64Prefix }}…</dd></div>
        </dl>
        <p class="prro-note">Приватний ключ залишається у віджеті. Підпис зберігається лише в пам’яті цієї сторінки та не надсилається на backend або ДПС.</p>
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
.branch-field select { width: min(100%, 360px); min-height: 40px; border: 1px solid #b9c4d0; border-radius: 8px; padding: 8px 10px; font: inherit; display:block; }
.branch-field small { display:block; margin-top:6px; color:#617580; }
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
.fixture-panel { display: grid; gap: 12px; }
.fixture-panel h3 { margin-bottom: 0; }
.fixture-xml { box-sizing: border-box; width: 100%; min-height: 220px; resize: vertical; border: 1px solid #b9c4d0; border-radius: 8px; padding: 12px; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre; }
.prro-operators { padding-left: 20px; }
.iit-widget-overlay { position: fixed; inset: 0; z-index: 2000; display: none; align-items: center; justify-content: center; padding: 16px; background: #0c1728a8; }
.iit-widget-overlay.visible { display: flex; }
.iit-widget-dialog { width: min(900px, 100%); height: min(800px, 92vh); overflow: hidden; background: white; border-radius: 12px; display: flex; flex-direction: column; }
.iit-widget-title { padding: 12px 16px; font-weight: 600; border-bottom: 1px solid #e0e5eb; }
.iit-widget-parent { flex: 1; min-height: 0; }
@media (max-width: 600px) { .shift-heading { align-items: flex-start; } .shift-actions button { width: 100%; } .iit-widget-overlay { padding: 0; } .iit-widget-dialog { height: 100dvh; border-radius: 0; } }
</style>
