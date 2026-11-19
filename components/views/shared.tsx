"use client";

import React from "react";
import { ArrowUpRight, ArrowDownRight, Minus, Database, ArrowRight } from "lucide-react";
import clsx from "clsx";

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div><h2 className="text-[17px] font-bold">{title}</h2>{desc && <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-3)" }}>{desc}</p>}</div>
      {actions && <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div>}
    </div>
  );
}

export function KpiCard({ label, value, unit, delta, icon, accent }: {
  label: string; value: string | number; unit?: string; delta?: number; icon?: React.ReactNode; accent?: string;
}) {
  const up = delta !== undefined && delta > 0;
  const down = delta !== undefined && delta < 0;
  return (
    <div className="card p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[11.5px]" style={{ color: "var(--text-2)" }}>{label}</span>
        {icon && <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${accent || "var(--brand)"} 12%, transparent)`, color: accent || "var(--brand)" }}>{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[24px] font-bold leading-none tracking-tight">{value}</span>
        {unit && <span className="text-[11.5px]" style={{ color: "var(--text-3)" }}>{unit}</span>}
      </div>
      {delta !== undefined && (
        <div className="flex items-center gap-1 text-[11px]">
          <span className={clsx("flex items-center gap-0.5 font-medium", up ? "text-emerald-600" : down ? "text-red-500" : "")} style={up ? { color: "var(--green)" } : down ? { color: "var(--red)" } : { color: "var(--text-3)" }}>
            {up ? <ArrowUpRight size={13} /> : down ? <ArrowDownRight size={13} /> : <Minus size={13} />}
            {Math.abs(delta)}%
          </span>
          <span style={{ color: "var(--text-3)" }}>较上周</span>
        </div>
      )}
    </div>
  );
}

export function Section({ title, extra, children, className }: { title?: string; extra?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("card p-4", className)}>
      {title && <div className="flex items-center justify-between mb-3"><h3 className="text-[13.5px] font-semibold">{title}</h3>{extra}</div>}
      {children}
    </div>
  );
}

export function StatusTag({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    "待发货": { bg: "#f59e0b", color: "#fff" },
    "已发货": { bg: "#3b82f6", color: "#fff" },
    "运输中": { bg: "#6366f1", color: "#fff" },
    "已签收": { bg: "#16a34a", color: "#fff" },
    "退货中": { bg: "#f43f5e", color: "#fff" },
    "异常": { bg: "#dc2626", color: "#fff" },
    "在途": { bg: "#0ea5e9", color: "#fff" },
    "已到港": { bg: "#16a34a", color: "#fff" },
    "延误": { bg: "#ef4444", color: "#fff" },
    "清关中": { bg: "#8b5cf6", color: "#fff" },
  };
  const s = map[status] || { bg: "#64748b", color: "#fff" };
  return <span className="tag" style={{ background: s.bg, color: s.color }}>{status}</span>;
}

export function PlatformTag({ platform }: { platform: string }) {
  const colors: Record<string, string> = {
    "Amazon": "#ff9900", "eBay": "#e53238", "TikTok Shop": "#111827", "独立站": "#3366ff",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px]">
      <span className="w-2 h-2 rounded-full" style={{ background: colors[platform] || "#64748b" }} />
      {platform}
    </span>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 rounded-full w-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color || "var(--brand)" }} />
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return <div className="py-10 text-center text-[12px]" style={{ color: "var(--text-3)" }}>{text}</div>;
}

// 数据为空时的统一引导（提示前往数据中心录入）
export function EmptyData({ label, onGoData, icon }: { label: string; onGoData?: () => void; icon?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-[44px] mb-3 opacity-60">{icon || "📭"}</div>
      <div className="text-[15px] font-semibold mb-1.5">暂无{label}数据</div>
      <p className="text-[12px] max-w-[380px] leading-relaxed mb-5" style={{ color: "var(--text-3)" }}>
        程序未预置任何虚拟数据。请在「数据中心」手动录入或 CSV 导入你的真实{label}数据，系统将自动在这里展示与分析。
      </p>
      {onGoData && (
        <button className="btn btn-primary" onClick={onGoData}>
          <Database size={14} /> 前往数据中心录入 <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

// 通用筛选下拉
export function FilterSelect({ value, onChange, options, label }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{label}</span>}
      <select className="field !h-8" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
