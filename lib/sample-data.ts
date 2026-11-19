// 示例数据生成器：按业务关联生成全套演示数据，供客户一键体验后自行删除。
// 所有数据相互关联，保证地图/图表/分析模块都有内容：
//   仓库(id) ← 订单(warehouseId) / 库存(warehouseId)
//   SKU(id=编码) ← 订单(skuId) / 库存(skuId)
// 注意：这些是"示例"，只在用户主动点击"加载示例数据"时写入，不会默认预置。
import type { EntityKey } from "./store";

export type SampleBundle = Record<EntityKey, any[]>;

const WAREHOUSES = [
  { id: "wh-usla", name: "美西洛杉矶仓", code: "US-LAX-01", country: "美国", countryCode: "US", state: "加利福尼亚州", city: "洛杉矶", lng: -118.24, lat: 34.05, capacity: 50000, used: 32000, health: "healthy", skuCount: 8, dailyOutbound: 420 },
  { id: "wh-usny", name: "美东新泽西仓", code: "US-EWR-02", country: "美国", countryCode: "US", state: "新泽西州", city: "纽瓦克", lng: -74.17, lat: 40.74, capacity: 40000, used: 31000, health: "warning", skuCount: 6, dailyOutbound: 280 },
  { id: "wh-dehh", name: "德国汉堡仓", code: "DE-HAM-01", country: "德国", countryCode: "DE", state: "汉堡州", city: "汉堡", lng: 9.99, lat: 53.55, capacity: 30000, used: 12000, health: "healthy", skuCount: 5, dailyOutbound: 150 },
];

const SKU_SEED = [
  { code: "TMY.WG001", name: "皮卡通用防滚架", category: "汽配-外饰", price: 128, cost: 62, weight: 24.5 },
  { code: "TMY.WG045", name: "皮卡后箱盖", category: "汽配-外饰", price: 89, cost: 41, weight: 18.2 },
  { code: "TMY.WG063", name: "越野车前保险杠", category: "汽配-改装", price: 215, cost: 108, weight: 32.0 },
  { code: "TMY.WG088", name: "车载行李架横杆", category: "汽配-外饰", price: 46, cost: 19, weight: 6.8 },
  { code: "TMY.WG102", name: "LED 户外射灯", category: "汽配-电子", price: 35, cost: 14, weight: 2.1 },
  { code: "TMY.WG121", name: "拖车钩总成", category: "汽配-改装", price: 76, cost: 33, weight: 11.4 },
  { code: "TMY.WG150", name: "轮眉防溅挡板", category: "汽配-外饰", price: 28, cost: 11, weight: 3.5 },
  { code: "TMY.WG180", name: "折叠式脚踏板", category: "汽配-改装", price: 158, cost: 74, weight: 19.6 },
];

const CITIES = [
  { city: "洛杉矶", state: "加利福尼亚州", country: "美国", countryCode: "US", zip: "90001", lng: -118.24, lat: 34.05 },
  { city: "旧金山", state: "加利福尼亚州", country: "美国", countryCode: "US", zip: "94102", lng: -122.42, lat: 37.77 },
  { city: "休斯顿", state: "德克萨斯州", country: "美国", countryCode: "US", zip: "77002", lng: -95.37, lat: 29.76 },
  { city: "纽约", state: "纽约州", country: "美国", countryCode: "US", zip: "10001", lng: -74.01, lat: 40.71 },
  { city: "芝加哥", state: "伊利诺伊州", country: "美国", countryCode: "US", zip: "60601", lng: -87.63, lat: 41.88 },
  { city: "迈阿密", state: "佛罗里达州", country: "美国", countryCode: "US", zip: "33101", lng: -80.19, lat: 25.76 },
  { city: "柏林", state: "", country: "德国", countryCode: "DE", zip: "10115", lng: 13.4, lat: 52.52 },
  { city: "慕尼黑", state: "", country: "德国", countryCode: "DE", zip: "80331", lng: 11.58, lat: 48.14 },
  { city: "伦敦", state: "", country: "英国", countryCode: "GB", zip: "SW1A", lng: -0.13, lat: 51.51 },
];

const PLATFORMS = ["Amazon", "eBay", "TikTok Shop", "独立站"];
const STATUSES = ["待发货", "已发货", "运输中", "已签收", "退货中", "异常"];

/** 生成全套关联示例数据 */
export function generateSampleData(): SampleBundle {
  const skus = SKU_SEED.map((s, i) => ({
    id: s.code, sku: s.code, name: s.name, category: s.category,
    price: s.price, cost: s.cost, weight: s.weight, image: ["🚗", "🛻", "🔧", "🛠️", "💡", "🪝", "🛡️", "🦶"][i % 8],
  }));

  const inventory: any[] = [];
  WAREHOUSES.forEach((w, wi) => {
    SKU_SEED.forEach((s, si) => {
      if ((si + wi) % 3 === 2 && wi === 2) return; // 德国仓少几个 SKU
      const available = 20 + ((si * 37 + wi * 53) % 380);
      const reserved = (si * 7 + wi * 3) % 25;
      inventory.push({
        id: `${w.id}_${s.code}_1`, warehouseId: w.id, skuId: s.code,
        available, reserved, total: available + reserved,
        safetyStock: 50, ageDays: (si * 13 + wi * 29) % 120,
      });
    });
  });

  const orders: any[] = [];
  const orderCount = 120;
  for (let i = 0; i < orderCount; i++) {
    const c = CITIES[i % CITIES.length];
    const sku = SKU_SEED[(i * 5 + 2) % SKU_SEED.length];
    const platform = PLATFORMS[i % PLATFORMS.length];
    const wh = WAREHOUSES[c.countryCode === "DE" ? 2 : i % 2];
    const qty = 1 + (i % 3);
    const amount = Math.round(sku.price * qty * (0.85 + (i % 7) * 0.03) * 100) / 100;
    const day = 1 + (i % 28);
    orders.push({
      id: `WO202611${String(i + 1).padStart(4, "0")}`,
      orderNo: `WO202611${String(i + 1).padStart(4, "0")}`,
      platform, skuId: sku.code, qty, amount,
      weight: Math.round(sku.weight * qty * 10) / 10,
      status: STATUSES[i % STATUSES.length],
      city: c.city, state: c.state, country: c.country, countryCode: c.countryCode, zip: c.zip,
      lng: c.lng, lat: c.lat, date: `2026-11-${String(day).padStart(2, "0")}`,
      warehouseId: wh.id, returnRisk: (i % 17) / 100,
      commission: Math.round(amount * 0.12 * 100) / 100,
      firstMile: Math.round(sku.weight * qty * 1.8 * 100) / 100,
      lastMile: Math.round(4.5 + (i % 9) * 0.7),
      returnLoss: i % 13 === 0 ? Math.round(amount * 0.3 * 100) / 100 : 0,
      otherCost: Math.round((i % 5) * 0.6 * 100) / 100,
    });
  }

  const containers = [
    { id: "cnt-001", containerNo: "MSCU8823417", originPort: "深圳盐田港", originLng: 114.27, originLat: 22.56, destPort: "洛杉矶港", destLng: -118.26, destLat: 33.74, destCountry: "美国", status: "在途", progress: 0.62, etd: "2026-11-02", eta: "2026-11-24", cargoValue: 186000, volume: 58, skuCount: 6 },
    { id: "cnt-002", containerNo: "COSU6451983", originPort: "宁波舟山港", originLng: 121.85, originLat: 29.92, destPort: "汉堡港", destLng: 9.93, destLat: 53.54, destCountry: "德国", status: "清关中", progress: 0.88, etd: "2026-10-28", eta: "2026-11-18", cargoValue: 124500, volume: 42, skuCount: 5 },
    { id: "cnt-003", containerNo: "EGLU3390264", originPort: "上海洋山港", originLng: 122.06, originLat: 30.62, destPort: "纽约港", destLng: -74.15, destLat: 40.67, destCountry: "美国", status: "已到港", progress: 1, etd: "2026-10-20", eta: "2026-11-12", cargoValue: 96000, volume: 35, skuCount: 4 },
  ];

  const priceCards = [
    { id: "pc-001", version: "v1.2", carrier: "UPS", country: "美国", state: "加利福尼亚州", zipFrom: "90001", zipTo: "92899", weightFrom: 0, weightTo: 5, price: 8.5, fuelSurcharge: 1.2, deliveryDays: 3, effectiveDate: "2026-01-01" },
    { id: "pc-002", version: "v1.2", carrier: "FedEx", country: "美国", state: "加利福尼亚州", zipFrom: "90001", zipTo: "92899", weightFrom: 5, weightTo: 20, price: 14.2, fuelSurcharge: 2.1, deliveryDays: 4, effectiveDate: "2026-01-01" },
    { id: "pc-003", version: "v1.0", carrier: "DHL", country: "德国", state: "", zipFrom: "10115", zipTo: "99999", weightFrom: 0, weightTo: 10, price: 6.8, fuelSurcharge: 0.9, deliveryDays: 2, effectiveDate: "2026-03-01" },
    { id: "pc-004", version: "v1.0", carrier: "USPS", country: "美国", state: "纽约州", zipFrom: "10001", zipTo: "14999", weightFrom: 0, weightTo: 5, price: 7.2, fuelSurcharge: 0.8, deliveryDays: 4, effectiveDate: "2026-02-01" },
  ];

  const alerts = [
    { id: "al-001", type: "库存", level: "high", title: "美东仓安全库存不足", detail: "新泽西仓多个 SKU 可售低于安全库存 50 件，建议尽快补货", time: "10分钟前", lng: -74.17, lat: 40.74, module: "inventory" },
    { id: "al-002", type: "海运", level: "medium", title: "MSCU8823417 在途延误", detail: "预计到达时间较计划晚 2 天，请关注清关进度", time: "1小时前", lng: -118.26, lat: 33.74, module: "shipping" },
    { id: "al-003", type: "运费", level: "medium", title: "美西尾程运费上涨", detail: "加州区域 UPS 运费环比上涨 8%，建议比价其他承运商", time: "今天 09:30", lng: -118.24, lat: 34.05, module: "pricecard" },
    { id: "al-004", type: "退货", level: "low", title: "皮卡后箱盖退货率偏高", detail: "TMY.WG045 近 30 天退货 6 单，集中在加州区域", time: "昨天", lng: -117.8, lat: 34.1, module: "sku" },
    { id: "al-005", type: "订单", level: "medium", title: "异常订单待处理", detail: "有 3 笔订单状态异常，请到订单分析核实", time: "今天 11:15", lng: -95.37, lat: 29.76, module: "orders" },
  ];

  return {
    warehouses: WAREHOUSES,
    orders,
    skus,
    inventory,
    containers,
    priceCards,
    alerts,
  };
}

/** 示例数据统计摘要（用于按钮提示） */
export function sampleSummary(): string {
  const d = generateSampleData();
  return Object.entries(d).map(([k, v]) => `${k}:${v.length}`).join(" ");
}
