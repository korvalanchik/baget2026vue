<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { getPrroBranches, getPrroDeviceForBranch, getPrroShiftStatus, inspectLastPrroCheck, inspectRro, preparePrroShiftOpen, submitPrroShiftOpen, cancelPrroPreparedShiftOpen, preparePrroShiftClose, submitPrroShiftClose, preparePrroTestCheck, submitPrroTestCheck, getPrroRecentPayments, preparePrroPaymentCheck, submitPrroPaymentCheck, getPrroFiscalDocuments, getPrroFiscalDocument } from "../services/prro.js";

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
const receiptPrintData = ref(null);
const receiptPrintError = ref("");
const canPrintReceipt = computed(() => !!receiptPrintData.value);
const recentPayments = ref([]);
const paymentCheckError = ref("");
const fiscalDocuments = ref([]);
const fiscalDocumentsLoading = ref(false);
const fiscalDocumentsError = ref("");
const fiscalDocumentQuery = ref("");
const fiscalDocumentFrom = ref(localDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
const fiscalDocumentTo = ref(localDateInput(new Date()));
const fiscalDocumentPage = ref(0);
const fiscalDocumentsHasMore = ref(false);
const openingFiscalDocumentId = ref(null);
const activePaymentRequestKey = ref("");
const shareDialogVisible = ref(false);
const sharePhone = ref("");
const shareBusy = ref(false);
const shareCopied = ref(false);
const shareError = ref("");
const shareMessage = ref("");
const canShareWithTelegram = computed(() => shareCopied.value && isValidSharePhone(sharePhone.value));
const canShareWithViber = computed(() => shareCopied.value && isValidSharePhone(sharePhone.value));
const testCheckIdempotencyKey = ref("");
const shiftStateLabel = computed(() => ({ OPEN: "Зміна відкрита", CLOSED: "Зміна закрита", DPS_ERROR: "Помилка відповіді ДПС", RECONCILIATION_REQUIRED: "Потрібна звірка стану" }[shiftStatus.value?.state] || "Стан не перевірено"));
const selectedBranchName = computed(() => branches.value.find(branch => String(branch.branchNo) === branchNo.value)?.name || props.session.branch?.name || "Філію не визначено");
const availableOperators = computed(() => (shiftStatus.value?.operators || [])
  .filter(operator => Number(operator.status) === 1));
const activeShiftSignerKeyId = computed(() => shiftStatus.value?.activeSignerKeyId
  || shiftStatus.value?.lastSigner || "");
const isTestEndpoint = computed(() => shiftStatus.value?.endpointMode === "TEST");
const canOpenShift = computed(() => !busy.value
  && shiftStatus.value?.state === "CLOSED"
  && shiftStatus.value?.infoStatus === "OK"
  && shiftStatus.value?.statusStatus === "OK"
  && Number(shiftStatus.value?.rroRegistrationStatus) === 1
  && shiftStatus.value?.online === true
  && availableOperators.value.some(operator => operator.serial === selectedSignerKeyId.value));
const canCloseShift = computed(() => !busy.value
  && shiftStatus.value?.state === "OPEN"
  && shiftStatus.value?.infoStatus === "OK"
  && shiftStatus.value?.statusStatus === "OK"
  && Number(shiftStatus.value?.rroRegistrationStatus) === 1
  && shiftStatus.value?.online === true
  && !!activeShiftSignerKeyId.value
  && selectedSignerKeyId.value === activeShiftSignerKeyId.value);
const canCreateTestCheck = computed(() => isTestEndpoint.value && canCloseShift.value);
const canCreatePaymentCheck = computed(() => canCloseShift.value);
const canCancelPreparedShiftOpen = computed(() => !busy.value
  && shiftStatus.value?.state === "RECONCILIATION_REQUIRED"
  && shiftStatus.value?.dpsOpenShift === false
  && shiftStatus.value?.localShiftOpenPrepared === true);

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
  if (endUser) {
    widgetVisible.value = true;
    return endUser;
  }
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
  receiptPrintData.value = null;
  receiptPrintError.value = "";
  shareDialogVisible.value = false;
  shareCopied.value = false;
  sharePhone.value = "";
  testCheckIdempotencyKey.value = "";
  result.value = null;
  selectedSignerKeyId.value = "";
  shiftOpenResult.value = null;
  shiftOpenIdempotencyKey.value = "";
  shiftCloseResult.value = null;
  shiftCloseIdempotencyKey.value = "";
  recentPayments.value = [];
  paymentCheckError.value = "";
  fiscalDocuments.value = [];
  fiscalDocumentsError.value = "";
  fiscalDocumentPage.value = 0;
  fiscalDocumentsHasMore.value = false;
  openingFiscalDocumentId.value = null;
  activePaymentRequestKey.value = "";
  if (!selectedBranch) return;
  try {
    const device = await getPrroDeviceForBranch(props.session.token, selectedBranch);
    fiscalNumber.value = device.fiscalNumber;
    deviceName.value = device.displayName;
    await Promise.all([loadRecentPayments(), loadFiscalDocuments(true)]);
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

async function cancelPendingShiftOpen() {
  if (busy.value || !canCancelPreparedShiftOpen.value) return;
  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  if (!selectedBranch || !number) return;
  const confirmed = window.confirm(
    "ДПС зараз підтверджує закриту зміну. Скасувати лише незавершену локальну підготовку відкриття? "
    + "Backend повторно перевірить infoRro/statusRro. Жоден документ до ДПС надсилатися не буде.",
  );
  if (!confirmed) return;

  error.value = "";
  message.value = "";
  busy.value = true;
  try {
    message.value = "Завантажуємо віджет ІІТ для підписання фіскального номера…";
    const widget = await getWidget();
    await widget.ReadPrivateKey();
    const signatureBase64 = await widget.SignData(
      number, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signatureBase64 !== "string" || !signatureBase64.length) {
      throw new Error("ІІТ не повернув підпис фіскального номера.");
    }

    widgetVisible.value = false;
    message.value = "Backend повторно перевіряє в ДПС, що обидва статуси зміни — CLOSED…";
    const cancelled = await cancelPrroPreparedShiftOpen(props.session.token, {
      branchNo: Number(selectedBranch),
      fiscalNumber: number,
      signatureBase64,
    });

    // The old idempotency key must not be reused for a future, new shift.
    shiftOpenIdempotencyKey.value = "";
    shiftOpenResult.value = null;
    message.value = `Локальну підготовку відкриття #${cancelled.operationId} скасовано. Перевіряємо стан ПРРО…`;
    try {
      const refreshed = await refreshShiftState(selectedBranch, number, signatureBase64);
      if (refreshed.status.state === "CLOSED") {
        message.value = `Незавершене локальне відкриття #${cancelled.operationId} скасовано. ДПС і Baget тепер узгоджено: зміна закрита.`;
      } else {
        message.value += " ДПС не повернула узгоджений стан CLOSED після скасування; не виконуйте фіскальні операції.";
      }
    } catch (refreshError) {
      message.value += " Скасування збережено, але повторно оновити стан не вдалося: "
        + (refreshError.message || "невідома помилка") + ".";
    }
  } catch (e) {
    error.value = e.message || "Не вдалося скасувати незавершену підготовку відкриття зміни.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
  }
}

async function loadRecentPayments() {
  const selectedBranch = branchNo.value.trim();
  recentPayments.value = [];
  paymentCheckError.value = "";
  if (!selectedBranch) return;
  try {
    recentPayments.value = await getPrroRecentPayments(props.session.token, selectedBranch);
  } catch (e) {
    paymentCheckError.value = e.message || "Не вдалося завантажити надходження Baget.";
  }
}

function paymentOperationLabel(status) {
  return ({
    NOT_PREPARED: "Очікує тесту",
    PREPARED: "Підготовлено",
    SIGNED: "Підписано",
    SENDING: "Надсилається",
    FISCALIZED: "Отримано відповідь ДПС",
    REJECTED: "Відхилено ДПС",
    UNKNOWN_RESULT: "Потрібна звірка",
  })[status] || status || "—";
}

function localDateInput(date) {
  const pad = value => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

async function loadFiscalDocuments(reset = true) {
  const selectedBranch = branchNo.value.trim();
  if (!selectedBranch) {
    fiscalDocuments.value = [];
    fiscalDocumentsHasMore.value = false;
    return;
  }
  const page = reset ? 0 : fiscalDocumentPage.value + 1;
  fiscalDocumentsLoading.value = true;
  fiscalDocumentsError.value = "";
  try {
    const result = await getPrroFiscalDocuments(props.session.token, {
      branchNo: selectedBranch,
      from: fiscalDocumentFrom.value,
      to: fiscalDocumentTo.value,
      query: fiscalDocumentQuery.value,
      page,
      size: 30,
    });
    fiscalDocuments.value = reset
      ? result.documents
      : [...fiscalDocuments.value, ...result.documents];
    fiscalDocumentPage.value = result.page;
    fiscalDocumentsHasMore.value = result.hasMore;
  } catch (e) {
    fiscalDocumentsError.value = e.message || "Не вдалося завантажити архів фіскальних документів.";
  } finally {
    fiscalDocumentsLoading.value = false;
  }
}

function fiscalDocumentTypeLabel(type) {
  return ({
    CHK: "Чек",
    ZREPORT: "Z-звіт",
    SERVICECHK: "Службовий документ",
  })[type] || type || "Документ";
}

function fiscalDocumentSourceLabel(document) {
  if (document.sourceType === "PAYMENT") return "Надходження Baget";
  if (document.sourceType === "SHIFT_OPEN") return "Відкриття зміни";
  if (document.sourceType === "SHIFT_CLOSE") return "Закриття зміни";
  if (document.sourceType === "TEST") return "Контрольний тестовий чек";
  return document.sourceType || "Операція Baget";
}

async function openArchivedDocument(document) {
  if (openingFiscalDocumentId.value || !document) return;
  if (document.documentType !== "CHK") {
    fiscalDocumentsError.value = "Повторний друк цього типу документа поки не підтримується. Оригінал збережений в архіві.";
    return;
  }
  if (document.archiveStatus !== "CAPTURED") {
    fiscalDocumentsError.value = "ДПС підтвердила документ, але не повернула data_sign у відповіді sendChkV2. Оригінал не доступний для друку.";
    return;
  }

  openingFiscalDocumentId.value = document.id;
  fiscalDocumentsError.value = "";
  error.value = "";
  message.value = "";
  try {
    const archived = await getPrroFiscalDocument(props.session.token, document.id);
    if (!archived.dataSignBase64) {
      throw new Error("В архівному записі немає оригінальних байтів data_sign.");
    }
    const dpsReceipt = parseDpsReceipt(archived.dataSignBase64);
    if (dpsReceipt.fiscalNumber !== archived.fiscalNumber) {
      throw new Error("Фіскальний номер в оригіналі документа не збігається з архівним записом.");
    }
    if (dpsReceipt.receiptNumber !== String(archived.localNumber)) {
      throw new Error("Номер чека в оригіналі документа не збігається з локальним номером операції.");
    }
    receiptPrintData.value = {
      ...dpsReceipt,
      branchName: archived.branchName,
      deviceName: archived.deviceName,
      fiscalDocumentId: archived.fiscalDocumentId,
      responseCode: archived.responseCode,
      isTestDocument: archived.endpointMode === "TEST",
      archiveId: archived.id,
    };
    receiptPrintError.value = "";
    message.value = "Оригінальний чек завантажено з архіву ДПС. Тепер його можна повторно роздрукувати або надіслати.";
    await nextTick();
  } catch (e) {
    fiscalDocumentsError.value = e.message || "Не вдалося відкрити чек з архіву.";
  } finally {
    openingFiscalDocumentId.value = null;
  }
}


async function issuePaymentCheck(payment) {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  paymentCheckError.value = "";
  testCheckResult.value = null;
  receiptPrintData.value = null;
  receiptPrintError.value = "";

  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  const signerKeyId = selectedSignerKeyId.value.trim();
  if (!canCreatePaymentCheck.value) {
    paymentCheckError.value = "Для формування чека потрібна відкрита зміна та сертифікат касира, яким її відкрито.";
    return;
  }
  if (!payment?.paymentRequestKey || !["NOT_PREPARED", "PREPARED"].includes(payment.operationStatus)) {
    paymentCheckError.value = "Цей платіж уже обробляється або має завершений/неоднозначний результат ПРРО.";
    return;
  }

  activePaymentRequestKey.value = payment.paymentRequestKey;
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

    message.value = "Baget перевіряє збережений платіж і готує CHK із фактичної суми надходження…";
    const prepared = await preparePrroPaymentCheck(props.session.token, payment.paymentRequestKey, {
      branchNo: Number(selectedBranch),
      fiscalNumber: number,
      rroSignatureBase64,
      signerKeyId,
    });

    const xml = decodeSigningInput(prepared.signingInputBase64);
    message.value = "CHK сформовано на основі платежу Baget. Перевірте суму та підтвердьте підписання у віджеті IIT.";
    const signedPayloadBase64 = await widget.SignData(
      xml, false, true, window.EndUser.SignAlgo.DSTU4145WithGOST34311,
    );
    if (typeof signedPayloadBase64 !== "string" || !signedPayloadBase64.length) {
      throw new Error("ІІТ не повернув підписаний CHK у Base64.");
    }

    widgetVisible.value = false;
    message.value = isTestEndpoint.value
      ? "Підпис отримано. Надсилаємо тестовий CHK до ДПС…"
      : "Підпис отримано. Надсилаємо фіскальний CHK до ДПС…";
    const submitted = await submitPrroPaymentCheck(props.session.token, payment.paymentRequestKey, {
      operationId: prepared.operationId,
      signerKeyId,
      signedPayloadBase64,
    });
    testCheckResult.value = submitted;

    if (submitted.status === "FISCALIZED") {
      await loadFiscalDocuments(true);
      message.value = isTestEndpoint.value
        ? "ДПС прийняла тестовий чек із надходження Baget. Отримуємо відповідь lastChk…"
        : "ДПС прийняла фіскальний чек за надходженням Baget. Отримуємо відповідь lastChk…";
      try {
        const refreshed = await refreshShiftState(selectedBranch, number, rroSignatureBase64);
        const lastCheck = refreshed.lastCheck;
        if (!lastCheck || lastCheck.responseStatus !== "OK") {
          throw new Error(lastCheckError.value || "Не вдалося отримати підтвердження lastChk.");
        }
        if (lastCheck.fiscalDocumentId !== submitted.fiscalDocumentId) {
          throw new Error("ID документа lastChk не збігається з ID чека, створеного для платежу.");
        }
        if (!lastCheck.dataSignBase64) {
          throw new Error("У відповіді lastChk немає dataSignBase64. Перевірте розгортання backend PR #53.");
        }

        const dpsReceipt = parseDpsReceipt(lastCheck.dataSignBase64);
        if (dpsReceipt.fiscalNumber !== number) {
          throw new Error("Фіскальний номер у lastChk не збігається з вибраним ПРРО.");
        }
        receiptPrintData.value = {
          ...dpsReceipt,
          branchName: selectedBranchName.value,
          deviceName: deviceName.value || "ПРРО",
          fiscalDocumentId: lastCheck.fiscalDocumentId,
          responseCode: submitted.responseCode,
          isTestDocument: isTestEndpoint.value,
        };
        receiptPrintError.value = "";
        message.value = refreshed.status.state === "OPEN"
          ? (isTestEndpoint.value
            ? "Тестовий чек за реальним надходженням Baget підтверджено відповіддю ДПС. Друк і копіювання доступні."
            : "Фіскальний чек за надходженням Baget підтверджено відповіддю ДПС. Друк і копіювання доступні.")
          : "ДПС прийняла чек за надходженням Baget, але стан зміни потребує звірки перед наступною операцією.";
      } catch (verificationError) {
        receiptPrintData.value = null;
        receiptPrintError.value = verificationError.message || "невідома помилка";
        message.value = (isTestEndpoint.value
          ? "Тестовий чек прийнято"
          : "Фіскальний чек прийнято")
          + ", але документ lastChk не вдалося підтвердити: " + receiptPrintError.value;
      }
    } else if (submitted.status === "REJECTED") {
      message.value = (isTestEndpoint.value
        ? "ДПС відхилила тестовий чек"
        : "ДПС відхилила фіскальний чек")
        + " платежу Baget. Запис платежу в Baget не змінювався.";
    } else {
      message.value = "Результат фіскалізації неоднозначний. Не повторюйте надсилання — спочатку звірте операцію з ДПС.";
    }
  } catch (e) {
    paymentCheckError.value = e.message || "Не вдалося підготувати, підписати або надіслати чек платежу.";
    message.value = "";
  } finally {
    busy.value = false;
    widgetVisible.value = false;
    activePaymentRequestKey.value = "";
    await loadRecentPayments();
  }
}

async function inspectLastCheck() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  lastCheck.value = null;
  lastCheckError.value = "";
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


async function openShift() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  shiftOpenResult.value = null;

  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  const signerKeyId = selectedSignerKeyId.value.trim();
  if (!canOpenShift.value) {
    error.value = "Перевірте, що ПРРО має стан CLOSED і вибрано активного касира.";
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
      await loadFiscalDocuments(true);
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


async function closeShift() {
  if (busy.value) return;
  error.value = "";
  message.value = "";
  shiftCloseResult.value = null;

  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  const signerKeyId = selectedSignerKeyId.value.trim();
  if (!canCloseShift.value) {
    error.value = "Для закриття потрібна відкрита зміна та той самий касир, яким її відкрито.";
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
      await loadFiscalDocuments(true);
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
  if (busy.value || !isTestEndpoint.value) return;
  error.value = "";
  message.value = "";
  testCheckResult.value = null;
  receiptPrintData.value = null;
  receiptPrintError.value = "";
  shareDialogVisible.value = false;
  shareCopied.value = false;
  sharePhone.value = "";

  const selectedBranch = branchNo.value.trim();
  const number = fiscalNumber.value.trim();
  const signerKeyId = selectedSignerKeyId.value.trim();
  if (!canCreateTestCheck.value) {
    error.value = "Синтетичний чек доступний лише на TEST API у відкритій зміні, підписаній тим самим касиром.";
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
      await loadFiscalDocuments(true);
      testCheckIdempotencyKey.value = "";
      message.value = "Тестовий чек фіскалізовано. Отримуємо оригінальний документ із lastChk ДПС…";
      try {
        const refreshed = await refreshShiftState(selectedBranch, number, rroSignatureBase64);
        const lastCheck = refreshed.lastCheck;
        if (!lastCheck) {
          throw new Error(lastCheckError.value || "Backend не повернув відповідь lastChk.");
        }
        if (lastCheck.responseStatus !== "OK") {
          throw new Error("lastChk повернув статус " + (lastCheck.responseStatus || "невідомий")
            + (lastCheck.dpsMessage ? ": " + lastCheck.dpsMessage : "."));
        }
        if (!testCheckResult.value.fiscalDocumentId
            || lastCheck.fiscalDocumentId !== testCheckResult.value.fiscalDocumentId) {
          throw new Error("ID документа lastChk не збігається з ID щойно фіскалізованого чека. "
            + "Очікується " + (testCheckResult.value.fiscalDocumentId || "—")
            + ", отримано " + (lastCheck.fiscalDocumentId || "—") + ".");
        }
        if (!lastCheck.dataSignBase64) {
          throw new Error("У відповіді backend немає dataSignBase64. "
            + "Перевір, чи розгорнуто backend із PR #53.");
        }

        // lastChk identifies the exact latest document by fiscalDocumentId.
        // Do not require its data_sign bytes to hash identically to the original
        // signing input: DPS may return a representation with different bytes.
        const dpsReceipt = parseDpsReceipt(lastCheck.dataSignBase64);
        if (dpsReceipt.fiscalNumber !== number) {
          throw new Error("Фіскальний номер у документі lastChk (" + dpsReceipt.fiscalNumber
            + ") не збігається з вибраним ПРРО (" + number + ").");
        }
        receiptPrintData.value = {
          ...dpsReceipt,
          branchName: selectedBranchName.value,
          deviceName: deviceName.value || "ПРРО",
          fiscalDocumentId: lastCheck.fiscalDocumentId,
          responseCode: testCheckResult.value.responseCode,
          isTestDocument: isTestEndpoint.value,
        };
        receiptPrintError.value = "";

        if (refreshed.status.state === "OPEN") {
          message.value = "ДПС повернула той самий документ за ID через lastChk. Друк доступний.";
        } else {
          message.value = "Документ отримано та звірено за ID. Але стан зміни потребує уваги; "
            + "не виконуйте наступні фіскальні операції до звірки.";
        }
      } catch (verificationError) {
        receiptPrintData.value = null;
        receiptPrintError.value = verificationError.message || "невідома помилка";
        message.value = (isTestEndpoint.value
          ? "ДПС прийняла тестовий чек, але друк недоступний: "
          : "ДПС прийняла фіскальний чек, але друк недоступний: ")
          + receiptPrintError.value;
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

function formatDpsDateTime(value) {
  const digits = String(value ?? "");
  if (!/^\d{14}$/.test(digits)) return "—";
  return `${digits.slice(6, 8)}.${digits.slice(4, 6)}.${digits.slice(0, 4)} ${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14)}`;
}

function formatDpsMoney(minorUnits) {
  const amount = Number(minorUnits);
  if (!Number.isSafeInteger(amount)) {
    throw new Error("У документі ДПС міститься некоректна сума.");
  }
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount / 100) + " грн";
}

function readDerElement(bytes, offset, limit = bytes.length) {
  if (offset < 0 || offset >= limit) {
    throw new Error("Некоректна структура CMS: неочікуваний кінець ASN.1-елемента.");
  }
  const tag = bytes[offset++];
  if ((tag & 0x1f) === 0x1f) {
    throw new Error("CMS містить непідтримуваний багатобайтовий ASN.1 tag.");
  }
  if (offset >= limit) {
    throw new Error("Некоректна структура CMS: відсутня довжина ASN.1-елемента.");
  }

  const firstLength = bytes[offset++];
  let length = firstLength;
  if ((firstLength & 0x80) !== 0) {
    const lengthBytes = firstLength & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 4 || offset + lengthBytes > limit) {
      throw new Error("Некоректна DER-довжина ASN.1-елемента.");
    }
    length = 0;
    for (let i = 0; i < lengthBytes; i++) {
      length = length * 256 + bytes[offset++];
    }
  }

  const contentStart = offset;
  const contentEnd = contentStart + length;
  if (!Number.isSafeInteger(contentEnd) || contentEnd > limit) {
    throw new Error("ASN.1-елемент виходить за межі CMS-контейнера.");
  }
  return { tag, contentStart, contentEnd, nextOffset: contentEnd };
}

function readDerChildren(bytes, element) {
  const children = [];
  let offset = element.contentStart;
  while (offset < element.contentEnd) {
    const child = readDerElement(bytes, offset, element.contentEnd);
    children.push(child);
    offset = child.nextOffset;
  }
  if (offset !== element.contentEnd) {
    throw new Error("Некоректна межа ASN.1-елемента CMS.");
  }
  return children;
}

function derOidHex(bytes, element) {
  if (!element || element.tag !== 0x06) {
    throw new Error("У CMS відсутній очікуваний ASN.1 Object Identifier.");
  }
  return Array.from(bytes.subarray(element.contentStart, element.contentEnd))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function extractDerOctets(bytes, element) {
  if (element.tag === 0x04 || element.tag === 0x80) {
    return bytes.slice(element.contentStart, element.contentEnd);
  }
  if (element.tag === 0x24) {
    const chunks = readDerChildren(bytes, element).map(child => extractDerOctets(bytes, child));
    const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  throw new Error("CMS eContent має неочікуваний тип ASN.1: 0x"
    + element.tag.toString(16).padStart(2, "0") + ".");
}

function extractCmsSignedContent(bytes) {
  const contentInfo = readDerElement(bytes, 0);
  if (contentInfo.tag !== 0x30 || contentInfo.nextOffset !== bytes.length) {
    throw new Error("data_sign не є коректним DER ContentInfo CMS.");
  }
  const contentInfoChildren = readDerChildren(bytes, contentInfo);
  const signedDataOid = "2a864886f70d010702";
  if (derOidHex(bytes, contentInfoChildren[0]) !== signedDataOid) {
    throw new Error("data_sign є CMS-контейнером, але не типом SignedData.");
  }

  const explicitContent = contentInfoChildren[1];
  if (!explicitContent || explicitContent.tag !== 0xa0) {
    throw new Error("У CMS SignedData відсутня оболонка ContentInfo [0].");
  }
  const explicitChildren = readDerChildren(bytes, explicitContent);
  const signedData = explicitChildren.find(child => child.tag === 0x30);
  if (!signedData) {
    throw new Error("У CMS не знайдено структуру SignedData.");
  }

  const signedDataChildren = readDerChildren(bytes, signedData);
  // SignedData: version, digestAlgorithms, encapContentInfo, ...
  const encapsulatedContentInfo = signedDataChildren[2];
  if (!encapsulatedContentInfo || encapsulatedContentInfo.tag !== 0x30) {
    throw new Error("У CMS SignedData відсутній encapContentInfo.");
  }
  const encapsulatedChildren = readDerChildren(bytes, encapsulatedContentInfo);
  const dataContentOid = "2a864886f70d010701";
  if (derOidHex(bytes, encapsulatedChildren[0]) !== dataContentOid) {
    throw new Error("CMS містить eContent невідомого типу, очікувався PKCS#7 data.");
  }

  const embeddedContent = encapsulatedChildren[1];
  if (!embeddedContent || embeddedContent.tag !== 0xa0) {
    throw new Error("CMS SignedData містить відокремлений підпис без вкладеного XML eContent.");
  }
  const embeddedChildren = readDerChildren(bytes, embeddedContent);
  const octetString = embeddedChildren.find(child =>
    child.tag === 0x04 || child.tag === 0x24 || child.tag === 0x80);
  if (!octetString) {
    throw new Error("У CMS eContent немає OCTET STRING із даними чека.");
  }

  return extractDerOctets(bytes, octetString);
}

function decodeDpsXmlBytes(inputBytes) {
  let bytes = inputBytes;

  // Respect Unicode BOMs before trying XML-declared encodings.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    bytes = bytes.subarray(3);
  } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
  }

  // XML markup and the encoding declaration are ASCII, even when the XML
  // body itself is encoded as Windows-1251.
  const asciiPrefix = Array.from(bytes.subarray(0, Math.min(bytes.length, 512)))
    .map(byte => byte <= 0x7f ? String.fromCharCode(byte) : "\u0000")
    .join("");
  if (!/^\s*(?:<\?xml\b|<RQ\b|<DAT\b)/i.test(asciiPrefix)) {
    const preview = Array.from(bytes.subarray(0, 12))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join(" ");
    throw new Error("Вміст CMS eContent не починається з XML. Перші байти: "
      + (preview || "порожньо") + ".");
  }

  const declaredEncoding = asciiPrefix.match(
    /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i,
  )?.[1];
  const candidates = [...new Set([declaredEncoding, "utf-8", "windows-1251"].filter(Boolean))];
  const failures = [];

  for (const encoding of candidates) {
    try {
      const xmlText = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if (/^\uFEFF?\s*(?:<\?xml\b|<RQ\b|<DAT\b)/i.test(xmlText)) return xmlText;
      failures.push(encoding + ": декодований текст не починається з XML");
    } catch (e) {
      failures.push(encoding + ": " + (e.message || "помилка декодування"));
    }
  }

  throw new Error("Не вдалося декодувати XML із CMS eContent. Перевірені кодування: "
    + candidates.join(", ") + ". " + failures.join("; "));
}

function decodeDpsXml(dataSignBase64) {
  if (typeof dataSignBase64 !== "string" || !dataSignBase64.trim()) {
    throw new Error("ДПС не повернула в lastChk тіло документа data_sign.");
  }

  let binary;
  try {
    binary = window.atob(dataSignBase64);
  } catch {
    throw new Error("Поле data_sign від ДПС містить некоректний Base64.");
  }
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const asciiPrefix = Array.from(bytes.subarray(0, Math.min(bytes.length, 16)))
    .map(byte => byte <= 0x7f ? String.fromCharCode(byte) : "\u0000")
    .join("");

  // Accept plain XML for DPS responses that return it without a CMS wrapper.
  if (/^\s*(?:<\?xml\b|<RQ\b|<DAT\b)/i.test(asciiPrefix)) {
    return decodeDpsXmlBytes(bytes);
  }

  // lastChk.data_sign may be a PKCS#7/CMS SignedData container. Extract only
  // its encapsulated data; never try to decode the DER signature/certificates
  // as text.
  const embeddedXml = extractCmsSignedContent(bytes);
  return decodeDpsXmlBytes(embeddedXml);
}

function parseDpsReceipt(dataSignBase64) {
  const xmlText = decodeDpsXml(dataSignBase64);
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error("Документ data_sign від ДПС не є коректним XML UTF-8.");
  }

  const packet = document.getElementsByTagName("DAT")[0];
  const check = document.getElementsByTagName("C")[0];
  const closing = check?.getElementsByTagName("E")[0];
  if (!packet || !check || !closing) {
    throw new Error("У документі lastChk відсутні обов'язкові елементи DAT/C/E.");
  }

  const fiscalNumber = packet.getAttribute("FN") || closing.getAttribute("FN") || "";
  const receiptNumber = closing.getAttribute("NO") || "";
  const dateTime = closing.getAttribute("TS")
    || packet.getElementsByTagName("TS")[0]?.textContent?.trim()
    || "";
  const items = Array.from(check.getElementsByTagName("P")).map((item, index) => {
    const name = item.getAttribute("NM") || "";
    const amountMinor = item.getAttribute("SM");
    if (!name || amountMinor === null) {
      throw new Error("У документі ДПС є товарна позиція без назви або суми.");
    }
    const quantityRaw = item.getAttribute("Q");
    const quantity = quantityRaw === null ? 1 : Number(quantityRaw) / 1000;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("У документі ДПС є некоректна кількість товару.");
    }
    return {
      key: item.getAttribute("N") || String(index),
      name,
      quantity: new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 3 }).format(quantity),
      amount: formatDpsMoney(amountMinor),
      taxCode: item.getAttribute("TX") || "",
    };
  });
  const payments = Array.from(check.getElementsByTagName("M")).map((payment, index) => {
    const amountMinor = payment.getAttribute("SM");
    if (amountMinor === null) {
      throw new Error("У документі ДПС є спосіб оплати без суми.");
    }
    return {
      key: payment.getAttribute("N") || String(index),
      name: payment.getAttribute("NM") || "Оплата",
      amount: formatDpsMoney(amountMinor),
    };
  });

  if (!/^\d{1,32}$/.test(fiscalNumber) || !/^\d+$/.test(receiptNumber)
      || !/^\d{14}$/.test(dateTime) || !items.length || !payments.length) {
    throw new Error("Документ lastChk не містить повного набору реквізитів чека.");
  }

  const totalMinor = closing.getAttribute("SM");
  if (totalMinor === null) {
    throw new Error("У документі lastChk відсутня підсумкова сума.");
  }

  return {
    fiscalNumber,
    receiptNumber,
    dateTime,
    receiptType: check.getAttribute("T") === "1" ? "ЧЕК ПОВЕРНЕННЯ" : "ЧЕК ПРОДАЖУ",
    cashierNumber: closing.getAttribute("CS") || "",
    items,
    payments,
    total: formatDpsMoney(totalMinor),
    source: "lastChk.data_sign",
  };
}

function printReceipt() {
  if (!canPrintReceipt.value) return;
  window.print();
}

function wrapReceiptText(context, value, maxWidth) {
  const words = String(value ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (!line || context.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function createReceiptImageBlob(data) {
  return new Promise((resolve, reject) => {
    const width = 720;
    const margin = 44;
    const contentWidth = width - margin * 2;
    const measureCanvas = document.createElement("canvas");
    const measureContext = measureCanvas.getContext("2d");
    if (!measureContext) {
      reject(new Error("Браузер не підтримує формування зображення чека."));
      return;
    }

    const commands = [];
    let y = 40;

    function addText(value, font = "20px Arial", options = {}) {
      const lineHeight = options.lineHeight || 29;
      const align = options.align || "left";
      const color = options.color || "#111111";
      const maxWidth = options.maxWidth || contentWidth;
      measureContext.font = font;
      const lines = wrapReceiptText(measureContext, value, maxWidth);
      for (const line of lines) {
        y += lineHeight;
        commands.push({
          type: "text",
          text: line,
          x: align === "center" ? width / 2 : align === "right" ? width - margin : margin,
          y,
          font,
          align,
          color,
        });
      }
      if (options.after) y += options.after;
    }

    function addRow(left, right, font = "18px Arial", lineHeight = 27) {
      measureContext.font = font;
      const rightWidth = measureContext.measureText(String(right ?? "")).width;
      const leftWidth = Math.max(100, contentWidth - rightWidth - 20);
      const lines = wrapReceiptText(measureContext, left, leftWidth);
      for (let index = 0; index < lines.length; index++) {
        y += lineHeight;
        commands.push({
          type: "text", text: lines[index], x: margin, y, font, align: "left", color: "#111111",
        });
        if (index === 0 && right) {
          commands.push({
            type: "text", text: String(right), x: width - margin, y, font, align: "right", color: "#111111",
          });
        }
      }
    }

    function addSeparator() {
      y += 12;
      commands.push({ type: "line", x1: margin, x2: width - margin, y, color: "#222222" });
      y += 16;
    }

    addText("БАГЕТ", "bold 36px Arial", { align: "center", lineHeight: 44 });
    addText(data.receiptType || "ЧЕК", "bold 23px Arial", { align: "center", lineHeight: 31, after: 12 });

    const warningTop = y + 2;
    if (data.isTestDocument) {
      const warningHeight = 76;
      commands.push({
        type: "rect",
        x: margin,
        y: warningTop,
        width: contentWidth,
        height: warningHeight,
        color: "#111111",
      });
      y = warningTop + 13;
      addText("ТЕСТОВИЙ ДОКУМЕНТ", "bold 22px Arial", { align: "center", lineHeight: 27 });
      addText("НЕ Є ФІСКАЛЬНИМ ЧЕКОМ", "bold 20px Arial", { align: "center", lineHeight: 25, color: "#111111" });
      y = warningTop + warningHeight + 13;
    } else {
      addText("КОПІЯ ФІСКАЛЬНОГО ЧЕКА", "bold 20px Arial", { align: "center", lineHeight: 28, after: 10 });
    }

    addText(data.branchName || "Філія", "18px Arial", { lineHeight: 26 });
    addText(data.deviceName || "ПРРО", "18px Arial", { lineHeight: 26 });
    addText("ФН ПРРО: " + (data.fiscalNumber || "—"), "18px Arial", { lineHeight: 26 });
    addText("Чек №: " + (data.receiptNumber || "—"), "18px Arial", { lineHeight: 26 });
    addText("Дата і час: " + formatDpsDateTime(data.dateTime), "18px Arial", { lineHeight: 26 });
    if (data.cashierNumber) addText("Касир: " + data.cashierNumber, "18px Arial", { lineHeight: 26 });

    addSeparator();
    addText("ПОЗИЦІЇ", "bold 17px Arial", { lineHeight: 24 });
    for (const item of data.items || []) {
      const itemName = item.name + " × " + item.quantity
        + (item.taxCode ? " · податок " + item.taxCode : "");
      addRow(itemName, item.amount, "18px Arial", 27);
    }

    addSeparator();
    for (const payment of data.payments || []) {
      addRow("Оплата: " + payment.name, payment.amount, "18px Arial", 27);
    }
    addSeparator();
    addRow("СУМА", data.total, "bold 24px Arial", 34);
    y += 8;

    addText("Джерело документа: відповідь ДПС lastChk / data_sign", "15px Arial", { lineHeight: 22 });
    addText("ID документа ДПС: " + (data.fiscalDocumentId || "—"), "15px Arial", { lineHeight: 22 });
    addText("Код відповіді: " + (data.responseCode ?? "—"), "15px Arial", { lineHeight: 22, after: 8 });
    addText(
      data.isTestDocument
        ? "Документ отримано з тестового середовища ДПС. Він не підтверджує оплату, продаж або приймання коштів і не може використовуватися як фіскальний розрахунковий документ."
        : "Копію сформовано за даними документа, отриманого від production API ДПС.",
      "bold 15px Arial",
      { align: "center", lineHeight: 22, after: 18 },
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.ceil(y + 32);
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Не вдалося створити зображення чека."));
      return;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textBaseline = "top";

    for (const command of commands) {
      if (command.type === "text") {
        context.font = command.font;
        context.fillStyle = command.color;
        context.textAlign = command.align;
        context.fillText(command.text, command.x, command.y);
      } else if (command.type === "line") {
        context.beginPath();
        context.setLineDash([7, 5]);
        context.strokeStyle = command.color;
        context.lineWidth = 1;
        context.moveTo(command.x1, command.y);
        context.lineTo(command.x2, command.y);
        context.stroke();
        context.setLineDash([]);
      } else if (command.type === "rect") {
        context.strokeStyle = command.color;
        context.lineWidth = 3;
        context.strokeRect(command.x, command.y, command.width, command.height);
      }
    }

    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Браузер не зміг сформувати PNG-зображення чека."));
    }, "image/png");
  });
}

function copyReceiptImageToClipboard() {
  if (!canPrintReceipt.value || !receiptPrintData.value) {
    throw new Error("Немає перевіреного документа ДПС для копіювання.");
  }
  if (!window.isSecureContext || !navigator.clipboard?.write || typeof window.ClipboardItem !== "function") {
    throw new Error("Копіювання зображення недоступне. Відкрийте Baget через HTTPS у Microsoft Edge або Chrome.");
  }

  // Pass a promise-backed PNG to ClipboardItem so clipboard.write is invoked
  // immediately from the user's click handler while transient user activation is available.
  const imageBlob = createReceiptImageBlob(receiptPrintData.value);
  const clipboardItem = new window.ClipboardItem({ "image/png": imageBlob });
  return navigator.clipboard.write([clipboardItem]);
}

function normalizeSharePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = "38" + digits;
  return digits;
}

function isValidSharePhone(value) {
  return /^\d{8,15}$/.test(normalizeSharePhone(value));
}

function openReceiptShare() {
  if (!canPrintReceipt.value || shareBusy.value) return;
  shareDialogVisible.value = true;
  shareCopied.value = false;
  sharePhone.value = "";
  shareError.value = "";
  shareMessage.value = "";
  shareBusy.value = true;

  let copyPromise;
  try {
    copyPromise = copyReceiptImageToClipboard();
  } catch (e) {
    shareError.value = e.message || "Не вдалося скопіювати чек.";
    shareBusy.value = false;
    return;
  }

  copyPromise.then(() => {
    shareCopied.value = true;
    shareMessage.value = "Чек скопійовано як PNG-зображення. Відкрийте потрібний месенджер і вставте його через Ctrl+V.";
  }).catch(e => {
    shareError.value = e.message || "Не вдалося скопіювати чек у буфер обміну.";
  }).finally(() => {
    shareBusy.value = false;
  });
}

function copyReceiptAgain() {
  if (shareBusy.value) return;
  shareBusy.value = true;
  shareError.value = "";
  let copyPromise;
  try {
    copyPromise = copyReceiptImageToClipboard();
  } catch (e) {
    shareError.value = e.message || "Не вдалося скопіювати чек.";
    shareBusy.value = false;
    return;
  }
  copyPromise.then(() => {
    shareCopied.value = true;
    shareMessage.value = "Чек знову скопійовано. Тепер його можна вставити у відкритий чат через Ctrl+V.";
  }).catch(e => {
    shareError.value = e.message || "Не вдалося скопіювати чек у буфер обміну.";
  }).finally(() => {
    shareBusy.value = false;
  });
}

function openTelegramForShare() {
  if (!canShareWithTelegram.value) return;
  const phone = normalizeSharePhone(sharePhone.value);
  window.open("https://t.me/+" + phone, "_blank", "noopener,noreferrer");
  shareMessage.value = "Telegram відкриває контакт за номером. Перевірте ім’я одержувача, відкрийте чат і вставте чек через Ctrl+V.";
}

function openViberForShare() {
  if (!canShareWithViber.value) return;
  const phone = normalizeSharePhone(sharePhone.value);
  // Viber Desktop uses the chat URI scheme for opening a personal number.
  // Encode the leading plus so it is not interpreted as a space in the query.
  const viberUrl = "viber://chat?number=" + encodeURIComponent("+" + phone);
  window.open(viberUrl, "_blank", "noopener,noreferrer");
  shareMessage.value = "Viber має відкрити чат із номером " + sharePhone.value
    + ". Перевірте одержувача та вставте чек через Ctrl+V. Якщо Viber не відкрився, перевірте, чи встановлено Viber Desktop і чи дозволено браузеру відкривати зовнішні URI-схеми.";
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
        <div><span>Сервер ДПС</span><strong>{{ shiftStatus.endpointMode === "TEST" ? "TEST API" : shiftStatus.endpointMode === "PRODUCTION" ? "PRODUCTION API" : shiftStatus.endpointMode || "—" }}</strong></div>
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
          Список завантажено разом зі станом ПРРО. Це прив’язка до зареєстрованого оператора;
          фактичний приватний ключ ви окремо обираєте у вікні IIT. Обирайте той самий сертифікат в обох місцях.
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
          @click="openShift">
          Відкрити зміну
        </button>
        <button v-if="canCancelPreparedShiftOpen" type="button" class="button-secondary"
          :disabled="busy"
          @click="cancelPendingShiftOpen">
          Скасувати незавершене локальне відкриття
        </button>
      </div>
      <p v-if="canCancelPreparedShiftOpen" class="reconciliation-warning">
        Локальна операція відкриття залишилася у PREPARED, але ДПС підтверджує закриту зміну.
        Скасування дозволене лише після повторної перевірки ДПС на сервері.
      </p>

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
        <article v-if="isTestEndpoint" class="prro-panel operation-card">
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
          <p v-if="testCheckResult?.status === 'FISCALIZED' && !canPrintReceipt && receiptPrintError"
            class="feedback feedback-error" role="alert">
            Друк недоступний: {{ receiptPrintError }}
          </p>
          <button v-if="canPrintReceipt" type="button" class="button-secondary"
            @click="printReceipt">
            {{ receiptPrintData.isTestDocument ? "Роздрукувати тестовий чек" : "Роздрукувати фіскальний чек" }}
          </button>
          <button v-if="canPrintReceipt" type="button" class="button-primary"
            @click="openReceiptShare">
            Надіслати чек
          </button>
        </article>
        <article class="prro-panel operation-card">
          <div class="operation-icon">↻</div>
          <div>
            <h4>Закриття зміни</h4>
            <p>Формування Z-звіту з підсумків усіх фіскалізованих CHK та закриття активної зміни ПРРО.</p>
          </div>
          <span class="feature-status feature-ready">{{ isTestEndpoint ? "TEST API" : "PRODUCTION API" }}</span>
          <button type="button" class="button-secondary" :disabled="!canCloseShift" @click="closeShift">
            {{ busy ? "Виконується…" : "Сформувати Z-звіт і закрити зміну" }}
          </button>
        </article>
      </div>
    </section>

    <section class="prro-panel fiscal-document-archive" aria-labelledby="fiscal-document-archive-title">
      <div class="section-heading">
        <div>
          <h3 id="fiscal-document-archive-title">Архів фіскальних документів</h3>
          <p>Оригінальні відповіді ДПС, збережені під час фіскалізації. Чеки продажу та повернення можна повторно відкрити й надрукувати.</p>
        </div>
        <button type="button" class="button-secondary"
          :disabled="fiscalDocumentsLoading || !branchNo" @click="loadFiscalDocuments(true)">
          {{ fiscalDocumentsLoading ? "Завантаження…" : "Оновити архів" }}
        </button>
      </div>

      <div class="fiscal-document-filters">
        <label>З дати
          <input v-model="fiscalDocumentFrom" type="date">
        </label>
        <label>До дати
          <input v-model="fiscalDocumentTo" type="date">
        </label>
        <label class="fiscal-document-search">Пошук
          <input v-model.trim="fiscalDocumentQuery" type="search"
            placeholder="Фіскальний ID, номер чека, ФН або джерело"
            @keyup.enter="loadFiscalDocuments(true)">
        </label>
        <button type="button" class="button-primary"
          :disabled="fiscalDocumentsLoading || !branchNo"
          @click="loadFiscalDocuments(true)">
          Знайти
        </button>
      </div>

      <p v-if="fiscalDocumentsError" class="feedback feedback-error" role="alert">{{ fiscalDocumentsError }}</p>
      <p v-if="!fiscalDocuments.length && !fiscalDocumentsLoading && !fiscalDocumentsError" class="help-text">
        За вибраний період фіскальних документів не знайдено.
      </p>

      <div v-if="fiscalDocuments.length" class="fiscal-document-list">
        <article v-for="document in fiscalDocuments" :key="document.id" class="fiscal-document-row">
          <div class="fiscal-document-copy">
            <strong>{{ fiscalDocumentTypeLabel(document.documentType) }} №{{ document.localNumber }}</strong>
            <span>{{ document.branchName }} · {{ document.deviceName }} · ФН {{ document.fiscalNumber }}</span>
            <small>{{ new Date(document.archivedAt).toLocaleString("uk-UA") }} · ID ДПС: {{ document.fiscalDocumentId }}</small>
            <small>{{ fiscalDocumentSourceLabel(document) }} · {{ document.endpointMode === "TEST" ? "TEST API" : "PRODUCTION API" }}</small>
            <small v-if="document.archiveStatus !== 'CAPTURED'" class="fiscal-document-missing">
              Відповідь ДПС не містила data_sign — повторний друк недоступний
            </small>
          </div>
          <button type="button" class="button-secondary"
            :disabled="openingFiscalDocumentId === document.id || document.archiveStatus !== 'CAPTURED' || document.documentType !== 'CHK'"
            @click="openArchivedDocument(document)">
            {{ openingFiscalDocumentId === document.id ? "Відкриваємо…" : "Відкрити чек" }}
          </button>
        </article>
      </div>

      <div class="fiscal-document-pagination">
        <span>{{ fiscalDocuments.length }} документ(ів) у вибірці</span>
        <button v-if="fiscalDocumentsHasMore" type="button" class="button-secondary"
          :disabled="fiscalDocumentsLoading" @click="loadFiscalDocuments(false)">
          {{ fiscalDocumentsLoading ? "Завантаження…" : "Завантажити ще" }}
        </button>
      </div>

      <div v-if="receiptPrintData?.archiveId" class="fiscal-document-selected">
        <div>
          <strong>Відкрито чек з архіву №{{ receiptPrintData.receiptNumber }}</strong>
          <small>ID ДПС: {{ receiptPrintData.fiscalDocumentId }}</small>
        </div>
        <div class="fiscal-document-selected-actions">
          <button type="button" class="button-primary" @click="printReceipt">Роздрукувати</button>
          <button type="button" class="button-secondary" @click="openReceiptShare">Надіслати копію</button>
        </div>
      </div>
    </section>

    <div v-if="shareDialogVisible" class="share-overlay" @click.self="shareDialogVisible = false">
      <section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <button type="button" class="share-close" aria-label="Закрити" @click="shareDialogVisible = false">×</button>
        <p class="eyebrow">КОПІЯ ДОКУМЕНТА ДПС</p>
        <h3 id="share-dialog-title">Надіслати чек</h3>
        <p class="help-text">
          Чек копіюється як PNG-зображення. Відкрийте месенджер, виберіть контакт і вставте зображення через Ctrl+V.
        </p>
        <div class="share-status" :class="{ 'share-status-error': shareError }" role="status">
          <span v-if="shareBusy">Готуємо зображення та копіюємо чек…</span>
          <span v-else-if="shareError">{{ shareError }}</span>
          <span v-else>{{ shareMessage }}</span>
        </div>
        <label for="share-customer-phone">Номер телефону покупця</label>
        <input id="share-customer-phone" v-model.trim="sharePhone" type="tel"
          inputmode="tel" autocomplete="tel" placeholder="+380 XX XXX XX XX" />
        <p class="help-text">
          Для Telegram номер має бути міжнародним. Для Viber відкриється Viber Desktop, де касир знайде контакт за цим номером.
        </p>
        <div class="share-actions">
          <button type="button" class="button-primary" :disabled="!canShareWithTelegram || shareBusy"
            @click="openTelegramForShare">
            <span aria-hidden="true">➤</span> Telegram
          </button>
          <button type="button" class="button-secondary" :disabled="!canShareWithViber || shareBusy"
            @click="openViberForShare">
            <span aria-hidden="true">●</span> Viber
          </button>
        </div>
        <div class="share-footer">
          <button type="button" class="button-secondary" :disabled="shareBusy || !canPrintReceipt"
            @click="copyReceiptAgain">
            {{ shareBusy ? "Копіюємо…" : "Скопіювати чек ще раз" }}
          </button>
          <button type="button" class="button-secondary" @click="shareDialogVisible = false">Готово</button>
        </div>
        <p class="share-disclaimer">
          Перед відправленням обов’язково перевірте номер і профіль одержувача.
          {{ receiptPrintData?.isTestDocument ? "Це документ із тестового середовища ДПС, він не є фіскальним чеком." : "Це електронна копія документа, отриманого від production API ДПС." }}
        </p>
      </section>
    </div>

    <section class="prro-panel payment-check-panel" aria-labelledby="payment-check-title">
      <div class="section-heading">
        <div>
          <h3 id="payment-check-title">Надходження Baget для фіскалізації</h3>
          <p>Реальні суми з підтверджених платежів каси/банку Baget. Фінансові записи не змінюються.</p>
        </div>
        <button type="button" class="button-secondary" :disabled="busy || !branchNo" @click="loadRecentPayments">
          Оновити список
        </button>
      </div>
      <p class="help-text">
        {{ isTestEndpoint ? "У TEST API надсилається лише нове надходження коштів: окремо не дублюється зарахований аванс." : "У production API надсилається лише нове надходження коштів: окремо не дублюється зарахований аванс." }}
        Ім’я, телефон та адреса покупця не надсилаються. Податкову ознаку позицій задає серверна конфігурація Baget.
      </p>
      <p v-if="paymentCheckError" class="feedback feedback-error" role="alert">{{ paymentCheckError }}</p>
      <p v-if="!recentPayments.length && !paymentCheckError" class="help-text">
        Немає доступних підтверджених надходжень із новими коштами для цієї філії.
      </p>
      <div v-if="recentPayments.length" class="payment-check-list">
        <article v-for="payment in recentPayments" :key="payment.paymentRequestKey" class="payment-check-row">
          <div class="payment-check-copy">
            <strong>{{ payment.documentLabel }}</strong>
            <span>{{ payment.createdAt ? new Date(payment.createdAt).toLocaleString("uk-UA") : "Дата невідома" }}</span>
            <small>{{ payment.paymentName }} · {{ paymentOperationLabel(payment.operationStatus) }}</small>
          </div>
          <strong class="payment-check-amount">
            {{ new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH" }).format(Number(payment.amount || 0)) }}
          </strong>
          <button type="button" class="button-secondary"
            :disabled="busy || !canCreatePaymentCheck || !['NOT_PREPARED', 'PREPARED'].includes(payment.operationStatus)"
            @click="issuePaymentCheck(payment)">
            {{ activePaymentRequestKey === payment.paymentRequestKey ? "Виконується…" : payment.operationStatus === "PREPARED" ? "Продовжити підготовку" : isTestEndpoint ? "Підготувати тестовий чек" : "Підготувати фіскальний чек" }}
          </button>
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

    <section v-if="receiptPrintData" class="print-receipt" aria-hidden="true">
      <header class="print-receipt__header">
        <strong class="print-receipt__brand">БАГЕТ</strong>
        <div class="print-receipt__title">{{ receiptPrintData.receiptType }}</div>
        <div v-if="receiptPrintData.isTestDocument" class="print-receipt__warning">ТЕСТОВИЙ ДОКУМЕНТ<br />НЕ Є ФІСКАЛЬНИМ ЧЕКОМ</div>
      <div v-else class="print-receipt__warning">КОПІЯ ФІСКАЛЬНОГО ЧЕКА</div>
      </header>

      <div class="print-receipt__meta">
        <div>{{ receiptPrintData.branchName }}</div>
        <div>{{ receiptPrintData.deviceName }}</div>
        <div>ФН ПРРО: {{ receiptPrintData.fiscalNumber }}</div>
        <div>Чек №: {{ receiptPrintData.receiptNumber }}</div>
        <div>Дата і час: {{ formatDpsDateTime(receiptPrintData.dateTime) }}</div>
        <div v-if="receiptPrintData.cashierNumber">Касир: {{ receiptPrintData.cashierNumber }}</div>
      </div>

      <div class="print-receipt__separator"></div>
      <div v-for="item in receiptPrintData.items" :key="item.key" class="print-receipt__row">
        <span>
          {{ item.name }} × {{ item.quantity }}
          <small v-if="item.taxCode"> · податок {{ item.taxCode }}</small>
        </span>
        <span>{{ item.amount }}</span>
      </div>

      <div class="print-receipt__separator"></div>
      <div v-for="payment in receiptPrintData.payments" :key="payment.key" class="print-receipt__row">
        <span>Оплата: {{ payment.name }}</span>
        <span>{{ payment.amount }}</span>
      </div>
      <div class="print-receipt__separator"></div>
      <div class="print-receipt__total">
        <strong>СУМА</strong>
        <strong>{{ receiptPrintData.total }}</strong>
      </div>

      <div class="print-receipt__meta print-receipt__footer">
        <div>Джерело документа: архів оригінальної відповіді ДПС / data_sign</div>
        <div>ID документа ДПС: {{ receiptPrintData.fiscalDocumentId }}</div>
        <div>Код відповіді: {{ receiptPrintData.responseCode ?? "—" }}</div>
      </div>
      <p class="print-receipt__disclaimer">
        {{ receiptPrintData.isTestDocument
          ? "Документ отримано з тестового середовища ДПС. Він не підтверджує оплату, продаж або приймання коштів і не може використовуватися як фіскальний розрахунковий документ."
          : "Копію сформовано за даними документа, отриманого від production API ДПС." }}
      </p>
    </section>

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
.payment-check-panel { display:grid; gap:13px; }
.payment-check-list { display:grid; gap:9px; }
.payment-check-row { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(190px,220px); align-items:center; gap:14px; padding:12px 13px; border:1px solid #e0e5eb; border-radius:10px; background:#fff; }
.payment-check-copy { display:grid; gap:4px; min-width:0; }
.payment-check-copy strong { font-size:14px; overflow-wrap:anywhere; }
.payment-check-copy span,.payment-check-copy small { color:#667085; font-size:12px; }
.payment-check-amount { white-space:nowrap; font-size:14px; }
.payment-check-row button { min-height:40px; border:0; border-radius:9px; padding:9px 12px; font:inherit; font-size:12px; font-weight:650; cursor:pointer; }
.diagnostics-section { border:1px solid #e0e5eb; border-radius:12px; background:#f8fafc; padding:14px 16px; }
.diagnostics-section>summary { list-style:none; }.diagnostics-section>summary::-webkit-details-marker { display:none; }
.diagnostics-section>summary span { display:grid; gap:3px; }.diagnostics-section>summary strong { color:#344054; font-size:14px; }.diagnostics-section>summary small { color:#667085; font-size:12px; font-weight:400; }
.diagnostics-content { display:grid; gap:12px; margin-top:14px; }.diagnostics-content h3 { margin:0 0 14px; font-size:16px; }.diagnostics-content h4 { margin:18px 0 0; font-size:13px; }
.diagnostic-actions { margin:12px 0; }.diagnostic-result { margin-top:16px; padding-top:14px; border-top:1px solid #eaecf0; }
.operator-list { padding-left:18px; color:#475467; font-size:13px; line-height:1.7; overflow-wrap:anywhere; }
.fixture-panel details { display:grid; gap:12px; }.fixture-panel .help-text { margin-top:12px; }.fixture-xml { box-sizing:border-box; width:100%; min-height:200px; margin-top:12px; padding:12px; border:1px solid #cfd6df; border-radius:9px; font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre; }
.iit-widget-overlay { position:fixed; inset:0; z-index:2000; display:none; align-items:center; justify-content:center; padding:16px; background:#0c1728a8; }.iit-widget-overlay.visible { display:flex; }
.iit-widget-dialog { display:flex; flex-direction:column; width:min(900px,100%); height:min(800px,92vh); overflow:hidden; border-radius:12px; background:#fff; }.iit-widget-title { padding:12px 16px; border-bottom:1px solid #e0e5eb; font-weight:650; }.iit-widget-parent { flex:1; min-height:0; }
.print-receipt { display:none; }
@media print {
  @page { size:80mm auto; margin:3mm; }
  :global(body *) { visibility:hidden !important; }
  .print-receipt,.print-receipt * { visibility:visible !important; }
  .print-receipt {
    display:block !important;
    position:absolute !important;
    left:0 !important;
    top:0 !important;
    width:74mm !important;
    box-sizing:border-box;
    margin:0;
    padding:0;
    color:#000 !important;
    background:#fff !important;
    font-family:Arial,Helvetica,sans-serif;
    font-size:11px;
    line-height:1.35;
  }
  .print-receipt__header { text-align:center; }
  .print-receipt__brand { display:block; font-size:20px; letter-spacing:.12em; }
  .print-receipt__title { margin:4px 0 7px; font-weight:700; }
  .print-receipt__warning {
    border:2px solid #000;
    padding:6px 4px;
    font-size:13px;
    font-weight:800;
    line-height:1.4;
  }
  .print-receipt__meta { margin:9px 0; overflow-wrap:anywhere; }
  .print-receipt__separator { border-top:1px dashed #000; margin:8px 0; }
  .print-receipt__row,.print-receipt__total { display:flex; justify-content:space-between; gap:8px; }
  .print-receipt__total { font-size:14px; margin:8px 0; }
  .print-receipt__footer { font-size:10px; }
  .print-receipt__disclaimer { margin:10px 0 0; text-align:center; font-size:10px; font-weight:600; }
}
@media(max-width:850px) { .operation-grid { grid-template-columns:1fr; }.status-summary { grid-template-columns:repeat(2,minmax(0,1fr)); }.payment-check-row { grid-template-columns:minmax(0,1fr) auto; }.payment-check-row button { grid-column:1 / -1; } }
.share-overlay { position:fixed; inset:0; z-index:2100; display:flex; align-items:center; justify-content:center; padding:16px; background:#0c1728a8; }
.share-dialog { position:relative; display:grid; gap:12px; width:min(520px,100%); max-height:calc(100dvh - 32px); overflow:auto; box-sizing:border-box; padding:24px; border-radius:14px; background:#fff; box-shadow:0 20px 60px #10182840; }
.share-dialog h3 { margin:0; font-size:21px; }.share-dialog label { margin-top:5px; font-size:13px; font-weight:650; }
.share-dialog input { box-sizing:border-box; width:100%; min-height:44px; border:1px solid #cfd6df; border-radius:9px; padding:10px 12px; font:inherit; }
.share-close { position:absolute; top:10px; right:12px; width:34px; height:34px; border:0; border-radius:8px; background:#f2f4f7; color:#344054; font-size:24px; cursor:pointer; }
.share-status { padding:11px 12px; border-radius:9px; background:#ecfdf3; color:#067647; font-size:13px; line-height:1.5; }
.share-status-error { background:#fef3f2; color:#b42318; }.share-actions,.share-footer { display:flex; flex-wrap:wrap; gap:9px; }
.share-actions button,.share-footer button { min-height:42px; border:0; border-radius:9px; padding:10px 15px; font:inherit; font-size:13px; font-weight:650; cursor:pointer; }
.share-actions button { flex:1; }.share-footer { justify-content:space-between; border-top:1px solid #eaecf0; padding-top:12px; }
.share-disclaimer { margin:0; color:#667085; font-size:11px; line-height:1.45; }
@media(max-width:600px) { .share-overlay { align-items:flex-end; padding:0; }.share-dialog { width:100%; max-height:92dvh; border-radius:16px 16px 0 0; padding:22px 16px; }.share-actions,.share-footer { display:grid; grid-template-columns:1fr; }.share-actions button,.share-footer button { width:100%; } }
@media(max-width:600px) { .page-header,.overview-main { flex-direction:column; }.branch-picker { width:100%; }.shift-state { align-self:flex-start; }.primary-actions,.diagnostic-actions { display:grid; grid-template-columns:1fr; }.primary-actions button,.diagnostic-actions button { width:100%; }.status-summary { grid-template-columns:1fr 1fr; }.iit-widget-overlay { padding:0; }.iit-widget-dialog { width:100%; height:100dvh; border-radius:0; } }

.fiscal-document-archive{display:grid;gap:14px}.fiscal-document-filters{display:grid;grid-template-columns:repeat(2,minmax(130px,170px)) minmax(200px,1fr) auto;align-items:end;gap:10px}.fiscal-document-filters label{display:grid;gap:5px;font-size:13px;color:#617580}.fiscal-document-filters input{min-width:0;width:100%}.fiscal-document-list{display:grid;gap:0}.fiscal-document-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 0;border-top:1px solid #e7edf0}.fiscal-document-copy{display:grid;gap:4px;min-width:0}.fiscal-document-copy span,.fiscal-document-copy small{font-size:13px;color:#617580;overflow-wrap:anywhere}.fiscal-document-copy .fiscal-document-missing{color:#9b4d25}.fiscal-document-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#617580;font-size:13px}.fiscal-document-selected{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid #dce4e9;border-radius:8px;background:#f7fafb}.fiscal-document-selected>div:first-child{display:grid;gap:4px}.fiscal-document-selected small{color:#617580}.fiscal-document-selected-actions{display:flex;gap:8px;flex-wrap:wrap}.fiscal-document-archive .feedback{margin:0}@media(max-width:760px){.fiscal-document-filters{grid-template-columns:1fr 1fr}.fiscal-document-search{grid-column:1/-1}.fiscal-document-filters>button{grid-column:1/-1}.fiscal-document-row,.fiscal-document-selected{align-items:stretch;flex-direction:column}.fiscal-document-selected-actions{justify-content:flex-start}}
</style>