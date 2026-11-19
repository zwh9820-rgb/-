"use client";

import { useState } from "react";
import {
  FileBarChart, FileSpreadsheet, FileText, Download, CalendarClock,
  ShoppingCart as OrdersIcon, Package, ClipboardList, Receipt, CheckCircle2, Clock,
  Plus, Trash2, Pause, Play, Printer, Image as ImageIcon,
} from "lucide-react";
import { useStore } from "@/lib/store";
import type { Order, InventoryItem, Container, Sku, Warehouse } from "@/lib/types";
import { PageHeader, Section, KpiCard } from "./shared";

const templates = [
  { id: "order", name: "订单汇总报表", desc: "按平台/国家/时间汇总订单量、销售额、重量", icon: OrdersIcon, color: "#3366ff", formats: ["Excel", "CSV", "PDF"] },
  { id: "inventory", name: "库存报表", desc: "各仓库 SKU 可售/预留/库龄与安全库存预警", icon: Package, color: "#7c3aed", formats: ["Excel", "CSV", "PDF"] },
  { id: "stockplan", name: "备货计划报表", desc: "基于销量预测的头程补货与箱量建议", icon: ClipboardList, color: "#0891b2", formats: ["Excel", "PDF"] },
  { id: "lastmile", name: "尾程成本测算表", desc: "多服务商比价与最优仓配落地成本明细", icon: Receipt, color: "#f59e0b", formats: ["Excel", "CSV"] },
];
interface ReportData {
  orders: Order[]; inventory: InventoryItem[]; containers: Container[]; skus: Sku[]; warehouses: Warehouse[]; priceCards: any[];
}

// 根据模板与范围生成真实 CSV 数据（全部来自用户录入的数据）
function buildReport(id: string, range: string, data: ReportData): string[][] {
  const skuName = (s: string) => data.skus.find((x) => x.id === s)?.name || s;
  const whName = (s: string) => data.warehouses.find((x) => x.id === s)?.name || s;
  const days = range === "最近 30 天" ? 30 : range === "最近 90 天" ? 90 : range === "本年度" ? 320 : 3650;
  const cutoff = Date.now() - days * 86400000;
  if (id === "order") {
    const rows = data.orders.filter((o) => !o.date || new Date(o.date).getTime() >= cutoff);
    return [
      ["订单号", "平台", "SKU", "数量", "金额", "重量kg", "状态", "国家", "城市", "日期"],
      ...rows.slice(0, 1000).map((o) => [o.orderNo, o.platform, skuName(o.skuId), String(o.qty), String(o.amount), String(o.weight), o.status, o.country, o.city, o.date]),
    ];
  }
  if (id === "inventory") {
    return [
      ["仓库", "SKU", "可售", "预留", "总库存", "安全库存", "库龄天", "状态"],
      ...data.inventory.map((i) => [whName(i.warehouseId), skuName(i.skuId), String(i.available), String(i.reserved), String(i.total), String(i.safetyStock), String((i as any).ageDays || 0), (i as any).available < (i as any).safetyStock ? "需补货" : "正常"]),
    ];
  }
  if (id === "stockplan") {
    return [
      ["柜号", "起运港", "目的港", "状态", "ETD", "ETA", "货值", "体积m3", "SKU数"],
      ...data.containers.map((c) => [c.containerNo, c.originPort, c.destPort, c.status, c.etd, c.eta, String(c.cargoValue), String(c.volume), String(c.skuCount)]),
    ];
  }
  // 尾程成本：基于真实价卡条目
  return [
    ["服务商", "国家", "州", "邮编区间", "重量段kg", "运费", "燃油附加", "时效天", "生效日期", "版本"],
    ...data.priceCards.slice(0, 500).map((c) => [c.carrier, c.country, c.state, `${c.zipFrom}–${c.zipTo}`, `${c.weightFrom}–${c.weightTo}`, String(c.price), String(c.fuelSurcharge), String(c.deliveryDays), c.effectiveDate, c.version]),
  ];
}

export default function ReportsView({ showToast }: { showToast: (m: string) => void }) {
  const store = useStore();
  const reportData: ReportData = {
    orders: store.orders, inventory: store.inventory, containers: store.containers,
    skus: store.skus, warehouses: store.warehouses, priceCards: store.priceCards,
  };
  const [selected, setSelected] = useState("order");
  const [format, setFormat] = useState("Excel");
  const [range, setRange] = useState("最近 30 天");
  const [taskModal, setTaskModal] = useState(false);
  const [newTask, setNewTask] = useState({ name: "", cycle: "每周一 09:00" });

  const exportNow = (name: string, fmt: string) => {
    const rows = buildReport(selected, range, reportData);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    if (fmt === "PDF") {
      // 真实 PDF：打开可打印的 HTML 窗口，用户可另存为 PDF
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title>
        <style>body{font-family:system-ui,sans-serif;padding:24px;color:#1a2233}h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}th{background:#f1f3f7}@media print{button{display:none}}</style></head>
        <body><h1>${name}</h1><p>时间范围：${range} · 生成时间：${new Date().toLocaleString("zh-CN")} · 共 ${rows.length - 1} 条</p>
        <button onclick="window.print()">打印 / 另存为 PDF</button>
        <table>${rows.map((r, i) => `<tr>${r.map((c) => i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); showToast("已打开可打印报表，在打印对话框中选择「另存为 PDF」"); }
      else showToast("弹窗被拦截，请允许弹出窗口后重试");
      return;
    }
    const mime = fmt === "Excel" ? "application/vnd.ms-excel" : "text/csv";
    const ext = fmt === "Excel" ? "xls" : "csv";
    const blob = new Blob(["\ufeff" + csv], { type: `${mime};charset=utf-8` });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}_${range}.${ext}`; a.click();
    showToast(`${name} 已导出 ${rows.length - 1} 条记录（${fmt}）`);
  };

  const saveScreenshot = () => {
    // 真实生成一张报表概览 PNG（Canvas 绘制）并下载
    const canvas = document.createElement("canvas");
    canvas.width = 1000; canvas.height = 560;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 1000, 560);
    g.addColorStop(0, "#1e3a8a"); g.addColorStop(0.5, "#3b82f6"); g.addColorStop(1, "#22d3ee");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1000, 560);
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(0, 440, 1000, 120);
    // 简易地球
    ctx.beginPath(); ctx.arc(500, 250, 150, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.ellipse(500, 250, 150 * i / 6, 150, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(500 - 150, 250 + i * 45); ctx.lineTo(500 + 150, 250 + i * 45); ctx.stroke(); }
    // 仓库点位
    [[450, 180], [560, 210], [480, 300], [600, 280]].forEach(([x, y], i) => { ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = ["#22c55e", "#f59e0b", "#22c55e", "#ef4444"][i]; ctx.fill(); });
    ctx.fillStyle = "#fff"; ctx.font = "bold 28px system-ui"; ctx.fillText("LinkVue 联视 · 跨境数据中台", 32, 62);
    ctx.font = "16px system-ui"; ctx.fillText(`地图视图快照 · ${new Date().toLocaleString("zh-CN")}`, 32, 92);
    ctx.font = "14px system-ui"; ctx.fillText(`海外仓 ${reportData.warehouses.length} 个  ·  在途柜 ${reportData.containers.length} 条  ·  订单 ${reportData.orders.length} 单`, 32, 500);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `地图视图快照_${Date.now()}.png`; a.click();
      showToast("地图视图快照已保存为 PNG");
    });
  };

  const createTask = () => {
    if (!newTask.name.trim()) { showToast("请填写任务名称"); return; }
    store.upsertTask({ id: `task-${Date.now()}`, name: newTask.name, cycle: newTask.cycle, enabled: true, lastRun: "尚未运行" });
    setTaskModal(false); setNewTask({ name: "", cycle: "每周一 09:00" });
    showToast(`已创建定时任务「${newTask.name}」`);
  };
  const tasks = store.tasks;
  const totalRecords = reportData.orders.length + reportData.inventory.length + reportData.containers.length + reportData.priceCards.length;

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="报表中心" desc="内置报表模板、定时周报月报本地存档与多格式导出" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="报表模板" value={String(templates.length)} unit="个" icon={<FileBarChart size={15} />} />
        <KpiCard label="定时任务" value={String(tasks.length)} unit="个" icon={<CalendarClock size={15} />} accent="#7c3aed" />
        <KpiCard label="可导出数据" value={String(totalRecords)} unit="条" icon={<FileText size={15} />} accent="#0891b2" />
        <KpiCard label="库存快照" value={String(store.snapshots.length)} unit="份" icon={<Download size={15} />} accent="#16a34a" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 space-y-3">
          <Section title="内置报表模板">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templates.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setSelected(t.id)} className="p-4 rounded-xl text-left transition-all" style={{ background: selected === t.id ? `color-mix(in srgb, ${t.color} 7%, transparent)` : "var(--surface-2)", border: selected === t.id ? `1px solid ${t.color}` : "1px solid transparent" }}>
                    <div className="flex items-start gap-3">
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${t.color} 14%, transparent)`, color: t.color }}><Icon size={19} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold mb-1">{t.name}</div>
                        <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>{t.desc}</div>
                        <div className="flex gap-1.5 mt-2.5">{t.formats.map((f) => <span key={f} className="tag" style={{ background: "var(--surface)", color: "var(--text-2)" }}>{f}</span>)}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-4 p-4 rounded-xl flex items-end gap-3 flex-wrap" style={{ background: "var(--surface-2)" }}>
              <div><label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>导出格式</label><div className="flex gap-1">{["Excel", "CSV", "PDF"].map((f) => <button key={f} onClick={() => setFormat(f)} className="px-3 h-8 rounded-lg text-[11.5px] font-medium" style={{ background: format === f ? "var(--brand)" : "var(--surface)", color: format === f ? "#fff" : "var(--text-2)" }}>{f}</button>)}</div></div>
              <div><label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>时间范围</label><select className="field" value={range} onChange={(e) => setRange(e.target.value)}><option>最近 30 天</option><option>最近 90 天</option><option>本年度</option><option>全部</option></select></div>
              <button className="btn btn-primary ml-auto" onClick={() => exportNow(templates.find((t) => t.id === selected)!.name, format)}><Download size={14} /> 立即导出</button>
            </div>
            <div className="mt-2 text-[10.5px]" style={{ color: "var(--text-3)" }}>已选：{templates.find((t) => t.id === selected)?.name} · {range} · {format} · 预计 {buildReport(selected, range, reportData).length - 1} 条记录</div>
          </Section>

          <Section title="地图视图截图保存">
            <div className="flex items-center gap-4">
              <div className="w-28 h-20 rounded-lg shrink-0" style={{ background: "linear-gradient(135deg,#1e3a8a,#3b82f6,#22d3ee)" }} />
              <div><div className="text-[12.5px] font-semibold mb-1">保存地图视图快照</div><div className="text-[11px] mb-2.5" style={{ color: "var(--text-3)" }}>生成包含全球仓网概览的高清 PNG 图片，用于汇报分享。</div><button className="btn !h-8" onClick={saveScreenshot}><ImageIcon size={13} /> 保存截图</button></div>
            </div>
          </Section>
        </div>

        <Section title="定时生成任务" className="lg:col-span-1"
          extra={<button className="btn !h-7 !text-[11px]" onClick={() => setTaskModal(true)}><Plus size={12} /> 新建</button>}>
          <div className="space-y-2.5">
            {tasks.map((s) => (
              <div key={s.id} className="p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12.5px] font-semibold">{s.name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="tag" style={{ background: s.enabled ? "color-mix(in srgb, var(--green) 12%, transparent)" : "var(--border)", color: s.enabled ? "var(--green)" : "var(--text-3)" }}><CheckCircle2 size={10} />{s.enabled ? "启用" : "停用"}</span>
                    <button className="p-0.5" style={{ color: "var(--text-2)" }} title={s.enabled ? "停用" : "启用"} onClick={() => store.upsertTask({ ...s, enabled: !s.enabled })}>{s.enabled ? <Pause size={12} /> : <Play size={12} />}</button>
                    <button className="p-0.5" style={{ color: "var(--red)" }} title="删除" onClick={() => { store.deleteTask(s.id); showToast(`已删除任务「${s.name}」`); }}><Trash2 size={12} /></button>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--text-3)" }}><Clock size={11} /> {s.cycle}</div>
                <div className="text-[10.5px] mt-1" style={{ color: "var(--text-3)" }}>上次生成：{s.lastRun}</div>
              </div>
            ))}
            {tasks.length === 0 && <div className="text-[11px] py-6 text-center" style={{ color: "var(--text-3)" }}>暂无定时任务，点击右上角「新建」添加</div>}
          </div>
        </Section>
      </div>

      {taskModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={() => setTaskModal(false)}>
          <div className="w-[440px] max-w-[92vw] rounded-2xl p-5 shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-[15px] font-bold flex items-center gap-2"><CalendarClock size={17} style={{ color: "var(--brand)" }} />新建定时任务</h3><button onClick={() => setTaskModal(false)} className="text-[18px]" style={{ color: "var(--text-3)" }}>×</button></div>
            <div className="space-y-3.5 text-[12.5px]">
              <div><label className="block mb-1.5" style={{ color: "var(--text-2)" }}>任务名称</label><input className="field w-full" value={newTask.name} onChange={(e) => setNewTask({ ...newTask, name: e.target.value })} placeholder="如：区域销售周报" /></div>
              <div><label className="block mb-1.5" style={{ color: "var(--text-2)" }}>生成周期</label><select className="field w-full" value={newTask.cycle} onChange={(e) => setNewTask({ ...newTask, cycle: e.target.value })}><option>每日 08:00</option><option>每周一 09:00</option><option>每周五 18:00</option><option>每月 1 日 10:00</option></select></div>
              <div className="p-3 rounded-lg text-[11px] leading-relaxed" style={{ background: "color-mix(in srgb, var(--brand) 8%, transparent)", color: "var(--brand)" }}>定时任务配置保存在本地。演示版不会后台自动执行，导出数据可随时在报表模板中生成。</div>
            </div>
            <div className="flex gap-2 mt-5"><button className="btn flex-1" onClick={() => setTaskModal(false)}>取消</button><button className="btn btn-primary flex-1" onClick={createTask}><CheckCircle2 size={14} /> 创建任务</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
