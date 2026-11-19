"use client";

import { useState, useMemo, useRef } from "react";
import {
  ReceiptText, Upload, GitCompare, History, Calculator, CheckCircle2,
  MapPin, Clock, DollarSign, TrendingDown, Plus, AlertTriangle, X, Trash2, Download,
} from "lucide-react";
import { CITIES } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { readFileText, parseCsv } from "@/lib/file-utils";
import { KpiCard, PageHeader, Section, ProgressBar, EmptyData } from "./shared";
import clsx from "clsx";

type CarrierQuote = { carrier: string; price: number; days: number; total: number };

// 简单的仓配测算引擎（成本/时效双模式）
function computeQuotes(weight: number, destCity: string, destLng: number, destLat: number): CarrierQuote[] {
  const base: Record<string, number> = { UPS: 1.0, USPS: 0.78, DHL: 1.15, FedEx: 0.95 };
  const daysBase: Record<string, number> = { UPS: 3, USPS: 5, DHL: 4, FedEx: 3 };
  return Object.keys(base).map((carrier) => {
    const zipFactor = 0.85 + ((Math.abs(destLng) + Math.abs(destLat)) % 10) / 40;
    const price = +(weight * base[carrier] * 3.2 * zipFactor + 4.5).toFixed(2);
    const fuel = +(price * 0.06).toFixed(2);
    return { carrier, price: +(price + fuel).toFixed(2), days: daysBase[carrier] + (weight > 2 ? 1 : 0), total: +(price + fuel).toFixed(2) };
  });
}

export default function PricecardView({ showToast, onNavigate }: { showToast: (m: string) => void; onNavigate?: (k: any) => void }) {
  const store = useStore();
  const { warehouses } = store;
  const PRICE_CARDS = store.priceCards;
  const SKUS = store.skus;
  const allVersions = useMemo(() => Array.from(new Set(["v1.0", ...PRICE_CARDS.map((c) => c.version), ...store.cardVersions.map((v) => v.version)])), [PRICE_CARDS, store.cardVersions]);
  const [tab, setTab] = useState<"manage" | "calc">("calc");
  const [version, setVersion] = useState("v1.0");
  const [carrier, setCarrier] = useState("全部");
  const [q, setQ] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);

  // 测算输入
  const [calcWeight, setCalcWeight] = useState(1.5);
  const [calcCity, setCalcCity] = useState(CITIES[0].name);
  const [calcSku, setCalcSku] = useState(SKUS[0]?.id || "");
  const [mode, setMode] = useState<"cost" | "time">("cost");
  const [batchOpen, setBatchOpen] = useState(false);
  const cardFileRef = useRef<HTMLInputElement>(null);
  const batchFileRef = useRef<HTMLInputElement>(null);
  const [batchFile, setBatchFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [batchResult, setBatchResult] = useState<{ rows: string[][]; count: number } | null>(null);

  const importCardFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const rows = parseCsv(await readFileText(file));
      if (rows.length < 2 || !rows[0].some((h) => /weight|重量/i.test(h))) {
        showToast("CSV 需包含表头且含「weight」或「重量」列"); return;
      }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const col = (names: string[]) => {
        for (const n of names) { const i = header.findIndex((h) => h.includes(n)); if (i >= 0) return i; }
        return -1;
      };
      const iCarrier = col(["carrier", "服务商"]), iCountry = col(["country", "国家"]), iState = col(["state", "州"]);
      const iZipF = col(["zipfrom", "邮编起"]), iZipT = col(["zipto", "邮编止"]);
      const iWF = col(["weightfrom", "重量起"]), iWT = col(["weightto", "重量止"]);
      const iPrice = col(["price", "运费"]), iFuel = col(["fuel", "燃油"]), iDays = col(["delivery", "时效"]);
      const iDate = col(["effective", "生效"]);
      const num = (v: string | undefined) => { const n = parseFloat(v || ""); return isNaN(n) ? 0 : n; };
      const imported = rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r, i) => ({
        id: `pc-${Date.now()}-${i}`,
        version,
        carrier: (iCarrier >= 0 ? r[iCarrier] : "UPS") as any,
        country: iCountry >= 0 ? r[iCountry] : "", state: iState >= 0 ? r[iState] : "",
        zipFrom: iZipF >= 0 ? r[iZipF] : "", zipTo: iZipT >= 0 ? r[iZipT] : "",
        weightFrom: iWF >= 0 ? num(r[iWF]) : 0, weightTo: iWT >= 0 ? num(r[iWT]) : 0,
        price: iPrice >= 0 ? num(r[iPrice]) : 0, fuelSurcharge: iFuel >= 0 ? num(r[iFuel]) : 0,
        deliveryDays: iDays >= 0 ? num(r[iDays]) : 0, effectiveDate: iDate >= 0 ? r[iDate] : "",
      }));
      store.setPriceCards([...imported, ...PRICE_CARDS]);
      showToast(`已导入 ${imported.length} 条价卡记录到版本 ${version}`);
    } catch { showToast("文件解析失败"); }
  };

  const importBatchFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    try {
      const rows = parseCsv(await readFileText(file));
      if (rows.length < 2) { showToast("文件无有效数据行"); return; }
      setBatchFile({ name: file.name, rows });
      showToast(`已载入「${file.name}」，${rows.length - 1} 条订单待测算`);
    } catch { showToast("文件解析失败"); }
  };

  const runBatchCalc = () => {
    if (!batchFile) { showToast("请先选择订单清单文件"); return; }
    const header = batchFile.rows[0];
    const wIdx = header.findIndex((h) => /weight|重量/i.test(h));
    const cIdx = header.findIndex((h) => /city|城市/i.test(h));
    const dataRows = batchFile.rows.slice(1).slice(0, 5000);
    const resultRows = [["序号", ...header, "最优渠道", "尾程成本", "时效天", "推荐仓", "落地总成本"]];
    dataRows.forEach((r, i) => {
      const w = Math.max(0.1, parseFloat(r[wIdx] || "1") || 1);
      const cityName = cIdx >= 0 ? r[cIdx] : "洛杉矶";
      const c = CITIES.find((x) => x.name === cityName) || CITIES[0];
      const qs = computeQuotes(w, cityName, c.lng, c.lat);
      const bestQ = [...qs].sort((a, b) => mode === "cost" ? a.price - b.price : a.days - b.days)[0];
      const nwh = [...warehouses].sort((a, b) => Math.hypot(a.lng - c.lng, a.lat - c.lat) - Math.hypot(b.lng - c.lng, b.lat - c.lat))[0];
      resultRows.push([String(i + 1), ...r, bestQ.carrier, String(bestQ.price), String(bestQ.days), nwh?.name || "", (bestQ.price + w * 0.4).toFixed(2)]);
    });
    setBatchResult({ rows: resultRows, count: dataRows.length });
    showToast(`批量测算完成，共 ${dataRows.length} 条订单`);
  };

  const downloadBatchResult = () => {
    if (!batchResult) return;
    const csv = batchResult.rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `批量测算结果_${Date.now()}.csv`; a.click();
    showToast("批量测算结果已下载");
  };

  const filteredCards = PRICE_CARDS.filter((c) =>
    (carrier === "全部" || c.carrier === carrier) &&
    (version === "全部" || c.version === version) &&
    (!q || (c.state || "").includes(q) || (c.zipFrom || "").includes(q))
  );

  // 校验问题
  const overlapCount = PRICE_CARDS.filter((c) => +c.zipTo < +c.zipFrom).length;
  const missingCount = PRICE_CARDS.filter((c) => c.price <= 0).length;

  const city = CITIES.find((c) => c.name === calcCity) || CITIES[0];
  const quotes = useMemo(() => computeQuotes(calcWeight, calcCity, city.lng, city.lat), [calcWeight, calcCity, city.lng, city.lat]);
  const sorted = [...quotes].sort((a, b) => mode === "cost" ? a.price - b.price : a.days - b.days || a.price - b.price);
  const best = sorted[0];

  // 仓库推荐
  const whRecommend = useMemo(() => [...warehouses].map((w) => {
    const dist = Math.hypot(w.lng - city.lng, w.lat - city.lat);
    const shipCost = +(calcWeight * 0.42 * dist + 3).toFixed(2);
    const lastMile = (computeQuotes(calcWeight, calcCity, city.lng, city.lat).find((q) => q.carrier === "USPS")?.price || 8);
    return { ...w, dist, shipCost, lastMile, total: +(shipCost + lastMile).toFixed(2), eta: +(1 + dist / 12).toFixed(1) };
  }).sort((a, b) => mode === "cost" ? a.total - b.total : a.eta - b.eta || a.total - b.total), [calcWeight, calcCity, city.lng, city.lat, mode, warehouses]);

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="尾程价卡与仓配智能测算" desc="价卡版本管理、数据校验，与多服务商比价 + 最优发货仓推荐"
        actions={<>
          <button className={clsx("btn", tab === "manage" && "btn-primary")} onClick={() => setTab("manage")}><ReceiptText size={14} /> 价卡管理</button>
          <button className={clsx("btn", tab === "calc" && "btn-primary")} onClick={() => setTab("calc")}><Calculator size={14} /> 测算工作台</button>
        </>} />

      {tab === "calc" && warehouses.length === 0 ? (
        <div className="card"><EmptyData label="海外仓" icon="🧮" onGoData={() => onNavigate?.("datacenter")} /><div className="text-center -mt-12 pb-6 text-[11.5px]" style={{ color: "var(--text-3)" }}>仓配测算需先录入海外仓；尾程价卡可在「数据中心」单独管理。</div></div>
      ) : tab === "calc" ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard label="最优尾程成本" value={`$${best.price}`} delta={-6.4} icon={<DollarSign size={15} />} accent="#16a34a" />
            <KpiCard label="最优时效" value={String(best.days)} unit="天" icon={<Clock size={15} />} accent="#3366ff" />
            <KpiCard label="推荐服务商" value={best.carrier} icon={<CheckCircle2 size={15} />} accent="#7c3aed" />
            <KpiCard label="比价渠道" value={String(quotes.length)} unit="家" icon={<TrendingDown size={15} />} accent="#0891b2" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* 输入 + 比价 */}
            <div className="space-y-3 lg:col-span-2">
              <Section title="单订单测算">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>SKU</label><select className="field w-full" value={calcSku} onChange={(e) => { setCalcSku(e.target.value); const s = SKUS.find((x) => x.id === e.target.value); if (s) setCalcWeight(s.weight); }}>{SKUS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  <div><label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>包裹重量 (kg)</label><input type="number" step="0.1" min="0.1" className="field w-full" value={calcWeight} onChange={(e) => setCalcWeight(+e.target.value)} /></div>
                  <div><label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>目的城市</label><select className="field w-full" value={calcCity} onChange={(e) => setCalcCity(e.target.value)}>{Array.from(new Set(CITIES.map((c) => c.name))).map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div><label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>优化目标</label><div className="flex gap-1">{(["cost", "time"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className="flex-1 h-[34px] rounded-lg text-[12px] font-medium" style={{ background: mode === m ? "var(--brand)" : "var(--surface-2)", color: mode === m ? "#fff" : "var(--text-2)" }}>{m === "cost" ? "成本优先" : "时效优先"}</button>)}</div></div>
                </div>
              </Section>

              <Section title="多服务商比价">
                <div className="space-y-2">
                  {sorted.map((q, i) => (
                    <div key={q.carrier} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: i === 0 ? "color-mix(in srgb, var(--green) 8%, transparent)" : "var(--surface-2)", border: i === 0 ? "1px solid color-mix(in srgb, var(--green) 30%, transparent)" : "1px solid transparent" }}>
                      <span className={clsx("w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center", i === 0 ? "bg-emerald-500 text-white" : "")} style={i > 0 ? { background: "var(--border)", color: "var(--text-2)" } : {}}>{i + 1}</span>
                      <div className="w-[80px] font-semibold">{q.carrier}</div>
                      <div className="flex-1"><div className="text-[10.5px] mb-1" style={{ color: "var(--text-3)" }}>运费 + 燃油附加费</div><ProgressBar value={(q.price / sorted[3].price) * 100} color={i === 0 ? "var(--green)" : "var(--brand)"} /></div>
                      <div className="text-right"><div className="text-[17px] font-bold">${q.price}</div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>{q.days} 天送达</div></div>
                      {i === 0 && <span className="tag" style={{ background: "var(--green)", color: "#fff" }}><CheckCircle2 size={11} /> 推荐</span>}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="推荐发货仓库（含头程 + 尾程落地成本）">
                <div className="table-wrap"><table className="data"><thead><tr><th>#</th><th>仓库</th><th>距离</th><th>头程成本</th><th>尾程成本</th><th>落地成本</th><th>预计时效</th></tr></thead><tbody>
                  {whRecommend.slice(0, 6).map((w, i) => (
                    <tr key={w.id} style={i === 0 ? { background: "color-mix(in srgb, var(--green) 6%, transparent)" } : {}}>
                      <td><span className={clsx("w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center", i === 0 ? "bg-emerald-500 text-white" : "")} style={i > 0 ? { background: "var(--surface-2)", color: "var(--text-2)" } : {}}>{i + 1}</span></td>
                      <td className="font-medium">{w.name}</td>
                      <td style={{ color: "var(--text-2)" }}>{w.dist.toFixed(1)}°</td>
                      <td>${w.shipCost}</td><td>${w.lastMile}</td>
                      <td className="font-bold" style={{ color: i === 0 ? "var(--green)" : "var(--text)" }}>${w.total}</td>
                      <td>{w.eta} 天</td>
                    </tr>
                  ))}
                </tbody></table></div>
              </Section>
            </div>

            {/* 侧栏 */}
            <div className="space-y-3">
              <Section title="智能推荐结论">
                <div className="p-3.5 rounded-xl" style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--brand) 10%, transparent), color-mix(in srgb, #7c3aed 8%, transparent))" }}>
                  <div className="text-[11px] mb-1" style={{ color: "var(--text-3)" }}>{mode === "cost" ? "💰 成本优先 · 最优方案" : "⚡ 时效优先 · 最优方案"}</div>
                  <div className="text-[15px] font-bold mb-2">{best.carrier} 尾程 + {whRecommend[0].name}</div>
                  <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                    <div><div style={{ color: "var(--text-3)" }}>落地总成本</div><b className="text-[16px]">${whRecommend[0].total}</b></div>
                    <div><div style={{ color: "var(--text-3)" }}>综合时效</div><b className="text-[16px]">{whRecommend[0].eta} 天</b></div>
                  </div>
                </div>
                <button className="btn btn-primary w-full mt-3" onClick={() => {
                  store.addSolution({
                    id: `sol-${Date.now()}`, name: `${best.carrier} + ${whRecommend[0].name}`,
                    createdAt: new Date().toLocaleString("zh-CN"), weight: calcWeight, city: calcCity,
                    carrier: best.carrier, price: best.price, days: best.days,
                    warehouse: whRecommend[0].name, total: whRecommend[0].total,
                  });
                  showToast(`已保存测算方案「${best.carrier} + ${whRecommend[0].name}」`);
                }}><CheckCircle2 size={14} /> 采用此方案</button>
                {store.solutions.length > 0 && <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                  <div className="text-[11px] mb-1.5" style={{ color: "var(--text-3)" }}>已保存方案（{store.solutions.length}）</div>
                  {store.solutions.slice(0, 3).map((s) => <div key={s.id} className="flex items-center justify-between text-[11px] py-1"><span className="truncate">{s.name}</span><b style={{ color: "var(--brand)" }}>${s.total}</b></div>)}
                </div>}
              </Section>
              <Section title="批量测算">
                <div className="text-[11.5px] mb-3" style={{ color: "var(--text-2)" }}>导入订单清单，一次性批量计算多仓库 × 多渠道尾程成本。</div>
                <button className="btn w-full" onClick={() => setBatchOpen(true)}><Upload size={14} /> 导入订单清单</button>
                <div className="mt-2 text-[10.5px]" style={{ color: "var(--text-3)" }}>支持 Excel / CSV，最多 5000 条</div>
              </Section>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard label="当前版本" value={version} icon={<ReceiptText size={15} />} />
            <KpiCard label="价卡条目" value={String(PRICE_CARDS.length)} unit="条" icon={<ReceiptText size={15} />} accent="#7c3aed" />
            <KpiCard label="数据校验问题" value={String(overlapCount + missingCount)} unit="项" icon={<AlertTriangle size={15} />} accent="#ef4444" />
            <KpiCard label="历史版本" value={String(allVersions.length)} unit="个" icon={<History size={15} />} accent="#0891b2" />
          </div>

          <Section>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <select className="field" value={version} onChange={(e) => setVersion(e.target.value)}>{["全部", ...allVersions].map((v) => <option key={v}>{v}</option>)}</select>
              <select className="field" value={carrier} onChange={(e) => setCarrier(e.target.value)}>{["全部", "UPS", "USPS", "DHL", "FedEx"].map((c) => <option key={c}>{c}</option>)}</select>
              <input className="field w-[160px]" placeholder="搜索州 / 邮编…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="ml-auto flex gap-2">
                <button className="btn" onClick={() => setCompareOpen(true)}><GitCompare size={14} /> 版本对比</button>
                <input ref={cardFileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={importCardFile} />
                <button className="btn" onClick={() => cardFileRef.current?.click()}><Upload size={14} /> 导入 CSV</button>
                <button className="btn btn-primary" onClick={() => {
                  const nums = allVersions.map((v) => parseFloat(v.replace("v", "")) || 0);
                  const next = `v${(Math.max(0, ...nums) + 0.1).toFixed(1)}`;
                  store.addCardVersion({ version: next, createdAt: new Date().toISOString().slice(0, 10), note: "从当前版本创建" });
                  setVersion(next);
                  showToast(`已创建新价卡版本 ${next}`);
                }}><Plus size={14} /> 新增版本</button>
              </div>
            </div>
            {(overlapCount + missingCount) > 0 && (
              <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-[11.5px]" style={{ background: "color-mix(in srgb, var(--amber) 10%, transparent)", color: "var(--amber)" }}>
                <AlertTriangle size={14} /> 检测到 {overlapCount} 条邮编区间异常、{missingCount} 条缺失价格，请校验后启用
              </div>
            )}
            <div className="table-wrap max-h-[460px] overflow-y-auto"><table className="data"><thead><tr>
              <th>服务商</th><th>国家</th><th>州</th><th>邮编区间</th><th>重量段(kg)</th><th>运费</th><th>燃油附加</th><th>时效</th><th>生效日期</th>
            </tr></thead><tbody>
              {filteredCards.slice(0, 100).map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.carrier}</td><td>{c.country}</td><td>{c.state}</td>
                  <td className="font-mono" style={{ color: "var(--text-2)" }}>{c.zipFrom}–{c.zipTo}</td>
                  <td>{c.weightFrom}–{c.weightTo}</td><td className="font-bold">${c.price}</td>
                  <td style={{ color: "var(--text-3)" }}>${c.fuelSurcharge}</td><td>{c.deliveryDays} 天</td><td style={{ color: "var(--text-3)" }}>{c.effectiveDate}</td>
                </tr>
              ))}
            </tbody></table></div>
          </Section>
        </>
      )}

      {/* 版本对比弹窗 */}
      {compareOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={() => setCompareOpen(false)}>
          <div className="w-[560px] max-w-[92vw] max-h-[80vh] overflow-y-auto rounded-2xl p-5 shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-[15px] font-bold flex items-center gap-2"><GitCompare size={17} style={{ color: "var(--brand)" }} />价卡版本对比</h3><button onClick={() => setCompareOpen(false)}><X size={18} style={{ color: "var(--text-3)" }} /></button></div>
            <div className="space-y-2 text-[12px]">
              {(() => {
                const versions = allVersions.filter((v) => v !== "全部");
                if (versions.length < 2) return <div className="py-10 text-center" style={{ color: "var(--text-3)" }}>至少需要 2 个版本且包含价卡数据才能对比。请在「数据中心」录入价卡并创建多个版本。</div>;
                const carriers = Array.from(new Set(PRICE_CARDS.map((c) => c.carrier)));
                return carriers.map((car) => {
                  const curArr = PRICE_CARDS.filter((c) => c.carrier === car && c.version === version);
                  const avg = curArr.length ? curArr.reduce((s, c) => s + c.price, 0) / curArr.length : 0;
                  return <div key={car} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: "var(--surface-2)" }}>
                    <span className="flex-1">{car} 平均运费</span>
                    <span style={{ color: "var(--text-3)" }}>{curArr.length} 条</span>
                    <b>${avg.toFixed(2)}</b>
                  </div>;
                });
              })()}
            </div>
            <p className="text-[10.5px] mt-3" style={{ color: "var(--text-3)" }}>对比基于你录入的真实价卡数据；不同版本的价格需分别录入后才会出现在对比中。</p>
          </div>
        </div>
      )}

      {/* 批量导入弹窗 */}
      {batchOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={() => setBatchOpen(false)}>
          <div className="w-[520px] max-w-[92vw] rounded-2xl p-6 shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-bold flex items-center gap-2"><Upload size={17} style={{ color: "var(--brand)" }} />批量订单测算</h3><button onClick={() => setBatchOpen(false)} className="text-[18px]" style={{ color: "var(--text-3)" }}>×</button></div>
            <p className="text-[12px] mb-3" style={{ color: "var(--text-2)" }}>导入 CSV 文件（含 weight/重量、city/城市 列），系统将逐单匹配价卡与仓库。</p>
            <input ref={batchFileRef} type="file" accept=".csv,.txt,text/csv" className="hidden" onChange={importBatchFile} />
            <div className="p-6 rounded-xl border-2 border-dashed mb-3 text-center cursor-pointer" style={{ borderColor: "var(--border)" }} onClick={() => batchFileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { e.preventDefault(); const dt = e.dataTransfer; const file = dt.files?.[0]; if (file) { const rows = parseCsv(await readFileText(file)); setBatchFile({ name: file.name, rows }); showToast(`已载入「${file.name}」`); } }}>
              <div className="text-[24px] mb-1">📁</div>
              <div className="text-[12px]" style={{ color: batchFile ? "var(--brand)" : "var(--text-3)" }}>{batchFile ? `${batchFile.name} · ${batchFile.rows.length - 1} 条订单` : "点击或拖放 CSV 文件至此"}</div>
            </div>
            {batchResult && <div className="mb-3 p-3 rounded-lg" style={{ background: "color-mix(in srgb, var(--green) 8%, transparent)" }}>
              <div className="text-[12px] font-medium" style={{ color: "var(--green)" }}>✓ 测算完成：{batchResult.count} 条订单</div>
              <div className="text-[10.5px] mt-1" style={{ color: "var(--text-2)" }}>结果含最优渠道 / 尾程成本 / 时效 / 推荐仓 / 落地总成本</div>
            </div>}
            <div className="flex gap-2">
              <button className="btn flex-1" onClick={() => setBatchOpen(false)}>关闭</button>
              <button className="btn flex-1" onClick={runBatchCalc} disabled={!batchFile}><Calculator size={13} /> 开始测算</button>
              <button className="btn btn-primary flex-1" onClick={downloadBatchResult} disabled={!batchResult}><Download size={13} /> 下载结果</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
