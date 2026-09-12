<script setup>
import { ref } from 'vue'
import OrderForm from './components/OrderForm.vue'

const activeSection = ref('new-order')
const navigation = [
  { id: 'new-order', icon: '＋', label: 'Нове замовлення' },
  { id: 'orders', icon: '▤', label: 'Замовлення', badge: '12' },
  { id: 'workshop', icon: '✦', label: 'Майстерня' },
  { id: 'materials', icon: '▱', label: 'Матеріали' },
  { id: 'transfers', icon: '↗', label: 'Переміщення' },
  { id: 'finance', icon: '₴', label: 'Фінанси' },
]
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand"><span class="brand-mark">B</span><span>Багет<span class="brand-dot">.</span></span></div>
      <button class="new-order" @click="activeSection = 'new-order'"><span>＋</span> Нове замовлення</button>
      <nav class="nav" aria-label="Основне меню">
        <button v-for="item in navigation" :key="item.id" class="nav-item" :class="{ active: activeSection === item.id }" @click="activeSection = item.id">
          <span class="nav-icon">{{ item.icon }}</span><span>{{ item.label }}</span><span v-if="item.badge" class="badge">{{ item.badge }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="branch"><span class="branch-pin">⌖</span><div><strong>Центральна майстерня</strong><small>вул. Січових Стрільців, 18</small></div><span class="chevron">⌄</span></div>
        <button class="help"><span>?</span> Допомога та підтримка</button>
      </div>
    </aside>
    <main class="content">
      <header class="topbar">
        <div class="mobile-brand">Багет<span>.</span></div>
        <label class="search"><span>⌕</span><input placeholder="Пошук замовлення або клієнта"><kbd>⌘ K</kbd></label>
        <div class="top-actions"><button class="icon-button" aria-label="Оновити">↻</button><button class="icon-button notification" aria-label="Сповіщення">♧<i></i></button><button class="account"><span class="avatar avatar-main">НП</span><span class="account-name">Наталія Петрівна</span><span>⌄</span></button></div>
      </header>
      <OrderForm v-if="activeSection === 'new-order'" />
      <section v-else class="placeholder-page"><p>Розділ «{{ navigation.find((item) => item.id === activeSection)?.label }}» у розробці.</p><button class="primary" @click="activeSection = 'new-order'">Створити замовлення</button></section>
    </main>
  </div>
</template>
