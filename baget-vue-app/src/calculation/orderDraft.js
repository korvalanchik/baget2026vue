import { buildEstimate } from "./estimate.js";
export function buildOrderDraft(
  artworks,
  details,
  branchName,
  requestKey,
  expectedRevision = 0,
) {
  const estimate = buildEstimate(artworks);
  if (!details.custNo && (!details.company?.trim() || !details.phone?.trim()))
    throw new Error("Оберіть клієнта або введіть ім’я та телефон.");
  return {
    requestKey,
    expectedRevision,
    branchName,
    custNo: details.custNo ? Number(details.custNo) : null,
    company: details.company?.trim() || "",
    phone: details.phone?.trim() || "",
    address: details.address?.trim() || "",
    notice: details.notice?.trim() || "",
    dueDate: details.dueDate || null,
    products: artworks.map((a) => ({
      clientProductId: a.id,
      form: JSON.parse(JSON.stringify(a)),
      note: a.note || "",
      components: estimate.items.filter(
        (item) => item.clientItemId.split("--")[0] === a.id,
      ),
    })),
  };
}
export function restoreOrderDraft(order) {
  return order.products.map((p) => {
    if (p.configuration?.schemaVersion !== 1 || !p.configuration?.draft?.form)
      throw new Error("Непідтримувана версія конфігурації виробу.");
    const a = JSON.parse(JSON.stringify(p.configuration.draft.form));
    a.id = p.clientProductId;
    a.note = p.configuration.draft.note || "";
    return a;
  });
}
