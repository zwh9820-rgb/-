"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  FolderOpen, FolderPlus, RefreshCw, Search, Star, FileText, FileSpreadsheet,
  Image as ImageIcon, FileArchive, File, Eye, Download, ExternalLink, Folder,
  Trash2, Shield, ShieldCheck, X, Globe, HardDrive, Grid2X2, List, Lock, Unlock,
  ChevronRight, ChevronDown, ArrowLeft, Home, ArrowUpDown, Loader2, Files,
} from "lucide-react";
import { useStore, type FileRoot, type FilePref } from "@/lib/store";
import { PageHeader, Section } from "./shared";

type ScannedFile = {
  path: string; name: string; ext: string; size: number; mtime: number; root: string;
};
type DirEntry = { path: string; name: string; isDir: true; mtime: number };

const fileAPI = (typeof window !== "undefined") ? (window as any).fileAPI : null;

const CATEGORY_LABELS: Record<string, string> = {
  all: "全部", doc: "文档", sheet: "表格", image: "图片", pdf: "PDF", archive: "压缩包", fav: "收藏",
};
const SORT_LABELS: Record<string, string> = { name: "名称", mtime: "修改时间", size: "大小" };

function categoryOf(ext: string): string {
  const e = ext.toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"].includes(e)) return "image";
  if (e === ".pdf") return "pdf";
  if ([".xls", ".xlsx", ".csv"].includes(e)) return "sheet";
  if ([".doc", ".docx", ".ppt", ".pptx", ".txt", ".md", ".json"].includes(e)) return "doc";
  if ([".zip", ".rar", ".7z"].includes(e)) return "archive";
  return "other";
}

function FileIcon({ ext, size = 18 }: { ext: string; size?: number }) {
  const cat = categoryOf(ext);
  const props = { size };
  if (cat === "image") return <ImageIcon {...props} style={{ color: "var(--green)" }} />;
  if (cat === "pdf") return <FileText {...props} style={{ color: "var(--red)" }} />;
  if (cat === "sheet") return <FileSpreadsheet {...props} style={{ color: "var(--green)" }} />;
  if (cat === "archive") return <FileArchive {...props} style={{ color: "var(--amber)" }} />;
  if (cat === "doc") return <FileText {...props} style={{ color: "var(--blue, var(--brand))" }} />;
  return <File {...props} style={{ color: "var(--text-3)" }} />;
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(ms: number) {
  try { return new Date(ms).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

// 路径工具（渲染层无 node:path，手动归一化）
const norm = (p: string) => (p || "").replace(/\\/g, "/");
const isUnder = (dir: string, root: string) => {
  const d = norm(dir), r = norm(root).replace(/\/$/, "");
  return d === r || d.startsWith(r + "/");
};
function crumbsOf(dir: string, root: string): { name: string; path: string }[] {
  const d = norm(dir), r = norm(root).replace(/\/$/, "");
  const rel = d.slice(r.length).replace(/^\//, "");
  const out = [{ name: r.split("/").pop() || r, path: norm(root) }];
  let acc = r;
  if (rel) for (const seg of rel.split("/")) { acc += "/" + seg; out.push({ name: seg, path: acc }); }
  return out;
}

type Scope = "tree" | "all" | "fav" | string; // tree=目录浏览；all/fav/分类=全局索引视图

export default function FileCenterView({ showToast }: { showToast: (m: string) => void }) {
  const store = useStore();
  const [allFiles, setAllFiles] = useState<ScannedFile[]>([]); // 全量递归索引（全局搜索/分类用）
  const [scanning, setScanning] = useState(false);

  // NAS 浏览状态
  const [scope, setScope] = useState<Scope>("tree");
  const [currentDir, setCurrentDir] = useState<string>("");
  const [dirData, setDirData] = useState<{ folders: DirEntry[]; files: ScannedFile[] }>({ folders: [], files: [] });
  const [dirLoading, setDirLoading] = useState(false);
  const [treeCache, setTreeCache] = useState<Record<string, DirEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortBy, setSortBy] = useState<"name" | "mtime" | "size">("name");
  const [sortAsc, setSortAsc] = useState(true);

  const [preview, setPreview] = useState<ScannedFile | null>(null);
  const [previewData, setPreviewData] = useState<{ kind: string; data: string; mime: string; error?: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const enabledRoots = useMemo(() => (store.fileRoots || []).filter((r) => r.enabled).map((r) => r.path), [store.fileRoots]);
  const prefMap = useMemo(() => {
    const m: Record<string, FilePref> = {};
    (store.filePrefs || []).forEach((p) => { m[p.path] = p; });
    return m;
  }, [store.filePrefs]);

  const canView = useCallback((f: ScannedFile) => {
    const s = store.fileSettings;
    if (!s?.adminMode) return true;
    const p = prefMap[f.path];
    return p?.viewable !== undefined ? p.viewable : s.defaultViewable;
  }, [store.fileSettings, prefMap]);
  const canDownload = useCallback((f: ScannedFile) => {
    const s = store.fileSettings;
    if (!s?.adminMode) return true;
    const p = prefMap[f.path];
    return p?.downloadable !== undefined ? p.downloadable : s.defaultDownloadable;
  }, [store.fileSettings, prefMap]);

  const doScan = useCallback(async () => {
    if (!fileAPI) { showToast("文件中心仅在桌面版可用"); return; }
    if (!enabledRoots.length) { showToast("请先在管理面板添加目录"); setShowAdmin(true); return; }
    setScanning(true);
    try {
      const list = await fileAPI.scan(enabledRoots);
      setAllFiles(Array.isArray(list) ? list : []);
      showToast(`索引完成，共 ${Array.isArray(list) ? list.length : 0} 个文件`);
    } catch (e) { showToast("扫描失败：" + String(e)); }
    finally { setScanning(false); }
  }, [enabledRoots, showToast]);

  // 加载某个目录的一级内容
  const loadDir = useCallback(async (dir: string) => {
    if (!fileAPI || !dir) return;
    setDirLoading(true);
    try {
      const res = await fileAPI.listDir(dir, enabledRoots);
      if (res && !res.error) setDirData({ folders: res.folders || [], files: res.files || [] });
      else { setDirData({ folders: [], files: [] }); if (res?.error) showToast(res.error); }
    } catch (e) { setDirData({ folders: [], files: [] }); showToast("读取目录失败：" + String(e)); }
    finally { setDirLoading(false); }
  }, [enabledRoots, showToast]);

  // 首次有目录：定位到第一个根目录并浏览
  useEffect(() => {
    if (!currentDir || !enabledRoots.some((r) => isUnder(currentDir, r))) {
      if (enabledRoots[0]) { setCurrentDir(norm(enabledRoots[0])); setScope("tree"); }
    }
    if (enabledRoots.length && !allFiles.length) doScan(); /* eslint-disable-next-line */
  }, [enabledRoots, currentDir, allFiles.length]);

  // 目录浏览时加载内容
  useEffect(() => { if (scope === "tree" && currentDir) loadDir(currentDir); /* eslint-disable-next-line */ }, [scope, currentDir, loadDir]);

  const enterDir = (p: string) => { setScope("tree"); setCurrentDir(norm(p)); setQ(""); };
  const goUp = () => {
    const parent = currentDir.replace(/\/+$/, "").split("/").slice(0, -1).join("/");
    if (parent && enabledRoots.some((r) => isUnder(parent, r) || norm(r) === parent)) enterDir(parent);
    else { setCurrentDir(enabledRoots[0] ? norm(enabledRoots[0]) : ""); }
  };

  const toggleExpand = async (p: string) => {
    if (expanded.has(p)) { setExpanded((prev) => { const n = new Set(prev); n.delete(p); return n; }); return; }
    if (!treeCache[p] && fileAPI) {
      const res = await fileAPI.listDir(p, enabledRoots);
      if (res && !res.error) setTreeCache((c) => ({ ...c, [p]: res.folders || [] }));
    }
    setExpanded((prev) => { const n = new Set(prev); n.add(p); return n; });
  };

  // 当前展示的文件集合
  const displayFiles = useMemo(() => {
    let list: ScannedFile[];
    if (q.trim()) {
      const kw = q.toLowerCase();
      list = allFiles.filter((f) => f.name.toLowerCase().includes(kw) || f.path.toLowerCase().includes(kw));
    } else if (scope === "tree") {
      list = dirData.files;
    } else if (scope === "fav") {
      list = allFiles.filter((f) => prefMap[f.path]?.fav);
    } else if (scope !== "all") {
      list = allFiles.filter((f) => categoryOf(f.ext) === scope);
    } else {
      list = allFiles;
    }
    const sign = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === "size") return (a.size - b.size) * sign;
      if (sortBy === "mtime") return (a.mtime - b.mtime) * sign;
      return a.name.localeCompare(b.name, "zh-CN") * sign;
    });
  }, [q, scope, dirData.files, allFiles, prefMap, sortBy, sortAsc]);

  // 分页：网盘目录可能上千文件，限制每页 DOM 数量
  const FILE_PAGE_SIZE = 100;
  const [filePage, setFilePage] = useState(0);
  useEffect(() => { setFilePage(0); }, [q, scope, currentDir, sortBy, sortAsc]);
  const filePageCount = Math.max(1, Math.ceil(displayFiles.length / FILE_PAGE_SIZE));
  const safeFilePage = Math.min(filePage, filePageCount - 1);
  const pagedFiles = displayFiles.slice(safeFilePage * FILE_PAGE_SIZE, (safeFilePage + 1) * FILE_PAGE_SIZE);

  const displayFolders = useMemo(() => {
    if (q.trim() || scope !== "tree") return [];
    return [...dirData.folders].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }, [q, scope, dirData.folders]);

  const setPref = (path: string, patch: Partial<FilePref>) => {
    store.setFilePrefs((prev) => {
      const idx = prev.findIndex((p) => p.path === path);
      if (idx < 0) return [...prev, { path, fav: false, ...patch }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const openPreview = async (f: ScannedFile) => {
    if (!canView(f)) { showToast("管理员已限制此文件的预览权限"); return; }
    // PDF 用独立窗口交给 Electron 内置查看器渲染（data: URL 在 Electron 中会白屏）
    if (f.ext === ".pdf" && fileAPI?.previewPdf) {
      const r = await fileAPI.previewPdf(f.path, enabledRoots, f.name);
      if (r?.ok === false) showToast(r.error || "PDF 预览失败，请点「打开」用系统程序查看");
      return;
    }
    setPreview(f); setPreviewLoading(true); setPreviewData(null);
    try {
      const res = await fileAPI.read(f.path, enabledRoots);
      setPreviewData(res);
    } catch (e) { setPreviewData({ kind: "text", data: "", mime: "", error: String(e) }); }
    finally { setPreviewLoading(false); }
  };

  const doOpen = async (f: ScannedFile) => { const r = await fileAPI.open(f.path, enabledRoots); if (r?.ok === false) showToast(r.error || "打开失败"); };
  const doReveal = async (f: ScannedFile) => { const r = await fileAPI.reveal(f.path, enabledRoots); if (r?.ok === false) showToast(r.error || "定位失败"); };
  const doDownload = async (f: ScannedFile) => {
    if (!canDownload(f)) { showToast("管理员已限制此文件的下载权限"); return; }
    const r = await fileAPI.saveAs(f.path, enabledRoots);
    if (r?.ok) showToast(`已保存到 ${r.savedTo}`);
    else if (!r?.canceled) showToast(r?.error || "下载失败");
  };

  const catCounts = useMemo(() => {
    const c: Record<string, number> = { all: allFiles.length, fav: 0, doc: 0, sheet: 0, image: 0, pdf: 0, archive: 0, other: 0 };
    allFiles.forEach((f) => { c[categoryOf(f.ext)] = (c[categoryOf(f.ext)] || 0) + 1; if (prefMap[f.path]?.fav) c.fav++; });
    return c;
  }, [allFiles, prefMap]);

  const currentRoot = enabledRoots.find((r) => isUnder(currentDir, r)) || enabledRoots[0];

  // 左侧目录树节点
  const renderTreeNode = (dirPath: string, label: string, depth: number) => {
    const isOpen = expanded.has(dirPath);
    const children = treeCache[dirPath] || [];
    const active = scope === "tree" && norm(currentDir) === norm(dirPath);
    return (
      <div key={dirPath}>
        <div
          className="flex items-center gap-1 py-1.5 pr-2 rounded-lg cursor-pointer text-[12px]"
          style={{ paddingLeft: 6 + depth * 14, background: active ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "transparent", color: active ? "var(--brand)" : "var(--text-2)" }}
          onClick={() => { enterDir(dirPath); }}
        >
          <button
            className="shrink-0 p-0.5"
            onClick={(e) => { e.stopPropagation(); toggleExpand(dirPath); }}
            title={isOpen ? "折叠" : "展开"}
          >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <Folder size={14} className="shrink-0" style={{ color: active ? "var(--brand)" : "var(--amber)" }} />
          <span className="truncate" title={dirPath}>{label}</span>
        </div>
        {isOpen && children.map((c) => renderTreeNode(c.path, c.name, depth + 1))}
        {isOpen && !children.length && <div className="py-1 text-[10.5px]" style={{ paddingLeft: 20 + depth * 14, color: "var(--text-3)" }}>空文件夹</div>}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-5 lg:px-6 pt-5 pb-3">
        <PageHeader
          title="文件中心"
          desc="像 NAS 一样浏览网盘同步目录与本地硬盘，统一查找与预览产品说明书、清单等文件"
          actions={
            <>
              <span className="tag" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{allFiles.length} 个文件</span>
              <button className="btn" onClick={() => setShowAdmin((v) => !v)}><Shield size={14} /> 管理目录{showAdmin ? "（收起）" : ""}</button>
              <button className="btn btn-primary" onClick={doScan} disabled={scanning}>{scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {scanning ? "索引中…" : "重建索引"}</button>
            </>
          }
        />
      </div>

      {/* 管理面板：目录配置 + 权限 */}
      {showAdmin && (
        <div className="px-5 lg:px-6 pb-3">
          <Section title="管理面板 · 目录与权限">
            <div className="space-y-3">
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                添加网盘同步目录或本地文件夹，系统会建立索引；左侧目录树可像 NAS 一样层层展开浏览。再次打开程序会自动重建索引。
              </div>
              <div className="space-y-2">
                {(store.fileRoots || []).map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                    {r.kind === "network" ? <Globe size={16} style={{ color: "var(--brand)" }} /> : <HardDrive size={16} style={{ color: "var(--brand)" }} />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{r.label || "未命名目录"}</div>
                      <div className="text-[10.5px] font-mono truncate" style={{ color: "var(--text-3)" }} title={r.path}>{r.path}</div>
                    </div>
                    <button className="text-[11px]" style={{ color: r.enabled ? "var(--green)" : "var(--text-3)" }} onClick={() => store.setFileRoots((p) => p.map((x) => x.id === r.id ? { ...x, enabled: !x.enabled } : x))}>{r.enabled ? "已启用" : "已停用"}</button>
                    <button className="p-1.5 rounded" style={{ color: "var(--red)" }} title="移除目录" onClick={() => {
                      if (window.confirm(`移除目录「${r.label}」？索引的文件会从列表中消失（不会删除磁盘文件）。`)) store.setFileRoots((p) => p.filter((x) => x.id !== r.id));
                    }}><Trash2 size={14} /></button>
                  </div>
                ))}
                {!store.fileRoots?.length && <div className="text-[11.5px] py-3 text-center" style={{ color: "var(--text-3)" }}>还没有配置目录，点下方按钮添加</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn" onClick={async () => {
                  if (!fileAPI) { showToast("仅在桌面版可用"); return; }
                  const p = await fileAPI.chooseFolder();
                  if (!p) return;
                  const ok = await fileAPI.checkFolder(p);
                  if (!ok?.ok) { showToast("目录不可访问"); return; }
                  store.setFileRoots((prev) => [...prev, { id: `root-${Date.now()}`, label: p.split(/[\\/]/).pop() || "网盘目录", path: p, kind: "network", enabled: true }]);
                  showToast("已添加网盘/本地目录");
                }}><Globe size={13} /> 添加网盘同步目录</button>
                <button className="btn" onClick={async () => {
                  if (!fileAPI) { showToast("仅在桌面版可用"); return; }
                  const p = await fileAPI.chooseFolder();
                  if (!p) return;
                  store.setFileRoots((prev) => [...prev, { id: `root-${Date.now()}`, label: p.split(/[\\/]/).pop() || "本地目录", path: p, kind: "local", enabled: true }]);
                  showToast("已添加本地硬盘目录");
                }}><HardDrive size={13} /> 添加本地硬盘目录</button>
              </div>
              {/* 权限设置 */}
              <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] font-semibold flex items-center gap-1.5"><ShieldCheck size={14} /> 下载 / 观看权限控制</div>
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input type="checkbox" checked={!!store.fileSettings?.adminMode} onChange={(e) => store.setFileSettings({ ...store.fileSettings, adminMode: e.target.checked })} className="accent-blue-600" /> 启用权限控制
                  </label>
                </div>
                {store.fileSettings?.adminMode ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 text-[11.5px] p-2.5 rounded-lg cursor-pointer" style={{ background: "var(--surface-2)" }}>
                      <input type="checkbox" checked={!!store.fileSettings.defaultDownloadable} onChange={(e) => store.setFileSettings({ ...store.fileSettings, defaultDownloadable: e.target.checked })} className="accent-blue-600" /> 默认允许下载
                    </label>
                    <label className="flex items-center gap-2 text-[11.5px] p-2.5 rounded-lg cursor-pointer" style={{ background: "var(--surface-2)" }}>
                      <input type="checkbox" checked={!!store.fileSettings.defaultViewable} onChange={(e) => store.setFileSettings({ ...store.fileSettings, defaultViewable: e.target.checked })} className="accent-blue-600" /> 默认允许预览
                    </label>
                  </div>
                ) : (
                  <div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>未启用时所有文件均可预览和下载；启用后可对每个文件单独设置（见列表中的锁图标）。</div>
                )}
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* 主体：左侧目录树 + 右侧内容 */}
      <div className="flex-1 min-h-0 flex px-5 lg:px-6 pb-5 gap-3">
        {/* 左侧栏 */}
        <aside className="w-[220px] shrink-0 overflow-y-auto rounded-xl border p-2" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div className="text-[10px] font-semibold px-2 py-1.5 uppercase tracking-wide" style={{ color: "var(--text-3)" }}>快捷访问</div>
          {[
            { key: "all", label: "全部文件", icon: Files, count: catCounts.all },
            { key: "fav", label: "我的收藏", icon: Star, count: catCounts.fav },
            { key: "doc", label: "文档", icon: FileText, count: catCounts.doc },
            { key: "sheet", label: "表格", icon: FileSpreadsheet, count: catCounts.sheet },
            { key: "image", label: "图片", icon: ImageIcon, count: catCounts.image },
            { key: "pdf", label: "PDF", icon: FileText, count: catCounts.pdf },
            { key: "archive", label: "压缩包", icon: FileArchive, count: catCounts.archive },
          ].map((it) => {
            const Icon = it.icon;
            const active = !q.trim() && scope === it.key;
            return (
              <div key={it.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-[12px]" style={{ background: active ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "transparent", color: active ? "var(--brand)" : "var(--text-2)" }}
                onClick={() => { setQ(""); setScope(it.key); }}>
                <Icon size={14} className="shrink-0" /><span className="flex-1 truncate">{it.label}</span>
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{it.count}</span>
              </div>
            );
          })}
          <div className="mt-2 pt-2 border-t text-[10px] font-semibold px-2 py-1.5 uppercase tracking-wide" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>存储目录</div>
          {enabledRoots.map((r) => renderTreeNode(r, r.split("/").pop() || r, 0))}
          {!enabledRoots.length && <div className="px-2 py-2 text-[10.5px]" style={{ color: "var(--text-3)" }}>未配置目录</div>}
        </aside>

        {/* 右侧内容区 */}
        <section className="flex-1 min-w-0 flex flex-col">
          {/* 工具栏：面包屑 / 搜索 / 视图 / 排序 */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {!q.trim() && scope === "tree" ? (
              <div className="flex items-center gap-1 min-w-0 flex-1 text-[12px]">
                <button className="p-1.5 rounded-lg shrink-0" title="返回上级" onClick={goUp}><ArrowLeft size={15} /></button>
                <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
                  {currentRoot && crumbsOf(currentDir, currentRoot).map((c, i, arr) => (
                    <span key={c.path} className="flex items-center shrink-0">
                      {i > 0 && <ChevronRight size={12} style={{ color: "var(--text-3)" }} />}
                      <button className="px-1 py-0.5 rounded hover:underline truncate max-w-[160px]" style={{ color: i === arr.length - 1 ? "var(--text)" : "var(--brand)", fontWeight: i === arr.length - 1 ? 600 : 400 }} onClick={() => enterDir(c.path)} title={c.path}>
                        {i === 0 ? <Home size={12} className="inline mr-1 -mt-0.5" /> : null}{c.name}
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[12px] font-semibold flex-1" style={{ color: "var(--text)" }}>
                {q.trim() ? `搜索结果：${q}` : CATEGORY_LABELS[scope] || "全部文件"}
              </div>
            )}
            <div className="relative w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索全部文件…" className="field w-full !pl-9 !h-9" />
            </div>
            <button className="flex items-center gap-1 px-2.5 h-9 rounded-lg text-[11.5px]" style={{ background: "var(--surface-2)", color: "var(--text-2)" }} title="排序方式" onClick={() => setSortAsc((v) => !v)}>
              <ArrowUpDown size={14} /> {SORT_LABELS[sortBy]}{sortAsc ? "↑" : "↓"}
            </button>
            <select className="field !h-9 !w-auto !py-0" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              {Object.entries(SORT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="p-2 h-9 rounded-lg" style={{ background: "var(--surface-2)", color: "var(--text-2)" }} title="切换视图" onClick={() => setViewMode((v) => v === "list" ? "grid" : "list")}>
              {viewMode === "list" ? <Grid2X2 size={15} /> : <List size={15} />}
            </button>
          </div>

          {/* 内容 */}
          <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            {!enabledRoots.length ? (
              <div className="py-20 text-center">
                <FolderOpen size={44} className="mx-auto mb-3 opacity-30" style={{ color: "var(--text-3)" }} />
                <div className="text-[14px] font-semibold mb-1">还没有配置文件目录</div>
                <p className="text-[12px] mb-4" style={{ color: "var(--text-3)" }}>点右上角「管理目录」添加网盘同步文件夹或本地硬盘目录。</p>
                <button className="btn btn-primary" onClick={() => setShowAdmin(true)}><FolderPlus size={14} /> 去添加目录</button>
              </div>
            ) : dirLoading && scope === "tree" && !q.trim() ? (
              <div className="py-20 text-center"><Loader2 size={26} className="animate-spin mx-auto" style={{ color: "var(--brand)" }} /></div>
            ) : displayFolders.length === 0 && displayFiles.length === 0 ? (
              <div className="py-20 text-center text-[12px]" style={{ color: "var(--text-3)" }}>
                {q.trim() ? "没有匹配的文件" : scope === "tree" ? "此文件夹为空，或点「重建索引」" : "暂无文件"}
              </div>
            ) : viewMode === "list" ? (
              <table className="data w-full"><thead><tr>
                <th>名称</th><th>类型</th><th>大小</th><th>修改时间</th><th>权限</th><th>操作</th>
              </tr></thead><tbody>
                {displayFolders.map((d) => (
                  <tr key={"d" + d.path} className="cursor-pointer" onDoubleClick={() => enterDir(d.path)}>
                    <td className="font-medium" onClick={() => enterDir(d.path)}>
                      <div className="flex items-center gap-2"><Folder size={18} style={{ color: "var(--amber)" }} /><span className="truncate max-w-[320px]">{d.name}</span></div>
                    </td>
                    <td style={{ color: "var(--text-3)" }}>文件夹</td>
                    <td>—</td>
                    <td className="text-[11px]" style={{ color: "var(--text-3)" }}>{fmtDate(d.mtime)}</td>
                    <td colSpan={2}><button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => enterDir(d.path)}>打开</button></td>
                  </tr>
                ))}
                {pagedFiles.map((f) => {
                  const pref = prefMap[f.path];
                  return (
                    <tr key={f.path}>
                      <td className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileIcon ext={f.ext} />
                          <div className="min-w-0"><div className="truncate max-w-[280px]" title={f.name}>{f.name}</div>{!!q.trim() && <div className="text-[10px] truncate max-w-[280px]" style={{ color: "var(--text-3)" }} title={f.path}>{f.path}</div>}</div>
                          <button title={pref?.fav ? "取消收藏" : "收藏"} onClick={() => setPref(f.path, { fav: !pref?.fav })}><Star size={13} style={{ color: pref?.fav ? "var(--amber)" : "var(--text-3)", fill: pref?.fav ? "var(--amber)" : "transparent" }} /></button>
                        </div>
                      </td>
                      <td>{CATEGORY_LABELS[categoryOf(f.ext)] || "其他"}</td>
                      <td>{fmtSize(f.size)}</td>
                      <td className="text-[11px]" style={{ color: "var(--text-3)" }}>{fmtDate(f.mtime)}</td>
                      <td>
                        {store.fileSettings?.adminMode ? (
                          <div className="flex gap-1">
                            <button title={canView(f) ? "允许预览(点击禁止)" : "禁止预览(点击允许)"} onClick={() => setPref(f.path, { viewable: !canView(f) })}>{canView(f) ? <Eye size={13} style={{ color: "var(--green)" }} /> : <Eye size={13} style={{ color: "var(--text-3)" }} />}</button>
                            <button title={canDownload(f) ? "允许下载(点击禁止)" : "禁止下载(点击允许)"} onClick={() => setPref(f.path, { downloadable: !canDownload(f) })}>{canDownload(f) ? <Unlock size={13} style={{ color: "var(--green)" }} /> : <Lock size={13} style={{ color: "var(--red)" }} />}</button>
                          </div>
                        ) : <span className="text-[10.5px]" style={{ color: "var(--text-3)" }}>开放</span>}
                      </td>
                      <td>
                        <div className="flex gap-1.5 flex-wrap">
                          {canView(f) && <button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => openPreview(f)}>预览</button>}
                          {canDownload(f) && <button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => doDownload(f)}>下载</button>}
                          <button className="text-[11px]" style={{ color: "var(--text-2)" }} onClick={() => doOpen(f)}>打开</button>
                          <button className="text-[11px]" style={{ color: "var(--text-3)" }} onClick={() => doReveal(f)}>定位</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody></table>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 p-3">
                {displayFolders.map((d) => (
                  <div key={"d" + d.path} className="card p-3 flex flex-col gap-2 items-center cursor-pointer" onClick={() => enterDir(d.path)}>
                    <div className="h-16 w-full rounded-lg flex items-center justify-center" style={{ background: "var(--surface-2)" }}><Folder size={34} style={{ color: "var(--amber)" }} /></div>
                    <div className="text-[11.5px] font-medium text-center w-full truncate" title={d.name}>{d.name}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-3)" }}>文件夹</div>
                  </div>
                ))}
                {pagedFiles.map((f) => {
                  const pref = prefMap[f.path];
                  return (
                    <div key={f.path} className="card p-3 flex flex-col gap-2 relative">
                      <button className="absolute top-2 right-2" title={pref?.fav ? "取消收藏" : "收藏"} onClick={() => setPref(f.path, { fav: !pref?.fav })}><Star size={14} style={{ color: pref?.fav ? "var(--amber)" : "var(--text-3)", fill: pref?.fav ? "var(--amber)" : "transparent" }} /></button>
                      <div className="h-16 w-full rounded-lg flex items-center justify-center overflow-hidden" style={{ background: "var(--surface-2)" }}>
                        <span style={{ transform: "scale(1.6)" }}><FileIcon ext={f.ext} /></span>
                      </div>
                      <div className="text-[11.5px] font-medium truncate w-full text-center" title={f.name}>{f.name}</div>
                      <div className="text-[10px] text-center" style={{ color: "var(--text-3)" }}>{fmtSize(f.size)}</div>
                      <div className="flex gap-1.5 justify-center">
                        {canView(f) && <button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => openPreview(f)}>预览</button>}
                        {canDownload(f) && <button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => doDownload(f)}>下载</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {displayFiles.length > FILE_PAGE_SIZE && (
              <div className="flex items-center justify-center gap-2 py-3 text-[11px]" style={{ color: "var(--text-3)" }}>
                <button className="px-3 py-1 rounded-lg" style={{ background: "var(--surface-2)" }} disabled={safeFilePage === 0} onClick={() => setFilePage((p) => Math.max(0, p - 1))}>上一页</button>
                <span>第 {safeFilePage + 1} / {filePageCount} 页 · 共 {displayFiles.length} 个文件</span>
                <button className="px-3 py-1 rounded-lg" style={{ background: "var(--surface-2)" }} disabled={safeFilePage >= filePageCount - 1} onClick={() => setFilePage((p) => Math.min(filePageCount - 1, p + 1))}>下一页</button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 预览弹窗 */}
      {preview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="w-[1000px] max-w-full h-[88vh] rounded-2xl flex flex-col overflow-hidden" style={{ background: "var(--surface)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0"><div className="text-[14px] font-bold truncate flex items-center gap-2"><FileIcon ext={preview.ext} /> {preview.name}</div><div className="text-[10.5px] font-mono truncate" style={{ color: "var(--text-3)" }}>{preview.path}</div></div>
              <div className="flex items-center gap-2">
                {canDownload(preview) && <button className="btn !h-8" onClick={() => doDownload(preview)}><Download size={13} /> 下载</button>}
                <button className="p-1.5 rounded" onClick={() => setPreview(null)}><X size={18} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center" style={{ background: "var(--surface-2)" }}>
              {previewLoading ? <Loader2 size={28} className="animate-spin" style={{ color: "var(--brand)" }} /> :
               !previewData ? <div style={{ color: "var(--text-3)" }}>无预览数据</div> :
               previewData.error === "UNPREVIEWABLE" ? (
                 <div className="text-center"><FileIcon ext={preview.ext} size={48} /><div className="mt-3 text-[13px]" style={{ color: "var(--text-2)" }}>此格式暂不支持在线预览</div><button className="btn btn-primary mt-3" onClick={() => doOpen(preview)}><ExternalLink size={13} /> 用系统程序打开</button></div>
               ) : previewData.error ? (
                 <div className="text-[12px]" style={{ color: "var(--red)" }}>{previewData.error}</div>
               ) : previewData.kind === "base64" ? (
                 previewData.mime.startsWith("image/") ? <img src={`data:${previewData.mime};base64,${previewData.data}`} alt={preview.name} className="max-w-full max-h-full object-contain" /> :
                 <div className="text-center"><FileIcon ext={preview.ext} size={48} /><div className="mt-3 text-[13px]" style={{ color: "var(--text-2)" }}>此格式请在独立窗口查看</div><button className="btn btn-primary mt-3" onClick={() => doOpen(preview)}><ExternalLink size={13} /> 用系统程序打开</button></div>
               ) : (
                 <pre className="w-full h-full overflow-auto p-4 rounded-lg text-[12px] whitespace-pre-wrap break-words" style={{ background: "var(--surface)", color: "var(--text-2)" }}>{previewData.data || "（空文件）"}</pre>
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
