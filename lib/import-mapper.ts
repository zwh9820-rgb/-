import { CITIES } from "./mock-data";
import { resolveGeo, stateFullName } from "./geo-resolve";
import type { EntityKey } from "./store";

// ============ 字段映射规则 ============
// alias: 真实导出文件中可能出现的列名（精确匹配优先，再去空格/括号模糊匹配）
// convert: 值转换
export interface FieldRule {
  key: string;
  alias: string[];
  convert?: (v: string, row: Record<string, string>) => any;
}

const clean = (s: string) => String(s ?? "").replace(/\s+/g, "").replace(/[（）()]/g, "").toLowerCase();

// 数值清洗：去掉逗号、货币符号、单位，转数字
const num = (v: string): number => {
  const n = parseFloat(String(v ?? "").replace(/[,\s￥$¥]/g, "").replace(/[^\d.\-].*$/, ""));
  return isNaN(n) ? 0 : n;
};
const str = (v: string) => String(v ?? "").replace(/\r?\n/g, " ").trim();

// 扩展城市坐标（真实地理中心，覆盖常见美国城市，供导入补全）
const EXTRA_CITIES: Record<string, [number, number]> = {
  "houston": [-95.37, 29.76], "miami": [-80.19, 25.76], "el paso": [-106.49, 31.76],
  "san diego": [-117.16, 32.72], "phoenix": [-112.07, 33.45], "columbus": [-83.0, 39.96],
  "nashua": [-71.46, 42.76], "edinburg": [-98.16, 26.3], "princeton": [-74.66, 40.36],
  "gainesville": [-82.32, 29.65], "dallas": [-96.8, 32.78], "silver spring": [-77.02, 39.0],
  "granada hills": [-118.52, 34.26], "saint paul": [-93.09, 44.95], "durham": [-78.9, 35.99],
  "baton rouge": [-91.19, 30.45], "charlotte": [-80.84, 35.23], "chester": [-75.36, 39.84],
  "bossier city": [-93.55, 32.53], "milwaukee": [-87.91, 43.04], "brooklyn": [-73.94, 40.68],
  "nogales": [-110.96, 31.34], "el centro": [-115.57, 32.79], "camp verde": [-111.85, 34.56],
  "hemet": [-117.07, 33.75], "hialeah": [-80.29, 25.82], "washington": [-77.04, 38.9],
  "ridgefield park": [-74.01, 40.86], "jacksonville": [-81.66, 30.33], "sylvania": [-83.7, 41.71],
  "los angeles": [-118.24, 34.05], "new york": [-74.01, 40.71], "chicago": [-87.63, 41.88],
  "san francisco": [-122.42, 37.77], "seattle": [-122.33, 47.61], "denver": [-104.99, 39.74],
  "atlanta": [-84.39, 33.75], "boston": [-71.06, 42.36], "las vegas": [-115.14, 36.17],
  "orlando": [-81.38, 28.54], "tampa": [-82.46, 27.95], "philadelphia": [-75.17, 39.95],
  "san antonio": [-98.49, 29.42], "austin": [-97.74, 30.27], "fort worth": [-97.33, 32.73],
  "detroit": [-83.05, 42.33], "minneapolis": [-93.27, 44.98], "portland": [-122.68, 45.52],
  "sacramento": [-121.49, 38.58], "kansas city": [-94.58, 39.1], "cleveland": [-81.69, 41.5],
  "pittsburgh": [-80.0, 40.44], "baltimore": [-76.61, 39.29], "newark": [-74.17, 40.74],
  "irvine": [-117.82, 33.69], "ontario": [-117.65, 34.06], "fontana": [-117.42, 34.09],
  "corona": [-117.57, 33.88], "riverside": [-117.4, 33.98], "santa ana": [-117.87, 33.75],
  "anaheim": [-117.91, 33.84], "long beach": [-118.19, 33.77], "oakland": [-122.27, 37.8],
  "fresno": [-119.79, 36.74], "bakersfield": [-119.02, 35.37], "tucson": [-110.97, 32.22],
  "albuquerque": [-106.65, 35.08], "memphis": [-90.05, 35.15], "nashville": [-86.78, 36.17],
  "louisville": [-85.76, 38.25], "oklahoma city": [-97.52, 35.47], "omaha": [-95.94, 41.26],
  "wichita": [-97.34, 37.69], "tulsa": [-95.99, 36.15], "honolulu": [-157.86, 21.31],
  "edison": [-74.24, 40.52], "jersey city": [-74.08, 40.73], "paterson": [-74.17, 40.92],
  "new haven": [-72.93, 41.31], "hartford": [-72.68, 41.76], "providence": [-71.41, 41.82],
};

// 美国州名/缩写 → 州中心坐标（兜底，保证订单能落到大致正确的区域）
const US_STATES: Record<string, [number, number]> = {
  "al":[-86.8,32.8],"ak":[-152.4,64.2],"az":[-111.7,34.0],"ar":[-92.4,34.8],"ca":[-119.7,37.2],
  "co":[-105.5,39.0],"ct":[-72.7,41.6],"de":[-75.5,39.0],"fl":[-81.5,28.6],"ga":[-83.4,32.6],
  "hi":[-157.5,20.3],"id":[-114.7,44.4],"il":[-89.0,40.0],"in":[-86.3,40.3],"ia":[-93.5,42.0],
  "ks":[-98.4,38.5],"ky":[-85.3,37.8],"la":[-92.5,31.1],"me":[-69.2,45.3],"md":[-76.7,39.0],
  "ma":[-71.8,42.3],"mi":[-85.6,44.3],"mn":[-94.7,46.0],"ms":[-89.4,32.7],"mo":[-92.5,38.4],
  "mt":[-111.7,47.0],"ne":[-99.8,41.5],"nv":[-116.6,39.3],"nh":[-71.6,43.2],"nj":[-74.7,40.2],
  "nm":[-106.1,34.5],"ny":[-75.5,43.0],"nc":[-79.4,35.8],"nd":[-100.5,47.5],"oh":[-82.9,40.3],
  "ok":[-97.5,35.5],"or":[-120.6,43.9],"pa":[-77.8,41.2],"ri":[-71.5,41.7],"sc":[-81.2,33.9],
  "sd":[-99.9,44.4],"tn":[-86.6,35.5],"tx":[-99.9,31.5],"ut":[-111.1,39.3],"vt":[-72.6,44.6],
  "va":[-78.7,37.5],"wa":[-120.4,47.4],"wv":[-80.5,38.6],"wi":[-89.7,44.6],"wy":[-107.6,43.0],
  "california":[-119.7,37.2],"texas":[-99.9,31.5],"florida":[-81.5,28.6],"new york":[-75.5,43.0],
  "washington":[-120.4,47.4],"illinois":[-89.0,40.0],"georgia":[-83.4,32.6],"arizona":[-111.7,34.0],
  "new jersey":[-74.7,40.2],"massachusetts":[-71.8,42.3],"pennsylvania":[-77.8,41.2],
  "virginia":[-78.7,37.5],"north carolina":[-79.4,35.8],"south carolina":[-81.2,33.9],
  "michigan":[-85.6,44.3],"ohio":[-82.9,40.3],"indiana":[-86.3,40.3],"wisconsin":[-89.7,44.6],
  "minnesota":[-94.7,46.0],"missouri":[-92.5,38.4],"tennessee":[-86.6,35.5],"alabama":[-86.8,32.8],
  "louisiana":[-92.5,31.1],"arkansas":[-92.4,34.8],"mississippi":[-89.4,32.7],"kentucky":[-85.3,37.8],
  "colorado":[-105.5,39.0],"oregon":[-120.6,43.9],"nevada":[-116.6,39.3],"utah":[-111.1,39.3],
  "connecticut":[-72.7,41.6],"maryland":[-76.7,39.0],"maine":[-69.2,45.3],"new hampshire":[-71.6,43.2],
  "rhode island":[-71.5,41.7],"vermont":[-72.6,44.6],"delaware":[-75.5,39.0],"idaho":[-114.7,44.4],
  "montana":[-111.7,47.0],"wyoming":[-107.6,43.0],"north dakota":[-100.5,47.5],"south dakota":[-99.9,44.4],
  "nebraska":[-99.8,41.5],"kansas":[-98.4,38.5],"oklahoma":[-97.5,35.5],"iowa":[-93.5,42.0],
  "new mexico":[-106.1,34.5],"hawaii":[-157.5,20.3],"alaska":[-152.4,64.2],"west virginia":[-80.5,38.6],
};

// 国家中心坐标（最后兜底）
const COUNTRY_CENTER: Record<string, [number, number]> = {
  "US":[-98.5,39.8], "CA":[-106.3,56.1], "GB":[-2.5,54.0], "DE":[10.4,51.2],
  "FR":[2.2,46.6], "JP":[138.0,37.0], "AU":[134.5,-25.3], "CN":[104.2,35.9],
};

// 城市名 → 经纬度（真实城市库 + 扩展库 + 州/国家兜底）
function cityCoord(city: string, country?: string, state?: string): { lng: number; lat: number } | null {
  const c = str(city).toLowerCase();
  // 1) 精确匹配内置城市库
  const hit = CITIES.find((x) =>
    x.nameEn.toLowerCase() === c || x.name === str(city) ||
    (x.nameEn.toLowerCase().includes(c) && c.length >= 4) ||
    (x.name.includes(str(city)) && str(city).length >= 2)
  );
  if (hit) return { lng: hit.lng, lat: hit.lat };
  // 2) 扩展美国城市库
  if (EXTRA_CITIES[c]) return { lng: EXTRA_CITIES[c][0], lat: EXTRA_CITIES[c][1] };
  // 部分匹配（如 "GRANADA HILLS CA"）
  for (const [name, coord] of Object.entries(EXTRA_CITIES)) {
    if (c.includes(name) || name.includes(c) && c.length >= 5) return { lng: coord[0], lat: coord[1] };
  }
  // 3) 州兜底：精确匹配（缩写/全称），再做受限的包含匹配
  if (state) {
    const s = str(state).toLowerCase().trim();
    if (US_STATES[s]) return { lng: US_STATES[s][0], lat: US_STATES[s][1] };
    // 全称匹配：key 长度>=4 才做包含，避免 "in"/"al" 等缩写误命中
    for (const [k, v] of Object.entries(US_STATES)) {
      if (k.length >= 4 && (s.includes(k) || k.includes(s)) && s.length >= 3) return { lng: v[0], lat: v[1] };
    }
    // 两字母缩写：仅当 state 恰好是2字母时已上面精确匹配，这里不再模糊匹配
  }
  // 4) 国家兜底
  const cc = str(country || "").toUpperCase();
  if (COUNTRY_CENTER[cc]) return { lng: COUNTRY_CENTER[cc][0], lat: COUNTRY_CENTER[cc][1] };
  return null;
}

// 平台标准化
const normalizePlatform = (v: string): string => {
  const s = str(v).toLowerCase();
  if (s.includes("amazon") || s.includes("亚马逊")) return "Amazon";
  if (s.includes("ebay")) return "eBay";
  if (s.includes("tiktok") || s.includes("抖音")) return "TikTok Shop";
  if (s.includes("walmart")) return "Walmart";
  if (s.includes("temu")) return "Temu";
  if (s.includes("独立站") || s.includes("shopify")) return "独立站";
  return str(v) || "其他";
};

// 出库单状态 → 订单状态
const normalizeOrderStatus = (v: string): string => {
  const s = str(v);
  if (s.includes("派送完成") || s.includes("妥投")) return "已签收";
  if (s.includes("出库完成") || s.includes("出库确认") || s.includes("拣选完成")) return "已发货";
  if (s.includes("派送中") || s.includes("运输")) return "运输中";
  if (s.includes("作废")) return "异常";
  if (s.includes("草稿")) return "待发货";
  return s || "待发货";
};

// 海运状态
const normalizeShipStatus = (v: string): string => {
  const s = str(v);
  if (s.includes("延误")) return "延误";
  if (s.includes("到港") || s.includes("签收")) return "已到港";
  if (s.includes("清关")) return "清关中";
  return s || "在途";
};

// ============ 各实体的映射规则 ============
export const FIELD_RULES: Record<EntityKey, FieldRule[]> = {
  orders: [
    // id：优先用用户填的"订单ID"；没有时用订单号兜底（保证唯一且不丢用户数据）
    { key: "id", alias: ["订单ID", "id", "ID", "记录ID"], convert: (v) => str(v) },
    { key: "orderNo", alias: ["卖家订单号", "订单号", "平台订单号", "平台订单号/订单参考号", "订单编号", "orderNo", "order no"], convert: (v) => str(v) },
    { key: "platform", alias: ["电商平台", "平台", "platform", "订单来源平台"], convert: normalizePlatform },
    { key: "skuId", alias: ["商品编码", "sku", "sku编码", "商品编号"], convert: (v) => str(v) },
    { key: "qty", alias: ["总单品数（实际）", "总单品数(实际)", "数量", "件数", "qty"], convert: num },
    { key: "amount", alias: ["实际金额(总)", "预计金额(总)", "金额", "订单金额", "amount"], convert: num },
    { key: "weight", alias: ["重量(kg)", "重量", "包裹重量", "weight", "注册重量(kg)"], convert: num },
    { key: "status", alias: ["出库单状态", "包裹状态", "派送状态", "订单状态", "status"], convert: normalizeOrderStatus },
    { key: "city", alias: ["城市", "收货城市", "city"], convert: (v) => str(v) },
    { key: "state", alias: ["省份/州", "州/省", "州", "省", "state"], convert: (v) => str(v) },
    { key: "country", alias: ["国家", "国家/地区", "country"], convert: (v) => str(v) || "美国" },
    { key: "countryCode", alias: ["国家代码", "countryCode", "国家编码"], convert: (v) => str(v).toUpperCase() },
    { key: "zip", alias: ["邮编", "邮政编码", "zip", "zipcode", "postal code"], convert: (v) => str(v) },
    { key: "lng", alias: ["经度", "lng", "longitude"], convert: num },
    { key: "lat", alias: ["纬度", "lat", "latitude"], convert: num },
    { key: "date", alias: ["出库时间(当地)", "提交时间", "下单时间", "订单日期", "日期", "date"], convert: (v) => str(v).slice(0, 10).replace(/\//g, "-") },
    { key: "warehouseId", alias: ["出货仓库", "下单仓库", "仓库", "履约仓"], convert: (v) => str(v) },
    { key: "returnRisk", alias: ["退货风险", "returnRisk"], convert: num },
    { key: "commission", alias: ["平台佣金", "佣金", "commission"], convert: num },
    { key: "firstMile", alias: ["头程运费", "头程", "头程费用", "firstMile"], convert: num },
    { key: "lastMile", alias: ["尾程运费", "尾程", "尾程费用", "运费", "lastMile"], convert: num },
    { key: "returnLoss", alias: ["退货损耗", "退货损失", "returnLoss"], convert: num },
    { key: "otherCost", alias: ["其他费用", "其他成本", "otherCost"], convert: num },
  ],
  inventory: [
    { key: "id", alias: ["记录ID", "库存ID", "id", "ID"], convert: (v) => str(v) },
    { key: "warehouseId", alias: ["仓库ID", "仓库", "仓库编码", "warehouse", "仓库代码"], convert: (v) => str(v) },
    { key: "skuId", alias: ["SKU ID", "skuid", "商品编号", "商品编码", "sku"], convert: (v) => str(v) },
    { key: "available", alias: ["可售", "可用库存", "可用", "available"], convert: num },
    { key: "reserved", alias: ["待出库", "销售预留冻结", "预留", "reserved"], convert: num },
    { key: "total", alias: ["在库库存", "总库存", "库存总量", "total"], convert: num },
    { key: "safetyStock", alias: ["安全库存", "safetyStock"], convert: num },
    { key: "ageDays", alias: ["库龄", "库龄(天)", "ageDays"], convert: num },
  ],
  skus: [
    // id：SKU 主标识。全应用按 s.id === order.skuId 关联，所以模板"SKU ID"列必须进 id。
    { key: "id", alias: ["SKU ID", "skuid", "商品ID", "id", "ID"], convert: (v) => str(v) },
    { key: "sku", alias: ["SKU编码", "商品编码", "商品编号", "sku编码", "sku"], convert: (v) => str(v) },
    { key: "name", alias: ["中文名称", "商品名称", "名称", "name"], convert: (v) => str(v) },
    { key: "category", alias: ["货物物理形态", "件型", "类目", "分类", "category"], convert: (v) => str(v) },
    { key: "price", alias: ["出口申报价值", "进口申报价值", "海关建议申报价值(USD)", "售价", "price"], convert: num },
    { key: "cost", alias: ["采购成本", "采购价", "成本", "cost"], convert: num },
    { key: "weight", alias: ["注册重量(kg)", "确认重量(kg)", "重量(kg)", "重量", "weight"], convert: num },
  ],
  containers: [
    { key: "id", alias: ["集装箱ID", "记录ID", "id", "ID"], convert: (v) => str(v) },
    { key: "containerNo", alias: ["柜号", "集装箱号", "containerNo", "箱号"], convert: (v) => str(v) },
    { key: "originPort", alias: ["起运港", "装货港", "originPort"], convert: (v) => str(v) },
    { key: "destPort", alias: ["目的港", "卸货港", "destPort"], convert: (v) => str(v) },
    { key: "destCountry", alias: ["目的国家", "国家", "destCountry"], convert: (v) => str(v) },
    { key: "status", alias: ["状态", "运输状态", "status"], convert: normalizeShipStatus },
    { key: "progress", alias: ["在途进度", "progress"], convert: num },
    { key: "etd", alias: ["ETD", "发货日", "预计离港", "etd"], convert: (v) => str(v).slice(0, 10) },
    { key: "eta", alias: ["ETA", "到港日", "预计到港", "eta"], convert: (v) => str(v).slice(0, 10) },
    { key: "cargoValue", alias: ["货值", "货值金额", "cargoValue"], convert: num },
    { key: "volume", alias: ["体积(CBM)", "体积", "volume"], convert: num },
    { key: "skuCount", alias: ["SKU数", "品名数", "skuCount"], convert: num },
  ],
  priceCards: [
    { key: "carrier", alias: ["服务商", "承运商", "快递公司", "carrier"], convert: (v) => str(v) || "其他" },
    { key: "country", alias: ["国家", "country"], convert: (v) => str(v) },
    { key: "state", alias: ["州", "州/省", "state"], convert: (v) => str(v) },
    { key: "zipFrom", alias: ["邮编起", "邮编开始", "zipFrom"], convert: (v) => str(v) },
    { key: "zipTo", alias: ["邮编止", "邮编结束", "zipTo"], convert: (v) => str(v) },
    { key: "weightFrom", alias: ["重量起", "重量起(kg)", "weightFrom"], convert: num },
    { key: "weightTo", alias: ["重量止", "重量止(kg)", "weightTo"], convert: num },
    { key: "price", alias: ["运费", "价格", "price"], convert: num },
    { key: "fuelSurcharge", alias: ["燃油附加费", "燃油", "fuelSurcharge"], convert: num },
    { key: "deliveryDays", alias: ["派送时效", "时效", "时效(天)", "deliveryDays"], convert: num },
    { key: "effectiveDate", alias: ["生效日期", "生效日", "effectiveDate"], convert: (v) => str(v).slice(0, 10) },
  ],
  alerts: [
    { key: "id", alias: ["预警ID", "记录ID", "id", "ID"], convert: (v) => str(v) },
    { key: "title", alias: ["标题", "预警标题", "title"], convert: str },
    { key: "detail", alias: ["详情", "描述", "detail"], convert: str },
    { key: "type", alias: ["类型", "预警类型", "type"], convert: (v) => str(v) || "库存" },
    { key: "level", alias: ["级别", "等级", "level"], convert: str },
    { key: "time", alias: ["时间", "time"], convert: str },
  ],
  warehouses: [
    { key: "id", alias: ["仓库ID", "id", "ID", "记录ID"], convert: (v) => str(v) },
    { key: "name", alias: ["仓库名称", "仓库", "名称", "name"], convert: (v) => str(v).replace(/\s*Warehouse\s*/i, "").trim() },
    { key: "code", alias: ["仓库编码", "仓库代码", "code", "仓库"], convert: (v) => str(v).replace(/\s*Warehouse\s*/i, "").trim() },
    { key: "country", alias: ["国家", "country"], convert: (v) => str(v) || "美国" },
    { key: "state", alias: ["州", "州/省", "state"], convert: str },
    { key: "city", alias: ["城市", "city"], convert: str },
    { key: "lng", alias: ["经度", "lng"], convert: num },
    { key: "lat", alias: ["纬度", "lat"], convert: num },
    { key: "capacity", alias: ["总库容", "容量", "capacity"], convert: num },
    { key: "used", alias: ["已用库容", "已用", "used"], convert: num },
  ],
};

// ============ 通用导入：二维数组 → 实体记录 ============
export interface MappingResult {
  records: Record<string, any>[];
  matched: Record<string, string>;   // 系统字段 → 匹配到的真实列名
  unmatched: string[];               // 未能映射的系统字段
}

export function mapRows(
  entity: EntityKey, headers: string[], rows: string[][], startId = 1,
  override?: Record<string, string> // 用户自定义：系统字段 → 真实列名（空字符串=不读取）
): MappingResult {
  const rules = FIELD_RULES[entity];
  const headerClean = headers.map(clean);
  const matched: Record<string, string> = {};
  const colIndex: Record<string, number> = {};

  // 为每个系统字段找最佳匹配列：两轮 + 列独占，避免短 alias 抢占长表头（如"平台"抢走"平台佣金"）
  const usedCols = new Set<number>();
  const findExact = (aliases: string[]): number => {
    for (const alias of aliases) {
      const ca = clean(alias);
      if (!ca) continue;
      const idx = headerClean.findIndex((h, j) => h === ca && !usedCols.has(j));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  // 模糊：只在 alias 足够长(>=3 字符)且表头包含 alias 时命中；不反向用短表头匹配长 alias
  const findFuzzy = (aliases: string[]): number => {
    for (const alias of aliases) {
      const ca = clean(alias);
      if (ca.length < 3) continue;
      const idx = headerClean.findIndex((h, j) => !usedCols.has(j) && h && (h.includes(ca) || ca.includes(h) && h.length >= 3));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  // 第一轮：所有字段精确匹配（id/关键字段优先，防被抢占）
  const priority = ["id", "orderNo", "skuId", "sku", "warehouseId", "containerNo"];
  const ordered = [...rules].sort((a, b) => {
    const ai = priority.indexOf(a.key), bi = priority.indexOf(b.key);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  ordered.forEach((rule) => {
    const idx = findExact(rule.alias);
    if (idx >= 0) { matched[rule.key] = headers[idx]; colIndex[rule.key] = idx; usedCols.add(idx); }
  });
  // 第二轮：未匹配的字段做严格模糊匹配
  ordered.forEach((rule) => {
    if (colIndex[rule.key] !== undefined) return;
    const idx = findFuzzy(rule.alias);
    if (idx >= 0) { matched[rule.key] = headers[idx]; colIndex[rule.key] = idx; usedCols.add(idx); }
  });
  // 用户覆盖优先（可解除列独占重新指定）
  if (override) {
    rules.forEach((rule) => {
      if (!(rule.key in override)) return;
      const col = override[rule.key];
      if (!col) {
        if (colIndex[rule.key] !== undefined) usedCols.delete(colIndex[rule.key]);
        delete matched[rule.key]; delete colIndex[rule.key]; return;
      }
      const idx = headers.indexOf(col);
      if (idx >= 0) {
        if (colIndex[rule.key] !== undefined && colIndex[rule.key] !== idx) usedCols.delete(colIndex[rule.key]);
        matched[rule.key] = col; colIndex[rule.key] = idx; usedCols.add(idx);
      }
    });
  }
  const unmatched = rules.filter((r) => colIndex[r.key] === undefined).map((r) => r.key);

  const records = rows.map((row, i) => {
    // 先构造原始行（列名→值），供转换函数交叉引用
    const raw: Record<string, string> = {};
    headers.forEach((h, j) => { raw[h] = row[j] ?? ""; });

    const rec: Record<string, any> = {};
    rules.forEach((rule) => {
      const idx = colIndex[rule.key];
      const v = idx !== undefined ? (row[idx] ?? "") : "";
      rec[rule.key] = rule.convert ? rule.convert(v, raw) : str(v);
    });

    // ID：优先用户填的 ID 列（已走 alias 匹配）；否则用业务主键兜底，最后才系统生成。
    // 关键：SKU 主数据无显式 ID 时用 sku 编码作 id —— 全应用按 s.id === order.skuId 关联，
    // 这样订单/库存的 skuId（=商品编码）才能对上 SKU 主数据。
    if (!rec.id) {
      if (entity === "skus" && rec.sku) rec.id = rec.sku;
      else if (entity === "orders" && rec.orderNo) rec.id = rec.orderNo;
      else if (entity === "containers" && rec.containerNo) rec.id = rec.containerNo;
      else if (entity === "inventory" && rec.skuId) rec.id = `${rec.warehouseId || "wh"}_${rec.skuId}_${startId + i}`;
      else rec.id = raw["id"] || `${entity}-${Date.now()}-${startId + i}`;
    }

    // 经纬度补全（订单/仓库）：地理智能解析——按 州字段/邮编→州中心，不再逐单猜城市坐标
    if ((entity === "orders" || entity === "warehouses") && (!rec.lng || !rec.lat)) {
      const coord = cityCoord(rec.city || rec.name, rec.country, rec.state);
      if (coord) { rec.lng = coord.lng; rec.lat = coord.lat; }
      else { rec.lng = 0; rec.lat = 0; }
    }

    // 订单：地理归一化（state 存英文全称与 GeoJSON 匹配；stateAbbr/center 供聚合；缺州用邮编补）
    if (entity === "orders") {
      const geo = resolveGeo({
        country: rec.country, countryCode: rec.countryCode, state: rec.state,
        city: rec.city, zip: rec.zip, lng: rec.lng, lat: rec.lat,
      });
      rec.countryCode = geo.countryCode;
      rec.country = geo.country;
      rec.state = geo.state || stateFullName(rec.state) || rec.state; // 英文全称
      rec.stateAbbr = geo.stateAbbr;
      rec.zip = rec.zip || "";
      // 坐标：用解析出的地理中心（州中心/国家中心），避免 0,0 与错误城市点
      rec.lng = geo.center[0]; rec.lat = geo.center[1];
      rec.geoSource = geo.source;
      rec.returnRisk = rec.returnRisk || 0;
      rec.qty = rec.qty || 1;
    }
    // 库存补 total
    if (entity === "inventory" && !rec.total) rec.total = (rec.available || 0) + (rec.reserved || 0);
    // 海运默认字段
    if (entity === "containers") {
      rec.items = rec.items || [];
      rec.skuCount = rec.skuCount || 0;
      rec.progress = rec.progress || 0;
    }
    // 价卡默认版本
    if (entity === "priceCards") rec.version = rec.version || "v1.0";
    // 仓库默认健康状态
    if (entity === "warehouses") {
      rec.health = raw["health"] || "healthy";
      rec.skuCount = rec.skuCount || 0;
      rec.dailyOutbound = rec.dailyOutbound || 0;
      rec.capacity = rec.capacity || 0;
      rec.used = rec.used || 0;
      rec.code = rec.code || rec.name;
      rec.countryCode = rec.countryCode || (rec.country === "美国" ? "US" : "");
    }
    // SKU 默认
    if (entity === "skus") rec.image = raw["image"] || "📦";

    return rec;
  });

  return { records, matched, unmatched };
}

// ============ 智能识别：根据表头自动判断文件属于哪个实体 ============
// 返回按匹配度排序的候选实体；第一项即最佳猜测
export function detectEntity(headers: string[]): { entity: EntityKey; score: number; hit: string[] }[] {
  const hc = headers.map(clean).filter(Boolean);
  const scores: { entity: EntityKey; score: number; hit: string[] }[] = [];
  (Object.keys(FIELD_RULES) as EntityKey[]).forEach((entity) => {
    const hit: string[] = [];
    let score = 0;
    FIELD_RULES[entity].forEach((rule) => {
      rule.alias.forEach((alias) => {
        const ca = clean(alias);
        if (ca.length < 2) return;
        const found = hc.some((h) => h === ca || (h.includes(ca) && ca.length >= 3) || (ca.includes(h) && h.length >= 3));
        if (found) { score += rule.key === "id" ? 0.5 : 1; hit.push(rule.key); }
      });
    });
    // 实体标志性列加权
    const must: Record<EntityKey, string[]> = {
      orders: ["orderno", "平台订单号", "卖家订单号", "出库单状态", "实际金额"],
      inventory: ["可用库存", "在库库存", "商品编号", "仓库"],
      skus: ["商品编码", "注册重量", "中文名称", "出口申报价值"],
      containers: ["柜号", "集装箱号", "起运港", "目的港"],
      warehouses: ["总库容", "仓库编码", "经度", "纬度"],
      priceCards: ["尾程", "派送时效", "运费", "服务商", "zipfrom", "重量起"],
      alerts: ["预警", "异常", "级别"],
    };
    (must[entity] || []).forEach((m) => { if (hc.some((h) => h.includes(clean(m)))) score += 2; });
    scores.push({ entity, score, hit: Array.from(new Set(hit)) });
  });
  return scores.sort((a, b) => b.score - a.score);
}
