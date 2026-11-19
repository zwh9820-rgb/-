"use client";

import { useState, useMemo } from "react";
import { RechartsWrapper } from "./charts";
import {
  Search, Download, Filter, ChevronLeft, ChevronRight, ShoppingBag,
  MapPin, Boxes, RefreshCcw, Map as MapIcon,
} from "lucide-react";
import { CITIES } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import type { Platform, OrderStatus } from "@/lib/types";
import { KpiCard, PageHeader, StatusTag, PlatformTag, Section, FilterSelect, EmptyData } from "./shared";

const PLATFORM_OPTS = [{ value: "all", label: "全部平台" }, ...["Amazon", "eBay", "TikTok Shop", "独立站"].map((p) => ({ value: p, label: p }))];
const STATUS_OPTS = [{ value: "all", label: "全部状态" }, ...["待发货", "已发货", "运输中", "已签收", "退货中", "异常"].map((s) => ({ value: s, label: s }))];
const COUNTRY_OPTS = [{ value: "all", label: "全部国家" }, ...Array.from(new Set(CITIES.map((c) => c.country))).map((c) => ({ value: c, label: c }))];

export default function OrdersView({ onNavigate, showToast }: { onNavigate: (k: any) => void; showToast: (m: string) => void }) {
  const { warehouses, orders: ORDERS, skus: SKUS } = useStore();
  const whName = (id: string) => warehouses.find((w) => w.id === id)?.name || id;
  const skuName = (id: string) => SKUS.find((s) => s.id === id)?.name || id;
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [country, setCountry] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const filtered = useMemo(() => ORDERS.filter((o) =>
    (platform === "all" || o.platform === platform) &&
    (status === "all" || o.status === status) &&
    (country === "all" || o.country === country) &&
    (!q || o.orderNo.toLowerCase().includes(q.toLowerCase()) || skuName(o.skuId).includes(q))
  ), [platform, status, country, q, ORDERS, SKUS]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalSales = filtered.reduce((s, o) => s + o.amount, 0);
  const totalWeight = filtered.reduce((s, o) => s + o.weight, 0);

  // 订单趋势：按真实订单日期聚合（近 8 个有数据的日期段）
  const trend = useMemo(() => {
    const byDate: Record<string, number> = {};
    ORDERS.forEach((o) => { if (o.date) byDate[o.date] = (byDate[o.date] || 0) + 1; });
    return Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([d, c]) => ({ week: d.slice(5), 订单: c }));
  }, [ORDERS]);
  // 平台占比：基于真实订单
  const platformDist = useMemo(() => {
    const counts: Record<string, number> = {};
    ORDERS.forEach((o) => { counts[o.platform] = (counts[o.platform] || 0) + 1; });
    const arr = Object.entries(counts).map(([name, value]) => ({ name, value }));
    return arr.length ? arr : [{ name: "暂无数据", value: 1 }];
  }, [ORDERS]);

  const exportCsv = () => {
    const csv = ["订单号,平台,SKU,数量,金额,重量,状态,国家,城市,推荐仓,日期", ...filtered.slice(0, 500).map((o) =>
      `${o.orderNo},${o.platform},${skuName(o.skuId)},${o.qty},${o.amount},${o.weight},${o.status},${o.country},${o.city},${whName(o.warehouseId)},${o.date}`)].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "订单明细.csv"; a.click();
    showToast(`已导出 ${Math.min(500, filtered.length)} 条订单`);
  };

  if (ORDERS.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="订单地图分析" desc="多平台订单统一视图，支持地理分布、区域汇总与明细导出" />
        <div className="card"><EmptyData label="订单" icon="📦" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="订单地图分析" desc="多平台订单统一视图，支持地理分布、区域汇总与明细导出"
        actions={<>
          <button className="btn" onClick={() => onNavigate("map")}><MapIcon size={14} /> 地图视图</button>
          <button className="btn" onClick={() => { setPlatform("all"); setStatus("all"); setCountry("all"); setQ(""); setPage(1); showToast("已重置全部筛选条件"); }}><RefreshCcw size={14} /> 刷新</button>
          <button className="btn btn-primary" onClick={exportCsv}><Download size={14} /> 导出 CSV</button>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="筛选订单" value={filtered.length.toLocaleString()} unit="单" delta={8.2} icon={<ShoppingBag size={15} />} />
        <KpiCard label="订单总额" value={`$${(totalSales / 1000).toFixed(1)}k`} delta={12.4} icon={<Boxes size={15} />} accent="#7c3aed" />
        <KpiCard label="总重量" value={totalWeight.toFixed(0)} unit="kg" delta={-2.1} icon={<Boxes size={15} />} accent="#0891b2" />
        <KpiCard label="覆盖国家" value={String(new Set(filtered.map((o) => o.countryCode)).size)} unit="个" icon={<MapPin size={15} />} accent="#059669" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <Section title="订单量趋势（近 8 周）" className="lg:col-span-2">
          <RechartsWrapper type="bar" data={trend} xKey="week" bars={[{ key: "订单", color: "#3366ff" }]} height={190} />
        </Section>
        <Section title="平台订单占比">
          <RechartsWrapper type="pie" data={platformDist} height={190} />
        </Section>
      </div>

      <Section className="!p-0 overflow-hidden">
        {/* 筛选栏 */}
        <div className="p-3.5 flex items-center gap-2 flex-wrap border-b" style={{ borderColor: "var(--border)" }}>
          <FilterSelect label="平台" value={platform} onChange={(v) => { setPlatform(v); setPage(1); }} options={PLATFORM_OPTS} />
          <FilterSelect label="状态" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={STATUS_OPTS} />
          <FilterSelect label="国家" value={country} onChange={(v) => { setCountry(v); setPage(1); }} options={COUNTRY_OPTS} />
          <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg ml-auto" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <Search size={13} style={{ color: "var(--text-3)" }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="搜索订单号 / SKU" className="w-[160px] bg-transparent outline-none text-[12px]" style={{ color: "var(--text)" }} />
          </div>
          <span className="text-[11px] ml-1" style={{ color: "var(--text-3)" }}>共 {filtered.length} 条</span>
        </div>
        {/* 表格 */}
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              <th>订单号</th><th>平台</th><th>SKU</th><th>数量</th><th>金额</th><th>重量</th><th>目的地</th><th>推荐仓</th><th>状态</th><th>日期</th>
            </tr></thead>
            <tbody>
              {pageData.map((o) => (
                <tr key={o.id}>
                  <td className="font-mono font-medium">{o.orderNo}</td>
                  <td><PlatformTag platform={o.platform} /></td>
                  <td>{skuName(o.skuId)}</td>
                  <td>{o.qty}</td>
                  <td className="font-medium">${o.amount.toFixed(2)}</td>
                  <td>{o.weight} kg</td>
                  <td>{o.country} · {o.city}</td>
                  <td style={{ color: "var(--text-2)" }}>{whName(o.warehouseId)}</td>
                  <td><StatusTag status={o.status} /></td>
                  <td style={{ color: "var(--text-3)" }}>{o.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 分页 */}
        <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: "var(--border)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>第 {page} / {totalPages} 页</span>
          <div className="flex items-center gap-1.5">
            <button className="btn !h-7 !px-2" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
            <button className="btn !h-7 !px-2" disabled={page === totalPages} onClick={() => setPage(page + 1)}><ChevronRight size={14} /></button>
          </div>
        </div>
      </Section>
    </div>
  );
}
