import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trackingToken } from '../src/calculation/tracking.js'
const id = 'c30b2f11-8dbf-47bd-91f4-317f40ad1af2'
test('scanner accepts QR URL and raw identifier',()=>{assert.equal(trackingToken(` https://example.test/?product=${id} `),id);assert.equal(trackingToken(id),id)})
test('scanner rejects arbitrary input and old order URLs',()=>{for(const s of ['', '1234', 'https://example.test/?publicId=123', 'javascript:alert(1)'])assert.throws(()=>trackingToken(s))})
