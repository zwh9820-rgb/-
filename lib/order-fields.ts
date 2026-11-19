import type { Order } from "./types";

// ============ 订单明细可显示字段配置 ============
// 用户可自行勾选要在「左侧订单卡片」与「地图订单弹窗」显示的字段。
export type OrderFieldKey =
  | "orderNo" | "platform" | "qty" | "amount" | "weight" | "date" | "status"
  | "skuId" | "city" | "state" | "country" | "countryCode" | "zip"
  | "warehouseId" | "returnRisk"
  | "commission" | "firstMile" | "lastMile" | "returnLoss" | "otherCost";

export type OrderFieldGroup = "基础" | "地理" | "费用";
export type OrderFieldDef = {
  key: OrderFieldKey;
  label: string;
  group: OrderFieldGroup;
  get: (o: Order) => string;
  accent?: boolean; // 是否用品牌色强调（金额类）
};

const money = (n: any) => `$${Number(n || 0).toFixed(2)}`;
const num = (n: any) => Number(n || 0).toLocaleString();

export const ORDER_FIELDS: OrderFieldDef[] = [
  { key: "orderNo", label: "订单号", group: "基础", get: (o) => o.orderNo || "-" },
  { key: "platform", label: "平台", group: "基础", get: (o) => o.platform || "-" },
  { key: "qty", label: "数量", group: "基础", get: (o) => `${num(o.qty)} 件` },
  { key: "amount", label: "金额", group: "基础", get: (o) => money(o.amount), accent: true },
  { key: "weight", label: "重量", group: "基础", get: (o) => `${num(o.weight)} kg` },
  { key: "date", label: "日期", group: "基础", get: (o) => o.date || "-" },
  { key: "status", label: "状态", group: "基础", get: (o) => o.status || "-" },
  { key: "skuId", label: "SKU", group: "基础", get: (o) => o.skuId || "-" },
  { key: "city", label: "城市", group: "地理", get: (o) => o.city || "-" },
  { key: "state", label: "州/省", group: "地理", get: (o) => o.state || "-" },
  { key: "country", label: "国家", group: "地理", get: (o) => o.country || "-" },
  { key: "countryCode", label: "国家代码", group: "地理", get: (o) => o.countryCode || "-" },
  { key: "zip", label: "邮编", group: "地理", get: (o) => (o as any).zip || "-" },
  { key: "warehouseId", label: "仓库", group: "地理", get: (o) => o.warehouseId || "-" },
  { key: "returnRisk", label: "退货风险", group: "地理", get: (o) => `${Math.round((o.returnRisk || 0) * 100)}%` },
  { key: "commission", label: "平台佣金", group: "费用", get: (o) => money((o as any).commission), accent: true },
  { key: "firstMile", label: "头程运费", group: "费用", get: (o) => money((o as any).firstMile), accent: true },
  { key: "lastMile", label: "尾程运费", group: "费用", get: (o) => money((o as any).lastMile), accent: true },
  { key: "returnLoss", label: "退货损耗", group: "费用", get: (o) => money((o as any).returnLoss), accent: true },
  { key: "otherCost", label: "其他费用", group: "费用", get: (o) => money((o as any).otherCost), accent: true },
];

export const FIELD_MAP: Record<OrderFieldKey, OrderFieldDef> = Object.fromEntries(
  ORDER_FIELDS.map((f) => [f.key, f])
) as Record<OrderFieldKey, OrderFieldDef>;

// 默认展示字段（与改造前一致）
export const DEFAULT_ORDER_FIELDS: OrderFieldKey[] = [
  "orderNo", "amount", "platform", "qty", "weight", "date", "status",
];

const LS_KEY = "cbh_order_fields_v1";

export function loadOrderFields(): OrderFieldKey[] {
  if (typeof window === "undefined") return DEFAULT_ORDER_FIELDS;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULT_ORDER_FIELDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER_FIELDS;
    // 过滤掉已不存在的字段，保持合法 key
    const valid = parsed.filter((k) => k in FIELD_MAP) as OrderFieldKey[];
    return valid.length ? valid : DEFAULT_ORDER_FIELDS;
  } catch {
    return DEFAULT_ORDER_FIELDS;
  }
}

export function saveOrderFields(keys: OrderFieldKey[]): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(LS_KEY, JSON.stringify(keys)); } catch { /* 存储不可用则忽略 */ }
}

export function formatOrderField(o: Order, key: OrderFieldKey): string {
  return FIELD_MAP[key]?.get(o) ?? "-";
}
