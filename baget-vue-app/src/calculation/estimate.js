export const groups = [
  {
    key: "glass",
    label: "Скло та дзеркало",
    parts: [
      [12670, "Скло 3 мм"],
      [27540, "Скло 2 мм"],
      [27510, "Антивідблискове скло"],
      [27470, "Акрил 2 мм"],
      [27760, "Дзеркало"],
    ],
  },
  {
    key: "backings",
    label: "Задники",
    parts: [
      [4460, "ДВП 3 мм"],
      [27520, "ПВХ 3 мм"],
    ],
  },
  {
    key: "mats",
    label: "Паспарту",
    parts: [
      [5160, "Звичайне"],
      [28010, "Тип 2"],
      [29500, "Овальне"],
    ],
  },
];
export const underframes = [
  [28060, "Тонкий"],
  [28020, "Середній"],
  [28210, "Широкий"],
  [29720, "Під принт"],
];
export const artworkTypes = [
  ["BLANK", "Чисте полотно"],
  ["WITH_IMAGE", "Полотно із зображенням"],
  ["PRINT", "Принт"],
];
export const hangers = [
  [27580, "Крокодил 01"],
  [14450, "Крокодил 04"],
  [14460, "Підвіс 099"],
  [29650, "Силовий"],
];
export function newArtwork(id) {
  return {
    id,
    withFrame: true,
    artworkType: "NONE",
    canvasSource: "CUSTOMER",
    underframePartNo: "",
    mountingType: "NONE",
    cordMode: "AUTO",
    widthMm: "",
    heightMm: "",
    productQuantity: 1,
    framePartNo: "",
    glass: [],
    backings: [],
    mats: [],
    margins: { leftMm: 0, rightMm: 0, topMm: 0, bottomMm: 0 },
    hangerMode: "AUTO",
    hangerPartNo: "",
    hangersPerProduct: "",
    includePozzi: false,
    pozziPerProduct: "",
  };
}
function number(value, label, min, max, integer = false) {
  const n = Number(value);
  if (
    value === "" ||
    value == null ||
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer
      ? !Number.isInteger(n)
      : Math.abs(n * 1000 - Math.round(n * 1000)) > 0.00001)
  ) {
    throw new Error(
      `${label}: ${integer ? "ціле число" : "число, до 3 знаків після коми"} від ${min} до ${max}.`,
    );
  }
  return n;
}
export function buildEstimate(artworks) {
  if (!artworks.length) throw new Error("Додайте хоча б один виріб.");
  const items = artworks.flatMap((a, index) => {
    try {
      const product = {
        productType: "FRAMED_ARTWORK",
        widthMm: number(a.widthMm, "Ширина", 0.001, 100000),
        heightMm: number(a.heightMm, "Висота", 0.001, 100000),
        productQuantity: number(
          a.productQuantity,
          "Кількість виробів",
          1,
          10000,
          true,
        ),
        framePartNo: a.withFrame
          ? number(
              a.framePartNo,
              "Оберіть багет",
              1,
              Number.MAX_SAFE_INTEGER,
              true,
            )
          : null,
      };
      if (a.withFrame) {
        for (const group of groups) {
          product[group.key] = a[group.key].map((s) => {
            if (!group.parts.some(([id]) => id === Number(s.partNo)))
              throw new Error("Оберіть матеріал зі списку.");
            return {
              partNo: Number(s.partNo),
              quantityPerProduct: number(
                s.quantityPerProduct,
                "Кількість шарів",
                1,
                10000,
                true,
              ),
            };
          });
          if (
            new Set(product[group.key].map((s) => s.partNo)).size !==
            product[group.key].length
          )
            throw new Error("Матеріал повторюється. Об’єднайте його шари.");
        }
        if (a.mats.length) {
          product.matMargins = Object.fromEntries(
            Object.entries(a.margins).map(([k, v]) => [
              k,
              number(v, "Поле паспарту", 0, 100000),
            ]),
          );
          if (
            product.widthMm +
              product.matMargins.leftMm +
              product.matMargins.rightMm >
              100000 ||
            product.heightMm +
              product.matMargins.topMm +
              product.matMargins.bottomMm >
              100000
          )
            throw new Error("Розмір із паспарту перевищує 100000 мм.");
        }
        const suspension = {
          hangerMode: a.hangerMode,
          includePozzi: a.includePozzi,
        };
        if (!["AUTO", "MANUAL", "NONE"].includes(a.hangerMode))
          throw new Error("Оберіть режим підвісу.");
        if (a.hangerMode === "MANUAL") {
          suspension.hangerPartNo = number(
            a.hangerPartNo,
            "Оберіть підвіс",
            1,
            Number.MAX_SAFE_INTEGER,
            true,
          );
          if (!hangers.some(([id]) => id === suspension.hangerPartNo))
            throw new Error("Невідомий підвіс.");
        }
        if (a.hangerMode !== "NONE" && a.hangersPerProduct !== "")
          suspension.hangersPerProduct = number(
            a.hangersPerProduct,
            "Кількість підвісів",
            1,
            10000,
            true,
          );
        if (a.includePozzi && a.pozziPerProduct !== "")
          suspension.pozziPerProduct = number(
            a.pozziPerProduct,
            "Кількість лапок",
            1,
            10000,
            true,
          );
        if (!["AUTO", "YES", "NO"].includes(a.cordMode))
          throw new Error("Оберіть режим шнурка.");
        if (a.cordMode !== "AUTO")
          suspension.includeCord = a.cordMode === "YES";
        product.suspension = suspension;
      }
      const rows = a.withFrame
        ? [{ clientItemId: a.id, kind: "PRODUCT", product }]
        : [];
      const size = {
        widthMm: product.widthMm,
        heightMm: product.heightMm,
        productQuantity: product.productQuantity,
      };
      if (!["NONE", "PLANE", "UNDERFRAME"].includes(a.mountingType))
        throw new Error("Оберіть спосіб натяжки.");
      if (
        a.artworkType !== "NONE" &&
        !artworkTypes.some(([type]) => type === a.artworkType)
      )
        throw new Error("Оберіть тип виробу.");
      if (!["CUSTOMER", "STOCK"].includes(a.canvasSource))
        throw new Error("Оберіть джерело полотна.");
      const underframe =
        a.underframePartNo === ""
          ? null
          : number(
              a.underframePartNo,
              "Підрамник",
              1,
              Number.MAX_SAFE_INTEGER,
              true,
            );
      if (underframe && !underframes.some(([id]) => id === underframe))
        throw new Error("Оберіть підрамник зі списку.");
      if (a.mountingType !== "NONE" && a.artworkType === "NONE")
        throw new Error("Для натяжки оберіть виріб: принт або полотно.");
      if (a.mountingType === "PLANE" && underframe)
        throw new Error("Для натяжки на площину виберіть «Без підрамника».");
      const canvas =
        a.artworkType !== "NONE" && a.canvasSource === "STOCK" ? 27970 : null;
      if (a.mountingType === "UNDERFRAME") {
        if (!underframe)
          throw new Error("Для натяжки на підрамник оберіть підрамник.");
        rows.push({
          clientItemId: `${a.id}--mounting`,
          kind: "MOUNTING",
          mounting: {
            ...size,
            mountingType: "UNDERFRAME",
            canvasType: a.artworkType,
            underframePartNo: underframe,
            ...(canvas ? { canvasPartNo: canvas } : {}),
          },
        });
      } else {
        if (underframe)
          rows.push({
            clientItemId: `${a.id}--underframe`,
            kind: "PRODUCT",
            product: {
              ...size,
              productType: "UNDERFRAME",
              underframePartNo: underframe,
            },
          });
        if (a.mountingType === "PLANE")
          rows.push({
            clientItemId: `${a.id}--mounting`,
            kind: "MOUNTING",
            mounting: { ...size, mountingType: "PLANE" },
          });
        if (canvas)
          rows.push({
            clientItemId: `${a.id}--canvas`,
            kind: "MOUNTING",
            mounting: {
              ...size,
              mountingType: "NONE",
              canvasType: a.artworkType,
              canvasPartNo: canvas,
            },
          });
      }
      if (!rows.length)
        throw new Error(
          "Оберіть раму, підрамник, полотно майстерні або натяжку.",
        );
      return rows;
    } catch (error) {
      throw new Error(`Виріб ${index + 1}: ${error.message}`, { cause: error });
    }
  });
  if (items.length > 50)
    throw new Error(
      "Кошторис перевищує 50 складових. Розділіть його на кілька розрахунків.",
    );
  return { items };
}

export function sectionTitle(clientItemId, artworks) {
  const [id, suffix] = clientItemId.split("--");
  const index = artworks.findIndex((a) => a.id === id);
  return `Виріб ${index + 1} · ${{ mounting: "Натяжка", underframe: "Підрамник", canvas: "Полотно" }[suffix] || "Оформлення в раму"}`;
}

// Verify explicit choices so an older backend cannot silently ignore includeCord.
export function verifyCordChoices(result, request) {
  for (const item of request.items) {
    const choice = item.product?.suspension?.includeCord;
    if (choice == null) continue;
    const priced = result.items.find(
      (r) => r.clientItemId === item.clientItemId,
    );
    const hasCord = priced?.product?.lines?.some(
      (line) => line.role === "CORD",
    );
    if (hasCord !== choice)
      throw new Error(
        "Сервер не підтвердив вибір шнурка. Оновіть backend із пакета кроку 12 v2.",
      );
  }
}
