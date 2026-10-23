/**
 * The five label kinds found in docs/samples/ETİKET.xlsx, one label per A4
 * page, landscape. Field lists only; layout/rendering is Phase 8.
 */
import type { labelTemplates } from "../schema";

type LabelTemplateSeed = Omit<typeof labelTemplates.$inferInsert, "id" | "sort">;

export const LABEL_TEMPLATE_SEEDS: LabelTemplateSeed[] = [
  {
    code: "PRODUCT",
    name: { tr: "Ürün etiketi", en: "Product label", ar: "ملصق المنتج" },
    kind: "product",
    logoMode: "pekiyi",
    fields: [
      { field: "productName", size: "xl" },
      { field: "colorCode", size: "lg" },
    ],
  },
  {
    code: "SHIPPING",
    name: { tr: "Kargo etiketi", en: "Shipping label", ar: "ملصق الشحن" },
    kind: "shipping",
    language: "tr",
    logoMode: "pekiyi",
    fields: [
      { field: "sender", label: { tr: "GÖNDEREN", en: "SENDER", ar: "المرسل" }, size: "md" },
      { field: "receiver", label: { tr: "ALICI", en: "RECEIVER", ar: "المستلم" }, size: "lg" },
      { field: "address", label: { tr: "ADRES", en: "ADDRESS", ar: "العنوان" }, size: "md" },
      { field: "packageContents", label: { tr: "İÇERİK", en: "CONTENTS", ar: "المحتوى" }, size: "lg" },
    ],
  },
  {
    code: "EXPORT_EN",
    name: { tr: "İhracat etiketi (İngilizce)", en: "Export label (English)", ar: "ملصق التصدير (إنجليزي)" },
    kind: "export",
    language: "en",
    logoMode: "pekiyi",
    fields: [
      { field: "company", label: { en: "COMPANY" }, size: "md" },
      { field: "address", label: { en: "ADDRESS" }, size: "md" },
      { field: "category", label: { en: "CATEGORY" }, size: "md" },
      { field: "setType", label: { en: "SET TYPE" }, size: "lg" },
      { field: "color", label: { en: "COLOR" }, size: "lg" },
      { field: "madeIn", label: { en: "Made in TURKEY" }, size: "md" },
    ],
  },
  {
    code: "PRIVATE_BARCODE",
    name: { tr: "Müşteri barkod etiketi", en: "Customer barcode label", ar: "ملصق باركود العميل" },
    kind: "private_barcode",
    logoMode: "customer",
    fields: [
      { field: "brandText", size: "xl" },
      { field: "customerProductName", size: "lg" },
      { field: "barcode", size: "lg" },
    ],
  },
  {
    code: "STOCK_BARCODE",
    name: { tr: "Stok barkod etiketi", en: "Stock barcode label", ar: "ملصق باركود المخزون" },
    kind: "stock_barcode",
    logoMode: "none",
    fields: [
      { field: "productPhoto", size: "lg" },
      { field: "productName", size: "lg" },
      { field: "color", size: "md" },
      { field: "stockCode", size: "md" },
      { field: "barcode", size: "lg" },
    ],
  },
];
