<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { filterProfiles } from "../calculation/profileSearch.js";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  profiles: { type: Array, default: () => [] },
  disabled: Boolean,
  inputId: { type: String, required: true },
});
const emit = defineEmits(["update:modelValue"]);
const query = ref("");
const list = ref(null);
const open = ref(false);
const active = ref(-1);
const matches = computed(() => filterProfiles(props.profiles, query.value));
const listId = computed(() => `${props.inputId}-list`);
const selected = computed(() =>
  props.profiles.find((p) => String(p.partNo) === String(props.modelValue)),
);
watch(
  selected,
  (profile) => {
    if (profile) query.value = profile.description;
  },
  { immediate: true },
);
watch(
  () => props.modelValue,
  (value, previous) => {
    if (!value && previous && selected.value == null && !open.value)
      query.value = "";
  },
);
watch(matches, () => {
  active.value = -1;
});
watch(active, async (index) => {
  if (index < 0) return;
  await nextTick();
  list.value?.children[index]?.scrollIntoView({ block: "nearest" });
});
function input(event) {
  query.value = event.target.value;
  open.value = true;
  active.value = -1;
  // A typed label is not a confirmed catalog selection.
  emit("update:modelValue", "");
}
function choose(profile) {
  query.value = profile.description;
  emit("update:modelValue", profile.partNo);
  open.value = false;
  active.value = -1;
}
function keydown(event) {
  if (event.key === "Escape") {
    open.value = false;
    active.value = -1;
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (open.value && matches.value.length) {
      if (active.value >= 0) choose(matches.value[active.value]);
      else if (matches.value.length === 1) choose(matches.value[0]);
    }
    return;
  }
  if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
  event.preventDefault();
  open.value = true;
  const count = matches.value.length;
  if (!count) return;
  active.value =
    event.key === "ArrowDown"
      ? (active.value + 1) % count
      : active.value <= 0
        ? count - 1
        : active.value - 1;
}
function blur(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) open.value = false;
}
</script>

<template>
  <div class="frame-search" @focusout="blur">
    <label :for="inputId">Артикул багета</label>
    <input
      :id="inputId"
      :value="query"
      :disabled="disabled"
      type="text"
      autocomplete="off"
      role="combobox"
      aria-autocomplete="list"
      :aria-expanded="open && Boolean(query.trim())"
      :aria-controls="listId"
      :aria-activedescendant="
        open && active >= 0 ? `${listId}-${active}` : undefined
      "
      placeholder="Введіть частину артикулу"
      @input="input"
      @focus="open = true"
      @keydown="keydown"
    />
    <ul
      ref="list"
      v-show="open && query.trim()"
      :id="listId"
      class="frame-matches"
      role="listbox"
      aria-label="Знайдені багети"
    >
      <li
        v-for="(profile, index) in matches"
        :id="`${listId}-${index}`"
        :key="profile.partNo"
        role="option"
        :aria-selected="active === index"
        :class="{ active: active === index }"
        @mousedown.prevent
        @click="choose(profile)"
        @mousemove="active = index"
      >
        {{ profile.description }}
      </li>
      <li v-if="!matches.length" role="presentation" class="empty">
        Збігів не знайдено
      </li>
    </ul>
    <small
      v-if="query.trim() && !modelValue && !disabled"
      class="selection-hint"
      >Оберіть багет зі знайдених позицій.</small
    >
  </div>
</template>

<style scoped>
.frame-search {
  position: relative;
  min-width: 0;
}
.frame-search label {
  display: block;
  font-size: 13px;
  margin-bottom: 7px;
}
.frame-search input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px;
  border: 1px solid #d7ded9;
  border-radius: 8px;
  background: white;
  color: #253c30;
}
.frame-matches {
  position: absolute;
  z-index: 20;
  top: 100%;
  left: 0;
  right: 0;
  list-style: none;
  margin: 4px 0 0;
  padding: 4px;
  max-height: 260px;
  overflow-y: auto;
  background: white;
  border: 1px solid #d7ded9;
  border-radius: 8px;
  box-shadow: 0 8px 24px #253c3020;
}
.frame-matches li {
  padding: 10px 12px;
  border-radius: 5px;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.frame-matches li.active {
  background: #edf4f0;
}
.frame-matches .empty {
  cursor: default;
  color: #64736a;
}
.selection-hint {
  display: block;
  margin-top: 6px;
  color: #64736a;
}
</style>
