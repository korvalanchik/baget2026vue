<script setup>
import { onMounted, ref } from 'vue'
import { apiOrigin, clearSession } from '../services/auth.js'
const props = defineProps({ session: { type: Object, required: true } })
const options = ref({ roles: [], branches: [] }), rows = ref([]), form = ref(null), search = ref(''), page = ref(0), more = ref(false), busy = ref(false), error = ref(''), notice = ref(''), history = ref(null), historyPage = ref(0), historyUser = ref(null)
const labels = { ROLE_ADMIN: 'Адміністратор', ROLE_FOREMAN: 'Майстер', ROLE_WAREHOUSE: 'Склад', ROLE_MANAGER: 'Менеджер', ROLE_SELLER: 'Продавець', ROLE_LEVEL2: 'Менеджер (сумісність)', ROLE_COUNTER: 'Облік і робота із замовленнями', ROLE_ACCOUNTANT: 'Бухгалтер', ROLE_BOOKKEEPER: 'Бухгалтер', ROLE_USER: 'Базовий доступ' }
const hints = { ROLE_ADMIN: 'Повний доступ до всіх філій і налаштувань.', ROLE_FOREMAN: 'Майстерня, матеріали та доступні операції замовлень.', ROLE_WAREHOUSE: 'Матеріали та переміщення готових виробів.', ROLE_MANAGER: 'Замовлення, CRM, оплати й видача у дозволених філіях.', ROLE_SELLER: 'Замовлення, CRM, оплати й видача у дозволених філіях.', ROLE_LEVEL2: 'Сумісна роль менеджера старої версії.', ROLE_COUNTER: 'Ширша роль обліку: фінанси та операції замовлень.', ROLE_ACCOUNTANT: 'Фінансові операції у дозволених філіях.', ROLE_BOOKKEEPER: 'Фінансові операції у дозволених філіях.', ROLE_USER: 'Не замінює роль менеджера. Можливості залежать від наявних API.' }
const roleName = id => { const name = options.value.roles.find(r => r.id === id)?.name; return labels[name] || name || id }
const branchName = id => options.value.branches.find(b => b.id === id)?.name || id
async function api(path, body) { const response = await fetch(`${apiOrigin}/api/admin/users${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${props.session.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const data = await response.json().catch(() => null); if (!response.ok) throw new Error(data?.message || `Не вдалося виконати операцію (HTTP ${response.status}). Оновіть список і перевірте результат.`); return data }
async function refresh() { const result = await api(`?q=${encodeURIComponent(search.value)}&page=${page.value}`); rows.value = result.rows; more.value = result.hasMore }
async function load(reset = false) { if (busy.value) return; busy.value = true; error.value = ''; if (reset) page.value = 0; try { options.value = await api('/options'); await refresh() } catch (e) { error.value = e.message } finally { busy.value = false } }
function edit(user = null) { if (busy.value) return; if (form.value && !window.confirm('Відкинути незбережені зміни форми?')) return; form.value = user ? { ...user, enabled: !!user.enabled, roles: [...user.roles], branches: [...user.branches], password: '' } : { id: null, revision: 0, username: '', email: '', enabled: true, roles: [], branches: [], password: '' }; error.value = ''; notice.value = ''; history.value = null }
function cancel() { if (busy.value || !window.confirm('Закрити форму без збереження?')) return; form.value = null }
async function save() {
 if (busy.value || !form.value) return
 error.value = ''
 if (!form.value.roles.length) { error.value = 'Оберіть хоча б одну роль.'; return }
 const password = form.value.password
 if ((!form.value.id && !password) || (password && (password.length < 10 || new TextEncoder().encode(password).length > 72))) { error.value = 'Пароль: від 10 символів, не більше 72 байтів UTF-8.'; return }
 if (!window.confirm('Зберегти користувача та права? Після редагування користувачу потрібно увійти знову.')) return
 busy.value = true; notice.value = ''
 try {
  const result = await api('', form.value); form.value = null
  if (result.selfChanged) { clearSession(); window.location.reload(); return }
  notice.value = 'Користувача збережено. Після зміни прав або пароля потрібно увійти знову.'; await refresh()
 } catch (e) { error.value = e.message + ' Якщо зв’язок перервався, оновіть список перед повторним збереженням.'; if (form.value) form.value.password = '' } finally { busy.value = false }
}
async function showHistory(user, delta = 0) { if (busy.value) return; historyPage.value = historyUser.value?.id === user.id ? Math.max(0, historyPage.value + delta) : 0; historyUser.value = user; busy.value = true; error.value = ''; try { history.value = await api(`/${user.id}/history?page=${historyPage.value}`) } catch (e) { error.value = e.message } finally { busy.value = false } }
onMounted(() => load())
</script>
<template>
 <section class="user-admin">
  <p>Ролі визначають дозволені операції, філії — доступні замовлення й клієнтів. Адміністратор має доступ до всіх філій. Права кількох ролей додаються.</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
  <div class="user-tools"><label>Логін або email<input v-model="search" maxlength="100" @keydown.enter.prevent="load(true)"></label><button :disabled="busy" @click="load(true)">Знайти / оновити</button><button :disabled="busy" @click="edit()">Додати користувача</button></div>
  <form v-if="form" class="user-editor" @submit.prevent="save"><h3>{{ form.id ? `Користувач ${form.username}` : 'Новий користувач' }}</h3><fieldset :disabled="busy"><div class="user-fields"><label>Логін<input v-model="form.username" required maxlength="100" :readonly="!!form.id" autocomplete="off"><small v-if="!form.id">Латинські літери, цифри, . _ @ -; від 3 символів.</small></label><label>Email<input v-model="form.email" type="email" required maxlength="100" autocomplete="off"></label><label>{{ form.id ? 'Новий пароль (порожньо — без змін)' : 'Пароль' }}<input v-model="form.password" type="password" autocomplete="new-password" :required="!form.id" maxlength="72"><small>Від 10 символів. Пароль не показується в історії.</small></label></div>
   <label class="user-check"><input v-model="form.enabled" type="checkbox" :disabled="form.id === options.selfId">Обліковий запис активний</label><p>Блокування зберігає авторство замовлень, винагороди та історію. Видалення користувачів не використовується.</p>
   <h4>Ролі</h4><div class="user-choices"><label v-for="role in options.roles" :key="role.id" class="user-role"><input v-model="form.roles" type="checkbox" :value="role.id" :disabled="form.id === options.selfId && role.name === 'ROLE_ADMIN'"><span><strong>{{ labels[role.name] || role.name }}</strong><small>{{ hints[role.name] || 'Наявна роль проєкту; її права визначаються сервером.' }}</small></span></label></div>
   <h4>Доступні філії</h4><div class="user-choices"><label v-for="b in options.branches" :key="b.id" class="user-check"><input v-model="form.branches" type="checkbox" :value="b.id">{{ b.name }}</label></div><p>Активному користувачу без ролі адміністратора потрібна хоча б одна філія для входу.</p>
   <div class="user-tools"><button type="submit">Зберегти</button><button type="button" @click="cancel">Закрити форму</button></div></fieldset></form>
  <p v-if="!rows.length && !busy">Користувачів за пошуком немає.</p>
  <article v-for="user in rows" :key="user.id"><strong>{{ user.username }}</strong> · {{ user.enabled ? 'Активний' : 'Заблокований' }}<p>{{ user.email }}</p><p>Ролі: {{ user.roles.map(roleName).join(', ') }}</p><p>Філії: {{ user.branches.map(branchName).join(', ') || 'Не вибрані' }}</p><div class="user-tools"><button :disabled="busy" @click="edit(user)">Редагувати</button><button :disabled="busy" @click="showHistory(user)">Історія</button></div></article>
  <div class="user-tools"><button :disabled="busy || !page" @click="page--; load()">Назад</button><span>Сторінка {{ page + 1 }}</span><button :disabled="busy || !more" @click="page++; load()">Далі</button></div>
  <section v-if="history"><h3>Історія: {{ historyUser.username }}</h3><p v-if="!history.length">Записів немає.</p><article v-for="event in history" :key="event.id"><strong>{{ event.action === 'CREATE' ? 'Створення' : 'Редагування' }}</strong> · {{ event.createdAt }} · {{ event.actor }}<p>Стан: {{ event.snapshot.after.enabled ? 'Активний' : 'Заблокований' }}. Email: {{ event.snapshot.after.email }}</p><p>Ролі: {{ event.snapshot.after.roles.map(roleName).join(', ') }}. Філії: {{ event.snapshot.after.branches.map(branchName).join(', ') || 'Не вибрані' }}</p><p v-if="event.snapshot.after.passwordChanged">Пароль встановлено або змінено.</p><details v-if="event.snapshot.before"><summary>До зміни</summary><p>{{ event.snapshot.before.enabled ? 'Активний' : 'Заблокований' }} · {{ event.snapshot.before.email }}</p><p>Ролі: {{ event.snapshot.before.roles.map(roleName).join(', ') }}</p><p>Філії: {{ event.snapshot.before.branches.map(branchName).join(', ') }}</p></details></article><div class="user-tools"><button :disabled="busy || !historyPage" @click="showHistory(historyUser, -1)">Назад</button><button :disabled="busy || history.length < 20" @click="showHistory(historyUser, 1)">Далі</button></div></section>
 </section>
</template>
<style scoped>
.user-admin{min-width:0}.user-tools{display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin:14px 0}.user-tools label,.user-fields label{display:grid;gap:6px;min-width:0}.user-fields,.user-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.user-role,.user-check{display:flex;align-items:start;gap:8px}.user-role small{display:block;font-size:12px;font-weight:400;margin-top:5px}.user-role input,.user-check input{flex-shrink:0}.user-editor{border:1px solid #91b6bc;background:#f5f9fa;padding:14px;border-radius:10px}.user-editor fieldset{border:0;padding:0;min-width:0}.user-fields input{width:100%;box-sizing:border-box}.user-admin article{overflow-wrap:anywhere}.user-admin small{font-size:12px}@media(max-width:650px){.user-fields,.user-choices{grid-template-columns:1fr}.user-tools button{flex:1 1 130px}}
</style>
