<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import FrameAutocomplete from "./FrameAutocomplete.vue";
import { loadOrderCatalog } from "../services/orders.js";
import { previewEstimate } from "../services/calculations.js";
import {
  buildEstimate,
  groups,
  hangers,
  newArtwork,
  underframes,
  artworkTypes,
  sectionTitle,
  verifyCordChoices,
} from "../calculation/estimate.js";

const props = defineProps({ session: { type: Object, required: true } });
let nextId = 1;
const artworks = ref([newArtwork(`art-${nextId++}`)]);
const profiles = ref([]);
const catalogBusy = ref(false);
const catalogError = ref("");
const busy = ref(false);
const error = ref("");
const result = ref(null);
let controller;
let revision = 0;
const calculation = (item) => item.product || item.mounting;
const marginFields = [
  ["leftMm", "Ліве"],
  ["rightMm", "Праве"],
  ["topMm", "Верхнє"],
  ["bottomMm", "Нижнє"],
];
const roles = {
  FRAME: "Рама",
  GLASS: "Скло",
  MIRROR: "Дзеркало",
  MAT: "Паспарту",
  BACKING: "Задник",
  HANGER: "Підвіс",
  CORD: "Шнур",
  POZZI: "Лапки",
  MIRROR_GLUE: "Термосклейка",
  UNDERFRAME: "Підрамник",
  CROSSBAR: "Перемичка",
  CANVAS: "Полотно",
  STRETCH_MATERIAL: "Матеріал натяжки",
  STRETCH_WORK: "Робота з натяжки",
};
const units = { METER: "м", SQUARE_METER: "м²", PIECE: "шт." };
const money = (value) =>
  new Intl.NumberFormat("uk-UA", { style: "currency", currency: "UAH" }).format(
    value,
  );
const amount = (value) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 6 }).format(value);
const validation = computed(() => {
  try {
    buildEstimate(artworks.value);
    return "";
  } catch (e) {
    return e.message;
  }
});
function invalidate() {
  revision++;
  controller?.abort();
  busy.value = false;
  result.value = null;
  error.value = "";
}
watch(artworks, invalidate, { deep: true, flush: "sync" });
watch(
  () => props.session.token,
  () => {
    invalidate();
    loadCatalog();
  },
);
async function loadCatalog() {
  const token = props.session.token;
  catalogBusy.value = true;
  catalogError.value = "";
  try {
    const catalog = await loadOrderCatalog(token);
    if (token === props.session.token)
      profiles.value = catalog.profileParts || [];
  } catch (e) {
    if (token === props.session.token) catalogError.value = e.message;
  } finally {
    if (token === props.session.token) catalogBusy.value = false;
  }
}
function addSheet(artwork, group) {
  const choice = group.parts.find(
    ([id]) => !artwork[group.key].some((s) => Number(s.partNo) === id),
  );
  if (choice)
    artwork[group.key].push({ partNo: choice[0], quantityPerProduct: 1 });
}
function outerSize(a) {
  const m = a.mats.length ? a.margins : {};
  return `${amount(Number(a.widthMm) + Number(m.leftMm || 0) + Number(m.rightMm || 0))} × ${amount(Number(a.heightMm) + Number(m.topMm || 0) + Number(m.bottomMm || 0))} мм`;
}
async function calculate() {
  error.value = "";
  let payload;
  try {
    payload = buildEstimate(artworks.value);
  } catch (e) {
    error.value = e.message;
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const current = ++revision;
  busy.value = true;
  result.value = null;
  try {
    const response = await previewEstimate(
      props.session.token,
      payload,
      controller.signal,
    );
    if (current === revision) {
      verifyCordChoices(response, payload);
      result.value = response;
    }
  } catch (e) {
    if (current === revision && e.name !== "AbortError") {
      const index = artworks.value.findIndex(
        (a) => a.id === e.clientItemId?.split("--")[0],
      );
      error.value = `${index >= 0 ? `Виріб ${index + 1}: ` : ""}${e.message}${e.code ? ` (${e.code})` : ""}`;
    }
  } finally {
    if (current === revision) busy.value = false;
  }
}
function reset() {
  artworks.value = [newArtwork(`art-${nextId++}`)];
}
onMounted(loadCatalog);
onBeforeUnmount(() => {
  revision++;
  controller?.abort();
});
</script>

<template>
  <section class="order-page estimate-page">
    <header class="page-head">
      <div>
        <h1>Розрахунок оформлення</h1>
        <p>
          Ціни та витрати матеріалів розраховує сервер за вашим рівнем доступу.
        </p>
      </div>
    </header>
    <p class="estimate-note">
      Попередній кошторис. Розрахунок не створює замовлення й не списує
      матеріали.
    </p>
    <p v-if="catalogBusy" role="status">Завантажуємо каталог багетів…</p>
    <p v-if="catalogError" role="alert" class="form-message">
      {{ catalogError }}
      <button type="button" @click="loadCatalog">Повторити</button>
    </p>
    <form @submit.prevent="calculate">
      <section
        v-for="(a, index) in artworks"
        :key="a.id"
        class="form-card estimate-item"
      >
        <div class="estimate-heading">
          <h2>Виріб {{ index + 1 }}</h2>
          <button
            v-if="artworks.length > 1"
            type="button"
            @click="artworks.splice(index, 1)"
          >
            Видалити виріб
          </button>
        </div>
        <label class="estimate-check"
          ><input v-model="a.withFrame" type="checkbox" /> Оформлення в
          раму</label
        >
        <div class="estimate-grid">
          <label
            >Ширина роботи, мм<input
              v-model="a.widthMm"
              required
              type="number"
              min="0.001"
              max="100000"
              step="0.001"
          /></label>
          <label
            >Висота роботи, мм<input
              v-model="a.heightMm"
              required
              type="number"
              min="0.001"
              max="100000"
              step="0.001"
          /></label>
          <label
            >Кількість виробів<input
              v-model="a.productQuantity"
              required
              type="number"
              min="1"
              max="10000"
              step="1"
          /></label>
          <FrameAutocomplete
            v-if="a.withFrame"
            v-model="a.framePartNo"
            class="estimate-frame"
            :profiles="profiles"
            :disabled="catalogBusy"
            :input-id="`${a.id}-frame`"
          />
        </div>
        <div v-if="a.withFrame" class="estimate-groups">
          <fieldset v-for="group in groups" :key="group.key">
            <legend>{{ group.label }}</legend>
            <p v-if="!a[group.key].length" class="estimate-muted">Не вибрано</p>
            <div
              v-for="(sheet, si) in a[group.key]"
              :key="si"
              class="estimate-sheet"
            >
              <label
                >Матеріал<select v-model="sheet.partNo">
                  <option
                    v-for="[id, name] in group.parts"
                    :key="id"
                    :value="id"
                    :disabled="
                      a[group.key].some(
                        (s, i) => i !== si && Number(s.partNo) === id,
                      )
                    "
                  >
                    {{ name }}
                  </option>
                </select></label
              >
              <label
                >Шарів<input
                  v-model="sheet.quantityPerProduct"
                  required
                  type="number"
                  min="1"
                  max="10000"
                  step="1"
              /></label>
              <button
                type="button"
                :aria-label="`Видалити матеріал із групи ${group.label}`"
                @click="a[group.key].splice(si, 1)"
              >
                ×
              </button>
            </div>
            <button
              type="button"
              :disabled="a[group.key].length === group.parts.length"
              @click="addSheet(a, group)"
            >
              ＋ Додати матеріал
            </button>
          </fieldset>
        </div>
        <fieldset v-if="a.withFrame && a.mats.length">
          <legend>Поля паспарту, мм</legend>
          <p class="estimate-muted">
            Для шару з найменшим отвором. Поля додаються до розміру роботи один
            раз.
          </p>
          <div class="estimate-grid">
            <label v-for="[key, label] in marginFields" :key="key"
              >{{ label
              }}<input
                v-model="a.margins[key]"
                required
                type="number"
                min="0"
                max="100000"
                step="0.001"
            /></label>
          </div>
        </fieldset>
        <p v-if="a.withFrame && a.widthMm && a.heightMm">
          Зовнішній розмір матеріалів: <strong>{{ outerSize(a) }}</strong>
        </p>
        <fieldset>
          <legend>Виріб і натяжка</legend>
          <div class="estimate-grid">
            <label
              >Виріб<select v-model="a.artworkType">
                <option value="NONE">Не вибрано</option>
                <option
                  v-for="[type, label] in artworkTypes"
                  :key="type"
                  :value="type"
                >
                  {{ label }}
                </option>
              </select></label
            >
            <label
              >Підрамник<select v-model="a.underframePartNo">
                <option value="">Без підрамника</option>
                <option
                  v-for="[id, label] in underframes"
                  :key="id"
                  :value="id"
                >
                  {{ label }}
                </option>
              </select></label
            >
            <label
              >Спосіб натяжки<select v-model="a.mountingType">
                <option value="NONE">Без натяжки</option>
                <option value="PLANE">На площину</option>
                <option value="UNDERFRAME">На підрамник</option>
              </select></label
            >
            <label v-if="a.artworkType !== 'NONE'"
              >Матеріал<select v-model="a.canvasSource">
                <option value="CUSTOMER">Виріб клієнта</option>
                <option value="STOCK">Полотно майстерні</option>
              </select></label
            >
          </div>
          <p class="estimate-muted">
            Підрамник і натяжка розраховуються за розміром роботи, без полів
            паспарту. При натяжці на підрамник його вартість враховується один
            раз разом із перемичками.
          </p>
          <p v-if="a.artworkType === 'PRINT'" class="estimate-muted">
            «Принт» визначає спосіб розрахунку натяжки. Вартість друку в цей
            кошторис не входить.
          </p>
          <p
            v-if="a.artworkType !== 'NONE' && a.canvasSource === 'STOCK'"
            class="estimate-muted"
          >
            Додається полотно майстерні з налаштованого серверного каталогу. При
            натяжці сервер враховує припуск.
          </p>
        </fieldset>
        <fieldset v-if="a.withFrame">
          <legend>Кріплення</legend>
          <div class="estimate-grid">
            <label
              >Підвіси<select v-model="a.hangerMode">
                <option value="AUTO">Автоматично за складом</option>
                <option value="MANUAL">Вибрати вручну</option>
                <option value="NONE">Без підвісів</option>
              </select></label
            >
            <label v-if="a.hangerMode === 'MANUAL'"
              >Тип підвісу<select v-model="a.hangerPartNo" required>
                <option value="" disabled>Оберіть</option>
                <option v-for="[id, name] in hangers" :key="id" :value="id">
                  {{ name }}
                </option>
              </select></label
            >
            <label v-if="a.hangerMode !== 'NONE'"
              >Підвісів на виріб<input
                v-model="a.hangersPerProduct"
                type="number"
                min="1"
                max="10000"
                step="1"
                placeholder="Автоматично"
            /></label>
            <label
              >Шнурок<select v-model="a.cordMode">
                <option value="AUTO">Автоматично за підвісами</option>
                <option value="YES">Додати шнурок</option>
                <option value="NO">Без шнурка</option>
              </select></label
            >
            <label class="estimate-check"
              ><input v-model="a.includePozzi" type="checkbox" /> Додати
              лапки</label
            >
            <label v-if="a.includePozzi"
              >Лапок на виріб<input
                v-model="a.pozziPerProduct"
                type="number"
                min="1"
                max="10000"
                step="1"
                placeholder="Автоматично"
            /></label>
          </div>
          <p class="estimate-muted">
            Шнурок сумісний із підвісами 099 та силовими; для дзеркала шириною
            понад 400 мм не додається. Довжина — зовнішня ширина + 100 мм на
            виріб. ПВХ та ДВП мають однакові правила кріплень.
          </p>
        </fieldset>
      </section>
      <div class="estimate-actions">
        <button
          type="button"
          :disabled="artworks.length >= 50"
          @click="artworks.push(newArtwork(`art-${nextId++}`))"
        >
          ＋ Додати виріб</button
        ><button type="button" @click="reset">Очистити</button
        ><button
          class="primary"
          type="submit"
          :disabled="busy || catalogBusy || Boolean(validation)"
        >
          {{ busy ? "Розраховуємо…" : "Розрахувати кошторис" }}
        </button>
      </div>
      <p v-if="validation" class="estimate-muted">{{ validation }}</p>
      <p v-if="error" role="alert" class="form-message">{{ error }}</p>
    </form>
    <section v-if="result" class="form-card estimate-result" aria-live="polite">
      <h2>Кошторис</h2>
      <article v-for="item in result.items" :key="item.clientItemId">
        <h3>
          {{ sectionTitle(item.clientItemId, artworks) }} ·
          {{ calculation(item).productQuantity }} шт.
        </h3>
        <div
          v-for="(line, li) in calculation(item).lines"
          :key="li"
          class="estimate-result-line"
        >
          <div>
            <strong>{{ roles[line.role] || line.role }}</strong>
            <p>{{ line.calculation.description }}</p>
            <small
              >{{ amount(line.calculation.totalConsumption) }}
              {{ units[line.calculation.unit] || line.calculation.unit }} ×
              {{ money(line.calculation.unitPrice) }} /
              {{ units[line.calculation.unit] || line.calculation.unit }}</small
            >
          </div>
          <strong>{{ money(line.calculation.amount) }}</strong>
        </div>
        <p v-if="Number(calculation(item).roundingAdjustment) !== 0">
          Коригування округлення:
          {{ money(calculation(item).roundingAdjustment) }}
        </p>
        <p class="estimate-item-total">
          Разом за складову ({{ calculation(item).productQuantity }} шт.):
          {{ money(item.total) }}
        </p>
      </article>
      <div class="total">
        <span>Загальна вартість</span><strong>{{ money(result.total) }}</strong>
      </div>
    </section>
  </section>
</template>

<style scoped>
.estimate-page {
  max-width: 1200px;
}
.estimate-note {
  padding: 14px 18px;
  background: #edf4f0;
  border-radius: 12px;
  color: #335446;
  margin-bottom: 20px;
}
.estimate-item {
  margin-bottom: 20px;
}
.estimate-heading,
.estimate-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.estimate-heading {
  justify-content: space-between;
}
.estimate-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.estimate-frame {
  grid-column: 1 / -1;
}
.estimate-page label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 13px;
  min-width: 0;
}
.estimate-page input,
.estimate-page select {
  width: 100%;
  min-width: 0;
  padding: 10px;
  border: 1px solid #d7ded9;
  border-radius: 8px;
  background: white;
  color: #253c30;
}
.estimate-page button {
  padding: 10px 14px;
  border: 1px solid #d7ded9;
  border-radius: 8px;
  cursor: pointer;
}
.estimate-page button:disabled {
  opacity: 0.5;
  cursor: default;
}
.estimate-page button.primary {
  background: #254d3a;
  color: white;
}
.estimate-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 20px;
}
.estimate-page fieldset {
  min-width: 0;
  border: 1px solid #e1e7e2;
  border-radius: 10px;
  padding: 14px;
  margin: 16px 0;
}
.estimate-page legend {
  padding: 0 6px;
  font-weight: 600;
}
.estimate-sheet {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 70px 38px;
  align-items: end;
  gap: 8px;
  margin-bottom: 12px;
}
.estimate-sheet button {
  padding: 10px;
}
.estimate-muted {
  font-size: 13px;
  color: #64736a;
  margin: 10px 0;
}
.estimate-page .estimate-check {
  flex-direction: row;
  align-items: center;
}
.estimate-check input {
  width: auto;
}
.estimate-result {
  margin-top: 24px;
}
.estimate-result h3 {
  margin-top: 24px;
}
.estimate-result-line {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #edf0ed;
  padding: 14px 0;
}
.estimate-result-line p {
  margin: 5px 0;
  overflow-wrap: anywhere;
}
.estimate-result-line > strong {
  white-space: nowrap;
}
.estimate-item-total {
  text-align: right;
  font-weight: 600;
}
@media (max-width: 1050px) {
  .estimate-groups {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .estimate-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .estimate-actions button {
    flex: 1 1 auto;
  }
}
</style>
