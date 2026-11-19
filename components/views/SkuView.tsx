"use client";

import { useState, useMemo } from "react";
import { RechartsWrapper } from "./charts";
import { BarChart3, Flame, TrendingUp, Undo2, GitCompare, MapPin } from "lucide-react";
import { CITIES } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { KpiCard, PageHeader, Section, ProgressBar, EmptyData } from "./shared";
import clsx from "clsx";

export default function SkuView({ onNavigate, showToast }: { onNavigate: (k: any) => void; showToast: (m: string) => void }) {
  const { orders: ORDERS, skus: SKUS } = useStore();
  const skuName = (id: string) => SKUS.find((s) => s.id === id)?.name || id;
  const [selectedSku, setSelectedSku] = useState(SKUS[0]?.id || "");
  const [view, setView] = useState<"heat" | "compare" | "return">("heat");
  const [compareSkus, setCompareSkus] = useState(SKUS.slice(0, 3).map((s) => s.id));

  // SKU 排名
  const skuRank = useMemo(() => SKUS.map((s) => {
    const orders = ORDERS.filter((o) => o.skuId === s.id);
    return { ...s, count: orders.length, sales: +orders.reduce((a, o) => a + o.amount, 0).toFixed(0) };
  }).sort((a, b) => b.count - a.count), [SKUS, ORDERS]);

  // 选中 SKU 的区域分布
  const regionDist = useMemo(() => {
    const m = new Map<string, number>();
    ORDERS.filter((o) => o.skuId === selectedSku).forEach((o) => m.set(o.city, (m.get(o.city) || 0) + 1));
    return Array.from(m.entries()).map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count);
  }, [selectedSku, ORDERS]);

  // 多 SKU 对比：基于真实订单出现的城市
  const orderCities = useMemo(() => Array.from(new Set(ORDERS.map((o) => o.city).filter(Boolean))).slice(0, 8), [ORDERS]);
  const compareData = useMemo(() => orderCities.map((city) => {
    const row: any = { city };
    compareSkus.forEach((sid, i) => { row[`s${i}`] = ORDERS.filter((o) => o.skuId === sid && o.city === city).length; });
    return row;
  }), [compareSkus, orderCities, ORDERS]);

  // 退货率区域：基于真实订单（returnRisk > 0.7）
  const returnData = useMemo(() => {
    const m = new Map<string, { total: number; ret: number }>();
    ORDERS.forEach((o) => {
      if (!o.city) return;
      if (!m.has(o.city)) m.set(o.city, { total: 0, ret: 0 });
      const x = m.get(o.city)!; x.total++; if (o.returnRisk > 0.7) x.ret++;
    });
    return Array.from(m.entries()).map(([city, v]) => ({ city, rate: +(v.ret / v.total * 100).toFixed(1) })).sort((a, b) => b.rate - a.rate).slice(0, 10);
  }, [ORDERS]);

  const avgReturn = returnData.length ? +(returnData.reduce((s, r) => s + r.rate, 0) / returnData.length).toFixed(1) : 0;
  const toggleCompare = (id: string) => setCompareSkus((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev);

  if (SKUS.length === 0 || ORDERS.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="SKU 区域销售分析" desc="单 SKU 全球热力分布、多 SKU 对比与区域退货率定位" />
        <div className="card"><EmptyData label="SKU / 订单" icon="📊" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="SKU 区域销售分析" desc="单 SKU 全球热力分布、多 SKU 对比与区域退货率定位"
        actions={<>
          <button className={clsx("btn", view === "heat" && "btn-primary")} onClick={() => setView("heat")}><Flame size={14} /> 热力分布</button>
          <button className={clsx("btn", view === "compare" && "btn-primary")} onClick={() => setView("compare")}><GitCompare size={14} /> 多 SKU 对比</button>
          <button className={clsx("btn", view === "return" && "btn-primary")} onClick={() => setView("return")}><Undo2 size={14} /> 退货分析</button>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="在售 SKU" value={String(SKUS.length)} unit="个" icon={<BarChart3 size={15} />} />
        <KpiCard label="热销 SKU" value={skuRank[0]?.sku || "—"} icon={<Flame size={15} />} accent="#ef4444" />
        <KpiCard label="平均退货率" value={String(avgReturn)} unit="%" icon={<Undo2 size={15} />} accent="#f59e0b" />
        <KpiCard label="覆盖城市" value={String(orderCities.length)} unit="个" icon={<MapPin size={15} />} accent="#0891b2" />
      </div>

      {view === "heat" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Section className="lg:col-span-2" title="选中 SKU 区域订单分布">
            <div className="mb-3 flex items-center gap-2">
              <select className="field flex-1" value={selectedSku} onChange={(e) => setSelectedSku(e.target.value)}>{skuRank.map((s) => <option key={s.id} value={s.id}>{s.sku} · {s.name}（{s.count} 单）</option>)}</select>
              <button className="btn" onClick={() => onNavigate("map")}><MapPin size={14} /> 地图热力</button>
            </div>
            <div className="space-y-2.5">
              {regionDist.slice(0, 10).map((r, i) => (
                <div key={r.city} className="flex items-center gap-3 text-[12px]">
                  <span className="w-4 text-[10px]" style={{ color: "var(--text-3)" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="w-[68px] truncate">{r.city}</span>
                  <div className="flex-1"><ProgressBar value={(r.count / regionDist[0].count) * 100} color={i === 0 ? "#ef4444" : "var(--brand)"} /></div>
                  <b className="w-[40px] text-right">{r.count} 单</b>
                </div>
              ))}
            </div>
          </Section>
          <Section title="SKU 销量排行 TOP 10">
            <div className="space-y-1.5">
              {skuRank.slice(0, 10).map((s, i) => (
                <button key={s.id} onClick={() => setSelectedSku(s.id)} className="w-full flex items-center gap-2 py-1.5 px-1.5 rounded-lg text-left text-[11.5px]" style={{ background: selectedSku === s.id ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent" }}>
                  <span className="w-4 text-[10px]" style={{ color: "var(--text-3)" }}>{i + 1}</span>
                  <span className="text-[14px]">{s.image}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  <b style={{ color: selectedSku === s.id ? "var(--brand)" : "var(--text)" }}>{s.count}</b>
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}

      {view === "compare" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Section title="选择对比 SKU（最多 4 个）" className="lg:col-span-1">
            <div className="space-y-1 max-h-[380px] overflow-y-auto">
              {skuRank.slice(0, 12).map((s) => (
                <label key={s.id} className="flex items-center gap-2 py-1.5 px-1.5 rounded-lg cursor-pointer text-[11.5px]" style={{ background: compareSkus.includes(s.id) ? "color-mix(in srgb, var(--brand) 8%, transparent)" : "transparent" }}>
                  <input type="checkbox" checked={compareSkus.includes(s.id)} onChange={() => toggleCompare(s.id)} className="accent-blue-600" />
                  <span>{s.image}</span><span className="flex-1 truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </Section>
          <Section title="多 SKU 区域销量对比" className="lg:col-span-2">
            <RechartsWrapper type="bar" data={compareData} xKey="city"
              bars={compareSkus.map((sid, i) => ({ key: `s${i}`, color: ["#3366ff", "#ef4444", "#10b981", "#f59e0b"][i] }))}
              height={330} />
            <div className="flex flex-wrap gap-3 mt-2 text-[11px]">
              {compareSkus.map((sid, i) => <span key={sid} className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: ["#3366ff", "#ef4444", "#10b981", "#f59e0b"][i] }} />{skuName(sid)}</span>)}
            </div>
          </Section>
        </div>
      )}

      {view === "return" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Section title="区域退货率排行（高 → 低）" className="lg:col-span-1">
            <div className="space-y-2">
              {returnData.map((r, i) => (
                <div key={r.city} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-4 text-[10px]" style={{ color: "var(--text-3)" }}>{i + 1}</span>
                  <span className="w-[64px] truncate">{r.city}</span>
                  <div className="flex-1"><ProgressBar value={(r.rate / returnData[0].rate) * 100} color={r.rate > 8 ? "var(--red)" : "var(--amber)"} /></div>
                  <b style={{ color: r.rate > 8 ? "var(--red)" : "var(--text)" }}>{r.rate}%</b>
                </div>
              ))}
            </div>
          </Section>
          <Section title="各城市退货率对比" className="lg:col-span-2">
            <RechartsWrapper type="bar" height={330}
              data={returnData.map((r) => ({ city: r.city, 退货率: r.rate }))}
              xKey="city" bars={[{ key: "退货率", color: "#ef4444" }]} />
            <div className="mt-3 p-3 rounded-lg text-[11.5px] flex items-start gap-2" style={{ background: "color-mix(in srgb, var(--brand) 8%, transparent)", color: "var(--text-2)" }}>
              <Flame size={14} className="mt-0.5" style={{ color: "var(--brand)" }} /> 退货率基于订单的「退货风险」字段（超过 0.7 视为高退货风险）统计；可在「地图下钻分析」中定位具体城市。
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
