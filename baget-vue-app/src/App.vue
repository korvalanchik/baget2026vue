<script setup>
import { computed, onMounted, ref } from 'vue'

const activeSection = ref('workshop')
const query = ref('')
const syncState = ref('Дані оновлено щойно')
const navigation = [
  { id: 'new-order', icon: '＋', label: 'Нове замовлення' }, { id: 'orders', icon: '▤', label: 'Замовлення', badge: '12' },
  { id: 'workshop', icon: '✦', label: 'Майстерня' }, { id: 'materials', icon: '▱', label: 'Матеріали' },
  { id: 'transfers', icon: '↗', label: 'Переміщення' }, { id: 'finance', icon: '₴', label: 'Фінанси' },
]
const columns = ref([
  { id: 'new', title: 'Нові', color: 'blue', cards: [
    { number: '№ 24091', client: 'Олена Коваленко', item: 'Картина «Тиша»', detail: '60 × 80 см · Дерев\'яний багет', tone: 'blue', due: 'Сьогодні, 15:00', avatar: 'ОК' },
    { number: '№ 24094', client: 'Андрій Савчук', item: 'Диплом', detail: '30 × 40 см · Пластиковий багет', tone: 'violet', due: 'Завтра, 12:00', avatar: 'АС' },
  ] },
  { id: 'cut', title: 'Розкрій', color: 'orange', cards: [
    { number: '№ 24088', client: 'Михайло Романюк', item: 'Сімейне фото', detail: '40 × 60 см · Алюмінієвий багет', tone: 'orange', due: 'Сьогодні, 17:30', avatar: 'МР' },
    { number: '№ 24090', client: 'Ірина Левченко', item: 'Вишивка', detail: '45 × 45 см · Багет «Горіх»', tone: 'pink', due: 'Завтра, 10:00', avatar: 'ІЛ' },
  ] },
  { id: 'assembly', title: 'Збірка', color: 'purple', cards: [{ number: '№ 24083', client: 'Катерина Бондар', item: 'Акварель «Місто»', detail: '50 × 70 см · Паспарту, скло', tone: 'purple', due: 'Сьогодні, 16:00', avatar: 'КБ', urgent: true }] },
  { id: 'ready', title: 'Готово', color: 'green', cards: [
    { number: '№ 24079', client: 'Володимир Кравець', item: 'Постер', detail: '70 × 100 см · Чорний багет', tone: 'green', due: 'Видача сьогодні', avatar: 'ВК', paid: true },
    { number: '№ 24080', client: 'Анна Гринь', item: 'Дзеркало', detail: '50 × 70 см · Золотий багет', tone: 'teal', due: 'Видача 14 вересня', avatar: 'АГ', paid: true },
  ] },
])
const filteredColumns = computed(() => !query.value.trim() ? columns.value : columns.value.map(c => ({ ...c, cards: c.cards.filter(card => `${card.number} ${card.client} ${card.item}`.toLowerCase().includes(query.value.toLowerCase())) })))
const totalOrders = computed(() => columns.value.reduce((sum, column) => sum + column.cards.length, 0))
function addOrder() { activeSection.value = 'new-order'; syncState.value = 'Створення нового замовлення' }
function refresh() { syncState.value = 'Оновлюємо дані…'; window.setTimeout(() => { syncState.value = 'Дані оновлено щойно' }, 700) }
const apiUrl = import.meta.env.VITE_API_URL || '/api'
async function loadOrders() { /* const response = await fetch(`${apiUrl}/orders`); columns.value = await response.json() */ console.info(`REST API endpoint: ${apiUrl}/orders`) }
onMounted(loadOrders)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar"><div class="brand"><span class="brand-mark">B</span><span>Багет<span class="brand-dot">.</span></span></div><button class="new-order" @click="addOrder"><span>＋</span> Нове замовлення</button>
      <nav class="nav" aria-label="Основне меню"><button v-for="item in navigation" :key="item.id" class="nav-item" :class="{ active: activeSection === item.id }" @click="activeSection = item.id"><span class="nav-icon">{{ item.icon }}</span><span>{{ item.label }}</span><span v-if="item.badge" class="badge">{{ item.badge }}</span></button></nav>
      <div class="sidebar-bottom"><div class="branch"><span class="branch-pin">⌖</span><div><strong>Центральна майстерня</strong><small>вул. Січових Стрільців, 18</small></div><span class="chevron">⌄</span></div><button class="help"><span>?</span> Допомога та підтримка</button></div>
    </aside>
    <main class="content">
      <header class="topbar"><div class="mobile-brand">Багет<span>.</span></div><label class="search"><span>⌕</span><input v-model="query" placeholder="Пошук замовлення або клієнта"><kbd>⌘ K</kbd></label><div class="top-actions"><button class="icon-button" @click="refresh">↻</button><button class="icon-button notification">♧<i></i></button><button class="account"><span class="avatar avatar-main">НП</span><span class="account-name">Наталія Петрівна</span><span>⌄</span></button></div></header>
      <section class="page-head"><div><div class="crumb">Майстерня <span>/</span> Усі замовлення</div><h1>Майстерня</h1><p>Контролюйте виконання замовлень у реальному часі</p></div><div class="head-actions"><span class="sync"><i></i>{{ syncState }}</span><button class="filter">☷ Фільтри</button><button class="primary" @click="addOrder">＋ Нове замовлення</button></div></section>
      <section class="metrics"><div class="metric"><div class="metric-icon blue-bg">▤</div><div><span>У роботі</span><strong>{{ totalOrders }} <em>замовлень</em></strong><small class="positive">↗ 3 з учора</small></div></div><div class="metric"><div class="metric-icon orange-bg">◷</div><div><span>Потребують уваги</span><strong>2 <em>замовлення</em></strong><small class="warning">● Термін сьогодні</small></div></div><div class="metric"><div class="metric-icon green-bg">✓</div><div><span>Готові до видачі</span><strong>5 <em>замовлень</em></strong><small class="positive">↗ +2 за сьогодні</small></div></div><div class="metric revenue"><div class="metric-icon violet-bg">₴</div><div><span>Дохід за вересень</span><strong>86 420 <em>₴</em></strong><small>Заплановано: 112 000 ₴</small></div><div class="progress"><i></i></div></div></section>
      <section class="board-toolbar"><div class="board-title"><h2>Виконання замовлень</h2><span>Станом на сьогодні, 11 вересня</span></div><div class="view-toggle"><button class="selected">▦ Дошка</button><button>☷ Список</button></div></section>
      <section class="board" aria-label="Дошка замовлень"><article v-for="column in filteredColumns" :key="column.id" class="board-column"><header class="column-head"><div><span class="column-dot" :class="column.color"></span><strong>{{ column.title }}</strong><b>{{ column.cards.length }}</b></div><button>•••</button></header><div class="card-stack"><div v-for="card in column.cards" :key="card.number" class="order-card" :class="{ urgent: card.urgent }"><div class="card-top"><span class="order-number">{{ card.number }}</span><span v-if="card.urgent" class="urgent-label">Терміново</span><button>•••</button></div><h3>{{ card.item }}</h3><p class="card-detail">{{ card.detail }}</p><div class="client"><span class="avatar" :class="card.tone">{{ card.avatar }}</span><span>{{ card.client }}</span></div><footer><span :class="{ paid: card.paid, late: card.urgent }"><i>{{ card.paid ? '✓' : '◷' }}</i> {{ card.due }}</span><span class="attachment">⌑ {{ card.paid ? '2' : '1' }}</span></footer></div><button class="add-card">＋ Додати замовлення</button></div></article></section>
    </main>
  </div>
</template>
