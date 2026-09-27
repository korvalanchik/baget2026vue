<script setup>
import { computed, ref } from "vue";
import AccountantDesk from "./components/AccountantDesk.vue";
import MaterialsDesk from "./components/MaterialsDesk.vue";
import WarehouseDesk from "./components/WarehouseDesk.vue";
import ProductTracking from "./components/ProductTracking.vue";
const scannedProduct = new URLSearchParams(window.location.search).get('product') || '';
import LoginPage from "./components/LoginPage.vue";
import OrderForm from "./components/OrderForm.vue";
import EstimateCalculator from "./components/EstimateCalculator.vue";
const orderTab = ref("estimate");
import CustomersDesk from "./components/CustomersDesk.vue";
import WorkshopDesk from "./components/WorkshopDesk.vue";
import { canAccess, clearSession, restoreSession } from "./services/auth.js";

const session = ref(restoreSession());
const activeSection = ref(scannedProduct ? 'scanning' : canAccess(session.value, 'orders:create') ? 'new-order' : canAccess(session.value, 'workshop:read') ? 'workshop' : 'scanning');
const navigation = [
  {
    id: "new-order",
    icon: "＋",
    label: "Нове замовлення",
    access: "orders:create",
  },
  {
    id: "orders",
    icon: "▤",
    label: "Замовлення",
    badge: "12",
    access: "orders:read",
  },
  { id: "customers", icon: "♙", label: "Клієнти та інвойси", access: "customers:finance:read" },
  { id: "workshop", icon: "✦", label: "Майстерня", access: "workshop:read" },
  { id: "warehouse", icon: "▣", label: "Готові вироби", access: "materials:read" },
  { id: "materials", icon: "▱", label: "Матеріали", access: "materials:read" },
  { id: "scanning", icon: "↗", label: "Сканування", access: "scanning:read" },
  { id: "accountant", icon: "▧", label: "Рахунки за виробами", access: "finance:read" },
  { id: "finance", icon: "₴", label: "Фінанси", access: "finance:read" },
];
const allowedNavigation = computed(() =>
  navigation.filter((item) => canAccess(session.value, item.access)),
);
function completeLogin(newSession) {
  session.value = newSession;
  activeSection.value = scannedProduct ? "scanning" : canAccess(newSession, "orders:create")
    ? "new-order"
    : allowedNavigation.value[0]?.id;
}
function signOut() {
  clearSession();
  session.value = null;
}
</script>

<template>
  <LoginPage v-if="!session" @authenticated="completeLogin" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">B</span
        ><span>Багет<span class="brand-dot">.</span></span>
      </div>
      <button
        v-if="canAccess(session, 'orders:create')"
        class="new-order"
        @click="activeSection = 'new-order'"
      >
        <span>＋</span> Нове замовлення
      </button>
      <nav class="nav" aria-label="Основне меню">
        <button
          v-for="item in allowedNavigation"
          :key="item.id"
          class="nav-item"
          :class="{ active: activeSection === item.id }"
          @click="activeSection = item.id"
        >
          <span class="nav-icon">{{ item.icon }}</span
          ><span>{{ item.label }}</span
          ><span v-if="item.badge" class="badge">{{ item.badge }}</span>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <div class="branch">
          <span class="branch-pin">⌖</span>
          <div>
            <strong>{{ session.branch.name }}</strong
            ><small>{{ session.branch.address }}</small>
          </div>
          <span class="chevron">⌄</span>
        </div>
        <button class="help"><span>?</span> Допомога та підтримка</button>
      </div>
    </aside>
    <main class="content">
      <header class="topbar">
        <div class="mobile-brand">Багет<span>.</span></div>
        <label class="search"
          ><span>⌕</span
          ><input placeholder="Пошук замовлення або клієнта" /><kbd
            >⌘ K</kbd
          ></label
        >
        <div class="top-actions">
          <button class="icon-button" aria-label="Оновити">↻</button
          ><button class="icon-button notification" aria-label="Сповіщення">
            ♧<i></i></button
          ><button class="account" title="Вийти із системи" @click="signOut">
            <span class="avatar avatar-main">{{ session.initials }}</span
            ><span class="account-name">{{ session.name }}</span
            ><span>⌄</span>
          </button>
        </div>
      </header>
      <section v-if="activeSection === 'new-order'">
        <div class="order-mode-tabs" role="group" aria-label="Режим роботи">
          <button :class="{ selected: orderTab === 'estimate' }" :aria-pressed="orderTab === 'estimate'" @click="orderTab = 'estimate'">Розрахунок</button>
          <button :class="{ selected: orderTab === 'legacy' }" :aria-pressed="orderTab === 'legacy'" @click="orderTab = 'legacy'">Оформлення замовлення</button>
        </div>
        <KeepAlive>
        <EstimateCalculator v-if="orderTab === 'estimate'" :session="session" />
        <OrderForm v-else :session="session" />
        </KeepAlive>
      </section>
      <CustomersDesk v-else-if="activeSection === 'customers'" :session="session" />
      <WorkshopDesk v-else-if="activeSection === 'workshop'" :session="session" @open-finance="activeSection = 'customers'" />
      <AccountantDesk v-else-if="activeSection === 'accountant'" :session="session" />
      <MaterialsDesk v-else-if="activeSection === 'materials'" :session="session" />
      <WarehouseDesk v-else-if="activeSection === 'warehouse'" :session="session" />
      <section v-else-if="activeSection === 'scanning'" style="padding:24px"><h1>Сканування виробу</h1><ProductTracking :session="session" :initial-token="scannedProduct" /></section>
      <section v-else class="placeholder-page">
        <p>
          Розділ «{{
            navigation.find((item) => item.id === activeSection)?.label
          }}» у розробці.
        </p>
        <button
          v-if="canAccess(session, 'orders:create')"
          class="primary"
          @click="activeSection = 'new-order'"
        >
          Створити замовлення
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.order-mode-tabs { display: flex; gap: 8px; padding: 20px 24px 0; flex-wrap: wrap; }
.order-mode-tabs button { padding: 12px 18px; border-radius: 10px; border: 1px solid #d7ded9; background: white; cursor: pointer; }
.order-mode-tabs .selected { color: white; background: #254d3a; border-color: #254d3a; }
</style>
