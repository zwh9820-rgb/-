"use client";

import { useState, useMemo } from "react";
import { RechartsWrapper } from "./charts";
import { Target, TrendingUp, ShoppingCart, CalendarDays, Plus, Trash2, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { trendBy, platformBreakdown, calcProfit, monthKey } from "@/lib/analytics";
import { KpiCard, PageHeader, Section, EmptyData, PlatformTag } from "./shared";

export default function TrendView({ onNavigate, showToast }: { onNavigate: (k: any) => void; showToast: (m: string) => void }) {
  const { orders, skus, targets, setTarget, deleteTarget, costRates } = useStore();
  const [grain, setGrain] = useState<"day" | "week" | "month">("week");
  const [newMonth, setNewMonth] = useState("");
  const [newValue, setNewValue] = useState("");

  const trend = useMemo(() => trendBy(orders, grain), [orders, grain]);
  const platforms = useMemo(() => platformBreakdown(orders), [orders]);
  const months = useMemo(() => Array.from(new Set(orders.map((o) => monthKey(o.date)).filter(Boolean))).sort().reverse(), [orders]);

  // 各月实际销售额 + 目标完成度
  const monthStats = useMemo(() => months.map((m) => {
    const actual = orders.filter((o) => monthKey(o.date) === m).reduce((s, o) => s + (o.amount || 0), 0);
    const target = targets[m] || 0;
    return { month: m, actual, target, pct: target > 0 ? actual / target * 100 : 0 };
  }), [months, orders, targets]);

  const latest = monthStats[0];
  const prev = monthStats[1];
  const mom = latest && prev && prev.actual > 0 ? (latest.actual - prev.actual) / prev.actual * 100 : undefined;

  const addTarget = () => {
    if (!/^\d{4}-\d{2}$/.test(newMonth) || !newValue || Number(newValue) <= 0) { showToast("请填写正确的月份(YYYY-MM)和目标金额"); return; }
    setTarget(newMonth, Number(newValue)); setNewMonth(""); setNewValue(""); showToast("月度目标已保存");
  };

  if (orders.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="多平台趋势与目标" desc="销售趋势、平台占比、同比环比与月度目标完成度" />
        <div className="card"><EmptyData label="订单" icon="📈" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="多平台趋势与目标" desc="基于真实订单的销售趋势、平台结构与目标达成情况"
        actions={<>
          {(["day", "week", "month"] as const).map((g) => (
            <button key={g} onClick={() => setGrain(g)} className="btn !h-8"
              style={{ background: grain === g ? "var(--brand)" : undefined, color: grain === g ? "#fff" : undefined }}>
              {g === "day" ? "日" : g === "week" ? "周" : "月"}
            </button>
          ))}
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="订单总数" value={orders.length.toLocaleString()} unit="单" icon={<ShoppingCart size={15} />} />
        <KpiCard label="销售总额" value={`$${(orders.reduce((s, o) => s + (o.amount || 0), 0) / 1000).toFixed(1)}k`} icon={<TrendingUp size={15} />} accent="#7c3aed" />
        <KpiCard label="覆盖平台" value={platforms.length} unit="个" icon={<Target size={15} />} accent="#0891b2" />
        <KpiCard label="月度环比" value={mom === undefined ? "—" : `${mom > 0 ? "+" : ""}${mom.toFixed(1)}%`}
          icon={<CalendarDays size={15} />} accent={mom !== undefined && mom < 0 ? "#ef4444" : "#059669"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Section title={`销售趋势（按${grain === "day" ? "日" : grain === "week" ? "周" : "月"}）`} className="lg:col-span-2">
          <RechartsWrapper type="area" data={trend} xKey="key"
            areas={[{ key: "sales", color: "#3366ff" }]} height={230} />
        </Section>
        <Section title="平台销售占比">
          <RechartsWrapper type="pie" data={platforms} height={230} />
        </Section>
      </div>

      <Section title="平台明细" className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {platforms.map((p) => (
            <div key={p.name} className="rounded-xl p-3.5" style={{ background: "var(--surface-2)" }}>
              <PlatformTag platform={p.name} />
              <div className="text-[19px] font-bold mt-2">${(p.value / 1000).toFixed(1)}k</div>
              <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>{p.orders} 单 · 占比 {orders.reduce((s, o) => s + (o.amount || 0), 0) > 0 ? (p.value / orders.reduce((s, o) => s + (o.amount || 0), 0) * 100).toFixed(1) : 0}%</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="月度目标管理" extra={
        <div className="flex items-center gap-1.5">
          <input className="field !w-28 !h-8" placeholder="YYYY-MM" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} />
          <input className="field !w-28 !h-8" type="number" placeholder="目标金额" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
          <button className="btn btn-primary !h-8" onClick={addTarget}><Plus size={13} /> 添加</button>
        </div>
      }>
        {monthStats.length === 0 ? <div className="py-6 text-center text-[12px]" style={{ color: "var(--text-3)" }}>暂无订单月份</div> : (
          <div className="space-y-3">
            {monthStats.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-[12px] font-medium w-16" style={{ color: "var(--text-2)" }}>{m.month}</span>
                <div className="flex-1">
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, m.pct)}%`, background: m.pct >= 100 ? "var(--green)" : "var(--brand)" }} />
                  </div>
                </div>
                <span className="text-[11.5px] w-40 text-right" style={{ color: "var(--text-3)" }}>
                  实际 ${(m.actual / 1000).toFixed(1)}k / 目标 {m.target ? `$${(m.target / 1000).toFixed(1)}k` : "未设置"}
                </span>
                <span className="text-[12px] font-semibold w-14 text-right" style={{ color: m.target > 0 && m.pct >= 100 ? "var(--green)" : "var(--text)" }}>
                  {m.target > 0 ? `${m.pct.toFixed(0)}%` : "—"}
                </span>
                {targets[m.month] ? <button onClick={() => { deleteTarget(m.month); showToast(`已删除 ${m.month} 目标`); }} style={{ color: "var(--text-3)" }}><Trash2 size={13} /></button> : <span className="w-[13px]" />}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] mt-3 flex items-center gap-1.5" style={{ color: "var(--text-3)" }}><Check size={13} /> 目标由你自行设置，保存在本地；实际值来自录入订单。</p>
      </Section>
    </div>
  );
}
