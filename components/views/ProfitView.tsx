"use client";

import { useState, useMemo } from "react";
import { RechartsWrapper } from "./charts";
import {
  Download, Settings2, TrendingUp, DollarSign, Percent, AlertTriangle, Info, RotateCcw,
} from "lucide-react";
import { useStore, DEFAULT_COST_RATES } from "@/lib/store";
import type { CostRates } from "@/lib/store";
import { calcProfit, sumProfit } from "@/lib/analytics";
import { KpiCard, PageHeader, Section, EmptyData, FilterSelect } from "./shared";

type Dim = "platform" | "country" | "sku";

export default function ProfitView({ onNavigate, showToast }: { onNavigate: (k: any) => void; showToast: (m: string) => void }) {
  const { orders, skus, costRates, setCostRates } = useStore();
  const [dim, setDim] = useState<Dim>("platform");
  const [month, setMonth] = useState("all");
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<CostRates>(costRates);

  const months = useMemo(() => Array.from(new Set(orders.map((o) => (o.date || "").slice(0, 7)).filter(Boolean))).sort().reverse(), [orders]);
  const scoped = useMemo(() => month === "all" ? orders : orders.filter((o) => (o.date || "").slice(0, 7) === month), [orders, month]);
  const rows = useMemo(() => calcProfit(scoped, skus, costRates), [scoped, skus, costRates]);
  const total = useMemo(() => sumProfit(rows), [rows]);

  // 按维度聚合
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; revenue: number; profit: number; cost: number; count: number; estimated: boolean }>();
    rows.forEach((r) => {
      const key = dim === "platform" ? r.order.platform : dim === "country" ? (r.order.country || "未知") : (skus.find((s) => s.id === r.order.skuId)?.name || r.order.skuId);
      if (!m.has(key)) m.set(key, { name: key, revenue: 0, profit: 0, cost: 0, count: 0, estimated: false });
      const g = m.get(key)!;
      g.revenue += r.revenue; g.profit += r.profit; g.cost += r.cost; g.count += 1; g.estimated = g.estimated || r.estimated;
    });
    return Array.from(m.values()).sort((a, b) => b.profit - a.profit);
  }, [rows, dim, skus]);

  const hasCostInput = skus.some((s) => (s.cost || 0) > 0) || orders.some((o) => (o.commission || 0) > 0 || (o.firstMile || 0) > 0 || (o.lastMile || 0) > 0);

  const exportCsv = () => {
    const csv = [
      "订单号,平台,日期,销售额,商品成本,平台佣金,头程,尾程,退货损耗,其他,总成本,毛利,毛利率%,费用来源",
      ...rows.map((r) => `${r.order.orderNo},${r.order.platform},${r.order.date},${r.revenue.toFixed(2)},${r.goodsCost.toFixed(2)},${r.commission.toFixed(2)},${r.firstMile.toFixed(2)},${r.lastMile.toFixed(2)},${r.returnLoss.toFixed(2)},${r.other.toFixed(2)},${r.cost.toFixed(2)},${r.profit.toFixed(2)},${r.margin.toFixed(1)},${r.estimated ? "含估算" : "实际录入"}`),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "利润核算明细.csv"; a.click();
    showToast(`已导出 ${rows.length} 条利润明细`);
  };

  const saveRates = () => { setCostRates(draft); setShowSettings(false); showToast("费用率已保存，利润已重新核算"); };

  if (orders.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="利润与费用核算" desc="SKU 级真实利润：销售额扣除商品成本、平台佣金、头程、尾程与退货损耗" />
        <div className="card"><EmptyData label="订单" icon="💰" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  const rateFields: { key: keyof CostRates; label: string }[] = [
    { key: "commissionRate", label: "平台佣金 %" }, { key: "firstMileRate", label: "头程 / 货值 %" },
    { key: "lastMileRate", label: "尾程 / 货值 %" }, { key: "returnRate", label: "退货损耗 %" }, { key: "otherRate", label: "其他 %" },
  ];

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="利润与费用核算" desc="销售额扣除商品成本、平台佣金、头程、尾程与退货损耗，定位真实盈利"
        actions={<>
          <FilterSelect label="月份" value={month} onChange={setMonth} options={[{ value: "all", label: "全部" }, ...months.map((m) => ({ value: m, label: m }))]} />
          <button className="btn" onClick={() => { setDraft(costRates); setShowSettings(true); }}><Settings2 size={14} /> 费用率设置</button>
          <button className="btn btn-primary" onClick={exportCsv}><Download size={14} /> 导出明细</button>
        </>} />

      {!hasCostInput && (
        <div className="card mb-4 flex items-start gap-2.5 p-3.5" style={{ borderColor: "var(--brand)", background: "color-mix(in srgb, var(--brand) 5%, transparent)" }}>
          <Info size={16} style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }} />
          <div className="text-[12px] leading-relaxed" style={{ color: "var(--text-2)" }}>
            当前未录入任何成本/费用。利润 = 销售额。请在「数据中心」为 SKU 录入采购成本、为订单录入各项费用，或在「费用率设置」中配置按货值比例估算（估算结果会明确标注）。
            <button className="ml-1 underline" style={{ color: "var(--brand)" }} onClick={() => onNavigate("datacenter")}>前往录入 →</button>
          </div>
        </div>
      )}

      {showSettings && (
        <Section title="费用率估算设置" className="mb-4" extra={<button className="btn !h-7 !px-2" onClick={() => setShowSettings(false)}>收起</button>}>
          <p className="text-[11.5px] mb-3" style={{ color: "var(--text-3)" }}>订单未录入具体费用时，按销售额 × 费率估算。全部为 0 表示不做估算，只统计实际录入的费用。</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {rateFields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--text-2)" }}>
                {f.label}
                <input type="number" min={0} max={100} step={0.1} className="field" value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: Math.max(0, Number(e.target.value)) })} />
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary" onClick={saveRates}>保存并重新核算</button>
            <button className="btn" onClick={() => setDraft(DEFAULT_COST_RATES)}><RotateCcw size={13} /> 全部归零</button>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="销售额" value={`$${(total.revenue / 1000).toFixed(1)}k`} icon={<DollarSign size={15} />} />
        <KpiCard label="总成本" value={`$${(total.cost / 1000).toFixed(1)}k`} icon={<DollarSign size={15} />} accent="#f59e0b" />
        <KpiCard label="毛利" value={`$${(total.profit / 1000).toFixed(1)}k`} icon={<TrendingUp size={15} />} accent={total.profit >= 0 ? "#059669" : "#ef4444"} />
        <KpiCard label="毛利率" value={`${total.margin.toFixed(1)}%`} icon={<Percent size={15} />} accent="#7c3aed" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Section title={`利润排行 · ${dim === "platform" ? "平台" : dim === "country" ? "国家" : "SKU"}`} className="lg:col-span-2"
          extra={<FilterSelect value={dim} onChange={(v) => setDim(v as Dim)} options={[{ value: "platform", label: "按平台" }, { value: "country", label: "按国家" }, { value: "sku", label: "按 SKU" }]} />}>
          <RechartsWrapper type="bar" data={groups.map((g) => ({ name: g.name, 毛利: Math.round(g.profit), 销售额: Math.round(g.revenue) }))}
            xKey="name" bars={[{ key: "毛利", color: "#3366ff" }, { key: "销售额", color: "#cbd5e1" }]} height={220} />
        </Section>
        <Section title="成本构成">
          <RechartsWrapper type="pie" height={220} data={[
            { name: "商品成本", value: Math.round(total.goodsCost) },
            { name: "平台佣金", value: Math.round(total.commission) },
            { name: "头程", value: Math.round(total.firstMile) },
            { name: "尾程", value: Math.round(total.lastMile) },
            { name: "退货损耗", value: Math.round(total.returnLoss) },
            { name: "其他", value: Math.round(total.other) },
          ].filter((x) => x.value > 0)} />
        </Section>
      </div>

      <Section className="!p-0 overflow-hidden">
        <div className="p-3.5 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
          <div className="text-[13.5px] font-semibold">利润明细（{rows.length} 条）</div>
          {total.estimated && <span className="flex items-center gap-1 text-[11px]" style={{ color: "#f59e0b" }}><AlertTriangle size={13} /> 部分费用为按费率估算</span>}
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>订单号</th><th>平台</th><th>销售额</th><th>商品成本</th><th>佣金</th><th>头程</th><th>尾程</th><th>退货</th><th>毛利</th><th>毛利率</th><th>来源</th></tr></thead>
            <tbody>
              {rows.slice(0, 200).map((r) => (
                <tr key={r.order.id}>
                  <td className="font-mono font-medium">{r.order.orderNo}</td>
                  <td>{r.order.platform}</td>
                  <td className="font-medium">${r.revenue.toFixed(2)}</td>
                  <td>${r.goodsCost.toFixed(2)}</td>
                  <td>${r.commission.toFixed(2)}</td>
                  <td>${r.firstMile.toFixed(2)}</td>
                  <td>${r.lastMile.toFixed(2)}</td>
                  <td>${r.returnLoss.toFixed(2)}</td>
                  <td className="font-semibold" style={{ color: r.profit >= 0 ? "var(--green)" : "var(--red)" }}>${r.profit.toFixed(2)}</td>
                  <td style={{ color: r.margin >= 0 ? "var(--green)" : "var(--red)" }}>{r.margin.toFixed(1)}%</td>
                  <td><span className="tag" style={{ background: r.estimated ? "#f59e0b" : "#16a34a", color: "#fff" }}>{r.estimated ? "含估算" : "实际"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
