import { stockQuantity } from './procurement.js'
export function receiptCostPayload(draft) {
 const amount=(value,digits,label)=>{const s=String(value??'').trim();if(!new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`).test(s)||Number(s)>999999999)throw new Error(`Перевірте ${label}`);return Number(s)}
 if(!draft.vendorNo || !draft.documentNo.trim() || !draft.documentDate)throw new Error('Вкажіть постачальника, номер і дату накладної')
 if(!draft.lines.length || draft.lines.length>200)throw new Error('Додайте від 1 до 200 матеріалів')
 const seen=new Set()
 return {requestKey:draft.requestKey,vendorNo:Number(draft.vendorNo),documentNo:draft.documentNo.trim(),documentDate:draft.documentDate,
 supplierOrderId:draft.supplierOrderId||null,expectedRevision:draft.expectedRevision??null,deliveryCost:amount(draft.deliveryCost,2,'доставку'),procurementCost:amount(draft.procurementCost,2,'витрати закупівлі'),note:draft.note.trim(),lines:draft.lines.map(l=>{
 if(seen.has(Number(l.partNo)))throw new Error('Матеріал повторюється');seen.add(Number(l.partNo))
 return {partNo:Number(l.partNo),quantity:stockQuantity(l.quantity,l.unit),unitPrice:amount(l.unitPrice,6,'закупівельну ціну'),directCost:amount(l.directCost,2,'витрати позиції'),openingUnitCost:l.openingUnitCost===''||l.openingUnitCost==null?null:amount(l.openingUnitCost,6,'початкову собівартість')}
 })}
}
