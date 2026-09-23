import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEstimate, newArtwork, sectionTitle } from '../src/calculation/estimate.js'
import { filterProfiles } from '../src/calculation/profileSearch.js'
import { buildOrderDraft, restoreOrderDraft } from '../src/calculation/orderDraft.js'
function sample() { return { ...newArtwork('art-1'), withFrame: false, framePartNo: 33190, widthMm: 300, heightMm: 400, glass: [{ partNo:27540, quantityPerProduct:1 }], backings: [{partNo:4460,quantityPerProduct:1}], mats:[{partNo:5160,quantityPerProduct:2}], margins:{leftMm:50,rightMm:50,topMm:50,bottomMm:50} } }
test('unframed sheets retain margins and layers but omit suspension', () => {
 const a=sample(), p=buildEstimate([a]).items[0].product
 assert.equal(p.productType,'UNFRAMED_ARTWORK'); assert.equal(p.framePartNo,null)
 assert.equal(p.mats[0].quantityPerProduct,2); assert.equal(p.matMargins.leftMm,50)
 assert.equal(p.suspension,undefined); assert.equal(buildEstimate([a]).items.length,1)
 assert.match(sectionTitle('art-1',[a]),/без рами/)
})
test('plane mounting stays separate and uses artwork dimensions', () => {
 const a=sample(); a.mountingType='PLANE';a.artworkType='PRINT'
 const rows=buildEstimate([a]).items
 assert.equal(rows.length,2); assert.equal(rows[1].mounting.widthMm,300);assert.equal(rows[1].mounting.heightMm,400)
})
test('individual sheet groups and empty standalone request', () => {
 for(const group of ['glass','backings','mats']) {
  const a=sample();for(const other of ['glass','backings','mats'])if(other!==group)a[other]=[]
  assert.equal(buildEstimate([a]).items.length,1)
 }
 const a=sample(); a.glass=[];a.backings=[];a.mats=[]
 assert.throws(()=>buildEstimate([a]));a.mountingType='PLANE';a.artworkType='PRINT';assert.equal(buildEstimate([a]).items.length,1)
})
test('legacy no-frame part excluded and cannot be submitted as a frame', () => {
 assert.deepEqual(filterProfiles([{partNo:33190,description:'Без рами'}],'рами'),[])
 const a=sample();a.withFrame=true;assert.throws(()=>buildEstimate([a]),/без рами/)
 a.framePartNo=29340;assert.equal(buildEstimate([a]).items[0].product.productType,'FRAMED_ARTWORK')
})
test('saved OrderProduct restores unframed composition with mounting', () => {
 const a=sample();a.mountingType='PLANE';a.artworkType='PRINT'
 const draft=buildOrderDraft([a],{custNo:7},'Test','12345678-1234-4234-8234-123456789012')
 assert.equal(draft.products[0].components.length,2)
 const restored=restoreOrderDraft({products:[{clientProductId:a.id,configuration:{schemaVersion:1,draft:draft.products[0]}}]})
 assert.deepEqual(buildEstimate(restored),buildEstimate([a]))
})
