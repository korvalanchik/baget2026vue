<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watchEffect } from "vue";
import TaskHome from "./components/TaskHome.vue";
import CashDesk from "./components/CashDesk.vue";
import FinanceDesk from "./components/FinanceDesk.vue";
import DeskLayout from "./components/DeskLayout.vue";
import { financeTarget } from "./services/financeNavigation.js";
import SettingsDesk from "./components/SettingsDesk.vue";
import BranchOrdersDesk from "./components/BranchOrdersDesk.vue";
import AccountantDesk from "./components/AccountantDesk.vue";
import MaterialsDesk from "./components/MaterialsDesk.vue";
import WarehouseDesk from "./components/WarehouseDesk.vue";
import FrameSamplesDesk from "./components/FrameSamplesDesk.vue";
import CrmQrIssueDesk from "./components/CrmQrIssueDesk.vue";
import { canAcceptCustomerPayment } from "./services/customerPayments.js";
import ProductTracking from "./components/ProductTracking.vue";
const scannedProduct = new URLSearchParams(window.location.search).get('product') || '';
import LoginPage from "./components/LoginPage.vue";
import EstimateCalculator from "./components/EstimateCalculator.vue";
const scanTracking = ref(false), scanBusy = ref(false);
import CustomersDesk from "./components/CustomersDesk.vue";
import WorkshopDesk from "./components/WorkshopDesk.vue";
import { canAccess, clearSession, restoreSession } from "./services/auth.js";

const taskContext = ref(null);
const menuOpen = ref(false);
const mobile = ref(window.matchMedia("(max-width: 750px)").matches);
const menuButton = ref(null), sidebar = ref(null), content = ref(null);
const mobileQuery = window.matchMedia("(max-width: 750px)");
function closeMenu() {
  menuOpen.value = false;
  nextTick(() => { if (mobile.value) menuButton.value?.focus(); });
}
async function openMenu() {
  menuOpen.value = true;
  await nextTick();
  sidebar.value?.querySelector("button")?.focus();
}
function selectSection(id) {
  taskContext.value = null;
  activeSection.value = id;
  closeMenu();
}
function trapMenuFocus(event) {
  if (!mobile.value || !menuOpen.value) return;
  const buttons = [...sidebar.value.querySelectorAll("button:not([disabled]), a[href], [tabindex='0']")]
    .filter(el => el.getClientRects().length);
  const first = buttons[0], last = buttons[buttons.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function resizeMenu(event) {
  const focusWasInMenu = sidebar.value?.contains(document.activeElement);
  mobile.value = event.matches;
  menuOpen.value = false;
  if (focusWasInMenu) nextTick(() => {
    if (event.matches) menuButton.value?.focus();
    else sidebar.value?.querySelector(".nav-item.active")?.focus();
  });
}
watchEffect(onCleanup => {
  if (!menuOpen.value || !mobile.value) return;
  const before = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  onCleanup(() => { document.body.style.overflow = before; });
});
onMounted(() => mobileQuery.addEventListener("change", resizeMenu));
onBeforeUnmount(() => mobileQuery.removeEventListener("change", resizeMenu));

const session = ref(restoreSession());
const activeSection = ref(
  session.value?.roles?.includes("ROLE_COURIER") && !session.value.roles.includes("ROLE_ADMIN")
    ? "samples"
    : scannedProduct ? "scanning" : "home",
);
const navigation = [
  { id: "home", icon: "⌂", label: "Мої завдання" },
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
    access: "orders:read",
  },
  { id: "customers", icon: "♙", label: "Клієнти CRM", access: "customers:crm:read" },
  { id: "workshop", icon: "✦", label: "Майстерня", access: "workshop:read" }                                                      ,
  { id: "warehouse", icon: "▣", label: "Готові вироби", access: "materials:read" },
  { id: "materials", icon: "▱", label: "Матеріали", access: "materials:read" },
  { id: "scanning", icon: "↗", label: "Сканування", access: "scanning:read" },
  { id: "accountant", icon: "▧", label: "Рахунки за виробами", access: "finance:read" },
  { id: "cash", icon: "₴", label: "Каси та рахунки", access: "scanning:read" },
  { id: "finance", icon: "₴", label: "Фінанси", access: "finance:read" },
  { id: "samples", icon: "▤", label: "Зразки багету", access: "samples:read" },
  { id: "settings", icon: "⚙", label: "Налаштування" },
];
const isAdmin = computed(() => session.value?.roles?.includes("ROLE_ADMIN") === true);
const allowedNavigation = computed(() => {
  const courierOnly = session.value?.roles?.includes("ROLE_COURIER") && !isAdmin.value;
  if (courierOnly) return navigation.filter((item) => item.id === "samples");
  return navigation.filter((item) => item.id === "home" ? true : ["finance", "cash"].includes(item.id) ? canAcceptCustomerPayment(session.value) : ["settings", "owner-results"].includes(item.id) ? isAdmin.value : canAccess(session.value, item.access));
});
function completeLogin(newSession) {
  menuOpen.value = false;
  session.value = newSession;
  taskContext.value = null;
  activeSection.value = newSession.roles?.includes("ROLE_COURIER") && !newSession.roles.includes("ROLE_ADMIN")
    ? "samples"
    : scannedProduct ? "scanning" : "home";
}
function taskNavigate(target) {
  target = financeTarget(target);
  if (!allowedNavigation.value.some(item => item.id === target.section)) return;
  taskContext.value = target;
  activeSection.value = target.section;
  closeMenu();
}
function signOut() {
  taskContext.value = null;
  scanBusy.value = false; scanTracking.value = false;
  menuOpen.value = false;
  clearSession();
  session.value = null;
}
</script>

<template>
  <LoginPage v-if="!session" @authenticated="completeLogin" />
  <div v-else class="app-shell">
    <button v-if="mobile && menuOpen" class="menu-backdrop" type="button" tabindex="-1" aria-label="Закрити меню" @click="closeMenu"></button>
    <aside id="main-navigation" ref="sidebar" class="sidebar" :class="{ 'mobile-open': mobile && menuOpen }"
      :role="mobile && menuOpen ? 'dialog' : undefined" :aria-modal="mobile && menuOpen ? true : undefined"
      aria-label="Навігація" @keydown.esc.stop.prevent="closeMenu" @keydown.tab="trapMenuFocus">
      <button class="mobile-menu-close" type="button" @click="closeMenu" aria-label="Закрити меню">✕ Закрити</button>
      <div class="brand">
        <span class="brand-mark">B</span
        ><span>Багет<span class="brand-dot">.</span></span>
      </div>
      <button
        v-if="canAccess(session, 'orders:create')"
        class="new-order"
        @click="selectSection('new-order')"
      >
        <span>＋</span> Нове замовлення
      </button>
      <nav class="nav" aria-label="Основне меню">
        <button
          v-for="item in allowedNavigation"
          :key="item.id"
          class="nav-item"
          :class="{ active: activeSection === item.id }"
          :aria-current="activeSection === item.id ? 'page' : undefined"
          @click="selectSection(item.id)"
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
    <main ref="content" class="content" :inert="mobile && menuOpen">
      <header class="topbar">
        <button ref="menuButton" class="mobile-menu-button" type="button" aria-controls="main-navigation" :aria-expanded="menuOpen" @click="openMenu"><span aria-hidden="true">☰</span> Меню</button>
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
      <TaskHome v-if="activeSection === 'home'" :session="session" @navigate="taskNavigate" />
      <section v-else-if="activeSection === 'new-order' && canAccess(session, 'orders:create')">
        <EstimateCalculator :session="session" />
      </section>
      <SettingsDesk v-else-if="activeSection === 'settings' && isAdmin" :session="session" />
      <FrameSamplesDesk v-else-if="activeSection === 'samples' && canAccess(session, 'samples:read')" :session="session" />
      <BranchOrdersDesk v-else-if="activeSection === 'orders' && canAccess(session, 'orders:read')" :session="session" :initial-tab="taskContext?.tab" :initial-order-no="taskContext?.orderNo" />
      <DeskLayout v-else-if="activeSection === 'cash' && canAcceptCustomerPayment(session)" title="Каси та рахунки" description="Щоденна робота з коштами філій та центральної каси."><CashDesk :session="session" @open-purchase="taskNavigate({ section: 'finance', tab: 'purchases', receiptId: $event })" /></DeskLayout>
      <FinanceDesk v-else-if="activeSection === 'finance' && canAcceptCustomerPayment(session)" :session="session" :initial-tab="taskContext?.tab" :initial-receipt-id="taskContext?.receiptId" />
      <CustomersDesk v-else-if="activeSection === 'customers' && canAccess(session, 'customers:crm:read')" :session="session" :initial-customer="taskContext?.customer" />
      <WorkshopDesk v-else-if="activeSection === 'workshop' && canAccess(session, 'workshop:read')" :session="session" :initial-order-no="taskContext?.orderNo" @open-finance="activeSection = 'customers'" />
      <AccountantDesk v-else-if="activeSection === 'accountant' && canAccess(session, 'finance:read')" :session="session" :initial-tab="taskContext?.tab" />
      <MaterialsDesk v-else-if="activeSection === 'materials' && canAccess(session, 'materials:read')" :session="session" />
      <WarehouseDesk v-else-if="activeSection === 'warehouse' && canAccess(session, 'materials:read')" :session="session" />
      <section v-else-if="activeSection === 'scanning' && canAccess(session, 'scanning:read')" style="padding:16px">
        <button v-if="canAcceptCustomerPayment(session)" type="button" :disabled="scanBusy" style="min-height:44px;margin-bottom:12px" @click="scanTracking = !scanTracking">{{ scanTracking ? 'До видачі клієнту' : 'Переміщення та історія виробу' }}</button>
        <CrmQrIssueDesk v-if="canAcceptCustomerPayment(session) && !scanTracking" :session="session" :initial-token="scannedProduct" @busy="scanBusy = $event" />
        <template v-else><h1>Сканування виробу</h1><ProductTracking :session="session" :initial-token="scannedProduct" /></template>
      </section>
      <section v-else class="placeholder-page">
        <p>
          Розділ «{{
            navigation.find((item) => item.id === activeSection)?.label
          }}» у розробці.
        </p>
        <button
          v-if="canAccess(session, 'orders:create')"
          class="primary"
          @click="selectSection('new-order')"
        >
          Створити замовлення
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.settings-page { padding: 20px clamp(12px, 3vw, 28px); min-width: 0; }

.mobile-menu-button, .mobile-menu-close { display: none; }
.menu-backdrop { position: fixed; inset: 0; z-index: 1000; background: rgba(16, 28, 45, .55); }
@media (max-width: 750px) {
  .mobile-menu-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 8px 10px; border: 1px solid #d7ded9; border-radius: 8px; color: #25344b; background: white; font-size: 14px; flex-shrink: 0; }
  .mobile-menu-close { display: block; align-self: flex-end; min-height: 44px; padding: 8px 12px; margin-bottom: 10px; border-radius: 8px; color: white; background: #29405f; }
  .sidebar { display: none; }
  .sidebar.mobile-open { display: flex; position: fixed; inset: 0 auto 0 0; width: min(310px, calc(100vw - 40px)); height: 100vh; height: 100dvh; z-index: 1001; overflow-y: auto; overscroll-behavior: contain; padding: 12px 16px max(18px, env(safe-area-inset-bottom)); box-shadow: 8px 0 24px #0003; }
  .sidebar .nav-item { min-height: 44px; height: auto; padding-top: 10px; padding-bottom: 10px; }
  .sidebar .brand { margin-bottom: 20px; }
  .sidebar-bottom { padding-top: 20px; }
  .topbar { gap: 8px; padding: 0 10px; }
  .top-actions { gap: 6px; }
  .mobile-brand { font-size: 20px; }
}
@media (max-width: 380px) {
  .top-actions > .icon-button { display: none; }
}
</style>
