<script setup>
defineProps({ tabs: { type: Array, required: true }, modelValue: String, label: { type: String, default: 'Розділи' } })
defineEmits(['update:modelValue'])
</script>
<template><nav class="desk-tabs" :aria-label="label"><button v-for="tab in tabs" :key="tab.id" type="button" :aria-pressed="modelValue === tab.id" @click="$emit('update:modelValue', tab.id)">{{ tab.label }}</button></nav></template>
<style scoped>
.desk-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}.desk-tabs button{font:inherit;min-height:44px;padding:10px 16px;background:white;border:1px solid #d8e3e8;border-radius:8px;cursor:pointer;color:#23454b;white-space:normal}.desk-tabs button[aria-pressed=true]{background:#185c63;color:white;border-color:#185c63}.desk-tabs button:focus-visible{outline:3px solid #79bbc4;outline-offset:2px}@media(max-width:650px){.desk-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.desk-tabs button{min-width:0;padding:10px 8px;overflow-wrap:anywhere}}@media(max-width:360px){.desk-tabs{grid-template-columns:1fr}}
</style>
