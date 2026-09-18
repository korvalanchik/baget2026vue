import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEstimate, newArtwork } from '../src/calculation/estimate.js'
const artwork = () => Object.assign(newArtwork('art-1'), { widthMm: 400, heightMm: 600, framePartNo: 29340, productQuantity: 2 })
test('sheet counts and artwork geometry reach API without multiplying frame quantity', () => {
  const a = artwork()
  a.glass = [{partNo:12670,quantityPerProduct:2},{partNo:27510,quantityPerProduct:1}]
  a.backings = [{partNo:27520,quantityPerProduct:3}]
  a.mats = [{partNo:5160,quantityPerProduct:2}]
  a.margins = {leftMm:50,rightMm:50,topMm:50,bottomMm:70}
  const {product:p} = buildEstimate([a]).items[0]
  assert.equal(p.productType,'FRAMED_ARTWORK')
  assert.equal(p.widthMm,400)
  assert.equal(p.productQuantity,2)
  assert.deepEqual(p.glass,a.glass)
  assert.deepEqual(p.matMargins,a.margins)
  assert.equal(p.backings[0].quantityPerProduct,3)
  assert.equal(p.suspension.hangerMode,'AUTO')
  assert.equal('unitPrice' in p,false)
})
test('hidden margins and manual settings are not sent', () => {
  const a=artwork();a.margins.leftMm=90;a.hangerMode='NONE';a.hangerPartNo=14460;a.hangersPerProduct=5;a.pozziPerProduct=4
  const p=buildEstimate([a]).items[0].product
  assert.equal('matMargins' in p,false)
  assert.deepEqual(p.suspension,{hangerMode:'NONE',includePozzi:false})
})
test('manual settings are sent independently of sheet counts', () => {
  const a=artwork();a.hangerMode='MANUAL';a.hangerPartNo=14450;a.hangersPerProduct=2;a.includePozzi=true;a.pozziPerProduct=3
  assert.deepEqual(buildEstimate([a]).items[0].product.suspension,{hangerMode:'MANUAL',hangerPartNo:14450,hangersPerProduct:2,includePozzi:true,pozziPerProduct:3})
})
test('invalid dimensions, fractional counts, duplicate sheets and oversized borders are rejected', () => {
  for (const value of ['',0,-1,Infinity,0.0001]) { const a=artwork();a.widthMm=value;assert.throws(()=>buildEstimate([a])) }
  for (const count of [0,1.5,10001,'']) { const a=artwork();a.glass=[{partNo:12670,quantityPerProduct:count}];assert.throws(()=>buildEstimate([a])) }
  const a=artwork();a.mats=[{partNo:5160,quantityPerProduct:1}];a.margins.leftMm=100000;assert.throws(()=>buildEstimate([a]))
  const b=artwork();b.glass=[{partNo:12670,quantityPerProduct:1},{partNo:12670,quantityPerProduct:2}];assert.throws(()=>buildEstimate([b]))
})
test('multiple independent products retain stable client IDs', () => {
  const a=artwork(),b=artwork();b.id='art-7'
  assert.deepEqual(buildEstimate([a,b]).items.map(i=>i.clientItemId),['art-1','art-7'])
})
