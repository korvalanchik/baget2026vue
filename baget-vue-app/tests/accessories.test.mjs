import {test} from 'node:test'
import assert from 'node:assert/strict'
import {newArtwork,buildEstimate} from '../src/calculation/estimate.js'
const base=()=>({...newArtwork('art-1'),widthMm:300,heightMm:400,framePartNo:29340,artworkType:'EMBROIDERY',canvasSource:'STOCK'})
test('embroidery without stretching never sells customer fabric',()=>{
 const rows=buildEstimate([base()]).items;assert.equal(rows.length,1);assert.equal(rows[0].kind,'PRODUCT')
})
test('embroidery on backing charges no stock canvas and preserves one backing',()=>{
 const a=base();a.withFrame=false;a.mountingType='PLANE';a.backings=[{partNo:4460,quantityPerProduct:1}]
 const rows=buildEstimate([a]).items;assert.equal(rows.length,2);assert.equal(rows[1].mounting.canvasType,'EMBROIDERY');assert.equal(rows[1].mounting.canvasPartNo,undefined)
 assert.equal(rows[0].product.backings.length,1)
 a.backings=[];assert.throws(()=>buildEstimate([a]),/задник/)
})
test('embroidery on underframe and optional frame fasteners',()=>{
 const a=base();a.underframePartNo=28060;a.mountingType='UNDERFRAME';a.includeUnderframeFasteners=true
 const rows=buildEstimate([a]).items;assert.equal(rows.length,2);assert.equal(rows[0].product.includeUnderframeFasteners,true);assert.equal(rows[1].mounting.canvasType,'EMBROIDERY');assert.equal(rows[1].mounting.canvasPartNo,undefined)
})
test('antiframe and crocodile are optional and need backing',()=>{
 const a=base();a.withFrame=false;a.antiFrame=true;a.includeBackingHanger=true;a.backings=[{partNo:27520,quantityPerProduct:1}];a.glass=[{partNo:27760,quantityPerProduct:1}]
 const p=buildEstimate([a]).items[0].product;assert.equal(p.antiFrame,true);assert.equal(p.suspension.hangerMode,'AUTO');assert.equal(p.suspension.includeCord,false)
 a.backings=[];assert.throws(()=>buildEstimate([a]),/антирами/)
})
