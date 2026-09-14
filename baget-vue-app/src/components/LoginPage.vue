<script setup>
import { reactive, ref } from 'vue'
import { signIn } from '../services/auth.js'

const emit = defineEmits(['authenticated'])
const form = reactive({ nickname: '', password: '', branchName: '' })
const error = ref('')
const isSubmitting = ref(false)
async function submit() {
  error.value = ''
  isSubmitting.value = true
  try { emit('authenticated', await signIn(form)) } catch (reason) { error.value = reason.message } finally { isSubmitting.value = false }
}
</script>

<template>
  <main class="login-page">
    <section class="login-intro"><div class="login-brand"><span class="brand-mark">B</span><span>Багет<span>.</span></span></div><div class="intro-copy"><p class="eyebrow">СИСТЕМА КЕРУВАННЯ МАЙСТЕРНЕЮ</p><h1>Усе для роботи з замовленнями — в одному місці.</h1><p>Увійдіть під своїм обліковим записом та оберіть філію, у якій працюєте сьогодні.</p></div><div class="intro-note"><span>✦</span><p>Філія визначає доступні вам дані й можливості в системі.</p></div></section>
    <section class="login-panel"><form class="login-card" @submit.prevent="submit"><div class="login-heading"><h2>Вхід до системи</h2><p>Введіть дані свого облікового запису</p></div><label>Нікнейм<input v-model="form.nickname" autocomplete="username" placeholder="Введіть нікнейм"></label><label>Пароль<input v-model="form.password" type="password" autocomplete="current-password" placeholder="Введіть пароль"></label><label>Філія <small>(для працівників філій)</small><input v-model="form.branchName" autocomplete="organization" placeholder="Введіть назву філії"></label><p class="branch-help">Адміністратор входить без філії. Працівник філії має вказати її точну назву — система перевірить наданий доступ.</p><p v-if="error" class="login-error">{{ error }}</p><button type="submit" :disabled="isSubmitting">{{ isSubmitting ? 'Перевіряємо доступ…' : 'Увійти' }} <span>→</span></button><p class="security-note">Пароль не зберігається в браузері. Маркер сесії діє лише в поточній вкладці.</p></form></section>
  </main>
</template>
