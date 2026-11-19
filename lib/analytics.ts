import type { Order, Sku, InventoryItem, Container } from "./types";
import type { CostRates } from "./store";

// ============ 利润核算 ============
// 规则：优先用订单上录入的真实费用；未录入时若费用率>0 则按货值估算，并标记 estimated
export interface ProfitRow {
  order: Order;
  revenue: number;      // 销售额
  goodsCost: number;    // 商品成本
  commission: number;   // 平台佣金
  firstMile: number;    // 头程
  lastMile: number;     // 尾程
  returnLoss: number;   // 退货损耗
  other: number;        // 其他
  cost: number;         // 总成本
  profit: number;       // 毛利
  margin: number;       // 毛利率 %
  estimated: boolean;   // 是否含估算费用
}

export function calcOrderProfit(order: Order, sku: Sku | undefined, rates: CostRates): ProfitRow {
  const revenue = order.amount || 0;
  const qty = order.qty || 1;
  const hasSkuCost = !!sku && (sku.cost || 0) > 0;
  const goodsCost = hasSkuCost ? (sku!.cost || 0) * qty : 0;

  const explicit = (v: number | undefined) => typeof v === "number" && v > 0;
  const commission = explicit(order.commission) ? order.commission! : revenue * (rates.commissionRate || 0) / 100;
  const firstMile = explicit(order.firstMile) ? order.firstMile! : revenue * (rates.firstMileRate || 0) / 100;
  const lastMile = explicit(order.lastMile) ? order.lastMile! : revenue * (rates.lastMileRate || 0) / 100;
  const returnLoss = explicit(order.returnLoss) ? order.returnLoss! : revenue * (rates.returnRate || 0) / 100;
  const other = explicit(order.otherCost) ? order.otherCost! : revenue * (rates.otherRate || 0) / 100;
  const cost = goodsCost + commission + firstMile + lastMile + returnLoss + other;
  const profit = revenue - cost;
  const margin = revenue > 0 ? profit / revenue * 100 : 0;
  const estimated = !hasSkuCost || (!explicit(order.commission) && (rates.commissionRate || 0) > 0)
    || (!explicit(order.firstMile) && (rates.firstMileRate || 0) > 0)
    || (!explicit(order.lastMile) && (rates.lastMileRate || 0) > 0)
    || (!explicit(order.returnLoss) && (rates.returnRate || 0) > 0)
    || (!explicit(order.otherCost) && (rates.otherRate || 0) > 0);
  return { order, revenue, goodsCost, commission, firstMile, lastMile, returnLoss, other, cost, profit, margin, estimated };
}

export function calcProfit(orders: Order[], skus: Sku[], rates: CostRates): ProfitRow[] {
  const map = new Map(skus.map((s) => [s.id, s]));
  return orders.map((o) => calcOrderProfit(o, map.get(o.skuId), rates));
}

export function sumProfit(rows: ProfitRow[]) {
  const t = rows.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, goodsCost: a.goodsCost + r.goodsCost,
    commission: a.commission + r.commission, firstMile: a.firstMile + r.firstMile,
    lastMile: a.lastMile + r.lastMile, returnLoss: a.returnLoss + r.returnLoss,
    other: a.other + r.other, cost: a.cost + r.cost, profit: a.profit + r.profit,
  }), { revenue: 0, goodsCost: 0, commission: 0, firstMile: 0, lastMile: 0, returnLoss: 0, other: 0, cost: 0, profit: 0 });
  return { ...t, margin: t.revenue > 0 ? t.profit / t.revenue * 100 : 0, estimated: rows.some((r) => r.estimated) };
}

// ============ 库存周转与补货 ============
export interface TurnoverRow {
  key: string;
  skuId: string;
  skuName: string;
  warehouseId: string;
  warehouseName: string;
  available: number;
  reserved: number;
  safetyStock: number;
  ageDays: number;
  sold30d: number;       // 近30天销量
  dailySales: number;    // 日均销量
  daysCover: number;     // 可售天数
  inTransit: number;     // 在途数量
  suggest: number;       // 建议补货量
  status: "断货风险" | "库存偏低" | "健康" | "滞销";
}

export function calcTurnover(
  inventory: InventoryItem[], skus: Sku[], warehouses: { id: string; name: string }[],
  orders: Order[], containers: Container[], coverDays = 30, leadDays = 30
): TurnoverRow[] {
  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const whMap = new Map(warehouses.map((w) => [w.id, w.name]));
  const now = Date.now();
  const d30 = now - 30 * 86400000;
  // 近30天按 SKU 销量（全局），按仓库履约分配
  const soldBySku: Record<string, number> = {};
  const soldByWhSku: Record<string, number> = {};
  orders.forEach((o) => {
    const t = o.date ? new Date(o.date).getTime() : 0;
    if (t < d30) return;
    const q = o.qty || 1;
    soldBySku[o.skuId] = (soldBySku[o.skuId] || 0) + q;
    if (o.warehouseId) soldByWhSku[`${o.warehouseId}_${o.skuId}`] = (soldByWhSku[`${o.warehouseId}_${o.skuId}`] || 0) + q;
  });
  // 在途（按 SKU 汇总）
  const transitBySku: Record<string, number> = {};
  containers.forEach((c) => (c.items || []).forEach((it) => {
    if (c.status !== "已到港") transitBySku[it.skuId] = (transitBySku[it.skuId] || 0) + (it.qty || 0);
  }));

  return inventory.map((inv) => {
    const sold30d = soldByWhSku[`${inv.warehouseId}_${inv.skuId}`] ?? soldBySku[inv.skuId] ?? 0;
    const dailySales = sold30d / 30;
    const usable = Math.max(0, inv.available - inv.reserved);
    const daysCover = dailySales > 0 ? usable / dailySales : (usable > 0 ? 999 : 0);
    const inTransit = transitBySku[inv.skuId] || 0;
    const target = dailySales * (coverDays + leadDays) + inv.safetyStock;
    const suggest = Math.max(0, Math.round(target - usable - inTransit));
    let status: TurnoverRow["status"];
    if (dailySales > 0 && daysCover < leadDays * 0.5) status = "断货风险";
    else if (dailySales > 0 && daysCover < leadDays) status = "库存偏低";
    else if (dailySales === 0 && inv.ageDays > 90) status = "滞销";
    else status = "健康";
    return {
      key: `${inv.warehouseId}_${inv.skuId}`,
      skuId: inv.skuId,
      skuName: skuMap.get(inv.skuId)?.name || inv.skuId,
      warehouseId: inv.warehouseId,
      warehouseName: whMap.get(inv.warehouseId) || inv.warehouseId,
      available: inv.available, reserved: inv.reserved, safetyStock: inv.safetyStock, ageDays: inv.ageDays || 0,
      sold30d, dailySales: +dailySales.toFixed(1), daysCover: daysCover >= 999 ? 999 : +daysCover.toFixed(1),
      inTransit, suggest, status,
    };
  }).sort((a, b) => a.daysCover - b.daysCover);
}

// ============ 趋势与目标 ============
export function monthKey(date: string): string { return (date || "").slice(0, 7); }

export interface TrendPoint { key: string; label: string; sales: number; orders: number; profit?: number; }

export function trendBy(orders: Order[], grain: "day" | "week" | "month", profitMap?: Map<string, number>): TrendPoint[] {
  const bucket = (d: string) => {
    const date = new Date(d);
    if (isNaN(date.getTime())) return monthKey(d) || "未知";
    if (grain === "month") return monthKey(d);
    if (grain === "day") return d.slice(0, 10);
    // ISO 周
    const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  };
  const m = new Map<string, TrendPoint>();
  orders.forEach((o) => {
    const k = bucket(o.date);
    if (!m.has(k)) m.set(k, { key: k, label: k.slice(5), sales: 0, orders: 0, profit: 0 });
    const p = m.get(k)!;
    p.sales += o.amount || 0;
    p.orders += 1;
    if (profitMap) p.profit = (p.profit || 0) + (profitMap.get(o.id) || 0);
  });
  return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function platformBreakdown(orders: Order[]) {
  const m = new Map<string, { sales: number; orders: number }>();
  orders.forEach((o) => {
    if (!m.has(o.platform)) m.set(o.platform, { sales: 0, orders: 0 });
    const p = m.get(o.platform)!;
    p.sales += o.amount || 0; p.orders += 1;
  });
  return Array.from(m.entries()).map(([name, v]) => ({ name, value: Math.round(v.sales), orders: v.orders }))
    .sort((a, b) => b.value - a.value);
}
