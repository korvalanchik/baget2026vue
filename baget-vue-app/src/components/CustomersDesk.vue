<script setup>
import { nextTick, ref } from 'vue'
import CrmDesk from './CrmDesk.vue'
import CustomerFinancePanel from './CustomerFinancePanel.vue'
defineProps({ session: { type: Object, required: true } })
const selected = ref(null), busy = ref(false), desk = ref(null)
async function back() { selected.value = null; await nextTick(); await desk.value?.refresh() }
</script>
<template>
  <section class="customers-page">
    <CrmDesk ref="desk" v-show="!selected" :session="session" @finance="selected = $event" />
    <template v-if="selected"><button type="button" :disabled="busy" @click="back">← До клієнтів</button>
      <CustomerFinancePanel :key="`${selected.customerId || selected.custNo || selected.id}-${selected.branchNo}`" :session="session" :customer-id="Number(selected.customerId || selected.custNo || selected.id)" :branch-no="Number(selected.branchNo || session.branch.id)" @busy="busy = $event" />
    </template>
  </section>
</template>
