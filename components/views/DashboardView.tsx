"use client";

import { useMemo } from "react";
import { RechartsWrapper } from "./charts";
import {
  DollarSign, ShoppingCart, Warehouse, Ship, AlertTriangle, TrendingUp, MapPin, Boxes,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { calcProfit, sumProfit, trendBy, platformBreakdown, calcTurnover, monthKey } from "@/lib/analytics";
import { Section, PlatformTag } from "./shared";

// 经营驾驶舱：一屏聚合销售/利润/库存/海运/预警，全部来自用户录入数据
export default function DashboardView({ onNavigate }: { onNavigate: (k: any) => void }) {
  const { orders, skus, inventory, warehouses, containers, alerts, costRates, alertRead } = useStore();

  const profit = useMemo(() => sumProfit(calcProfit(orders, skus, costRates)), [orders, skus, costRates]);
  const trend = useMemo(() => trendBy(orders, "week"), [orders]);
  const platforms = useMemo(() => platformBreakdown(orders), [orders]);
  const turnover = useMemo(() => calcTurnover(inventory, skus, warehouses, orders, containers), [inventory, skus, warehouses, orders, containers]);
  const unread = alerts.filter((a) => !(a.read || alertRead[a.id])).length;

  const countries = useMemo(() => {
    const m = new Map<string, { name: string; sales: number; orders: number }>();
    orders.forEach((o) => {
      const k = o.country || "未知";
      if (!m.has(k)) m.set(k, { name: k, sales: 0, orders: 0 });
      const x = m.get(k)!; x.sales += o.amount || 0; x.orders += 1;
    });
    return Array.from(m.values()).sort((a, b) => b.sales - a.sales).slice(0, 6);
  }, [orders]);

  const inTransit = containers.filter((c) => c.status !== "已到港").length;
  const stockHealth = inventory.filter((i) => i.available <= i.safetyStock).length;

  const bigKpis = [
    { label: "销售总额", value: `$${(profit.revenue / 1000).toFixed(1)}k`, sub: `${orders.length} 笔订单`, icon: DollarSign, color: "#3366ff", mod: "orders" },
    { label: "毛利", value: `$${(profit.profit / 1000).toFixed(1)}k`, sub: `毛利率 ${profit.margin.toFixed(1)}%`, icon: TrendingUp, color: profit.profit >= 0 ? "#059669" : "#ef4444", mod: "profit" },
    { label: "海外仓", value: String(warehouses.length), sub: `${skus.length} 个 SKU`, icon: Warehouse, color: "#7c3aed", mod: "inventory" },
    { label: "在途货柜", value: String(inTransit), sub: `${containers.length} 柜总计`, icon: Ship, color: "#0891b2", mod: "shipping" },
    { label: "待处理预警", value: String(unread), sub: `${stockHealth} 项库存偏低`, icon: AlertTriangle, color: "#f59e0b", mod: "alerts" },
  ];

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-[18px] font-bold">经营驾驶舱</h2>
          <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-3)" }}>一屏掌握销售、利润、仓网、海运与风险 · 全部来自你录入的真实数据</p>
        </div>
        <span className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)" }}>实时汇总</span>
      </div>

      {/* KPI 大卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        {bigKpis.map((k) => {
          const Icon = k.icon;
          return (
            <button key={k.label} className="card p-4 text-left hover:shadow-md transition-shadow" onClick={() => onNavigate(k.mod)}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11.5px]" style={{ color: "var(--text-2)" }}>{k.label}</span>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${k.color} 12%, transparent)`, color: k.color }}><Icon size={16} /></span>
              </div>
              <div className="text-[26px] font-bold leading-none tracking-tight">{k.value}</div>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>{k.sub}</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Section title="销售趋势" className="lg:col-span-2" extra={<button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => onNavigate("trend")}>详情 →</button>}>
          <RechartsWrapper type="area" data={trend} xKey="key" areas={[{ key: "sales", color: "#3366ff" }]} height={210} />
        </Section>
        <Section title="平台结构" extra={<button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => onNavigate("trend")}>详情 →</button>}>
          <RechartsWrapper type="pie" data={platforms} height={210} />
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Section title="国家销售排行" className="lg:col-span-1" extra={<button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => onNavigate("map")}>地图 →</button>}>
          <div className="space-y-2.5">
            {countries.length === 0 && <div className="py-8 text-center text-[12px]" style={{ color: "var(--text-3)" }}>暂无订单数据</div>}
            {countries.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: i < 3 ? "color-mix(in srgb, var(--brand) 15%, transparent)" : "var(--surface-2)", color: i < 3 ? "var(--brand)" : "var(--text-3)" }}>{i + 1}</span>
                <span className="text-[12px] flex-1 truncate">{c.name}</span>
                <span className="text-[12px] font-semibold">${(c.sales / 1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="库存风险 Top 6" className="lg:col-span-1" extra={<button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => onNavigate("inventory")}>详情 →</button>}>
          <div className="space-y-2.5">
            {turnover.slice(0, 6).map((r) => (
              <button key={r.key} className="w-full flex items-center gap-2 text-left" onClick={() => onNavigate("turnover")}>
                <Boxes size={13} style={{ color: r.status === "断货风险" ? "var(--red)" : "var(--text-3)" }} />
                <span className="text-[12px] flex-1 truncate">{r.skuName}</span>
                <span className="text-[11px]" style={{ color: r.daysCover < 15 ? "var(--red)" : "var(--text-3)" }}>{r.daysCover >= 999 ? "∞" : r.daysCover}天</span>
              </button>
            ))}
            {turnover.length === 0 && <div className="py-8 text-center text-[12px]" style={{ color: "var(--text-3)" }}>暂无库存数据</div>}
          </div>
        </Section>

        <Section title="最近预警" className="lg:col-span-1" extra={<button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => onNavigate("alerts")}>全部 →</button>}>
          <div className="space-y-2.5">
            {alerts.slice(0, 6).map((a) => (
              <button key={a.id} className="w-full flex items-start gap-2 text-left" onClick={() => onNavigate("alerts")}>
                <AlertTriangle size={13} style={{ color: a.level === "high" ? "var(--red)" : a.level === "medium" ? "#f59e0b" : "var(--text-3)", flexShrink: 0, marginTop: 1 }} />
                <div className="min-w-0"><div className="text-[12px] truncate">{a.title}</div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>{a.time}</div></div>
              </button>
            ))}
            {alerts.length === 0 && <div className="py-8 text-center text-[12px]" style={{ color: "var(--text-3)" }}>暂无预警</div>}
          </div>
        </Section>
      </div>

      <div className="card p-3.5 flex items-center gap-2 text-[11.5px]" style={{ color: "var(--text-3)" }}>
        <MapPin size={14} />
        点击任意卡片可跳转到对应模块。所有指标实时基于「数据中心」录入的数据计算，未录入时显示为空，不会生成演示数据。
      </div>
    </div>
  );
}
