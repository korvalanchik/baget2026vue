import { branchDimensions } from './workshopHistory.js'
export const documentUnits = { METER: 'м', SQUARE_METER: 'м²', PIECE: 'шт' }
export const componentRoles = { FRAME: 'Багет', GLASS: 'Скло / дзеркало', BACKING: 'Задник', MAT: 'Паспарту', UNDERFRAME: 'Підрамник', CANVAS: 'Полотно', MOUNTING: 'Натяжка', HANGER: 'Підвіс', CORD: 'Шнур', POZZI: 'Лапка pozzi' }
const present = x => x != null && String(x).trim() !== '' && Number.isFinite(Number(x))
export const numberText = x => present(x) ? Number(x).toLocaleString('uk-UA', { maximumFractionDigits: 6 }) : '—'
export function consumptionDifference(line) {
 if (!present(line.planned) || !present(line.actual)) return null
 const difference = Math.round((Number(line.actual) - Number(line.planned)) * 1e6) / 1e6
 return { value: difference, text: `${difference > 0 ? '+' : ''}${numberText(difference)}` }
}
export function workshopSpecification(product) {
 const draft = product.configuration?.draft || {}, form = draft.form || {}, components = Array.isArray(draft.components) ? draft.components : []
 const framing = components.find(c => c.kind === 'PRODUCT')?.product
 const mounting = components.find(c => c.kind === 'MOUNTING')?.mounting
 const surface = framing || form
 const names = { EMBROIDERY: 'Вишивка', BLANK: 'Чисте полотно', WITH_IMAGE: 'Полотно із зображенням', PRINT: 'Принт', NONE: 'Оформлення роботи' }
 const kind = mounting?.canvasType || form.artworkType
 const rows = [{ label: 'Виріб', value: names[kind] || 'Оформлення роботи' }]
 if (framing || Object.hasOwn(form, 'withFrame')) rows.push({ label: 'Оформлення', value: (framing ? Boolean(framing.framePartNo) : form.withFrame) ? 'З рамою' : 'Без рами' })
 if (surface.antiFrame) rows.push({ label: 'Антирама', value: 'Так' })
 const mount = mounting?.mountingType || form.mountingType
 if (mount) rows.push({ label: 'Натяжка', value: ({ NONE: 'Без натяжки', PLANE: 'На площину', UNDERFRAME: 'На підрамник' })[mount] || mount })
 for (const [key, label] of [['glass', 'Скло / дзеркало'], ['backings', 'Задник'], ['mats', 'Паспарту']]) {
  const layers = surface[key]
  if (Array.isArray(layers) && layers.length) {
   const count = layers.reduce((n, l) => n + (present(l.quantityPerProduct) ? Number(l.quantityPerProduct) : 1), 0)
   rows.push({ label, value: `${numberText(count)} шарів на один виріб` })
  }
 }
 const margins = surface.matMargins || form.margins
 if (surface.mats?.length && margins) rows.push({ label: 'Поля паспарту, мм', value: `ліве ${numberText(margins.leftMm)}, праве ${numberText(margins.rightMm)}, верхнє ${numberText(margins.topMm)}, нижнє ${numberText(margins.bottomMm)}` })
 return { rows, dimensions: branchDimensions(product.configuration), managerNote: draft.note || '', margins: surface.mats?.length ? margins : null }
}
export function materialWarnings(product) {
 return (product.rework?.reservations || []).filter(r => Number(r.shortage) > 0 || r.stockKnown === false).map(r => `${r.description}: ${r.stockKnown === false ? 'залишок невідомий' : `нестача ${numberText(r.shortage)} ${documentUnits[r.unit] || r.unit || ''}`}`)
}
const escape = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const text = x => escape(x || '—')
function qr(image) { return typeof image === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) ? `<img class="qr" src="${image}" alt="QR виробу">` : '' }
export function workshopPrintHtml(document, mode = 'sheet') {
 const { header: h, product: p } = document
 if (!h || !p) throw new Error('Неповні дані виробничої картки')
 if (mode === 'label' && (!document.labelAllowed || !qr(document.qrImage))) throw new Error('Етикетка доступна лише після підтвердженого завершення виробу')
 const spec = workshopSpecification(p), warnings = materialWarnings(p)
 const states = { WAITING: 'Очікує приймання', ACCEPTED: 'Прийнято майстром', IN_PROGRESS: 'В роботі', PAUSED: 'Призупинено', COMPLETED: 'Виготовлено', STOPPED: 'Виконання припинено' }
 const dims = spec.dimensions.map(s => `${escape(s.label)}: ${numberText(s.widthMm)} × ${numberText(s.heightMm)} мм · ${numberText(s.quantity)} шт`).join('<br>') || 'Не вказано'
 const pricing = document.commercial?.pricing
 const priceMessage = pricing && ['WAITING', 'REJECTED', 'UNMEASURED'].includes(pricing.state) ? ({ WAITING: 'Очікує погодження ціни — виготовлення зупинено', REJECTED: 'Повернуто на уточнення — виготовлення зупинено', UNMEASURED: 'Потрібно зберегти обмір і перевірити ціну' })[pricing.state] : ''
 const lineRows = (p.lines || []).map(l => { const diff = consumptionDifference(l);return `<tr><td>${text(l.description)}<small>${l.material ? 'Матеріал' : 'Робота'} · ${text(componentRoles[l.role] || l.role)}</small></td><td>${text(documentUnits[l.unit] || l.unit)}</td><td>${numberText(l.planned)}</td><td>${numberText(l.actual)}</td><td>${diff?.text || '—'}</td><td>${numberText(l.widthMm)} × ${numberText(l.heightMm)}</td></tr>` }).join('')
 const rework = p.rework?.active
 const body = mode === 'label' ? `<section class="label"><h1>Замовлення № ${text(h.orderNo)}</h1><h2>${text(p.name)}</h2><p>${text(h.branchName)}</p>${qr(document.qrImage)}</section>` : `<header><div><h1>Виробнича картка</h1><h2>Замовлення № ${text(h.orderNo)} · ${text(p.name)}</h2><p>Філія: ${text(h.branchName)} · Готовність: ${text(h.dueDate)}</p><p>Стан: ${text(states[p.state] || p.state)} · Майстер: ${text(p.master)}</p></div>${qr(document.qrImage)}</header><p class="meta">Збережена ревізія замовлення: ${text(h.revision)} · Сформовано: ${text(document.generatedAt)}</p>${[5, 10].includes(Number(h.status)) ? '<p class="warning">Виконання замовлення припинено</p>' : ''}${priceMessage ? `<p class="warning">${text(priceMessage)}</p>` : ''}${warnings.map(w => `<p class="warning">${text(w)}</p>`).join('')}<div class="sizes"><section><h2>Розміри від філії</h2><p>${dims}</p></section><section><h2>Збережений обмір роботи</h2><p>${numberText(p.widthMm)} × ${numberText(p.heightMm)} мм</p></section></div><p class="meta">Розміри роботи без полів паспарту. Розміри окремих матеріалів — у таблиці.</p><dl>${spec.rows.map(r => `<div><dt>${text(r.label)}</dt><dd>${text(r.value)}</dd></div>`).join('')}</dl><h2>Примітки</h2><p class="note">Замовлення: ${text(h.notice)}</p><p class="note">Виріб від менеджера: ${text(spec.managerNote)}</p><p class="note">Майстер: ${text(p.note)}</p><h2>Матеріали та роботи</h2><p>${p.confirmed ? 'Підтверджена витрата; матеріали списані при завершенні.' : 'Збережена витрата за обміром. Ця таблиця сама по собі не підтверджує списання.'} Кількості загальні для всіх екземплярів та шарів.</p><table><thead><tr><th>Матеріал / робота</th><th>Од.</th><th>План</th><th>Факт</th><th>Δ</th><th>Ш × В, мм</th></tr></thead><tbody>${lineRows}</tbody></table>${rework ? `<h2>Відкрите доопрацювання</h2><p class="note">${text(rework.reason)} · ${text(rework.note)}</p><p>Додаткові витрати нижче ще не включені в основну таблицю та не підтверджені списанням.</p><ul>${(rework.lines || []).map(l => `<li>${text(l.description)}: ${numberText(l.quantity)} ${text(documentUnits[l.unit] || l.unit)}</li>`).join('')}</ul>` : ''}`
 return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>${mode === 'label' ? 'Етикетка' : 'Виробнича картка'} ${text(h.orderNo)} · ${text(p.name)}</title><style>@page{size:${mode === 'label' ? '100mm 80mm' : 'A4 portrait'};margin:${mode === 'label' ? '4mm' : '12mm'}}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#172b36;margin:0;padding:16px}h1{font-size:20px;margin:0 0 8px}h2{font-size:15px;margin:12px 0 6px}p{margin:6px 0;line-height:1.45}header,.sizes{display:flex;gap:20px;justify-content:space-between}.qr{width:32mm;height:32mm;flex-shrink:0}.sizes>section{flex:1}dl>div{display:flex;gap:12px;padding:4px 0}dt{width:145px;flex-shrink:0}dd{margin:0}.note{white-space:pre-wrap;overflow-wrap:anywhere}.warning{border:1px solid #888;padding:8px;font-weight:bold}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:6px;border:1px solid #aaa;text-align:left;overflow-wrap:anywhere}th:first-child{width:34%}small{display:block;font-size:10px;margin-top:3px}thead{display:table-header-group}tr{break-inside:avoid}.meta{font-size:10px;color:#526571}.label{width:92mm;max-width:100%;text-align:center;overflow-wrap:anywhere}.label h1{font-size:16px}.label h2{font-size:14px}.label .qr{width:32mm;height:32mm}.tools{padding:10px 0;margin-bottom:15px}button{padding:12px;font:inherit}.tools p{color:#526571}@media print{body{padding:0}.tools{display:none}}</style></head><body><div class="tools"><button id="print" onclick="window.print()" ${document.qrImage ? 'disabled' : ''}>Друк / Зберегти PDF</button><p>${mode === 'label' ? 'Етикетка 100 × 80 мм. У діалозі друку: масштаб 100%, без колонтитулів. Для довгого артикула перевірте розбиття на сторінки.' : 'A4, книжкова орієнтація. Друкуються лише збережені дані.'}</p></div>${body}<script>const images=[...document.images];Promise.all(images.map(i=>i.complete&&i.naturalWidth?Promise.resolve():new Promise((ok,no)=>{i.onload=ok;i.onerror=no}))).then(()=>document.getElementById('print').disabled=false).catch(()=>{document.querySelector('.tools p').textContent='QR не завантажився. Закрийте вікно та сформуйте документ повторно.'})</script></body></html>`
}
