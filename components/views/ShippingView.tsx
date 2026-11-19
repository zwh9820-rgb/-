"use client";

import { useState, useMemo } from "react";
import { RechartsWrapper } from "./charts";
import {
  Ship, Container, AlertTriangle, CalendarClock, PackageCheck,
  MapPin, ChevronRight, TrendingUp, Navigation, Clock,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { KpiCard, PageHeader, Section, StatusTag, ProgressBar, EmptyData } from "./shared";
import clsx from "clsx";

export default function ShippingView({ onNavigate, showToast }: { onNavigate: (k: any) => void; showToast: (m: string) => void }) {
  const { containers: CONTAINERS, skus: SKUS } = useStore();
  const skuName = (id: string) => SKUS.find((s) => s.id === id)?.name || id;
  const [selected, setSelected] = useState(CONTAINERS[0]?.id || "");
  const [filter, setFilter] = useState("全部");

  const filtered = CONTAINERS.filter((c) => filter === "全部" || c.status === filter);
  const cnt = CONTAINERS.find((c) => c.id === selected) || CONTAINERS[0];
  const inTransit = CONTAINERS.filter((c) => c.status === "在途" || c.status === "清关中").length;
  const delayed = CONTAINERS.filter((c) => c.status === "延误").length;
  const totalValue = CONTAINERS.reduce((s, c) => s + c.cargoValue, 0);

  // 目的港货量汇总
  const destSummary = useMemo(() => {
    const m = new Map<string, { value: number; volume: number; count: number }>();
    CONTAINERS.forEach((c) => {
      if (!m.has(c.destPort)) m.set(c.destPort, { value: 0, volume: 0, count: 0 });
      const x = m.get(c.destPort)!; x.value += c.cargoValue; x.volume += c.volume; x.count++;
    });
    return Array.from(m.entries()).map(([port, v]) => ({ port, ...v })).sort((a, b) => b.value - a.value);
  }, [CONTAINERS]);

  // 备货箱量建议：按真实在途柜的目的港分布
  const forecast = useMemo(() => destSummary.slice(0, 8).map((d) => ({
    week: d.port.length > 6 ? d.port.slice(0, 6) : d.port,
    建议箱量: d.count,
  })), [destSummary]);

  if (CONTAINERS.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="海运与头程备货看板" desc="全球航线在途追踪、货量货值汇总与销量预测备货建议" />
        <div className="card"><EmptyData label="海运集装箱" icon="🚢" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="海运与头程备货看板" desc="全球航线在途追踪、货量货值汇总与销量预测备货建议"
        actions={<>
          <button className="btn" onClick={() => onNavigate("map")}><Navigation size={14} /> 航线地图</button>
          <button className="btn btn-primary" onClick={() => {
            const rows = [["柜号", "起运港", "目的港", "国家", "状态", "ETD", "ETA", "货值", "体积m3", "SKU数"],
              ...CONTAINERS.map((c) => [c.containerNo, c.originPort, c.destPort, c.destCountry, c.status, c.etd, c.eta, String(c.cargoValue), String(c.volume), String(c.skuCount)])];
            const csv = rows.map((r) => r.map((x) => `"${x}"`).join(",")).join("\n");
            const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `备货计划_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
            showToast(`备货计划已导出，共 ${CONTAINERS.length} 个在途货柜`);
          }}><PackageCheck size={14} /> 生成备货计划</button>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="在途集装箱" value={String(inTransit)} unit="柜" delta={5.1} icon={<Container size={15} />} />
        <KpiCard label="延误预警" value={String(delayed)} unit="柜" icon={<AlertTriangle size={15} />} accent="#ef4444" />
        <KpiCard label="在途货值" value={`$${(totalValue / 1000).toFixed(0)}k`} delta={9.3} icon={<Ship size={15} />} accent="#7c3aed" />
        <KpiCard label="目的港" value={String(destSummary.length)} unit="个" icon={<MapPin size={15} />} accent="#0891b2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Section title="销量预测与备货箱量建议" className="lg:col-span-2">
          <RechartsWrapper type="bar" data={forecast} xKey="week" bars={[{ key: "建议箱量", color: "#3366ff" }]} height={180} />
        </Section>
        <Section title="目的港在途货量 TOP">
          <div className="space-y-2.5">
            {destSummary.slice(0, 6).map((d, i) => (
              <div key={d.port} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)", color: "var(--brand)" }}>{i + 1}</span>
                <span className="w-[72px] truncate">{d.port}</span>
                <div className="flex-1"><ProgressBar value={(d.value / destSummary[0].value) * 100} /></div>
                <span className="w-[54px] text-right font-medium">${(d.value / 1000).toFixed(0)}k</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 集装箱列表 */}
        <Section className="lg:col-span-2 !p-0 overflow-hidden">
          <div className="p-3.5 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-[13.5px] font-semibold">在途集装箱</h3>
            <div className="flex gap-1 ml-auto">
              {["全部", "在途", "清关中", "已到港", "延误"].map((f) => (
                <button key={f} onClick={() => setFilter(f)} className="px-2 py-1 rounded-md text-[11px]" style={{ background: filter === f ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "transparent", color: filter === f ? "var(--brand)" : "var(--text-2)" }}>{f}</button>
              ))}
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>柜号</th><th>航线</th><th>状态</th><th>进度</th><th>ETA</th><th>货值</th><th></th></tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} onClick={() => setSelected(c.id)} className="cursor-pointer" style={selected === c.id ? { background: "color-mix(in srgb, var(--brand) 6%, transparent)" } : {}}>
                    <td className="font-mono font-medium">{c.containerNo}</td>
                    <td className="max-w-[150px] truncate">{c.originPort} → {c.destPort}</td>
                    <td><StatusTag status={c.status} /></td>
                    <td className="w-[90px]"><ProgressBar value={c.progress * 100} color={c.status === "延误" ? "var(--red)" : "var(--brand)"} /></td>
                    <td style={{ color: c.status === "延误" ? "var(--red)" : "var(--text-2)" }}>{c.eta}</td>
                    <td>${(c.cargoValue / 1000).toFixed(0)}k</td>
                    <td><ChevronRight size={13} style={{ color: "var(--text-3)" }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 柜详情 */}
        <Section title="集装箱详情">
          <div className="space-y-3 text-[12px]">
            <div className="flex items-center justify-between"><span style={{ color: "var(--text-2)" }}>柜号</span><b className="font-mono">{cnt.containerNo}</b></div>
            <div className="flex items-center justify-between"><span style={{ color: "var(--text-2)" }}>状态</span><StatusTag status={cnt.status} /></div>
            <div className="p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
              <div className="text-[11px] mb-2" style={{ color: "var(--text-3)" }}>航线轨迹</div>
              <div className="flex items-center gap-2 text-[11.5px]"><MapPin size={13} style={{ color: "#22d3ee" }} />{cnt.originPort}</div>
              <div className="ml-[5px] my-1 border-l-2 border-dashed h-5" style={{ borderColor: "var(--border)" }} />
              <div className="flex items-center gap-2 text-[11.5px] font-medium"><MapPin size={13} style={{ color: "var(--brand)" }} />{cnt.destPort}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>ETD</div><div className="font-medium">{cnt.etd}</div></div>
              <div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>ETA</div><div className="font-medium" style={{ color: cnt.status === "延误" ? "var(--red)" : "var(--text)" }}>{cnt.eta}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>货值</div><div className="font-bold">${(cnt.cargoValue / 1000).toFixed(0)}k</div></div>
              <div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>体积</div><div className="font-bold">{cnt.volume} m³</div></div>
            </div>
            <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="text-[11px] mb-1.5" style={{ color: "var(--text-3)" }}>载货 SKU（{cnt.skuCount}）</div>
              {cnt.items.map((it, i) => <div key={i} className="flex justify-between py-0.5 text-[11px]"><span className="truncate">{skuName(it.skuId)}</span><b>{it.qty}</b></div>)}
            </div>
            <div className="p-2.5 rounded-lg text-[11px]" style={{ background: "color-mix(in srgb, var(--brand) 8%, transparent)", color: "var(--brand)" }}>
              💡 头程成本联动尾程，完整落地成本已计入 Landed Cost 核算
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
