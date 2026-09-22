import { test } from "node:test";
import assert from "node:assert/strict";
import { newArtwork } from "../src/calculation/estimate.js";
import {
  buildOrderDraft,
  restoreOrderDraft,
} from "../src/calculation/orderDraft.js";
const details = {
  custNo: 9878,
  company: "Test",
  phone: "0660000000",
  notice: "Прийнято полотно",
  dueDate: "2026-10-01",
};
function art(id = "art-1") {
  return {
    ...newArtwork(id),
    widthMm: 400,
    heightMm: 500,
    framePartNo: 30410,
    artworkType: "PRINT",
    mountingType: "UNDERFRAME",
    underframePartNo: 29720,
    note: "Виріб клієнта",
  };
}
test("frame and mounting belong to one physical OrderProduct", () => {
  const r = buildOrderDraft(
    [art()],
    details,
    "Парапет",
    "12345678-1234-4234-8234-123456789012",
  );
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].components.length, 2);
  assert.equal(r.products[0].components[1].kind, "MOUNTING");
  assert.equal("itemsTotal" in r, false);
  assert.equal("sellPrice" in r.products[0], false);
  assert.equal(r.expectedRevision, 0);
  assert.equal(r.dueDate, "2026-10-01");
});
test("separate physical products remain separate and preserve notes", () => {
  const r = buildOrderDraft(
    [art(), art("art-2")],
    details,
    "Парапет",
    "key",
    4,
  );
  assert.equal(r.products.length, 2);
  assert.equal(r.expectedRevision, 4);
  assert.equal(r.products[0].note, "Виріб клієнта");
  assert.ok(
    r.products[1].components.every((c) => c.clientItemId.startsWith("art-2")),
  );
});
test("saved configuration restores layers and mounting independently of server-generated row IDs", () => {
  const a = art();
  a.mats = [{ partNo: 5160, quantityPerProduct: 3 }];
  a.margins.leftMm = 70;
  const draft = buildOrderDraft([a], details, "Парапет", "key").products[0];
  const restored = restoreOrderDraft({
    products: [
      {
        id: 125,
        clientProductId: a.id,
        configuration: { schemaVersion: 1, draft },
      },
    ],
  });
  assert.deepEqual(restored, [a]);
  restored[0].margins.leftMm = 80;
  assert.equal(draft.form.margins.leftMm, 70);
});
test("customer is required and unknown configuration versions cannot silently reopen", () => {
  assert.throws(() => buildOrderDraft([art()], {}, "Парапет", "key"));
  assert.throws(() =>
    restoreOrderDraft({ products: [{ configuration: { schemaVersion: 2 } }] }),
  );
});
