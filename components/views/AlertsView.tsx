"use client";

import { useState } from "react";
import {
  Bell, AlertTriangle, PackageX, Ship, DollarSign, Undo2, TrendingUp,
  MapPin, CheckCheck, Clock, Filter, Map as MapIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { AlertType } from "@/lib/types";
import { PageHeader, KpiCard, EmptyData } from "./shared";
import clsx from "clsx";

const typeMeta: Record<AlertType, { icon: any; color: string; label: string }> = {
  "库存": { icon: PackageX, color: "#ef4444", label: "库存" },
  "海运": { icon: Ship, color: "#0ea5e9", label: "海运" },
  "运费": { icon: DollarSign, color: "#f59e0b", label: "运费" },
  "退货": { icon: Undo2, color: "#ec4899", label: "退货" },
  "订单": { icon: TrendingUp, color: "#7c3aed", label: "订单" },
  "地理编码": { icon: MapPin, color: "#64748b", label: "地理编码" },
};
const levelMeta = {
  high: { label: "紧急", color: "#ef4444" },
  medium: { label: "警告", color: "#f59e0b" },
  low: { label: "提示", color: "#64748b" },
};

export default function AlertsView({ onNavigate }: { onNavigate: (k: any) => void }) {
  const store = useStore();
  const [filter, setFilter] = useState("全部");
  const [showRead, setShowRead] = useState(true);

  // 预警来自全局 store（用户录入/导入），已读状态持久化
  const alerts = store.alerts.map((a) => ({ ...a, read: a.read || !!store.alertRead[a.id] }));
  const filtered = alerts.filter((a) =>
    (filter === "全部" || a.type === filter) &&
    (showRead || !a.read)
  );
  const unread = alerts.filter((a) => !a.read).length;
  const high = alerts.filter((a) => a.level === "high" && !a.read).length;
  const processed = alerts.length ? Math.round((alerts.length - unread) / alerts.length * 100) : 0;

  const markAll = () => { alerts.forEach((a) => store.setAlertRead(a.id, true)); };
  const markRead = (id: string) => store.setAlertRead(id, true);

  if (store.alerts.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="全局异常预警" desc="跨模块异常监控，预警条目与地图点位联动，点击直达" />
        <div className="card"><EmptyData label="预警" icon="⚠️" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="全局异常预警" desc="跨模块异常监控，预警条目与地图点位联动，点击直达"
        actions={<button className="btn" onClick={markAll}><CheckCheck size={14} /> 全部标为已读</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="未读预警" value={String(unread)} unit="条" icon={<Bell size={15} />} accent="#3366ff" />
        <KpiCard label="紧急预警" value={String(high)} unit="条" icon={<AlertTriangle size={15} />} accent="#ef4444" />
        <KpiCard label="预警总数" value={String(alerts.length)} unit="条" icon={<Clock size={15} />} accent="#f59e0b" />
        <KpiCard label="已处理率" value={String(processed)} unit="%" icon={<CheckCheck size={15} />} accent="#16a34a" />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "var(--surface-2)" }}>
          {["全部", "库存", "海运", "运费", "退货", "订单", "地理编码"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="px-2.5 py-1.5 rounded-md text-[11.5px] font-medium" style={{ background: filter === f ? "var(--surface)" : "transparent", color: filter === f ? "var(--brand)" : "var(--text-2)", boxShadow: filter === f ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>{f}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[11.5px] ml-auto cursor-pointer" style={{ color: "var(--text-2)" }}>
          <input type="checkbox" checked={showRead} onChange={(e) => setShowRead(e.target.checked)} className="accent-blue-600" /> 显示已读
        </label>
      </div>

      <div className="space-y-2.5">
        {filtered.map((a) => {
          const tm = typeMeta[a.type];
          const Icon = tm.icon;
          const lm = levelMeta[a.level];
          return (
            <div key={a.id} className={clsx("card p-4 flex items-start gap-3.5 transition-opacity", a.read && "opacity-60")}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${tm.color} 12%, transparent)`, color: tm.color }}><Icon size={18} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[13.5px] font-bold">{a.title}</span>
                  <span className="tag" style={{ background: `color-mix(in srgb, ${lm.color} 14%, transparent)`, color: lm.color }}>{lm.label}</span>
                  <span className="tag" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{tm.label}</span>
                  {!a.read && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand)" }} />}
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-2)" }}>{a.detail}</p>
                <div className="mt-2 flex items-center gap-3 text-[10.5px]" style={{ color: "var(--text-3)" }}>
                  <span className="flex items-center gap-1"><Clock size={11} />{a.time}</span>
                  {a.lng !== undefined && <span className="flex items-center gap-1"><MapPin size={11} />地图点位已标记</span>}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                {a.lng !== undefined && <button className="btn !h-7 !text-[11px]" onClick={() => { onNavigate("map"); }}><MapIcon size={12} /> 地图定位</button>}
                <button className="btn !h-7 !text-[11px]" onClick={() => onNavigate(a.module)}>查看详情</button>
                {!a.read && <button className="text-[10.5px] hover:underline" style={{ color: "var(--brand)" }} onClick={() => markRead(a.id)}>标为已读</button>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-16 text-[13px]" style={{ color: "var(--text-3)" }}>🎉 当前筛选下没有预警</div>}
      </div>
    </div>
  );
}
