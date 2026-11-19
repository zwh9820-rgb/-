import type { Order } from "./types";

// ============ 州名归一化：各种写法 → GeoJSON 中的英文全称 ============
const ABBR: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California", CO:"Colorado",
  CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho",
  IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi",
  MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey",
  NM:"New Mexico", NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota",
  TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming", DC:"District of Columbia",
};
const ZH: Record<string, string> = {
  "阿拉巴马州":"Alabama","阿拉斯加州":"Alaska","亚利桑那州":"Arizona","阿肯色州":"Arkansas",
  "加利福尼亚州":"California","加州":"California","科罗拉多州":"Colorado","康涅狄格州":"Connecticut",
  "特拉华州":"Delaware","佛罗里达州":"Florida","佛州":"Florida","佐治亚州":"Georgia",
  "夏威夷州":"Hawaii","爱达荷州":"Idaho","伊利诺伊州":"Illinois","伊州":"Illinois",
  "印第安纳州":"Indiana","艾奥瓦州":"Iowa","堪萨斯州":"Kansas","肯塔基州":"Kentucky",
  "路易斯安那州":"Louisiana","缅因州":"Maine","马里兰州":"Maryland","马萨诸塞州":"Massachusetts",
  "密歇根州":"Michigan","明尼苏达州":"Minnesota","密西西比州":"Mississippi","密苏里州":"Missouri",
  "蒙大拿州":"Montana","内布拉斯加州":"Nebraska","内华达州":"Nevada","新罕布什尔州":"New Hampshire",
  "新泽西州":"New Jersey","新墨西哥州":"New Mexico","纽约州":"New York","北卡罗来纳州":"North Carolina",
  "北达科他州":"North Dakota","俄亥俄州":"Ohio","俄克拉荷马州":"Oklahoma","俄勒冈州":"Oregon",
  "宾夕法尼亚州":"Pennsylvania","罗得岛州":"Rhode Island","南卡罗来纳州":"South Carolina",
  "南达科他州":"South Dakota","田纳西州":"Tennessee","德克萨斯州":"Texas","德州":"Texas",
  "犹他州":"Utah","佛蒙特州":"Vermont","弗吉尼亚州":"Virginia","华盛顿州":"Washington",
  "西弗吉尼亚州":"West Virginia","威斯康星州":"Wisconsin","怀俄明州":"Wyoming",
  "华盛顿哥伦比亚特区":"District of Columbia",
};
export function normalizeStateName(raw: string): string {
  const s = (raw || "").replace(/\r?\n/g, " ").trim();
  if (!s) return "";
  if (ZH[s]) return ZH[s];
  const up = s.toUpperCase();
  if (ABBR[up]) return ABBR[up];
  // 已是英文全称（大小写不敏感）
  const lower = s.toLowerCase();
  const hit = Object.values(ABBR).find((n) => n.toLowerCase() === lower);
  return hit || s;
}

// ============ 聚合 ============
export function aggregateByCountry(orders: Order[]): Record<string, { value: number; count: number }> {
  const m: Record<string, { value: number; count: number }> = {};
  orders.forEach((o) => {
    const cc = (o.countryCode || "").toUpperCase();
    if (!cc) return;
    if (!m[cc]) m[cc] = { value: 0, count: 0 };
    m[cc].value += o.amount || 0;
    m[cc].count += 1;
  });
  return m;
}
export function aggregateByState(orders: Order[]): Record<string, { value: number; count: number }> {
  const m: Record<string, { value: number; count: number }> = {};
  orders.forEach((o) => {
    const st = normalizeStateName(o.state || "");
    if (!st) return;
    if (!m[st]) m[st] = { value: 0, count: 0 };
    m[st].value += o.amount || 0;
    m[st].count += 1;
  });
  return m;
}

// ============ 给 GeoJSON 附加指标值 ============
export function attachCountryValues(geo: any, agg: Record<string, { value: number; count: number }>, metric: "count" | "value") {
  return {
    ...geo,
    features: geo.features.map((f: any) => {
      const cc = (f.properties?.iso2 || "").toUpperCase();
      const d = agg[cc];
      return { ...f, properties: { ...f.properties, _key: cc, _count: d?.count || 0, _value: d?.value || 0, _metric: metric === "count" ? (d?.count || 0) : (d?.value || 0) } };
    }),
  };
}
export function attachStateValues(geo: any, agg: Record<string, { value: number; count: number }>, metric: "count" | "value") {
  return {
    ...geo,
    features: geo.features.map((f: any) => {
      const name = f.properties?.name || "";
      const d = agg[name];
      return { ...f, properties: { ...f.properties, _key: name, _count: d?.count || 0, _value: d?.value || 0, _metric: metric === "count" ? (d?.count || 0) : (d?.value || 0) } };
    }),
  };
}

// ============ 计算要素中心点 ============
// 用球面向量平均（而非 bbox 平均）：跨日期变更线的国家（美国含阿留申、俄罗斯、斐济）
// 若用 bbox 会把东经/西经属地一并平均，中心落到地球反面（如美国算到法国）。
// 球面平均对所有顶点按单位向量求和再归一化，天然处理经度环绕。
// 同时对顶点做 3° 网格去重并按主岛聚类，避免偏远小岛把中心拉偏。
export function featureCenter(f: any): [number, number] | null {
  const g = f.geometry;
  if (!g) return null;

  // 收集所有坐标点
  const pts: [number, number][] = [];
  const walk = (c: any) => {
    if (typeof c[0] === "number") pts.push([c[0], c[1]]);
    else c.forEach(walk);
  };
  walk(g.coordinates);
  if (!pts.length) return null;

  // 网格去重（3°），减少密集顶点对平均的权重偏差
  const cell = new Map<string, [number, number]>();
  pts.forEach(([lng, lat]) => {
    const key = `${Math.round(lng / 3)}_${Math.round(lat / 3)}`;
    if (!cell.has(key)) cell.set(key, [lng, lat]);
  });
  const uniq = Array.from(cell.values());

  // 球面单位向量求和
  let x = 0, y = 0, z = 0;
  uniq.forEach(([lng, lat]) => {
    const la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
    const cl = Math.cos(la);
    x += cl * Math.cos(lo);
    y += cl * Math.sin(lo);
    z += Math.sin(la);
  });
  if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-9) {
    // 向量和接近 0（极端对称形状）时退回 bbox 中纬度的一个代表点
    return [uniq[0][0], uniq[0][1]];
  }
  const lng = Math.atan2(y, x) * 180 / Math.PI;
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
  return [lng, lat];
}

// ============ 颜色分级（5 档，从浅到深）============
export const CHOROPLETH_STEPS = [
  { max: 0, color: "rgba(148,163,184,0.08)" },
  { max: 1, color: "rgba(59,130,246,0.20)" },
  { max: 10, color: "rgba(59,130,246,0.42)" },
  { max: 100, color: "rgba(124,58,237,0.60)" },
  { max: 1000, color: "rgba(220,38,38,0.78)" },
  { max: Infinity, color: "rgba(153,27,27,0.92)" },
];
export function colorForValue(v: number): string {
  for (const s of CHOROPLETH_STEPS) if (v <= s.max) return s.color;
  return CHOROPLETH_STEPS[CHOROPLETH_STEPS.length - 1].color;
}
