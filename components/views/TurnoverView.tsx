"use client";

import { useState, useMemo } from "react";
import {
  Download, Package, AlertTriangle, CheckCircle2, TrendingDown, Truck, RefreshCcw,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { calcTurnover } from "@/lib/analytics";
import type { TurnoverRow } from "@/lib/analytics";
import { KpiCard, PageHeader, Section, EmptyData, ProgressBar } from "./shared";
import clsx from "clsx";

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  "断货风险": { bg: "#ef4444", color: "#fff" },
  "库存偏低": { bg: "#f59e0b", color: "#fff" },
  "健康": { bg: "#16a34a", color: "#fff" },
  "滞销": { bg: "#64748b", color: "#fff" },
};

export default function TurnoverView({ onNavigate, showToast }: { onNavigate: (k: any) => void; showToast: (m: string) => void }) {
  const { inventory, skus, warehouses, orders, containers } = useStore();
  const [coverDays, setCoverDays] = useState(30);
  const [leadDays, setLeadDays] = useState(30);
  const [filter, setFilter] = useState<"all" | TurnoverRow["status"]>("all");

  const rows = useMemo(() => calcTurnover(inventory, skus, warehouses, orders, containers, coverDays, leadDays),
    [inventory, skus, warehouses, orders, containers, coverDays, leadDays]);
  const filtered = useMemo(() => filter === "all" ? rows : rows.filter((r) => r.status === filter), [rows, filter]);
  const kpi = useMemo(() => ({
    skuCount: new Set(rows.map((r) => r.skuId)).size,
    risk: rows.filter((r) => r.status === "断货风险").length,
    slow: rows.filter((r) => r.status === "滞销").length,
    suggestQty: rows.reduce((s, r) => s + r.suggest, 0),
  }), [rows]);

  const exportCsv = () => {
    const csv = ["SKU,商品名称,仓库,可售,预留,安全库存,近30天销量,日均销量,可售天数,在途,建议补货量,状态",
      ...filtered.map((r) => `${r.skuId},${r.skuName},${r.warehouseName},${r.available},${r.reserved},${r.safetyStock},${r.sold30d},${r.dailySales},${r.daysCover},${r.inTransit},${r.suggest},${r.status}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = "库存周转与补货建议.csv"; a.click();
    showToast(`已导出 ${filtered.length} 条补货建议`);
  };

  if (inventory.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="库存周转与补货" desc="基于真实销量与在途货柜，计算可售天数与建议补货量" />
        <div className="card"><EmptyData label="库存" icon="📊" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="库存周转与补货" desc="可售天数 = 可售库存 ÷ 近30天日均销量；建议补货 = 目标覆盖量 + 安全库存 − 可售 − 在途"
        actions={<>
          <button className="btn" onClick={() => showToast("已按当前销量重新计算")}><RefreshCcw size={14} /> 重新计算</button>
          <button className="btn btn-primary" onClick={exportCsv}><Download size={14} /> 导出补货建议</button>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="监控 SKU" value={kpi.skuCount} unit="个" icon={<Package size={15} />} />
        <KpiCard label="断货风险" value={kpi.risk} unit="项" icon={<AlertTriangle size={15} />} accent="#ef4444" />
        <KpiCard label="滞销 SKU" value={kpi.slow} unit="项" icon={<TrendingDown size={15} />} accent="#64748b" />
        <KpiCard label="建议补货总量" value={kpi.suggestQty.toLocaleString()} unit="件" icon={<Truck size={15} />} accent="#7c3aed" />
      </div>

      <Section title="补货参数" className="mb-4">
        <div className="flex items-center gap-6 flex-wrap text-[12px]">
          <label className="flex items-center gap-2">目标覆盖天数
            <input type="number" min={1} max={180} className="field !w-20 !h-8" value={coverDays} onChange={(e) => setCoverDays(Math.max(1, Number(e.target.value)))} />
          </label>
          <label className="flex items-center gap-2">采购提前期(天)
            <input type="number" min={0} max={180} className="field !w-20 !h-8" value={leadDays} onChange={(e) => setLeadDays(Math.max(0, Number(e.target.value)))} />
          </label>
          <span style={{ color: "var(--text-3)" }}>可售天数低于提前期一半判为断货风险；无销量且库龄超过 90 天判为滞销</span>
        </div>
      </Section>

      <Section className="!p-0 overflow-hidden">
        <div className="p-3.5 flex items-center gap-2 flex-wrap border-b" style={{ borderColor: "var(--border)" }}>
          <div className="text-[13.5px] font-semibold mr-auto">周转明细（{filtered.length} 条）</div>
          {(["all", "断货风险", "库存偏低", "健康", "滞销"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(s)} className={clsx("px-2.5 h-7 rounded-lg text-[11.5px]")}
              style={{ background: filter === s ? "var(--brand)" : "var(--surface-2)", color: filter === s ? "#fff" : "var(--text-2)" }}>
              {s === "all" ? "全部" : s}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>SKU</th><th>仓库</th><th>可售</th><th>预留</th><th>近30天销量</th><th>日均</th><th>可售天数</th><th>在途</th><th>建议补货</th><th>状态</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.key}>
                  <td className="font-medium">{r.skuName}</td>
                  <td style={{ color: "var(--text-2)" }}>{r.warehouseName}</td>
                  <td>{r.available}</td>
                  <td>{r.reserved}</td>
                  <td>{r.sold30d}</td>
                  <td>{r.dailySales}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: r.daysCover < leadDays ? "var(--red)" : "var(--text)" }}>{r.daysCover >= 999 ? "∞" : r.daysCover}</span>
                      <div className="w-14"><ProgressBar value={Math.min(100, r.daysCover / (coverDays * 2) * 100)} color={r.daysCover < leadDays ? "var(--red)" : "var(--green)"} /></div>
                    </div>
                  </td>
                  <td>{r.inTransit}</td>
                  <td className="font-semibold" style={{ color: r.suggest > 0 ? "var(--brand)" : "var(--text-3)" }}>{r.suggest || "—"}</td>
                  <td><span className="tag" style={{ background: STATUS_STYLE[r.status].bg, color: STATUS_STYLE[r.status].color }}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <p className="text-[11px] mt-3 flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
        <CheckCircle2 size={13} /> 所有计算基于你录入的库存、订单与在途货柜数据，不含任何预设示例。
      </p>
    </div>
  );
}
