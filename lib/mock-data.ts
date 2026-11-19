import type {
  Warehouse, Sku, InventoryItem, Order, Container, PriceCard, Alert, City,
} from "./types";

// ============================================================
// 说明：本文件不再包含任何预置的业务数据。
// 仓库 / 订单 / SKU / 库存 / 海运 / 价卡 / 预警 等全部业务数据
// 由用户在「数据中心」手动录入或 CSV 导入，保存在本地存储中。
// 下方仅保留：
//   1) 城市 / 港口坐标库 —— 真实地理参考字典，供录入时选择坐标、地图下钻使用；
//   2) 空的业务数据占位导出 —— 兼容旧引用，均为 []；
//   3) STATS —— 基于当前数据实时计算（在 useLiveStats 中）。
// ============================================================

// ============ 城市坐标参考库（真实地理数据，非业务数据）============
export const CITIES: City[] = [
  { name: "洛杉矶", nameEn: "Los Angeles", country: "美国", countryCode: "US", state: "加利福尼亚州", lng: -118.24, lat: 34.05 },
  { name: "旧金山", nameEn: "San Francisco", country: "美国", countryCode: "US", state: "加利福尼亚州", lng: -122.42, lat: 37.77 },
  { name: "纽约", nameEn: "New York", country: "美国", countryCode: "US", state: "纽约州", lng: -74.01, lat: 40.71 },
  { name: "芝加哥", nameEn: "Chicago", country: "美国", countryCode: "US", state: "伊利诺伊州", lng: -87.63, lat: 41.88 },
  { name: "休斯顿", nameEn: "Houston", country: "美国", countryCode: "US", state: "德克萨斯州", lng: -95.37, lat: 29.76 },
  { name: "迈阿密", nameEn: "Miami", country: "美国", countryCode: "US", state: "佛罗里达州", lng: -80.19, lat: 25.76 },
  { name: "西雅图", nameEn: "Seattle", country: "美国", countryCode: "US", state: "华盛顿州", lng: -122.33, lat: 47.61 },
  { name: "丹佛", nameEn: "Denver", country: "美国", countryCode: "US", state: "科罗拉多州", lng: -104.99, lat: 39.74 },
  { name: "亚特兰大", nameEn: "Atlanta", country: "美国", countryCode: "US", state: "佐治亚州", lng: -84.39, lat: 33.75 },
  { name: "波士顿", nameEn: "Boston", country: "美国", countryCode: "US", state: "马萨诸塞州", lng: -71.06, lat: 42.36 },
  { name: "多伦多", nameEn: "Toronto", country: "加拿大", countryCode: "CA", state: "安大略省", lng: -79.38, lat: 43.65 },
  { name: "温哥华", nameEn: "Vancouver", country: "加拿大", countryCode: "CA", state: "不列颠哥伦比亚省", lng: -123.12, lat: 49.28 },
  { name: "伦敦", nameEn: "London", country: "英国", countryCode: "GB", state: "英格兰", lng: -0.13, lat: 51.51 },
  { name: "曼彻斯特", nameEn: "Manchester", country: "英国", countryCode: "GB", state: "英格兰", lng: -2.24, lat: 53.48 },
  { name: "柏林", nameEn: "Berlin", country: "德国", countryCode: "DE", state: "柏林州", lng: 13.4, lat: 52.52 },
  { name: "慕尼黑", nameEn: "Munich", country: "德国", countryCode: "DE", state: "巴伐利亚州", lng: 11.58, lat: 48.14 },
  { name: "法兰克福", nameEn: "Frankfurt", country: "德国", countryCode: "DE", state: "黑森州", lng: 8.68, lat: 50.11 },
  { name: "巴黎", nameEn: "Paris", country: "法国", countryCode: "FR", state: "法兰西岛", lng: 2.35, lat: 48.86 },
  { name: "东京", nameEn: "Tokyo", country: "日本", countryCode: "JP", state: "东京都", lng: 139.69, lat: 35.69 },
  { name: "大阪", nameEn: "Osaka", country: "日本", countryCode: "JP", state: "大阪府", lng: 135.5, lat: 34.69 },
  { name: "悉尼", nameEn: "Sydney", country: "澳大利亚", countryCode: "AU", state: "新南威尔士州", lng: 151.21, lat: -33.87 },
  { name: "墨尔本", nameEn: "Melbourne", country: "澳大利亚", countryCode: "AU", state: "维多利亚州", lng: 144.96, lat: -37.81 },
];

// ============ 港口坐标参考库（真实地理数据）============
export const PORTS_DISPLAY = [
  { name: "深圳", lng: 114.27, lat: 22.56 },
  { name: "上海", lng: 122.06, lat: 30.62 },
  { name: "宁波", lng: 121.85, lat: 29.92 },
];

// ============ 业务数据占位（全部为空，由用户录入）============
export const WAREHOUSES: Warehouse[] = [];
export const SKUS: Sku[] = [];
export const INVENTORY: InventoryItem[] = [];
export const ORDERS: Order[] = [];
export const CONTAINERS: Container[] = [];
export const PRICE_CARDS: PriceCard[] = [];
export const PRICE_CARD_VERSIONS: string[] = [];
export const ALERTS: Alert[] = [];

// ============ 实时统计（基于传入的当前数据计算）============
export interface LiveStatsInput {
  orders?: Order[];
  warehouses?: Warehouse[];
  containers?: Container[];
  alerts?: Alert[];
}
export function computeStats(input: LiveStatsInput) {
  const orders = input.orders || [];
  const warehouses = input.warehouses || [];
  const containers = input.containers || [];
  const alerts = input.alerts || [];
  return {
    totalOrders: orders.length,
    totalSales: +orders.reduce((s, o) => s + (o.amount || 0), 0).toFixed(2),
    totalWeight: +orders.reduce((s, o) => s + (o.weight || 0), 0).toFixed(1),
    warehouseCount: warehouses.length,
    activeContainers: containers.filter((c) => c.status === "在途" || c.status === "清关中").length,
    unreadAlerts: alerts.filter((a) => !a.read).length,
    avgDeliveryDays: 0,
    returnRate: 0,
  };
}

// 兼容性 STATS（空数据），仅用于尚未改造的旧引用
export const STATS = computeStats({});
