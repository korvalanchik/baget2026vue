<script setup>
import { ref } from 'vue'
import OwnerResultsDesk from './OwnerResultsDesk.vue'
import PartnerResultsDesk from './PartnerResultsDesk.vue'
defineProps({ session: { type: Object, required: true } })
const tab = ref('own')
</script>
<template><section><nav class="results-tabs" aria-label="Розділи результатів"><button :aria-pressed="tab === 'own'" @click="tab = 'own'">Власні філії</button><button :aria-pressed="tab === 'partner'" @click="tab = 'partner'">Фірми-посередники</button></nav><OwnerResultsDesk v-if="tab === 'own'" :session="session" /><PartnerResultsDesk v-else :session="session" /></section></template>
<style scoped>.results-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:16px 20px 0}.results-tabs button{font:inherit;padding:12px;border:1px solid #bdccd4;border-radius:8px;cursor:pointer;background:white}.results-tabs button[aria-pressed=true]{background:#185c63;color:white}@media(max-width:650px){.results-tabs button{flex:1}}</style>
