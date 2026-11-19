"use client";

import { useState, useRef, useMemo } from "react";
import {
  Database, Plus, Pencil, Trash2, Upload, Download, X, Search,
  CheckCircle2, AlertTriangle, FileSpreadsheet, Info, RotateCcw, Sparkles,
} from "lucide-react";
import { useStore, type EntityKey } from "@/lib/store";
import {
  ENTITY_SCHEMAS, templateCsv,
  type EntitySchema, type FieldDef,
} from "@/lib/data-schema";
import { readFileText, readXlsx, isExcel } from "@/lib/file-utils";
import { mapRows, type MappingResult } from "@/lib/import-mapper";
import { PageHeader, Section } from "./shared";
import SmartImport from "./SmartImport";
import clsx from "clsx";

export default function DataCenterView({
  showToast, onNavigate,
}: {
  showToast: (m: string) => void;
  onNavigate: (k: any) => void;
}) {
  const store = useStore();
  const [active, setActive] = useState<EntityKey>("warehouses");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [editSchema, setEditSchema] = useState<EntitySchema | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [smartOpen, setSmartOpen] = useState(false);
  // 导入映射预览
  const [importPreview, setImportPreview] = useState<{
    entity: EntityKey; fileName: string; result: MappingResult; sheets?: string[]; sheet?: string; file?: File;
  } | null>(null);

  const schema = ENTITY_SCHEMAS.find((s) => s.key === active)!;
  const records: Record<string, any>[] = store[active] as any;

  const filtered = useMemo(() => {
    if (!q.trim()) return records;
    const kw = q.toLowerCase();
    return records.filter((r) =>
      Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(kw))
    );
  }, [records, q]);

  const openNew = () => {
    const defaults: Record<string, any> = {};
    schema.fields.forEach((f) => { defaults[f.key] = f.default ?? ""; });
    setEditSchema(schema);
    setEditing(defaults);
  };
  const openEdit = (rec: Record<string, any>) => { setEditSchema(schema); setEditing({ ...rec }); };

  const saveEdit = () => {
    if (!editing || !editSchema) return;
    for (const f of editSchema.fields) {
      if (f.required && (editing[f.key] === "" || editing[f.key] === undefined || editing[f.key] === null)) {
        showToast(`请填写「${f.label}」`); return;
      }
    }
    store.upsertRecord(editSchema.key, editing);
    showToast(`${editSchema.label}已保存`);
    setEditing(null); setEditSchema(null);
  };

  const doDelete = (rec: Record<string, any>) => {
    if (!window.confirm(`确定删除这条${schema.label}记录吗？此操作不可撤销。`)) return;
    store.deleteRecord(schema.key, rec.id);
    showToast("已删除");
  };

  const clearAll = () => {
    if (!records.length) return;
    if (!window.confirm(`确定清空全部 ${records.length} 条${schema.label}数据吗？此操作不可撤销。`)) return;
    store.clearEntity(schema.key);
    showToast(`已清空${schema.label}数据`);
  };

  const downloadTemplate = () => {
    const blob = new Blob([templateCsv(schema)], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `${schema.label}导入模板.csv`);
    showToast("模板已下载；若使用系统原生导出文件，可直接导入无需套模板");
  };

  const exportCurrent = () => {
    if (!records.length) { showToast("暂无数据可导出"); return; }
    const header = "\uFEFF" + schema.fields.map((f) => f.label).join(",") + "\n";
    const body = records.map((r) => schema.fields.map((f) => {
      const v = String(r[f.key] ?? "");
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")).join("\n");
    triggerDownload(new Blob([header + body], { type: "text/csv;charset=utf-8" }), `${schema.label}数据导出.csv`);
    showToast(`已导出 ${records.length} 条记录`);
  };

  const parseFile = async (file: File, entity: EntityKey, sheet?: string) => {
    try {
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
        headers = parsed[0] || []; rows = parsed.slice(1);
      }
      if (!headers.length || !rows.length) { showToast("文件无有效数据行，请检查格式"); return; }
      const result = mapRows(entity, headers, rows);
      if (!result.records.length) { showToast("未解析到有效数据行"); return; }
      setImportPreview({ entity, fileName: file.name, result, sheets, sheet, file });
    } catch (err) {
      showToast("文件解析失败：" + (err instanceof Error ? err.message : "格式错误"));
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) parseFile(file, active);
  };

  // 确认导入（可选：追加 or 替换）
  const confirmImport = (replace: boolean) => {
    if (!importPreview) return;
    const { entity, result } = importPreview;
    const next = replace ? result.records : [...result.records, ...(store[entity] as any[])];
    (store as any)[`set${cap(entity)}`](next);
    showToast(`成功导入 ${result.records.length} 条${ENTITY_SCHEMAS.find(s=>s.key===entity)?.label}数据`);
    setImportPreview(null);
  };

  const totalCount = ENTITY_SCHEMAS.reduce((s, sc) => s + ((store[sc.key] as any[])?.length || 0), 0);

  return (
    <div className="h-full overflow-y-auto p-5 lg:p-6">
      <PageHeader
        title="数据中心"
        desc="所有业务数据由你手动录入或 CSV 导入，保存在本机；程序不再预置任何虚拟数据。"
        actions={
          <>
            <span className="tag" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>共 {totalCount} 条真实数据</span>
            <button className="btn btn-primary" onClick={() => setSmartOpen(true)}><Sparkles size={14} /> 智能导入</button>
            <button className="btn" onClick={() => onNavigate("settings")}><Database size={14} /> 接口配置</button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        {ENTITY_SCHEMAS.map((sc) => {
          const count = ((store[sc.key] as any[])?.length || 0);
          return (
            <button key={sc.key} onClick={() => { setActive(sc.key); setQ(""); }}
              className={clsx("card p-3 text-left transition-all", active === sc.key && "ring-2")}
              style={active === sc.key ? { borderColor: "var(--brand)" } : {}}>
              <div className="text-[18px] mb-1">{sc.icon}</div>
              <div className="text-[12px] font-semibold">{sc.label}</div>
              <div className="text-[10.5px] mt-0.5" style={{ color: count ? "var(--brand)" : "var(--text-3)" }}>{count} 条</div>
            </button>
          );
        })}
      </div>

      <div className="mb-3 flex items-start gap-2 p-3 rounded-xl text-[11.5px]" style={{ background: "color-mix(in srgb, var(--brand) 6%, transparent)", color: "var(--text-2)" }}>
        <Sparkles size={15} className="shrink-0 mt-0.5" style={{ color: "var(--brand)" }} />
        <div>
          <b style={{ color: "var(--text)" }}>推荐用「智能导入」</b>：一次把原始 Excel 全放进去，系统自动识别是订单/库存/SKU，并自动匹配每一列；你只需确认每列读成什么。地址会自动按「州字段 / 邮编 → 州中心」聚合，不再逐个猜坐标。
          <button className="ml-1 underline" style={{ color: "var(--brand)" }} onClick={() => setSmartOpen(true)}>立即打开 →</button>
        </div>
      </div>

      <Section
        title={`${schema.icon} ${schema.label}数据`}
        extra={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索…" className="field !h-8 !w-40 !pl-7" />
            </div>
            <button className="btn !h-8" onClick={downloadTemplate} title="下载含表头的 CSV 模板"><Download size={13} /> 模板</button>
            <button className="btn !h-8" onClick={() => fileRef.current?.click()}><Upload size={13} /> 导入 Excel / CSV</button>
            <button className="btn !h-8" onClick={exportCurrent}><FileSpreadsheet size={13} /> 导出</button>
            <button className="btn btn-primary !h-8" onClick={openNew}><Plus size={13} /> 新增</button>
          </div>
        }
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => handleImport(e)} />

        {records.length === 0 ? (
          <div className="py-14 text-center">
            <div className="text-[40px] mb-3">{schema.icon}</div>
            <div className="text-[14px] font-semibold mb-1">暂无{schema.label}数据</div>
            <p className="text-[12px] mb-4" style={{ color: "var(--text-3)" }}>程序未预置任何虚拟数据。可手动新增，或直接导入系统导出的 Excel / CSV（自动识别列名并映射）。</p>
            <div className="flex items-center justify-center gap-2">
              <button className="btn" onClick={downloadTemplate}><Download size={13} /> 下载模板</button>
              <button className="btn btn-primary" onClick={openNew}><Plus size={13} /> 手动录入第一条</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[12px]" style={{ color: "var(--text-3)" }}>没有匹配「{q}」的记录</div>
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
                    <th className="text-left py-2 pr-3 font-medium whitespace-nowrap">#</th>
                    {schema.fields.slice(0, 6).map((f) => <th key={f.key} className="text-left py-2 pr-3 font-medium whitespace-nowrap">{f.label}</th>)}
                    <th className="text-right py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr key={r.id ?? idx} className="border-b hover:opacity-80" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pr-3" style={{ color: "var(--text-3)" }}>{idx + 1}</td>
                      {schema.fields.slice(0, 6).map((f) => (
                        <td key={f.key} className="py-2 pr-3 whitespace-nowrap max-w-[180px] truncate">{String(r[f.key] ?? "—")}</td>
                      ))}
                      <td className="py-2 text-right whitespace-nowrap">
                        <button className="p-1.5 rounded hover:bg-opacity-10" style={{ color: "var(--brand)" }} title="编辑" onClick={() => openEdit(r)}><Pencil size={13} /></button>
                        <button className="p-1.5 rounded" style={{ color: "var(--red)" }} title="删除" onClick={() => doDelete(r)}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 text-[10.5px]" style={{ color: "var(--text-3)" }}>
              <span>显示 {filtered.length} / {records.length} 条</span>
              <button className="flex items-center gap-1 hover:underline" onClick={clearAll}><RotateCcw size={11} /> 清空全部</button>
            </div>
          </>
        )}
      </Section>

      {/* 编辑弹窗 */}
      {editing && editSchema && (
        <EditModal
          schema={editSchema} value={editing} onChange={setEditing}
          onClose={() => { setEditing(null); setEditSchema(null); }} onSave={saveEdit}
        />
      )}

      {/* 导入映射预览弹窗（旧版单文件） */}
      {importPreview && (
        <ImportPreview
          preview={importPreview}
          onSheet={(s) => { if (importPreview.file) parseFile(importPreview.file, importPreview.entity, s); }}
          onClose={() => setImportPreview(null)}
          onConfirm={confirmImport}
        />
      )}

      {/* 智能导入工作台 */}
      {smartOpen && (
        <SmartImport
          onClose={() => setSmartOpen(false)}
          onImported={() => { /* store 已更新，视图会随 useStore 自动刷新 */ }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function EditModal({ schema, value, onChange, onClose, onSave }: {
  schema: EntitySchema; value: Record<string, any>;
  onChange: (v: Record<string, any>) => void; onClose: () => void; onSave: () => void;
}) {
  const setField = (f: FieldDef, val: any) => onChange({ ...value, [f.key]: val });
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div className="w-[620px] max-w-full max-h-[88vh] rounded-2xl shadow-2xl flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div><h3 className="text-[15px] font-bold">{schema.icon} {value.id ? `编辑${schema.label}` : `新增${schema.label}`}</h3>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>带 * 为必填项</p></div>
          <button className="p-1.5 rounded-lg" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {schema.fields.map((f) => (
            <div key={f.key} className={clsx(f.type === "textarea" && "md:col-span-2")}>
              <label className="block text-[11.5px] font-medium mb-1.5">{f.label}{f.required && <span style={{ color: "var(--red)" }}> *</span>}</label>
              {f.type === "select" ? (
                <select className="field" value={value[f.key] ?? ""} onChange={(e) => setField(f, e.target.value)}>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === "textarea" ? (
                <textarea className="field !h-auto min-h-[70px] py-2" value={value[f.key] ?? ""} onChange={(e) => setField(f, e.target.value)} />
              ) : (
                <input className="field" type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  step={f.type === "number" ? "any" : undefined}
                  value={value[f.key] ?? ""} onChange={(e) => setField(f, f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
              )}
              {f.help && <div className="text-[10px] mt-1" style={{ color: "var(--text-3)" }}>{f.help}</div>}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          <button className="btn flex-1" onClick={onClose}>取消</button>
          <button className="btn btn-primary flex-1" onClick={onSave}><CheckCircle2 size={14} /> 保存</button>
        </div>
      </div>
    </div>
  );
}

function ImportPreview({ preview, onSheet, onClose, onConfirm }: {
  preview: { entity: EntityKey; fileName: string; result: MappingResult; sheets?: string[]; sheet?: string };
  onSheet: (s: string) => void;
  onClose: () => void;
  onConfirm: (replace: boolean) => void;
}) {
  const { result, sheets, sheet, fileName } = preview;
  const entityLabel = ENTITY_SCHEMAS.find((s) => s.key === preview.entity)?.label || preview.entity;
  const fieldLabels: Record<string, string> = {};
  ENTITY_SCHEMAS.find((s) => s.key === preview.entity)?.fields.forEach((f) => { fieldLabels[f.key] = f.label; });
  const matchedEntries = Object.entries(result.matched);
  const sample = result.records.slice(0, 3);
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      <div className="w-[720px] max-w-full max-h-[90vh] rounded-2xl shadow-2xl flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div>
            <h3 className="text-[15px] font-bold flex items-center gap-2"><FileSpreadsheet size={17} style={{ color: "var(--brand)" }} /> 导入预览 · {entityLabel}</h3>
            <p className="text-[11px] mt-0.5 truncate max-w-[560px]" style={{ color: "var(--text-3)" }}>{fileName} · 解析到 {result.records.length} 条</p>
          </div>
          <button className="p-1.5 rounded-lg" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 工作表切换 */}
          {sheets && sheets.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11.5px]" style={{ color: "var(--text-2)" }}>工作表：</span>
              {sheets.map((s) => (
                <button key={s} onClick={() => onSheet(s)} className="px-2.5 py-1 rounded-md text-[11px]"
                  style={{ background: (sheet || sheets[0]) === s ? "var(--brand)" : "var(--surface-2)", color: (sheet || sheets[0]) === s ? "#fff" : "var(--text-2)" }}>{s}</button>
              ))}
            </div>
          )}
          {/* 字段映射 */}
          <div>
            <div className="text-[12px] font-semibold mb-2">字段自动映射（{matchedEntries.length} 项已识别）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {matchedEntries.map(([key, col]) => (
                <div key={key} className="flex items-center gap-2 text-[11px] px-2.5 py-1.5 rounded-lg" style={{ background: "var(--surface-2)" }}>
                  <CheckCircle2 size={12} style={{ color: "var(--green)" }} className="shrink-0" />
                  <span className="font-medium shrink-0" style={{ minWidth: 76 }}>{fieldLabels[key] || key}</span>
                  <span style={{ color: "var(--text-3)" }}>←</span>
                  <span className="truncate" style={{ color: "var(--text-2)" }} title={col}>{col}</span>
                </div>
              ))}
            </div>
            {result.unmatched.length > 0 && (
              <div className="mt-2 text-[10.5px] px-2.5 py-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--amber) 10%, transparent)", color: "var(--amber)" }}>
                未识别字段（将使用默认值）：{result.unmatched.map((k) => fieldLabels[k] || k).join("、")}
              </div>
            )}
          </div>
          {/* 数据样例 */}
          <div>
            <div className="text-[12px] font-semibold mb-2">数据预览（前 3 条）</div>
            <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
              <table className="w-full text-[10.5px]">
                <thead><tr style={{ background: "var(--surface-2)" }}>
                  {Object.keys(sample[0] || {}).slice(0, 8).map((k) => <th key={k} className="text-left px-2 py-1.5 font-medium whitespace-nowrap">{fieldLabels[k] || k}</th>)}
                </tr></thead>
                <tbody>{sample.map((r, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                    {Object.keys(sample[0] || {}).slice(0, 8).map((k) => <td key={k} className="px-2 py-1.5 whitespace-nowrap max-w-[140px] truncate">{String(r[k] ?? "")}</td>)}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <div className="text-[10.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
            💡 系统已自动识别列名并补全缺失的坐标（按城市匹配）。导入后可在表格中逐条编辑修正。若映射有误，可关闭后改用「模板」方式。
          </div>
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          <button className="btn flex-1" onClick={onClose}>取消</button>
          <button className="btn flex-1" onClick={() => onConfirm(false)}><Plus size={13} /> 追加到现有数据</button>
          <button className="btn btn-primary flex-1" onClick={() => onConfirm(true)}><RotateCcw size={13} /> 替换全部数据</button>
        </div>
      </div>
    </div>
  );
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
