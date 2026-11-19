// ============ 基础类型 ============

export type Platform = "Amazon" | "eBay" | "TikTok Shop" | "独立站";
export type OrderStatus = "待发货" | "已发货" | "运输中" | "已签收" | "退货中" | "异常";
export type HealthStatus = "healthy" | "warning" | "critical"; // 库存充足/预警/断货
export type ThemeMode = "light" | "dark";

export interface GeoPoint {
  lng: number;
  lat: number;
}

export interface City {
  name: string;
  nameEn: string;
  country: string;
  countryCode: string;
  state: string;
  lng: number;
  lat: number;
}

// ============ 海外仓 ============
export interface Warehouse {
  id: string;
  name: string;
  code: string;
  country: string;
  countryCode: string;
  state: string;
  city: string;
  lng: number;
  lat: number;
  capacity: number; // 总容量
  used: number; // 已用
  health: HealthStatus;
  skuCount: number;
  dailyOutbound: number;
}

// ============ SKU ============
export interface Sku {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  weight: number; // kg
  image: string; // emoji 占位
  cost?: number; // 采购成本（可选，用户录入）
}

// ============ 库存 ============
export interface InventoryItem {
  warehouseId: string;
  skuId: string;
  available: number;
  reserved: number;
  total: number;
  safetyStock: number;
  ageDays: number;
}

// ============ 订单 ============
export interface Order {
  id: string;
  orderNo: string;
  platform: Platform;
  skuId: string;
  qty: number;
  amount: number;
  weight: number;
  status: OrderStatus;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  lng: number;
  lat: number;
  date: string; // ISO
  warehouseId: string; // 推荐/履约仓
  returnRisk: number; // 0-1
  // 地理解析元数据（导入时自动生成，供按国家/州/邮编聚合）
  stateAbbr?: string;  // 州缩写，如 CA
  zip?: string;        // 邮编
  geoSource?: string;  // 地理来源：州字段/邮编推断/国家兜底
  // 利润核算费用项（可选，由用户录入；未录入则按费用率配置估算，估算值会标注）
  commission?: number; // 平台佣金
  firstMile?: number;  // 头程运费
  lastMile?: number;   // 尾程运费
  returnLoss?: number; // 退货损耗
  otherCost?: number;  // 其他费用
}

// ============ 海运 ============
export type ShipmentStatus = "在途" | "已到港" | "延误" | "清关中";
export interface Container {
  id: string;
  containerNo: string;
  originPort: string;
  originLng: number;
  originLat: number;
  destPort: string;
  destLng: number;
  destLat: number;
  destCountry: string;
  status: ShipmentStatus;
  progress: number; // 0-1
  etd: string;
  eta: string;
  cargoValue: number;
  volume: number; // 立方
  skuCount: number;
  items: { skuId: string; qty: number }[];
}

// ============ 尾程价卡 ============
export interface PriceCard {
  id: string;
  version: string;
  carrier: "UPS" | "USPS" | "DHL" | "FedEx";
  country: string;
  state: string;
  zipFrom: string;
  zipTo: string;
  weightFrom: number; // kg
  weightTo: number;
  price: number;
  fuelSurcharge: number; // 燃油附加费
  deliveryDays: number;
  effectiveDate: string;
}

// ============ 预警 ============
export type AlertType = "库存" | "海运" | "运费" | "退货" | "订单" | "地理编码";
export type AlertLevel = "high" | "medium" | "low";
export interface Alert {
  id: string;
  type: AlertType;
  level: AlertLevel;
  title: string;
  detail: string;
  time: string;
  lng?: number;
  lat?: number;
  module: string; // 跳转模块
  read: boolean;
}

// ============ 地图图层指标 ============
export type MapMetric =
  | "orderCount"
  | "sales"
  | "weight"
  | "deliveryTime"
  | "returnRate"
  | "availableStock"
  | "stockRisk"
  | "freightHeat";

export interface DrillLevel {
  level: "world" | "country" | "state" | "city";
  country?: string;
  state?: string;
  city?: string;
}
