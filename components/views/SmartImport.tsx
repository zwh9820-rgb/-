"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Upload, X, FileSpreadsheet, Check, ChevronDown, Save, Trash2, Sparkles,
  AlertTriangle, CheckCircle2, RotateCcw, Database, ArrowRight, Info,
} from "lucide-react";
import { useStore, type EntityKey } from "@/lib/store";
import { ENTITY_SCHEMAS } from "@/lib/data-schema";
import { readFileText, readXlsx, isExcel } from "@/lib/file-utils";
import { mapRows, detectEntity, type MappingResult } from "@/lib/import-mapper";
import clsx from "clsx";

type ParsedFile = {
  id: string;
  fileName: string;
  entity: EntityKey;
  headers: string[];
  rows: string[][];
  sheets?: string[];
  sheet?: string;
  file: File;
};
type Preset = { name: string; entity: EntityKey; mapping: Record<string, string>; createdAt: string };
const PRESET_KEY = "cbh_import_presets_v1";

const ENTITY_LABELS: Record<EntityKey, string> = {
  warehouses: "海外仓", orders: "订单", skus: "SKU", inventory: "库存",
  containers: "海运集装箱", priceCards: "尾程价卡", alerts: "预警",
};

export default function SmartImport({
  onClose, onImported, showToast,
}: {
  onClose: () => void;
  onImported: () => void;
  showToast: (m: string) => void;
}) {
  const store = useStore();
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<MappingResult | null>(null);
  const [presets, setPresets] = useState<Preset[]>(() => {
    try { return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]"); } catch { return []; }
  });
  const [presetName, setPresetName] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = files.find((f) => f.id === activeId) || null;
  const schema = active ? ENTITY_SCHEMAS.find((s) => s.key === active.entity)! : null;

  const autoMap = (pf: ParsedFile): Record<string, string> => {
    const r = mapRows(pf.entity, pf.headers, []); // 用空数据行拿自动匹配结果
    return { ...r.matched };
  };

  const parseOne = async (file: File, sheet?: string): Promise<ParsedFile> => {
    let headers: string[], rows: string[][], sheets: string[] | undefined;
    if (isExcel(file)) {
      const x = await readXlsx(file, sheet);
      headers = x.headers; rows = x.rows; sheets = x.sheets;
    } else {
      const text = await readFileText(file);
      const parsed = text.replace(/^\ufeff/, "").trim().split(/\r?\n/).filter(Boolean).map((line) => {
        const out: string[] = []; let cur = "", q = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
          else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
          else cur += ch;
        }
        out.push(cur.trim()); return out;
      });
      // 探测表头起始行：找非空单元格最多的一行（跳过标题/说明行）
      let hIdx = 0, best = -1;
      for (let i = 0; i < Math.min(6, parsed.length); i++) {
        const nonEmpty = parsed[i].filter((c) => c).length;
        if (nonEmpty > best) { best = nonEmpty; hIdx = i; }
      }
      headers = parsed[hIdx] || []; rows = parsed.slice(hIdx + 1);
    }
    const guess = detectEntity(headers)[0]?.entity || "orders";
    return { id: `${file.name}-${Date.now()}-${Math.random()}`, fileName: file.name, entity: guess, headers, rows, sheets, sheet, file };
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    e.target.value = "";
    if (!list.length) return;
    setBusy(true);
    try {
      const parsed: ParsedFile[] = [];
      for (const f of list) {
        try { parsed.push(await parseOne(f)); }
        catch { showToast(`「${f.name}」解析失败，已跳过`); }
      }
      if (parsed.length) {
        setFiles((prev) => [...prev, ...parsed]);
        setActiveId(parsed[0].id);
        showToast(`已识别 ${parsed.length} 个文件`);
      }
    } finally { setBusy(false); }
  };

  // 切换活动文件时载入其映射
  useEffect(() => {
    if (!active) { setMapping({}); setPreview(null); return; }
    setMapping(autoMap(active));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // 映射变化 → 实时预览
  useEffect(() => {
    if (!active) { setPreview(null); return; }
    try { setPreview(mapRows(active.entity, active.headers, active.rows.slice(0, 50), 1, mapping)); }
    catch { setPreview(null); }
  }, [active, mapping]);

  const setEntity = (entity: EntityKey) => {
    if (!active) return;
    // 切换实体后重新自动映射
    setFiles((prev) => prev.map((f) => f.id === active.id ? { ...f, entity } : f));
    const r = mapRows(entity, active.headers, []);
    setMapping({ ...r.matched });
  };

  const changeSheet = async (sheet: string) => {
    if (!active) return;
    setBusy(true);
    try {
      const pf = await parseOne(active.file, sheet);
      setFiles((prev) => prev.map((f) => f.id === active.id ? { ...f, ...pf, id: f.id } : f));
      setMapping(autoMap({ ...pf, id: active.id }));
    } finally { setBusy(false); }
  };

  const savePreset = () => {
    if (!active || !presetName.trim()) { showToast("请先填写方案名称"); return; }
    const p: Preset = { name: presetName.trim(), entity: active.entity, mapping: { ...mapping }, createdAt: new Date().toISOString().slice(0, 10) };
    const next = [p, ...presets.filter((x) => x.name !== p.name)];
    setPresets(next);
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(next)); } catch {}
    setPresetName("");
    showToast(`方案「${p.name}」已保存`);
  };
  const applyPreset = (p: Preset) => {
    if (!active) return;
    if (p.entity !== active.entity) { showToast(`该方案适用于${ENTITY_LABELS[p.entity]}，请先切换文件类型`); return; }
    setMapping({ ...p.mapping });
    showToast(`已套用方案「${p.name}」`);
  };
  const deletePreset = (name: string) => {
    const next = presets.filter((x) => x.name !== name);
    setPresets(next); try { localStorage.setItem(PRESET_KEY, JSON.stringify(next)); } catch {}
  };

  const doImport = (replace: boolean) => {
    if (!files.length) { showToast("请先添加文件"); return; }
    let total = 0;
    files.forEach((pf) => {
      const r = mapRows(pf.entity, pf.headers, pf.rows, Date.now(), mappingFor(pf.id));
      if (!r.records.length) return;
      const setter = (store as any)[`set${cap(pf.entity)}`];
      if (typeof setter === "function") {
        const current = (store[pf.entity] as any[]) || [];
        setter(replace ? r.records : [...r.records, ...current]);
      }
      total += r.records.length;
    });
    showToast(`已导入 ${total} 条数据（${files.length} 个文件）`);
    onImported();
    onClose();
  };

  // 每个文件各自保存映射（切换后编辑的是当前文件）
  const [mappingByFile, setMappingByFile] = useState<Record<string, Record<string, string>>>({});
  const mappingFor = (id: string) => mappingByFile[id] || (id === activeId ? mapping : {});
  useEffect(() => {
    if (active) setMappingByFile((prev) => ({ ...prev, [active.id]: mapping }));
  }, [mapping, active]);

  const matchedCount = Object.values(mapping).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div className="w-[960px] max-w-full h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <div>
            <h3 className="text-[15px] font-bold flex items-center gap-2"><Sparkles size={17} style={{ color: "var(--brand)" }} /> 智能导入工作台</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>把原始文件放进去，自动识别列并生成映射；你只需确认每列读成什么。</p>
          </div>
          <button className="p-1.5 rounded-lg" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* 左侧：文件列表 */}
          <div className="w-[210px] shrink-0 border-r flex flex-col" style={{ borderColor: "var(--border)" }}>
            <div className="p-3 border-b" style={{ borderColor: "var(--border)" }}>
              <button className="btn btn-primary w-full !h-8" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload size={13} /> {busy ? "识别中…" : "添加文件"}
              </button>
              <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFiles} />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {files.map((f) => (
                <button key={f.id} onClick={() => setActiveId(f.id)}
                  className={clsx("w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left", activeId === f.id && "ring-1")}
                  style={{ background: activeId === f.id ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent" }}>
                  <FileSpreadsheet size={15} className="shrink-0 mt-0.5" style={{ color: "var(--brand)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-medium truncate" title={f.fileName}>{f.fileName}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
                      {ENTITY_LABELS[f.entity]} · {f.rows.length} 行
                    </div>
                  </div>
                  <span className="p-0.5 rounded" onClick={(e) => { e.stopPropagation(); setFiles((prev) => prev.filter((x) => x.id !== f.id)); }}>
                    <X size={13} style={{ color: "var(--text-3)" }} />
                  </span>
                </button>
              ))}
              {!files.length && <div className="px-3 py-10 text-center text-[11px]" style={{ color: "var(--text-3)" }}>还没有文件<br />点上方「添加文件」<br />可一次选多个</div>}
            </div>
            {/* 方案区 */}
            {presets.length > 0 && (
              <div className="p-2.5 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="text-[10.5px] font-semibold mb-1.5" style={{ color: "var(--text-3)" }}>已保存的映射方案</div>
                <div className="space-y-1 max-h-[140px] overflow-y-auto">
                  {presets.map((p) => (
                    <div key={p.name} className="flex items-center gap-1 text-[10.5px] px-1.5 py-1 rounded" style={{ background: "var(--surface-2)" }}>
                      <button className="flex-1 text-left truncate" onClick={() => applyPreset(p)} title={`套用：${p.name}`}>{p.name}</button>
                      <span style={{ color: "var(--text-3)" }}>{ENTITY_LABELS[p.entity]}</span>
                      <span onClick={() => deletePreset(p.name)}><Trash2 size={11} style={{ color: "var(--text-3)", cursor: "pointer" }} /></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 右侧：映射配置 */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {!active ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ color: "var(--text-3)" }}>
                <Database size={40} className="mb-3 opacity-40" />
                <div className="text-[13px]">添加文件后，这里会显示每一列的读取方式</div>
                <div className="text-[11px] mt-1.5">支持订单出库、库存、SKU 等原始 Excel，自动识别类型</div>
              </div>
            ) : (
              <>
                {/* 文件信息条 */}
                <div className="px-4 py-2.5 border-b flex items-center gap-3 flex-wrap shrink-0" style={{ borderColor: "var(--border)" }}>
                  <span className="text-[12.5px] font-semibold truncate max-w-[280px]">{active.fileName}</span>
                  <span className="text-[11px]" style={{ color: "var(--text-3)" }}>识别为</span>
                  <select className="field !h-7 !w-32 !text-[11px]" value={active.entity} onChange={(e) => setEntity(e.target.value as EntityKey)}>
                    {ENTITY_SCHEMAS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                  {active.sheets && active.sheets.length > 1 && (
                    <select className="field !h-7 !w-36 !text-[11px]" value={active.sheet || active.sheets[0]} onChange={(e) => changeSheet(e.target.value)}>
                      {active.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  <span className="ml-auto text-[11px] px-2 py-1 rounded-full" style={{ background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)" }}>
                    自动识别 {matchedCount} 个字段
                  </span>
                </div>

                {/* 映射表 */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[12px] font-semibold">字段映射（每列读成什么）</div>
                    <div className="flex items-center gap-1.5">
                      <input className="field !h-7 !w-32 !text-[11px]" placeholder="方案名称" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
                      <button className="btn !h-7 !px-2 !text-[11px]" onClick={savePreset}><Save size={12} /> 存为方案</button>
                      <button className="btn !h-7 !px-2 !text-[11px]" onClick={() => setMapping(autoMap(active))}><RotateCcw size={12} /> 重置</button>
                    </div>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
                          <th className="text-left px-3 py-2 font-medium w-[34%]">文件里的列</th>
                          <th className="text-left px-3 py-2 font-medium w-[8%]"></th>
                          <th className="text-left px-3 py-2 font-medium w-[30%]">读成系统字段</th>
                          <th className="text-left px-3 py-2 font-medium">样例值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {active.headers.map((h, i) => {
                          const matchedField = Object.entries(mapping).find(([, col]) => col === h)?.[0];
                          const sample = active.rows.slice(0, 20).map((r) => r[i]).filter((v) => v && String(v).trim())[0] || "";
                          return (
                            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1.5">
                                  {matchedField ? <CheckCircle2 size={12} style={{ color: "var(--green)" }} className="shrink-0" /> : <span className="w-3" />}
                                  <span className="truncate font-medium" title={h}>{h || `（空列 ${i + 1}）`}</span>
                                </div>
                              </td>
                              <td className="px-2 py-1.5 text-center" style={{ color: "var(--text-3)" }}>→</td>
                              <td className="px-3 py-1.5">
                                <select className="field !h-7 !text-[11px] w-full" value={matchedField || ""}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setMapping((prev) => {
                                      const next = { ...prev };
                                      // 先清除该列原来的映射
                                      Object.keys(next).forEach((k) => { if (next[k] === h) delete next[k]; });
                                      // 若目标字段已被别的列占用，清掉
                                      if (val) {
                                        Object.keys(next).forEach((k) => { if (k === val) delete next[k]; });
                                        next[val] = h;
                                      }
                                      return next;
                                    });
                                  }}>
                                  <option value="">不读取（忽略此列）</option>
                                  {schema?.fields.map((f) => (
                                    <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-1.5 truncate max-w-[180px]" style={{ color: "var(--text-3)" }} title={String(sample)}>{String(sample)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* 预览 */}
                  {preview && preview.records.length > 0 && (
                    <div className="mt-4">
                      <div className="text-[12px] font-semibold mb-2 flex items-center gap-2">
                        解析预览 <span className="text-[10.5px] font-normal" style={{ color: "var(--text-3)" }}>（前 3 条 · 共将导入 {preview.records.length} 条）</span>
                        {active.entity === "orders" && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--brand) 10%, transparent)", color: "var(--brand)" }}>州/坐标按邮编与州字段自动补全</span>}
                      </div>
                      <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
                        <table className="w-full text-[10.5px]">
                          <thead><tr style={{ background: "var(--surface-2)" }}>
                            {Object.keys(preview.records[0] || {}).filter((k) => !["id"].includes(k)).slice(0, 12).map((k) => {
                              const f = schema?.fields.find((x) => x.key === k);
                              return <th key={k} className="text-left px-2 py-1.5 font-medium whitespace-nowrap">{f?.label || k}</th>;
                            })}
                          </tr></thead>
                          <tbody>{preview.records.slice(0, 3).map((r, i) => (
                            <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                              {Object.keys(preview.records[0] || {}).filter((k) => !["id"].includes(k)).slice(0, 12).map((k) => (
                                <td key={k} className="px-2 py-1.5 whitespace-nowrap max-w-[120px] truncate" title={String(r[k] ?? "")}>{String(r[k] ?? "")}</td>
                              ))}
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <div className="mt-2 flex items-start gap-1.5 text-[10.5px]" style={{ color: "var(--text-3)" }}>
                        <Info size={12} className="shrink-0 mt-0.5" />
                        <span>确认无误后点底部按钮导入。导入后如需修正单条，可到数据中心表格里编辑。</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 底部 */}
        <div className="px-5 py-3 border-t flex items-center gap-2 shrink-0" style={{ borderColor: "var(--border)" }}>
          <div className="text-[11px] mr-auto" style={{ color: "var(--text-3)" }}>
            {files.length ? `${files.length} 个文件 · 将按各自类型分别导入` : "添加文件后开始"}
          </div>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn" onClick={() => doImport(false)} disabled={!files.length}><ArrowRight size={13} /> 追加到现有数据</button>
          <button className="btn btn-primary" onClick={() => doImport(true)} disabled={!files.length}><Check size={13} /> 导入并替换全部</button>
        </div>
      </div>
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
