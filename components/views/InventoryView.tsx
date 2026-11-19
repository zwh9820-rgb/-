"use client";

import { useState, useMemo } from "react";
import {
  Warehouse, AlertTriangle, Camera, ArrowRightLeft, Plus, Search,
  Package, TrendingDown, CheckCircle2, MapPin, Ship, Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { KpiCard, PageHeader, Section, ProgressBar, EmptyData } from "./shared";
import clsx from "clsx";

const healthMeta = {
  healthy: { label: "库存充足", color: "var(--green)", bg: "color-mix(in srgb, var(--green) 10%, transparent)" },
  warning: { label: "库存预警", color: "var(--amber)", bg: "color-mix(in srgb, var(--amber) 12%, transparent)" },
  critical: { label: "断货风险", color: "var(--red)", bg: "color-mix(in srgb, var(--red) 10%, transparent)" },
};
export default function InventoryView({ onNavigate, showToast }: { onNavigate: (k: any) => void; showToast: (m: string) => void }) {
  const store = useStore();
  const WAREHOUSES = store.warehouses;
  const INVENTORY = store.inventory;
  const SKUS = store.skus;
  const skuName = (id: string) => SKUS.find((s) => s.id === id)?.name || id;
  const [selectedWh, setSelectedWh] = useState(WAREHOUSES[0]?.id || "");
  const [q, setQ] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [viewingSnapshot, setViewingSnapshot] = useState<string | null>(null);

  const wh = WAREHOUSES.find((w) => w.id === selectedWh) || WAREHOUSES[0];
  // 若正在查看快照，展示快照中的库存数据
  const activeSnapshot = store.snapshots.find((s) => s.id === viewingSnapshot);
  const baseInventory = activeSnapshot ? activeSnapshot.items : INVENTORY;
  const whInventory = baseInventory.filter((i) => i.warehouseId === (wh?.id || selectedWh));
  const filteredInv = whInventory.filter((i) => skuName(i.skuId).includes(q));
  const lowStock = whInventory.filter((i) => (i as any).available < (i as any).safetyStock);

  const saveSnapshot = () => {
    const now = new Date();
    store.addSnapshot({
      id: `snap-${now.getTime()}`,
      label: `${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} 库存快照`,
      createdAt: now.toISOString(),
      items: INVENTORY.map((i) => ({ warehouseId: i.warehouseId, skuId: i.skuId, available: i.available, reserved: i.reserved, total: i.total, safetyStock: i.safetyStock, ageDays: i.ageDays })),
    });
    showToast(`已保存库存快照，共 ${INVENTORY.length} 条库存记录`);
  };

  // 调拨模拟状态
  const [transferSku, setTransferSku] = useState(whInventory[0]?.skuId || "");
  const [transferQty, setTransferQty] = useState(200);
  const [transferTarget, setTransferTarget] = useState(WAREHOUSES.find((w) => w.id !== selectedWh)?.id || "");
  const transferCost = (transferQty * 0.38).toFixed(0);
  const transferDays = 2 + Math.ceil(transferQty / 500);
  const confirmTransfer = () => {
    store.addTransfer({
      id: `tr-${Date.now()}`,
      fromWh: wh.id, toWh: transferTarget, skuId: transferSku,
      qty: transferQty, cost: +transferCost, days: transferDays,
      createdAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    });
    setShowTransfer(false);
    showToast(`调拨方案已记录：${wh.name} → ${WAREHOUSES.find((w) => w.id === transferTarget)?.name}，${transferQty} 件`);
  };

  if (WAREHOUSES.length === 0) {
    return (
      <div className="w-full h-full overflow-y-auto p-5">
        <PageHeader title="海外仓库存看板" desc="全球仓库存健康度、SKU 明细与安全库存预警" />
        <div className="card"><EmptyData label="海外仓" icon="🏭" onGoData={() => onNavigate("datacenter")} /></div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="海外仓库存看板" desc="全球仓库存健康度、SKU 明细与安全库存预警"
        actions={<>
          <button className="btn" onClick={saveSnapshot}><Camera size={14} /> 保存库存快照</button>
          <button className="btn btn-primary" onClick={() => setShowTransfer(true)}><ArrowRightLeft size={14} /> 仓间调拨模拟</button>
        </>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard label="海外仓总数" value={String(WAREHOUSES.length)} unit="个" icon={<Warehouse size={15} />} />
        <KpiCard label="总库容利用率" value={String(Math.round(WAREHOUSES.reduce((s, w) => s + w.used, 0) / WAREHOUSES.reduce((s, w) => s + w.capacity, 0) * 100))} unit="%" delta={3.6} icon={<Package size={15} />} accent="#7c3aed" />
        <KpiCard label="低于安全库存 SKU" value={String(INVENTORY.filter((i) => i.available < i.safetyStock).length)} unit="项" icon={<AlertTriangle size={15} />} accent="#ef4444" />
        <KpiCard label="历史库存快照" value={String(store.snapshots.length)} unit="份" icon={<Camera size={15} />} accent="#0891b2" />
      </div>

      {/* 仓库卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {WAREHOUSES.map((w) => {
          const util = Math.round(w.used / w.capacity * 100);
          const meta = healthMeta[w.health];
          return (
            <button key={w.id} onClick={() => setSelectedWh(w.id)} className={clsx("card p-3.5 text-left transition-all", selectedWh === w.id && "ring-2")} style={selectedWh === w.id ? { boxShadow: "0 0 0 2px var(--brand)" } : {}}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold truncate">{w.name}</div>
                  <div className="text-[10px] font-mono mt-0.5" style={{ color: "var(--text-3)" }}>{w.code}</div>
                </div>
                <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: meta.color }} />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px]"><span style={{ color: "var(--text-2)" }}>库容利用率</span><b style={{ color: meta.color }}>{util}%</b></div>
              <div className="mt-1.5"><ProgressBar value={util} color={meta.color} /></div>
              <div className="mt-2.5 flex items-center gap-3 text-[10px]" style={{ color: "var(--text-3)" }}>
                <span>{w.skuCount} SKU</span><span>·</span><span>{w.dailyOutbound} 单/日</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* SKU 明细 */}
        <Section className="lg:col-span-3 !p-0 overflow-hidden">
          <div className="px-4 pt-4 pb-1 text-[13.5px] font-semibold">仓库 SKU 库存明细 · <b style={{ color: "var(--brand)" }}>{wh.name}</b></div>
          <div className="p-3 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg flex-1 max-w-[280px]" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              <Search size={13} style={{ color: "var(--text-3)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索 SKU…" className="bg-transparent outline-none text-[12px] w-full" style={{ color: "var(--text)" }} />
            </div>
            <span className="text-[11px] ml-auto" style={{ color: "var(--red)" }}>{lowStock.length} 项低于安全库存</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>SKU</th><th>可售</th><th>预留</th><th>总库存</th><th>安全库存</th><th>库龄</th><th>状态</th></tr></thead>
              <tbody>
                {filteredInv.map((it) => {
                  const isLow = it.available < it.safetyStock;
                  return (
                    <tr key={it.skuId}>
                      <td className="font-medium">{skuName(it.skuId)}</td>
                      <td className={isLow ? "font-bold" : ""} style={isLow ? { color: "var(--red)" } : {}}>{it.available}</td>
                      <td style={{ color: "var(--text-2)" }}>{it.reserved}</td>
                      <td>{it.total}</td>
                      <td style={{ color: "var(--text-2)" }}>{it.safetyStock}</td>
                      <td style={{ color: "var(--text-3)" }}>{it.ageDays} 天</td>
                      <td>{isLow ? <span className="tag" style={{ background: "color-mix(in srgb, var(--red) 12%, transparent)", color: "var(--red)" }}><AlertTriangle size={11} /> 需补货</span> : <span className="tag" style={{ background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)" }}><CheckCircle2 size={11} /> 正常</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 侧栏：库存健康 + 快照 */}
        <div className="space-y-3">
          <Section title="库存健康分布">
            <div className="space-y-2.5">
              {(["healthy", "warning", "critical"] as const).map((h) => {
                const count = WAREHOUSES.filter((w) => w.health === h).length;
                return <div key={h} className="flex items-center justify-between text-[12px]"><span className="flex items-center gap-2"><i className="w-2 h-2 rounded-full" style={{ background: healthMeta[h].color }} />{healthMeta[h].label}</span><b>{count} 仓</b></div>;
              })}
            </div>
          </Section>
          <Section title="库存快照历史">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[11.5px] p-2 rounded-lg" style={{ background: viewingSnapshot ? "var(--surface-2)" : "color-mix(in srgb, var(--brand) 8%, transparent)" }}>
                <Camera size={13} style={{ color: "var(--brand)" }} />
                <div className="flex-1"><div className="font-medium">实时库存（当前）</div><div style={{ color: "var(--text-3)" }}>来自本地数据库</div></div>
                {viewingSnapshot && <button className="text-[10px]" style={{ color: "var(--brand)" }} onClick={() => setViewingSnapshot(null)}>返回实时</button>}
              </div>
              {store.snapshots.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[11.5px] p-2 rounded-lg" style={{ background: viewingSnapshot === s.id ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "var(--surface-2)" }}>
                  <Camera size={13} style={{ color: "var(--text-3)" }} />
                  <div className="flex-1 min-w-0"><div className="font-medium truncate">{s.label}</div><div style={{ color: "var(--text-3)" }}>{s.items.length} 条记录</div></div>
                  <button className="text-[10px]" style={{ color: "var(--brand)" }} onClick={() => { setViewingSnapshot(s.id); showToast(`已载入「${s.label}」用于复盘，表格显示历史快照`); }}>载入</button>
                  <button className="p-0.5" style={{ color: "var(--red)" }} title="删除快照" onClick={() => { store.deleteSnapshot(s.id); if (viewingSnapshot === s.id) setViewingSnapshot(null); showToast("快照已删除"); }}><Trash2 size={12} /></button>
                </div>
              ))}
              {store.snapshots.length === 0 && <div className="text-[11px] py-2 text-center" style={{ color: "var(--text-3)" }}>暂无快照，点击右上角保存</div>}
            </div>
          </Section>
          <Section title="调拨记录">
            <div className="space-y-2">
              {store.transfers.slice(0, 5).map((t) => (
                <div key={t.id} className="text-[11px] p-2 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <div className="flex justify-between"><span className="truncate">{WAREHOUSES.find(w => w.id === t.fromWh)?.name || t.fromWh} → {WAREHOUSES.find(w => w.id === t.toWh)?.name || t.toWh}</span><b>{t.qty} 件</b></div>
                  <div style={{ color: "var(--text-3)" }}>{skuName(t.skuId)} · ${t.cost} · {t.days} 天 · {t.createdAt}</div>
                </div>
              ))}
              {store.transfers.length === 0 && <div className="text-[11px] py-2 text-center" style={{ color: "var(--text-3)" }}>暂无调拨记录</div>}
            </div>
          </Section>
        </div>
      </div>

      {/* 调拨模拟弹窗 */}
      {showTransfer && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={() => setShowTransfer(false)}>
          <div className="w-[480px] max-w-[92vw] rounded-2xl p-5 shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-[15px] font-bold flex items-center gap-2"><ArrowRightLeft size={17} style={{ color: "var(--brand)" }} />仓间调拨模拟</h3><button onClick={() => setShowTransfer(false)} className="text-[18px]" style={{ color: "var(--text-3)" }}>×</button></div>
            <div className="space-y-3.5 text-[12.5px]">
              <div><label className="block mb-1.5" style={{ color: "var(--text-2)" }}>调拨 SKU</label><select className="field w-full" value={transferSku} onChange={(e) => setTransferSku(e.target.value)}>{whInventory.map((it) => <option key={it.skuId} value={it.skuId}>{skuName(it.skuId)}（可售 {it.available}）</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block mb-1.5" style={{ color: "var(--text-2)" }}>源仓</label><div className="field w-full flex items-center">{wh.name}</div></div>
                <div><label className="block mb-1.5" style={{ color: "var(--text-2)" }}>目标区域仓</label><select className="field w-full" value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)}>{WAREHOUSES.filter((w) => w.id !== selectedWh).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
              </div>
              <div><label className="block mb-1.5" style={{ color: "var(--text-2)" }}>调拨数量：{transferQty} 件</label><input type="range" min={50} max={1000} step={50} value={transferQty} onChange={(e) => setTransferQty(+e.target.value)} className="w-full accent-blue-600" /></div>
              <div className="p-3 rounded-xl grid grid-cols-2 gap-2" style={{ background: "var(--surface-2)" }}>
                <div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>预计调拨成本</div><div className="text-[18px] font-bold">${transferCost}</div></div>
                <div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>预计到货周期</div><div className="text-[18px] font-bold">{transferDays} 天</div></div>
              </div>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}><MapPin size={12} /> 地图链路预览：{wh.city} → {WAREHOUSES.find((w) => w.id === transferTarget)?.city}</div>
            </div>
            <div className="flex gap-2 mt-5"><button className="btn flex-1" onClick={() => setShowTransfer(false)}>取消</button><button className="btn btn-primary flex-1" onClick={confirmTransfer} disabled={!transferTarget || transferQty <= 0}><CheckCircle2 size={14} /> 确认方案</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
