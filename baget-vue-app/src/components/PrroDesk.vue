<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getPrroBranches, getPrroDeviceForBranch, getPrroShiftStatus, inspectLastPrroCheck, inspectRro, preparePrroShiftOpen, submitPrroShiftOpen, preparePrroShiftClose, submitPrroShiftClose, preparePrroTestCheck, submitPrroTestCheck } from "../services/prro.js";

const props = defineProps({ session: { type: Object, required: true } });
const canRunDiagnostics = computed(() => props.session.roles?.some(role => ["ROLE_ADMIN", "ROLE_SENIOR_CASHIER"].includes(role)) === true);
const fiscalNumber = ref("");
const branches = ref([]);
const deviceName = ref("");
const branchNo = ref(/^\d+$/.test(String(props.session.branch?.id ?? "")) ? String(props.session.branch.id) : "");
const shiftStatus = ref(null);
const lastCheck = ref(null);
const lastCheckError = ref("");
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
const testCheckResult = ref(null);
const testCheckIdempotencyKey = ref("");
const shiftStateLabel = computed(() => ({ OPEN: "Зміна відкрита", CLOSED: "Зміна закрита", DPS_ERROR: "Помилка відповіді ДПС", RECONCILIATION_REQUIRED: "Потрібна звірка стану" }[shiftStatus.value?.state] || "Стан не перевірено"));
const selectedBranchName = computed(() => branches.value.find(branch => String(branch.branchNo) === branchNo.value)?.name || props.session.branch?.name || "Філію не визначено");
const availableOperators = computed(() => (shiftStatus.value?.operators || [])
  .filter(operator => Number(operator.status) === 1));
const activeShiftSignerKeyId = computed(() => shiftStatus.value?.activeSignerKeyId
  || shiftStatus.value?.lastSigner || "");
const canOpenShift = computed(() => !busy.value
  && shiftStatus.value?.state === "CLOSED"
  && shiftStatus.value?.environment === "TEST"
  && availableOperators.value.some(operator => operator.serial === selectedSignerKeyId.value));
const canCloseShift = computed(() => !busy.value
  && shiftStatus.value?.state === "OPEN"
  && shiftStatus.value?.environment === "TEST"
  && !!activeShiftSignerKeyId.value
  && selectedSignerKeyId.value === activeShiftSignerKeyId.value);
const canCreateTestCheck = computed(() => canCloseShift.value);

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
  lastCheckError.value = "";
  testCheckResult.value = null;
  testCheckIdempotencyKey.value = "";
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



function createIdempotencyKey(prefix) {
  return window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function decodeSigningInput(signingInputBase64) {
  const binary = window.atob(signingInputBase64);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

async function refreshShiftState(selectedBranch, number, signatureBase64) {
  const updatedStatus = await getPrroShiftStatus(
    props.session.token, selectedBranch, number, signatureBase64,
  );
  shiftStatus.value = updatedStatus;

  if (updatedStatus.state === "OPEN") {
    const signer = updatedStatus.activeSignerKeyId || updatedStatus.lastSigner || "";
    selectedSignerKeyId.value = availableOperators.value.some(operator => operator.serial === signer)
      ? signer : "";
  } else if (updatedStatus.state === "CLOSED"
    && !availableOperators.value.some(operator => operator.serial === selectedSignerKeyId.value)) {
    selectedSignerKeyId.value = "";
  }

  lastCheckError.value = "";
  try {
    lastCheck.value = await inspectLastPrroCheck(
      props.session.token, selectedBranch, number, signatureBase64,
    );
  } catch (e) {
    lastCheck.value = null;
    lastCheckError.value = e.message || "Не вдалося перевірити останній документ ДПС.";
  }
  return { status: updatedStatus, lastCheck: lastCheck.value };
}

async function refreshShift() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
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
      number, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signatureBase64 !== "string" || !signatureBase64.length) {
      throw new Error("Віджет ІІТ не повернув підпис у Base64.");
    }
    widgetVisible.value = false;
    message.value = "Підпис отримано. Оновлюємо стан і список касирів із ДПС…";
    const refreshed = await refreshShiftState(selectedBranch, number, signatureBase64);
    message.value = refreshed.status.state === "OPEN"
      ? "Зміна відкрита. Стан і доступні сертифікати оновлено."
      : refreshed.status.state === "CLOSED"
        ? "Зміна закрита. Список доступних касирів оновлено."
        : "Стан ПРРО потребує додаткової звірки.";
    if (lastCheckError.value) {
      message.value += " Останній документ не перевірено: " + lastCheckError.value;
    }
  } catch (e) {
    error.value = e.message || "Помилка підписання або перевірки стану ПРРО.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
  }
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
  if (!canOpenShift.value) {
    error.value = "Перевірте, що TEST-ПРРО має стан CLOSED і вибрано активного касира.";
    return;
  }

  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ…";
    const widget = await getWidget();
    message.value = "Зчитайте КЕП касира. Підпишемо фіскальний номер ПРРО.";
    await widget.ReadPrivateKey();
    const rroSignatureBase64 = await widget.SignData(
      number, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof rroSignatureBase64 !== "string" || !rroSignatureBase64.length) {
      throw new Error("ІІТ не повернув підпис фіскального номера.");
    }

    if (!shiftOpenIdempotencyKey.value) {
      shiftOpenIdempotencyKey.value = createIdempotencyKey("shift-open");
    }
    message.value = "Baget готує SERVICECHK та перевіряє попередній документ у ДПС…";
    const prepared = await preparePrroShiftOpen(props.session.token, {
      branchNo: Number(selectedBranch),
      fiscalNumber: number,
      rroSignatureBase64,
      signerKeyId,
      idempotencyKey: shiftOpenIdempotencyKey.value,
    });

    const xml = decodeSigningInput(prepared.signingInputBase64);
    message.value = "SERVICECHK сформовано. Підтвердьте підписання XML у віджеті IIT.";
    const signedPayloadBase64 = await widget.SignData(
      xml, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signedPayloadBase64 !== "string" || !signedPayloadBase64.length) {
      throw new Error("ІІТ не повернув підписаний SERVICECHK у Base64.");
    }

    widgetVisible.value = false;
    message.value = "Підпис отримано. Надсилаємо SERVICECHK до ДПС…";
    shiftOpenResult.value = await submitPrroShiftOpen(props.session.token, {
      operationId: prepared.operationId,
      signerKeyId,
      signedPayloadBase64,
    });

    if (shiftOpenResult.value.status === "FISCALIZED") {
      shiftOpenIdempotencyKey.value = "";
      message.value = "ДПС прийняла SERVICECHK. Автоматично оновлюємо стан зміни…";
      try {
        const refreshed = await refreshShiftState(selectedBranch, number, rroSignatureBase64);
        const documentMatches = refreshed.lastCheck?.responseStatus === "OK"
          && refreshed.lastCheck.dataSignSha256 === shiftOpenResult.value.signedPayloadSha256;
        if (refreshed.status.state === "OPEN" && documentMatches) {
          message.value = "Зміну відкрито. ДПС підтвердила OPEN, а lastChk збігається з підписаним SERVICECHK.";
        } else {
          message.value = "SERVICECHK фіскалізовано, але автоматична звірка стану/lastChk не пройшла. Не продовжуйте операції до перевірки.";
        }
      } catch (verificationError) {
        message.value = "SERVICECHK фіскалізовано, але не вдалося оновити стан каси: "
          + (verificationError.message || "невідома помилка");
      }
    } else if (shiftOpenResult.value.status === "REJECTED") {
      shiftOpenIdempotencyKey.value = "";
      message.value = "ДПС відхилила SERVICECHK. Зміна не вважається відкритою.";
    } else {
      message.value = "Результат SERVICECHK неоднозначний. Не повторюйте надсилання — спочатку звірте стан через statusRro та lastChk.";
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
  if (!canCloseShift.value) {
    error.value = "Для закриття потрібна відкрита TEST-зміна та той самий касир, яким її відкрито.";
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
      throw new Error("ІІТ не повернув підпис фіскального номера.");
    }

    if (!shiftCloseIdempotencyKey.value) {
      shiftCloseIdempotencyKey.value = createIdempotencyKey("shift-close");
    }
    message.value = "Baget перевіряє стан зміни, lastChk та готує ZREPORT…";
    const prepared = await preparePrroShiftClose(props.session.token, {
      branchNo: Number(selectedBranch),
      fiscalNumber: number,
      rroSignatureBase64,
      signerKeyId,
      idempotencyKey: shiftCloseIdempotencyKey.value,
    });

    const xml = decodeSigningInput(prepared.signingInputBase64);
    message.value = "ZREPORT сформовано. Підтвердьте підписання XML у віджеті IIT.";
    const signedPayloadBase64 = await widget.SignData(
      xml, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signedPayloadBase64 !== "string" || !signedPayloadBase64.length) {
      throw new Error("ІІТ не повернув підписаний ZREPORT у Base64.");
    }

    widgetVisible.value = false;
    message.value = "Підпис отримано. Надсилаємо ZREPORT до ДПС…";
    shiftCloseResult.value = await submitPrroShiftClose(props.session.token, {
      operationId: prepared.operationId,
      signerKeyId,
      signedPayloadBase64,
    });

    if (shiftCloseResult.value.status === "FISCALIZED") {
      shiftOpenIdempotencyKey.value = "";
      shiftCloseIdempotencyKey.value = "";
      message.value = "ZREPORT прийнято. Автоматично перевіряємо закриття зміни…";
      try {
        const refreshed = await refreshShiftState(selectedBranch, number, rroSignatureBase64);
        const documentMatches = refreshed.lastCheck?.responseStatus === "OK"
          && refreshed.lastCheck.dataSignSha256 === shiftCloseResult.value.signedPayloadSha256;
        if (refreshed.status.state === "CLOSED" && documentMatches) {
          selectedSignerKeyId.value = "";
          message.value = "Зміну закрито. ДПС підтвердила CLOSED, а lastChk збігається з підписаним ZREPORT.";
        } else {
          message.value = "ZREPORT фіскалізовано, але автоматична звірка стану/lastChk не пройшла. Не відкривайте наступну зміну до перевірки.";
        }
      } catch (verificationError) {
        message.value = "ZREPORT фіскалізовано, але не вдалося оновити стан каси: "
          + (verificationError.message || "невідома помилка");
      }
    } else if (shiftCloseResult.value.status === "REJECTED") {
      shiftCloseIdempotencyKey.value = "";
      message.value = "ДПС відхилила ZREPORT. Зміна залишається відкритою.";
    } else {
      message.value = "Результат ZREPORT неоднозначний. Не надсилайте його повторно — спочатку звірте statusRro та lastChk.";
    }
  } catch (e) {
    error.value = e.message || "Не вдалося підготувати, підписати або надіслати ZREPORT.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
  }
}

async function issueTestCheck() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  testCheckResult.value = null;

  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  const signerKeyId = selectedSignerKeyId.value.trim();
  if (!canCreateTestCheck.value) {
    error.value = "Тестовий чек доступний лише у відкритій TEST-зміні, підписаній тим самим касиром.";
    return;
  }

  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ…";
    const widget = await getWidget();
    message.value = "Зчитайте КЕП касира. Підпишемо фіскальний номер ПРРО.";
    await widget.ReadPrivateKey();
    const rroSignatureBase64 = await widget.SignData(
      number, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof rroSignatureBase64 !== "string" || !rroSignatureBase64.length) {
      throw new Error("ІІТ не повернув підпис фіскального номера.");
    }

    if (!testCheckIdempotencyKey.value) {
      testCheckIdempotencyKey.value = createIdempotencyKey("test-check");
    }
    message.value = "Baget перевіряє відкриту зміну та готує тестовий CHK на 1,00 грн…";
    const prepared = await preparePrroTestCheck(props.session.token, {
      branchNo: Number(selectedBranch),
      fiscalNumber: number,
      rroSignatureBase64,
      signerKeyId,
      idempotencyKey: testCheckIdempotencyKey.value,
    });

    const xml = decodeSigningInput(prepared.signingInputBase64);
    message.value = "Тестовий CHK сформовано. Перевірте суму 1,00 грн і підтвердьте підписання у віджеті IIT.";
    const signedPayloadBase64 = await widget.SignData(
      xml, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signedPayloadBase64 !== "string" || !signedPayloadBase64.length) {
      throw new Error("ІІТ не повернув підписаний CHK у Base64.");
    }

    widgetVisible.value = false;
    message.value = "Підпис отримано. Надсилаємо тестовий CHK до ДПС…";
    testCheckResult.value = await submitPrroTestCheck(props.session.token, {
      operationId: prepared.operationId,
      signerKeyId,
      signedPayloadBase64,
    });

    if (testCheckResult.value.status === "FISCALIZED") {
      testCheckIdempotencyKey.value = "";
      message.value = "Тестовий чек фіскалізовано. Перевіряємо послідовність документів…";
      try {
        const refreshed = await refreshShiftState(selectedBranch, number, rroSignatureBase64);
        const documentMatches = refreshed.lastCheck?.responseStatus === "OK"
          && refreshed.lastCheck.dataSignSha256 === testCheckResult.value.signedPayloadSha256;
        if (refreshed.status.state === "OPEN" && documentMatches) {
          message.value = "Тестовий чек 1,00 грн фіскалізовано. Зміна залишається OPEN, lastChk підтвердив документ.";
        } else {
          message.value = "Тестовий чек фіскалізовано, але звірка statusRro/lastChk потребує уваги. Не надсилайте наступний документ до перевірки.";
        }
      } catch (verificationError) {
        message.value = "Тестовий чек фіскалізовано, але не вдалося оновити стан каси: "
          + (verificationError.message || "невідома помилка");
      }
    } else if (testCheckResult.value.status === "REJECTED") {
      testCheckIdempotencyKey.value = "";
      message.value = "ДПС відхилила тестовий CHK. Перевірте відповідь перед повторною спробою.";
    } else {
      message.value = "Результат надсилання тестового CHK неоднозначний. Не повторюйте операцію до звірки з ДПС.";
    }
  } catch (e) {
    error.value = e.message || "Не вдалося підготувати, підписати або надіслати тестовий CHK.";
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
    <header class="page-header">
      <div>
        <p class="eyebrow">РОБОЧЕ МІСЦЕ КАСИРА</p>
        <h2>Каса / ПРРО</h2>
        <p class="page-description">Стан каси, керування зміною та фіскальні операції.</p>
      </div>
      <div class="branch-picker">
        <label for="prro-branch-number">Філія</label>
        <select id="prro-branch-number" v-model="branchNo" :disabled="busy" @change="loadDeviceForBranch">
          <option value="" disabled>Оберіть філію</option>
          <option v-for="branch in branches" :key="branch.branchNo" :value="String(branch.branchNo)">
            {{ branch.branchNo }} · {{ branch.name }}
          </option>
        </select>
      </div>
    </header>

    <section class="prro-panel shift-overview" aria-labelledby="shift-title">
      <div class="overview-main">
        <div class="overview-copy">
          <p class="eyebrow">ПОТОЧНА КАСА</p>
          <h3 id="shift-title">{{ selectedBranchName }}</h3>
          <p class="device-line">
            <span>{{ deviceName || "ПРРО не налаштовано для цієї філії" }}</span>
            <span v-if="fiscalNumber">ФН {{ fiscalNumber }}</span>
          </p>
        </div>
        <div class="shift-state" :class="'state-' + (shiftStatus?.state || 'unknown').toLowerCase()">
          <span class="state-dot"></span>
          {{ shiftStateLabel }}
        </div>
      </div>

      <div v-if="shiftStatus" class="status-summary">
        <div><span>Середовище</span><strong>{{ shiftStatus.environment || "—" }}</strong></div>
        <div><span>Зв’язок із ДПС</span><strong>{{ shiftStatus.online ? "Онлайн" : "Офлайн" }}</strong></div>
        <div><span>Зміна за ДПС</span><strong>{{ shiftStatus.dpsOpenShift ? "Відкрита" : "Закрита" }}</strong></div>
        <div><span>Наступний номер</span><strong>{{ shiftStatus.nextLocalNumber ?? "—" }}</strong></div>
      </div>

      <p class="help-text">
        Для перевірки стану та фіскальних операцій касир підписує дані через IIT SignWidget.
        Приватний ключ залишається на комп’ютері касира.
      </p>

      <div v-if="shiftStatus?.operators?.length" class="signer-picker">
        <label for="prro-signer-serial">Касир / сертифікат ПРРО</label>
        <select id="prro-signer-serial" v-model="selectedSignerKeyId"
          :disabled="busy || shiftStatus.state === 'OPEN'">
          <option value="">Оберіть активного касира</option>
          <option v-for="operator in availableOperators" :key="operator.serial" :value="operator.serial">
            {{ operator.name || "Оператор" }}{{ operator.senior ? " · старший касир" : "" }} · {{ operator.serial }}
          </option>
        </select>
        <small v-if="shiftStatus.state === 'OPEN'">
          Підписувач зафіксований під час відкриття зміни: {{ shiftStatus.activeSignerKeyId || shiftStatus.lastSigner }}.
          Для чеків і Z-звіту використовуйте саме цей сертифікат.
        </small>
        <small v-else>
          Список отримано з infoRro під час звичайного оновлення стану. Оберіть касира, сертифікат якого потім виберете у віджеті IIT.
        </small>
      </div>
      <p v-else-if="shiftStatus" class="help-text">
        ДПС не повернула активних операторів. Відкриття зміни та фіскальні операції недоступні.
      </p>

      <div class="primary-actions">
        <button type="button" class="button-primary" :disabled="busy || !branchNo" @click="refreshShift">
          {{ busy ? "Виконується…" : "Підписати та оновити стан" }}
        </button>
        <button type="button" class="button-secondary"
          :disabled="!canOpenShift"
          @click="openShiftOnTest">
          Відкрити зміну
        </button>
      </div>

      <p v-if="message" role="status" class="feedback feedback-success">{{ message }}</p>
      <p v-if="error" role="alert" class="feedback feedback-error">{{ error }}</p>
      <p v-if="lastCheckError" role="alert" class="feedback feedback-error">
        Останній документ не перевірено: {{ lastCheckError }}
      </p>
      <div v-if="lastCheck" class="last-check-summary">
        <span>Останній документ ДПС</span>
        <strong>{{ lastCheck.fiscalDocumentId || "ID не повернуто" }}</strong>
        <small>{{ lastCheck.responseStatus }} · {{ lastCheck.dataSignLength }} байт · SHA-256 {{ lastCheck.dataSignSha256 || "—" }}</small>
      </div>
      <p v-if="shiftStatus?.state === 'RECONCILIATION_REQUIRED'" class="reconciliation-warning" role="alert">
        Стан у ДПС не збігається з локальним станом Baget. Не відкривайте нову зміну та не фіскалізуйте чеки,
        доки операцію не буде звірено.
      </p>

      <details v-if="shiftStatus" class="technical-details">
        <summary>Технічні дані стану</summary>
        <dl class="data-grid">
          <div><dt>Фіскальний номер</dt><dd>{{ shiftStatus.fiscalNumber || fiscalNumber }}</dd></div>
          <div><dt>Статус infoRro / statusRro</dt><dd>{{ shiftStatus.infoStatus }} / {{ shiftStatus.statusStatus }}</dd></div>
          <div><dt>Реєстрація ПРРО</dt><dd>{{ shiftStatus.rroRegistrationStatus ?? "—" }}</dd></div>
          <div><dt>Локальна операція відкриття</dt><dd>{{ shiftStatus.localShiftPrepared ? "Є" : "Немає" }}</dd></div>
          <div><dt>Підписувач зміни</dt><dd>{{ shiftStatus.activeSignerKeyId || "—" }}</dd></div>
          <div><dt>Останній підписувач ДПС</dt><dd>{{ shiftStatus.lastSigner || "—" }}</dd></div>
          <div><dt>Повідомлення ДПС</dt><dd>{{ shiftStatus.dpsMessage || "—" }}</dd></div>
        </dl>
      </details>
    </section>

    <section class="work-section" aria-labelledby="operations-title">
      <div class="section-heading">
        <div>
          <h3 id="operations-title">Операції</h3>
          <p>Основні дії касира в межах відкритої зміни.</p>
        </div>
      </div>
      <div class="operation-grid">
        <article class="prro-panel operation-card">
          <div class="operation-icon">₴</div>
          <div>
            <h4>Тестовий чек</h4>
            <p>Фіксований CHK на 1,00 грн: одна тестова послуга, оплата готівкою. Не є фіскалізацією реального платежу Baget.</p>
          </div>
          <span class="feature-status feature-ready">Лише TEST · 1,00 грн</span>
          <button type="button" class="button-secondary" :disabled="!canCreateTestCheck" @click="issueTestCheck">
            {{ busy ? "Виконується…" : "Сформувати та фіскалізувати тестовий чек" }}
          </button>
          <dl v-if="testCheckResult" class="data-grid operation-result">
            <div><dt>Статус</dt><dd>{{ testCheckResult.status }}</dd></div>
            <div><dt>ID документа ДПС</dt><dd>{{ testCheckResult.fiscalDocumentId || "—" }}</dd></div>
            <div><dt>Код відповіді</dt><dd>{{ testCheckResult.responseCode ?? "—" }}</dd></div>
          </dl>
        </article>
        <article class="prro-panel operation-card">
          <div class="operation-icon">↻</div>
          <div>
            <h4>Закриття зміни</h4>
            <p>Формування Z-звіту з підсумків усіх фіскалізованих CHK та закриття активної зміни ПРРО.</p>
          </div>
          <span class="feature-status feature-ready">TEST</span>
          <button type="button" class="button-secondary" :disabled="!canCloseShift" @click="closeShiftOnTest">
            {{ busy ? "Виконується…" : "Сформувати Z-звіт і закрити зміну" }}
          </button>
        </article>
        <article class="prro-panel operation-card">
          <div class="operation-icon">≡</div>
          <div>
            <h4>Історія операцій</h4>
            <p>Фіскалізовані, відхилені та операції, що потребують звірки.</p>
          </div>
          <span class="feature-status">Готується</span>
          <button type="button" class="button-secondary" disabled>Незабаром</button>
        </article>
      </div>
    </section>

    <details v-if="canRunDiagnostics" class="diagnostics-section">
      <summary>
        <span><strong>Діагностика та інструменти</strong><small>Технічна інформація ДПС, lastChk та IIT</small></span>
      </summary>
      <div class="diagnostics-content">
        <section class="prro-panel">
          <h3>Діагностика ПРРО у ДПС</h3>
          <label for="rro-fiscal-number">Фіскальний номер ПРРО</label>
          <input id="rro-fiscal-number" v-model.trim="fiscalNumber" inputmode="numeric"
            autocomplete="off" maxlength="32" :disabled="busy" />
          <div class="diagnostic-actions">
            <button type="button" class="button-primary" :disabled="busy" @click="inspect">
              {{ busy ? "Виконується…" : "Підписати та перевірити infoRro" }}
            </button>
            <button type="button" class="button-secondary" :disabled="busy" @click="inspectLastCheck">
              Перевірити lastChk
            </button>
            <button type="button" class="button-secondary" :disabled="busy || !endUser" @click="resetKey">
              Очистити ключ ІІТ
            </button>
          </div>
          <p class="help-text">Підписання відбувається локально через IIT SignWidget. Приватний ключ і пароль не надсилаються на backend.</p>
          <div v-if="result" class="diagnostic-result">
            <h4>Відповідь infoRro / statusRro</h4>
            <dl class="data-grid">
              <div><dt>Підписаний номер</dt><dd>{{ checkedFiscalNumber }}</dd></div>
              <div><dt>infoRro</dt><dd>{{ result.infoStatus }}</dd></div>
              <div><dt>statusRro</dt><dd>{{ result.statusStatus }}</dd></div>
              <div><dt>Статус ПРРО</dt><dd>{{ result.statusRro }}</dd></div>
              <div><dt>Онлайн</dt><dd>{{ result.online ? "Так" : "Ні" }}</dd></div>
              <div><dt>Зміна відкрита</dt><dd>{{ result.openShift ? "Так" : "Ні" }}</dd></div>
              <div><dt>Назва</dt><dd>{{ result.name || "—" }}</dd></div>
              <div><dt>Платник</dt><dd>{{ result.paymentName || "—" }}</dd></div>
              <div><dt>Останній підписувач</dt><dd>{{ result.lastSigner || "—" }}</dd></div>
              <div><dt>Помилка statusRro</dt><dd>{{ result.statusErrorMessage || "—" }}</dd></div>
            </dl>
            <h4>Зареєстровані оператори</h4>
            <p v-if="!result.operators?.length">ДПС не повернула список операторів.</p>
            <ul v-else class="operator-list">
              <li v-for="operator in result.operators" :key="operator.serial">
                {{ operator.name || "Оператор" }} · {{ operator.serial }} · статус {{ operator.status }}
                <span v-if="operator.senior">· старший касир</span>
              </li>
            </ul>
          </div>
          <div v-if="lastCheck" class="diagnostic-result">
            <h4>Відповідь lastChk</h4>
            <dl class="data-grid">
              <div><dt>Статус</dt><dd>{{ lastCheck.responseStatus }} ({{ lastCheck.responseCode }})</dd></div>
              <div><dt>ID документа ДПС</dt><dd>{{ lastCheck.fiscalDocumentId || "—" }}</dd></div>
              <div><dt>Розмір data_sign</dt><dd>{{ lastCheck.dataSignLength }} байт</dd></div>
              <div><dt>XML</dt><dd>{{ lastCheck.dataSignStartsWithXml ? "Так" : "Ні" }}</dd></div>
              <div><dt>SHA-256 data_sign</dt><dd>{{ lastCheck.dataSignSha256 || "—" }}</dd></div>
              <div><dt>Повідомлення ДПС</dt><dd>{{ lastCheck.dpsMessage || "—" }}</dd></div>
            </dl>
          </div>
        </section>

        <section v-if="shiftOpenResult || shiftCloseResult" class="prro-panel">
          <h3>Результат останньої операції</h3>
          <dl class="data-grid">
            <template v-if="shiftOpenResult">
              <div><dt>Відкриття зміни</dt><dd>{{ shiftOpenResult.status }}</dd></div>
              <div><dt>Код ДПС</dt><dd>{{ shiftOpenResult.responseCode ?? "—" }}</dd></div>
              <div><dt>ID документа</dt><dd>{{ shiftOpenResult.fiscalDocumentId || "—" }}</dd></div>
              <div><dt>Повідомлення</dt><dd>{{ shiftOpenResult.responseMessage || "—" }}</dd></div>
            </template>
            <template v-if="shiftCloseResult">
              <div><dt>Закриття зміни</dt><dd>{{ shiftCloseResult.status }}</dd></div>
              <div><dt>Код ДПС</dt><dd>{{ shiftCloseResult.responseCode ?? "—" }}</dd></div>
              <div><dt>ID документа</dt><dd>{{ shiftCloseResult.fiscalDocumentId || "—" }}</dd></div>
              <div><dt>Повідомлення</dt><dd>{{ shiftCloseResult.responseMessage || "—" }}</dd></div>
            </template>
          </dl>
        </section>

        <section class="prro-panel fixture-panel">
          <details>
            <summary>Тестові XML-приклади та підписання IIT</summary>
            <p class="help-text">
              Локальна перевірка IIT SignWidget. Ці приклади не надсилаються до ДПС і не є фіскальними документами.
            </p>
            <div class="diagnostic-actions">
              <button type="button" class="button-secondary" :disabled="busy" @click="loadShiftOpenFixture">Приклад SERVICECHK</button>
              <button type="button" class="button-secondary" :disabled="busy" @click="loadSaleCheckFixture">Приклад CHK</button>
              <button type="button" class="button-primary" :disabled="busy || !fixtureXml" @click="signFixture">
                {{ busy ? "Підписуємо…" : "Підписати XML через IIT" }}
              </button>
            </div>
            <textarea v-if="fixtureXml" v-model="fixtureXml" class="fixture-xml" rows="10" spellcheck="false" :disabled="busy"></textarea>
            <dl v-if="fixtureResult" class="data-grid">
              <div><dt>Тип тесту</dt><dd>{{ fixtureResult.kind }}</dd></div>
              <div><dt>Розмір підпису</dt><dd>{{ fixtureResult.signatureBytesLength }} байт</dd></div>
              <div><dt>SHA-256</dt><dd>{{ fixtureResult.signatureSha256 || "Недоступний" }}</dd></div>
              <div><dt>Початок Base64</dt><dd>{{ fixtureResult.signatureBase64Prefix }}…</dd></div>
            </dl>
          </details>
        </section>
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
.prro-desk { display:grid; gap:22px; min-width:0; padding:20px clamp(12px,3vw,28px); color:#1d2939; }
.page-header,.overview-main,.section-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; }
.page-header h2 { margin:3px 0 5px; font-size:24px; }
.page-description,.section-heading p { margin:0; color:#667085; font-size:14px; }
.eyebrow { margin:0; color:#667085; font-size:11px; font-weight:700; letter-spacing:.08em; }
.branch-picker { display:grid; gap:6px; min-width:min(280px,100%); }
.branch-picker label,.signer-picker label,.prro-panel label { font-size:13px; font-weight:650; }
.branch-picker select,.signer-picker select,.prro-panel input { box-sizing:border-box; width:100%; min-height:42px; border:1px solid #cfd6df; border-radius:9px; padding:9px 11px; background:#fff; color:inherit; font:inherit; }
.prro-panel { min-width:0; padding:20px; border:1px solid #e0e5eb; border-radius:14px; background:#fff; }
.shift-overview { display:grid; gap:18px; }
.overview-copy h3 { margin:5px 0 7px; font-size:19px; }
.device-line { display:flex; flex-wrap:wrap; gap:8px 16px; margin:0; color:#667085; font-size:13px; }
.shift-state { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:#f2f4f7; color:#475467; font-size:13px; font-weight:650; white-space:nowrap; }
.state-dot { width:8px; height:8px; border-radius:50%; background:#98a2b3; }
.state-open { background:#ecfdf3; color:#067647; }.state-open .state-dot { background:#12b76a; }
.state-closed { background:#f2f4f7; color:#475467; }.state-closed .state-dot { background:#667085; }
.state-dps_error,.state-reconciliation_required { background:#fff4ed; color:#b54708; }.state-dps_error .state-dot,.state-reconciliation_required .state-dot { background:#f79009; }
.status-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; padding:15px; border-radius:10px; background:#f8fafc; }
.status-summary div { display:grid; gap:5px; min-width:0; }.status-summary span,.data-grid dt { color:#667085; font-size:12px; }.status-summary strong { font-size:14px; overflow-wrap:anywhere; }
.help-text { margin:0; color:#667085; font-size:13px; line-height:1.55; }
.signer-picker { display:grid; gap:7px; max-width:520px; }.signer-picker small { color:#667085; font-size:12px; }
.primary-actions,.diagnostic-actions { display:flex; flex-wrap:wrap; gap:9px; }
.primary-actions button,.diagnostic-actions button,.operation-card button { min-height:42px; border:0; border-radius:9px; padding:10px 15px; font:inherit; font-size:13px; font-weight:650; cursor:pointer; }
.button-primary { background:#2456a6; color:#fff; }.button-secondary { background:#eef2f6; color:#344054; }
button:disabled { opacity:.48; cursor:not-allowed; }
.feedback { margin:0; padding:11px 13px; border-radius:9px; font-size:13px; line-height:1.5; }
.feedback-success { background:#ecfdf3; color:#067647; }.feedback-error { background:#fef3f2; color:#b42318; }
.reconciliation-warning { margin:0; padding:12px 14px; border-left:3px solid #f79009; background:#fffaeb; color:#93370d; font-size:13px; line-height:1.5; }
.technical-details { border-top:1px solid #eaecf0; padding-top:12px; }.technical-details summary,.diagnostics-section>summary,.fixture-panel summary { cursor:pointer; color:#475467; font-size:13px; font-weight:650; }
.data-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:13px 18px; margin:14px 0 0; }
.data-grid div { min-width:0; }.data-grid dd { margin:4px 0 0; font-size:13px; font-weight:600; overflow-wrap:anywhere; }
.last-check-summary { display:grid; gap:4px; padding:12px 14px; border:1px solid #d0d5dd; border-radius:9px; background:#f8fafc; }.last-check-summary span,.last-check-summary small { color:#667085; font-size:12px; }.last-check-summary strong { font-size:13px; overflow-wrap:anywhere; }.operation-result { margin-top:0; padding-top:10px; border-top:1px solid #eaecf0; }
.work-section { display:grid; gap:13px; }.section-heading h3 { margin:0 0 4px; font-size:18px; }
.operation-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.operation-card { display:flex; flex-direction:column; align-items:flex-start; gap:10px; }.operation-icon { display:grid; place-items:center; width:36px; height:36px; border-radius:10px; background:#eef4ff; color:#2456a6; font-size:19px; font-weight:700; }
.operation-card h4 { margin:0 0 5px; font-size:15px; }.operation-card p { margin:0; color:#667085; font-size:13px; line-height:1.5; flex:1; }
.feature-status { color:#667085; font-size:11px; font-weight:650; }.feature-ready { color:#067647; }
.operation-hint { color:#667085; font-size:12px; line-height:1.4; }
.operation-card button { width:100%; margin-top:3px; }
.diagnostics-section { border:1px solid #e0e5eb; border-radius:12px; background:#f8fafc; padding:14px 16px; }
.diagnostics-section>summary { list-style:none; }.diagnostics-section>summary::-webkit-details-marker { display:none; }
.diagnostics-section>summary span { display:grid; gap:3px; }.diagnostics-section>summary strong { color:#344054; font-size:14px; }.diagnostics-section>summary small { color:#667085; font-size:12px; font-weight:400; }
.diagnostics-content { display:grid; gap:12px; margin-top:14px; }.diagnostics-content h3 { margin:0 0 14px; font-size:16px; }.diagnostics-content h4 { margin:18px 0 0; font-size:13px; }
.diagnostic-actions { margin:12px 0; }.diagnostic-result { margin-top:16px; padding-top:14px; border-top:1px solid #eaecf0; }
.operator-list { padding-left:18px; color:#475467; font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
.fixture-panel details { display:grid; gap:12px; }.fixture-panel .help-text { margin-top:12px; }.fixture-xml { box-sizing:border-box; width:100%; min-height:200px; margin-top:12px; padding:12px; border:1px solid #cfd6df; border-radius:9px; font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre; }
.iit-widget-overlay { position:fixed; inset:0; z-index:2000; display:none; align-items:center; justify-content:center; padding:16px; background:#0c1728a8; }.iit-widget-overlay.visible { display:flex; }
.iit-widget-dialog { display:flex; flex-direction:column; width:min(900px,100%); height:min(800px,92vh); overflow:hidden; border-radius:12px; background:#fff; }.iit-widget-title { padding:12px 16px; border-bottom:1px solid #e0e5eb; font-weight:650; }.iit-widget-parent { flex:1; min-height:0; }
@media(max-width:850px) { .operation-grid { grid-template-columns:1fr; }.status-summary { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:600px) { .page-header,.overview-main { flex-direction:column; }.branch-picker { width:100%; }.shift-state { align-self:flex-start; }.primary-actions,.diagnostic-actions { display:grid; grid-template-columns:1fr; }.primary-actions button,.diagnostic-actions button { width:100%; }.status-summary { grid-template-columns:1fr 1fr; }.iit-widget-overlay { padding:0; }.iit-widget-dialog { width:100%; height:100dvh; border-radius:0; } }
</style>