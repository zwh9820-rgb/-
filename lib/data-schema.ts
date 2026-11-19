import type { EntityKey } from "./store";

export type FieldType = "text" | "number" | "date" | "select" | "textarea";
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  default?: any;
  help?: string;
}
export interface EntitySchema {
  key: EntityKey;
  label: string;
  desc: string;
  icon: string;
  fields: FieldDef[];
}

const PLATFORMS = ["Amazon", "eBay", "TikTok Shop", "独立站", "其他"];
const ORDER_STATUS = ["待发货", "已发货", "运输中", "已签收", "退货中", "异常"];
const HEALTH = ["healthy", "warning", "critical"];
const SHIP_STATUS = ["在途", "清关中", "已到港", "延误"];
const CARRIERS = ["UPS", "USPS", "DHL", "FedEx", "其他"];
const ALERT_TYPE = ["库存", "海运", "运费", "退货", "订单", "地理编码"];
const ALERT_LEVEL = ["high", "medium", "low"];

export const ENTITY_SCHEMAS: EntitySchema[] = [
  {
    key: "warehouses", label: "海外仓", icon: "🏭",
    desc: "仓库地址、坐标与库容。地图点位按经纬度自动落点。",
    fields: [
      { key: "id", label: "仓库ID", type: "text", required: true, help: "唯一标识，如 wh-la" },
      { key: "name", label: "仓库名称", type: "text", required: true },
      { key: "code", label: "仓库编码", type: "text", help: "如 US-LAX-01" },
      { key: "country", label: "国家", type: "text" },
      { key: "countryCode", label: "国家代码", type: "text", help: "如 US" },
      { key: "state", label: "州/省", type: "text" },
      { key: "city", label: "城市", type: "text" },
      { key: "lng", label: "经度", type: "number", required: true },
      { key: "lat", label: "纬度", type: "number", required: true },
      { key: "capacity", label: "总库容", type: "number", default: 0 },
      { key: "used", label: "已用库容", type: "number", default: 0 },
      { key: "health", label: "库存状态", type: "select", options: HEALTH, default: "healthy" },
      { key: "skuCount", label: "SKU 数", type: "number", default: 0 },
      { key: "dailyOutbound", label: "日均出库", type: "number", default: 0 },
    ],
  },
  {
    key: "orders", label: "订单", icon: "📦",
    desc: "多平台订单。经纬度决定地图点位；关联仓库ID用于仓配分析。",
    fields: [
      { key: "id", label: "订单ID", type: "text", required: true, help: "唯一标识，如 order-001" },
      { key: "orderNo", label: "订单号", type: "text", required: true },
      { key: "platform", label: "平台", type: "select", options: PLATFORMS, default: "Amazon" },
      { key: "skuId", label: "SKU ID", type: "text" },
      { key: "qty", label: "数量", type: "number", default: 1 },
      { key: "amount", label: "金额", type: "number", default: 0 },
      { key: "weight", label: "重量(kg)", type: "number", default: 0 },
      { key: "status", label: "状态", type: "select", options: ORDER_STATUS, default: "待发货" },
      { key: "city", label: "城市", type: "text" },
      { key: "state", label: "州/省", type: "text" },
      { key: "country", label: "国家", type: "text" },
      { key: "countryCode", label: "国家代码", type: "text" },
      { key: "zip", label: "邮编", type: "text", help: "用于按邮编推断州，补全地理层级" },
      { key: "lng", label: "经度", type: "number" },
      { key: "lat", label: "纬度", type: "number" },
      { key: "date", label: "日期", type: "date" },
      { key: "warehouseId", label: "履约仓库ID", type: "text" },
      { key: "returnRisk", label: "退货风险(0-1)", type: "number", default: 0 },
      { key: "commission", label: "平台佣金", type: "number", default: 0, help: "利润核算用，留空则按费用率估算" },
      { key: "firstMile", label: "头程运费", type: "number", default: 0, help: "利润核算用" },
      { key: "lastMile", label: "尾程运费", type: "number", default: 0, help: "利润核算用" },
      { key: "returnLoss", label: "退货损耗", type: "number", default: 0, help: "利润核算用" },
      { key: "otherCost", label: "其他费用", type: "number", default: 0, help: "利润核算用" },
    ],
  },
  {
    key: "skus", label: "SKU", icon: "🏷️",
    desc: "商品主数据。库存、订单、价卡通过 SKU ID 关联。",
    fields: [
      { key: "id", label: "SKU ID", type: "text", required: true, help: "如 sku-001" },
      { key: "sku", label: "SKU 编码", type: "text" },
      { key: "name", label: "商品名称", type: "text", required: true },
      { key: "category", label: "类目", type: "text" },
      { key: "price", label: "售价", type: "number", default: 0 },
      { key: "cost", label: "采购成本", type: "number", default: 0, help: "利润核算用，留空则不计算商品成本" },
      { key: "weight", label: "重量(kg)", type: "number", default: 0 },
      { key: "image", label: "图标(emoji)", type: "text", default: "📦" },
    ],
  },
  {
    key: "inventory", label: "库存", icon: "📊",
    desc: "各仓库的 SKU 库存明细。安全库存低于阈值将在地图预警。",
    fields: [
      { key: "id", label: "记录ID", type: "text", required: true, help: "唯一标识，如 inv-001" },
      { key: "warehouseId", label: "仓库ID", type: "text", required: true },
      { key: "skuId", label: "SKU ID", type: "text", required: true },
      { key: "available", label: "可售", type: "number", default: 0 },
      { key: "reserved", label: "预留", type: "number", default: 0 },
      { key: "total", label: "总库存", type: "number", default: 0 },
      { key: "safetyStock", label: "安全库存", type: "number", default: 0 },
      { key: "ageDays", label: "库龄(天)", type: "number", default: 0 },
    ],
  },
  {
    key: "containers", label: "海运集装箱", icon: "🚢",
    desc: "头程在途集装箱。起运港/目的港坐标决定地图航线。ETD/ETA 用于延误预警。",
    fields: [
      { key: "id", label: "集装箱ID", type: "text", required: true, help: "如 cnt-001" },
      { key: "containerNo", label: "柜号", type: "text", required: true, help: "如 MSCU1234567" },
      { key: "originPort", label: "起运港", type: "text" },
      { key: "originLng", label: "起运港经度", type: "number" },
      { key: "originLat", label: "起运港纬度", type: "number" },
      { key: "destPort", label: "目的港", type: "text" },
      { key: "destLng", label: "目的港经度", type: "number" },
      { key: "destLat", label: "目的港纬度", type: "number" },
      { key: "destCountry", label: "目的国家", type: "text" },
      { key: "status", label: "状态", type: "select", options: SHIP_STATUS, default: "在途" },
      { key: "progress", label: "在途进度(0-1)", type: "number", default: 0 },
      { key: "etd", label: "ETD 发货日", type: "date" },
      { key: "eta", label: "ETA 到港日", type: "date" },
      { key: "cargoValue", label: "货值", type: "number", default: 0 },
      { key: "volume", label: "体积(立方)", type: "number", default: 0 },
      { key: "skuCount", label: "SKU 种类数", type: "number", default: 0 },
    ],
  },
  {
    key: "priceCards", label: "尾程价卡", icon: "💰",
    desc: "服务商尾程价格。国家/州/邮编/重量段用于自动比价。",
    fields: [
      { key: "id", label: "价卡ID", type: "text", required: true, help: "如 pc-001" },
      { key: "version", label: "版本", type: "text", default: "v1.0" },
      { key: "carrier", label: "服务商", type: "select", options: CARRIERS, default: "UPS" },
      { key: "country", label: "国家", type: "text" },
      { key: "state", label: "州/省", type: "text" },
      { key: "zipFrom", label: "邮编起", type: "text" },
      { key: "zipTo", label: "邮编止", type: "text" },
      { key: "weightFrom", label: "重量起(kg)", type: "number", default: 0 },
      { key: "weightTo", label: "重量止(kg)", type: "number", default: 0 },
      { key: "price", label: "运费", type: "number", default: 0 },
      { key: "fuelSurcharge", label: "燃油附加费", type: "number", default: 0 },
      { key: "deliveryDays", label: "派送时效(天)", type: "number", default: 0 },
      { key: "effectiveDate", label: "生效日期", type: "date" },
    ],
  },
  {
    key: "alerts", label: "预警", icon: "⚠️",
    desc: "手动录入的预警条目。带坐标的预警会在地图打红点并可跳转。",
    fields: [
      { key: "id", label: "预警ID", type: "text", required: true, help: "如 al-001" },
      { key: "type", label: "类型", type: "select", options: ALERT_TYPE, default: "库存" },
      { key: "level", label: "级别", type: "select", options: ALERT_LEVEL, default: "medium" },
      { key: "title", label: "标题", type: "text", required: true },
      { key: "detail", label: "详情", type: "textarea" },
      { key: "time", label: "时间", type: "text", help: "如 10分钟前 / 2026-11-18" },
      { key: "lng", label: "经度", type: "number" },
      { key: "lat", label: "纬度", type: "number" },
      { key: "module", label: "跳转模块", type: "select", options: ["inventory", "shipping", "pricecard", "sku", "orders", "map"], default: "map" },
    ],
  },
];

// 生成 CSV 模板表头
export function templateCsv(schema: EntitySchema): string {
  const headers = schema.fields.map((f) => f.label).join(",");
  return "\uFEFF" + headers + "\n";
}

// 将 CSV 行解析为记录对象（按字段顺序映射）
export function csvToRecords(schema: EntitySchema, text: string): Record<string, any>[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
      else if (ch === "," && !quoted) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur); return out;
  };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const labelToKey: Record<string, string> = {};
  schema.fields.forEach((f) => { labelToKey[f.label] = f.key; });
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const rec: Record<string, any> = {};
    headers.forEach((h, i) => {
      const key = labelToKey[h];
      if (!key) return;
      const field = schema.fields.find((f) => f.key === key)!;
      const raw = (cells[i] ?? "").trim();
      rec[key] = field.type === "number" ? (raw === "" ? 0 : Number(raw)) : raw;
    });
    return rec;
  });
}
