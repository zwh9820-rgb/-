"use client";

import { useState, useRef, useEffect } from "react";
import {
  KeyRound, Globe, BellRing, RefreshCw, Sun, Moon,
  Warehouse, Save, Eye, EyeOff, ShieldCheck, Plus, Edit, Check, Trash2, X,
  Loader2, PlugZap, AlertTriangle, MapPin, Download, Rocket, ExternalLink,
  CheckCircle2, Circle, HardDriveDownload, FileText, Copy,
} from "lucide-react";
import type { ThemeMode, Warehouse as WarehouseType, HealthStatus } from "@/lib/types";
import { useStore, ApiConfig, DEFAULT_THRESHOLDS } from "@/lib/store";
import { readFileText } from "@/lib/file-utils";
import { CHANGELOG, CHANGELOG_POLICY, formatReleaseNotes } from "@/lib/changelog";
import { PageHeader, Section } from "./shared";
import clsx from "clsx";

const EMPTY_WH: WarehouseType = {
  id: "", name: "", code: "", country: "", countryCode: "", state: "", city: "",
  lng: 0, lat: 0, capacity: 20000, used: 0, health: "healthy", skuCount: 0, dailyOutbound: 0,
};

const EMPTY_API: ApiConfig = {
  id: "", name: "", appKey: "", appSecret: "", endpoint: "", enabled: true, connected: false, updatedAt: "",
};

export default function SettingsView({ theme, setTheme, showToast, initialTab, onTabConsumed }: { theme: ThemeMode; setTheme: (t: ThemeMode) => void; showToast: (m: string) => void; initialTab?: string; onTabConsumed?: () => void }) {
  const store = useStore();
  const [tab, setTab] = useState<"api" | "geo" | "alert" | "sync" | "ui" | "warehouse" | "update">("api");

  // 从帮助菜单跳转时切到"在线更新"页
  useEffect(() => {
    if (initialTab === "update") { setTab("update"); onTabConsumed?.(); }
  }, [initialTab]);

  // 仓库编辑
  const [whForm, setWhForm] = useState<WarehouseType | null>(null);
  const [whFormNew, setWhFormNew] = useState(false);
  // API 编辑
  const [apiForm, setApiForm] = useState<ApiConfig | null>(null);
  const [apiFormNew, setApiFormNew] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- 在线更新 ----
  const updater = (typeof window !== "undefined") ? (window as any).updaterAPI : null;
  const [appInfo, setAppInfo] = useState<{ version: string; packaged: boolean }>({ version: "—", packaged: false });
  const [upCfg, setUpCfg] = useState({ provider: "github", owner: "", repo: "", private: false, token: "", feedUrl: "", autoCheck: true });
  const [upStatus, setUpStatus] = useState<{ state: string; message: string; percent: number; remoteVersion: string }>({ state: "idle", message: "", percent: 0, remoteVersion: "" });
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);

  useEffect(() => {
    if (!updater) return;
    updater.getInfo().then((i: any) => i && setAppInfo({ version: i.version, packaged: i.packaged })).catch(() => {});
    updater.getConfig().then((c: any) => { if (c) { setUpCfg(c); setCfgLoaded(true); } }).catch(() => {});
    const off = updater.onStatus?.((s: any) => { if (s) setUpStatus(s); });
    return () => { off?.(); };
  }, []);

  const saveUpdateConfig = async () => {
    if (!updater) return;
    setCfgSaving(true);
    try {
      const r = await updater.setConfig(upCfg);
      showToast(r?.ok ? "更新源配置已保存" : "配置保存失败");
    } catch { showToast("配置保存失败"); }
    finally { setCfgSaving(false); }
  };
  const doCheck = async () => {
    if (!updater) { showToast("在线更新仅在桌面版可用"); return; }
    await updater.check();
  };
  const doDownload = async () => {
    if (!updater) return;
    await updater.download();
  };
  const doInstall = async () => {
    if (!updater) return;
    // 安装前备份业务数据（不改动线上数据，只多存一份快照）
    try {
      const data = updater.collectDataForBackup?.() || {};
      const r = await updater.backup(data);
      if (r?.ok) showToast("已备份当前数据，即将安装更新并重启");
    } catch { showToast("即将安装更新并重启"); }
    await updater.install();
  };
  const cfgValid = !!upCfg.feedUrl || !!(upCfg.owner.trim() && upCfg.repo.trim());

  const tabs = [
    { key: "api", label: "API 密钥", icon: KeyRound },
    { key: "warehouse", label: "海外仓信息", icon: Warehouse },
    { key: "geo", label: "地理边界", icon: Globe },
    { key: "alert", label: "预警阈值", icon: BellRing },
    { key: "sync", label: "同步周期", icon: RefreshCw },
    { key: "ui", label: "界面主题", icon: Sun },
    { key: "update", label: "在线更新", icon: Download },
  ] as const;

  const geoFileRef = useRef<HTMLInputElement>(null);
  const handleGeoImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await readFileText(file);
      const json = JSON.parse(text);
      if (json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
        showToast("文件格式无效：需要标准 GeoJSON FeatureCollection");
        return;
      }
      const sizeKB = Math.round(text.length / 1024);
      store.addGeoLayer({
        id: `geo-${Date.now()}`,
        name: file.name.replace(/\.(geo)?json$/i, ""),
        desc: `${json.features.length} 个要素 · 用户导入`,
        size: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`,
        active: true,
        source: "imported",
      });
      showToast(`已导入「${file.name}」，共 ${json.features.length} 个地理要素`);
    } catch {
      showToast("文件解析失败：请检查是否为有效 JSON");
    }
  };

  // ---- 仓库操作 ----
  const openEditWh = (w: WarehouseType) => { setWhForm({ ...w }); setWhFormNew(false); };
  const openNewWh = () => { setWhForm({ ...EMPTY_WH, id: `wh-${Date.now()}` }); setWhFormNew(true); };
  const saveWh = () => {
    if (!whForm) return;
    if (!whForm.name.trim() || !whForm.code.trim()) { showToast("仓库名称与编码为必填项"); return; }
    if (!isFinite(whForm.lng) || !isFinite(whForm.lat)) { showToast("经纬度必须为有效数字"); return; }
    store.upsertWarehouse(whForm);
    setWhForm(null);
    showToast(whFormNew ? `已新增仓库「${whForm.name}」，地图与库存看板已同步` : `已保存仓库「${whForm.name}」，相关模块已更新`);
  };
  const removeWh = (w: WarehouseType) => {
    if (w.used > 0) { showToast(`仓库仍有 ${w.used.toLocaleString()} 件库存，请先调拨后再删除`); return; }
    store.deleteWarehouse(w.id);
    showToast(`已删除仓库「${w.name}」`);
  };

  // ---- API 操作 ----
  const openEditApi = (c: ApiConfig) => {
    const plain = store.plainSecrets[c.id] || { appKey: "", appSecret: "" };
    setApiForm({ ...c, appKey: plain.appKey, appSecret: plain.appSecret });
    setApiFormNew(false);
  };
  const openNewApi = () => { setApiForm({ ...EMPTY_API, id: `api-${Date.now()}` }); setApiFormNew(true); };
  const saveApi = async () => {
    if (!apiForm) return;
    if (!apiForm.name.trim()) { showToast("请填写配置名称"); return; }
    if (!/^https?:\/\//.test(apiForm.endpoint)) { showToast("接口地址需以 http:// 或 https:// 开头"); return; }
    setSaving(true);
    try {
      const cfg: ApiConfig = {
        ...apiForm,
        connected: !!(apiForm.appKey.trim() && apiForm.appSecret.trim()) && apiForm.enabled,
      };
      await store.saveApiConfig(cfg);
      showToast(`${cfg.name} 密钥已 AES 加密保存到本地`);
      setApiForm(null);
    } catch { showToast("保存失败，请重试"); }
    finally { setSaving(false); }
  };
  const testApi = async (c: ApiConfig) => {
    setTesting(c.id);
    const plain = store.plainSecrets[c.id];
    if (!plain?.appKey || !c.endpoint) {
      setTesting(null);
      showToast(`${c.name} 缺少密钥或接口地址，请先配置`);
      return;
    }
    // 真实探测：向 endpoint 发起带超时的 HEAD 请求
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(c.endpoint, { method: "HEAD", signal: ctrl.signal, mode: "cors" });
      showToast(`${c.name} 响应 ${res.status} · 接口可达（密钥认证需真实 API 验证）`);
    } catch (err: any) {
      const reason = err?.name === "AbortError" ? "连接超时" : "网络不可达或被 CORS 拦截";
      showToast(`${c.name} ${reason} · 配置已保存，联网环境可重试`);
    } finally {
      clearTimeout(timer);
      setTesting(null);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto p-5">
      <PageHeader title="系统设置" desc="API 密钥加密存储、海外仓信息、地理边界、预警阈值与同步周期"
        actions={<span className="flex items-center gap-1.5 text-[11.5px] px-3 py-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--green) 10%, transparent)", color: "var(--green)" }}><ShieldCheck size={14} /> 配置自动保存在本地</span>} />

      <div className="flex gap-1 border-b mb-4 overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          return <button key={t.key} onClick={() => setTab(t.key)} className="flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] font-medium whitespace-nowrap border-b-2 -mb-px" style={{ color: tab === t.key ? "var(--brand)" : "var(--text-2)", borderColor: tab === t.key ? "var(--brand)" : "transparent" }}><Icon size={14} /> {t.label}</button>;
        })}
      </div>

      {/* ============ API 密钥 ============ */}
      {tab === "api" && (
        <Section title="平台与物流 API 配置"
          extra={<button className="btn !h-8" onClick={openNewApi}><Plus size={13} /> 新增配置</button>}>
          <div className="mb-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11.5px]" style={{ background: "color-mix(in srgb, var(--brand) 8%, transparent)", color: "var(--brand)" }}>
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            密钥经 AES-256-GCM 加密后存储于本地，界面仅显示脱敏内容。清空密钥即视为未配置。
          </div>
          <div className="space-y-2.5">
            {store.apiConfigs.map((c) => {
              const plain = store.plainSecrets[c.id];
              const hasSecret = !!(plain?.appKey || c.appKey);
              const shown = showKeys[c.id];
              const cfgConnected = hasSecret && c.enabled && c.connected;
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--surface-2)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--brand) 10%, transparent)", color: "var(--brand)" }}><KeyRound size={15} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold">{c.name}</div>
                    <div className="text-[10.5px] font-mono truncate" style={{ color: "var(--text-3)" }}>
                      {!hasSecret ? "尚未配置密钥" : shown ? `Key: ${plain?.appKey || "—"} · Secret: ${plain?.appSecret || "—"}` : `Key: sk_••••${(plain?.appKey || "").slice(-4) || "****"} · Secret: ••••••••`}
                    </div>
                    <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>{c.endpoint}</div>
                  </div>
                  <button className="p-1.5 rounded-lg shrink-0" style={{ color: "var(--text-2)" }} title={shown ? "隐藏密钥" : "显示密钥"} onClick={() => setShowKeys({ ...showKeys, [c.id]: !shown })} disabled={!hasSecret}>{shown ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  <span className="tag shrink-0" style={{ background: cfgConnected ? "color-mix(in srgb, var(--green) 12%, transparent)" : "var(--border)", color: cfgConnected ? "var(--green)" : "var(--text-3)" }}>{cfgConnected ? "已连接" : c.enabled ? "未配置" : "已停用"}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <button className="btn !h-7 !px-2 !text-[11px]" onClick={() => testApi(c)} disabled={testing === c.id} title="测试连接">
                      {testing === c.id ? <Loader2 size={12} className="animate-spin" /> : <PlugZap size={12} />}
                    </button>
                    <button className="btn !h-7 !text-[11px]" onClick={() => openEditApi(c)}><Edit size={12} /> 配置</button>
                    <button className="btn !h-7 !px-2 !text-[11px]" onClick={() => { store.deleteApiConfig(c.id); showToast(`已删除 ${c.name} 配置`); }} title="删除配置" style={{ color: "var(--red)" }}><Trash2 size={12} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ============ 海外仓 ============ */}
      {tab === "warehouse" && (
        <Section title="海外仓基础信息维护" extra={<button className="btn !h-8" onClick={openNewWh}><Plus size={13} /> 新增仓库</button>}>
          <div className="mb-3 text-[11.5px]" style={{ color: "var(--text-3)" }}>
            共 {store.warehouses.length} 个仓库 · 编辑后地图点位、库存看板、仓配测算等模块会即时同步
          </div>
          <div className="table-wrap"><table className="data"><thead><tr>
            <th>仓库名称</th><th>编码</th><th>国家</th><th>城市</th><th>经纬度</th><th>库容</th><th>状态</th><th>操作</th>
          </tr></thead><tbody>
            {store.warehouses.map((w) => (
              <tr key={w.id}>
                <td className="font-medium">{w.name}</td>
                <td className="font-mono" style={{ color: "var(--text-2)" }}>{w.code}</td>
                <td>{w.country}</td>
                <td>{w.city}</td>
                <td className="font-mono" style={{ color: "var(--text-3)" }}>{w.lat.toFixed(2)}, {w.lng.toFixed(2)}</td>
                <td>{w.capacity.toLocaleString()}</td>
                <td><span className="tag" style={{ background: `color-mix(in srgb, ${w.health === "healthy" ? "var(--green)" : w.health === "warning" ? "var(--amber)" : "var(--red)"} 12%, transparent)`, color: w.health === "healthy" ? "var(--green)" : w.health === "warning" ? "var(--amber)" : "var(--red)" }}>{w.health === "healthy" ? "充足" : w.health === "warning" ? "预警" : "断货"}</span></td>
                <td>
                  <div className="flex gap-2">
                    <button className="text-[11px]" style={{ color: "var(--brand)" }} onClick={() => openEditWh(w)}>编辑</button>
                    <button className="text-[11px]" style={{ color: "var(--red)" }} onClick={() => removeWh(w)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody></table></div>
        </Section>
      )}

      {/* ============ 地理边界 ============ */}
      {tab === "geo" && (
        <Section title="GeoJSON 地理边界数据"
          extra={<button className="btn !h-8" onClick={() => geoFileRef.current?.click()}><Plus size={13} /> 导入自定义 GeoJSON</button>}>
          <input ref={geoFileRef} type="file" accept=".json,.geojson,application/json" className="hidden" onChange={handleGeoImport} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { id: "world", name: "世界国家边界", desc: "241 个国家/地区 · 50m 精度", size: "3.8 MB", active: true, source: "builtin" as const },
              { id: "us-states", name: "美国州级边界", desc: "56 个州/地区 · 10m 精度", size: "565 KB", active: true, source: "builtin" as const },
              ...store.geoLayers,
            ].map((g) => (
              <div key={g.id} className="flex items-center gap-3 p-3.5 rounded-xl" style={{ background: "var(--surface-2)" }}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--brand) 10%, transparent)", color: "var(--brand)" }}><Globe size={16} /></div>
                <div className="flex-1 min-w-0"><div className="text-[12.5px] font-semibold truncate">{g.name}</div><div className="text-[10.5px] truncate" style={{ color: "var(--text-3)" }}>{g.desc} · {g.size}</div></div>
                {g.source === "builtin" ? (
                  <span className="tag shrink-0" style={{ background: "color-mix(in srgb, var(--green) 12%, transparent)", color: "var(--green)" }}><Check size={10} /> 内置</span>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button className="text-[10.5px]" style={{ color: g.active ? "var(--green)" : "var(--text-3)" }} onClick={() => { store.toggleGeoLayer(g.id); showToast(`「${g.name}」已${g.active ? "停用" : "启用"}`); }}>{g.active ? "已启用" : "已停用"}</button>
                    <button className="p-1 rounded" style={{ color: "var(--red)" }} title="删除图层" onClick={() => { store.deleteGeoLayer(g.id); showToast(`已移除「${g.name}」`); }}><Trash2 size={12} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11px]" style={{ background: "color-mix(in srgb, var(--brand) 8%, transparent)", color: "var(--brand)" }}>
            <ShieldCheck size={14} className="mt-0.5 shrink-0" /> 导入的 GeoJSON 会校验格式并保存在本地。内置的世界/美国边界随应用提供，无需导入。
          </div>
        </Section>
      )}

      {/* ============ 预警阈值 ============ */}
      {tab === "alert" && (
        <Section title="自定义预警阈值">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[640px]">
            {[
              { key: "lowStock", label: "安全库存下限", unit: "件", hint: "SKU 可售低于此值触发库存预警" },
              { key: "etaDelay", label: "海运 ETA 延误", unit: "天", hint: "晚于预计到达此天数触发延误预警" },
              { key: "freightSurge", label: "尾程运费涨幅", unit: "%", hint: "环比涨幅超过此值触发运费预警" },
              { key: "returnRate", label: "区域退货率", unit: "%", hint: "超过此值标记为高退货区域" },
            ].map((f) => {
              const key = f.key as keyof typeof store.thresholds;
              const min = key === "returnRate" || key === "freightSurge" ? 5 : key === "etaDelay" ? 1 : 20;
              const max = key === "returnRate" ? 20 : key === "freightSurge" ? 50 : key === "etaDelay" ? 10 : 300;
              return (
                <div key={f.key}>
                  <label className="flex items-center justify-between text-[12px] mb-1.5"><span>{f.label}</span><span className="font-bold" style={{ color: "var(--brand)" }}>{store.thresholds[key]} {f.unit}</span></label>
                  <input type="range" className="w-full accent-blue-600" min={min} max={max} value={store.thresholds[key]} onChange={(e) => store.setThresholds({ ...store.thresholds, [key]: +e.target.value })} />
                  <div className="text-[10.5px] mt-1" style={{ color: "var(--text-3)" }}>{f.hint}</div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 mt-5">
            <button className="btn btn-primary" onClick={() => { store.setThresholds({ ...store.thresholds }); showToast("预警阈值已写入本地存储，地图标记将按新阈值更新"); }}><Save size={14} /> 保存阈值</button>
            <button className="btn" onClick={() => { store.setThresholds(DEFAULT_THRESHOLDS); showToast("已恢复默认阈值"); }}>恢复默认</button>
          </div>
        </Section>
      )}

      {/* ============ 同步周期 ============ */}
      {tab === "sync" && (
        <Section title="数据同步周期">
          <div className="max-w-[520px]">
            <label className="block text-[12px] mb-2" style={{ color: "var(--text-2)" }}>自动同步间隔（已自动保存）</label>
            <div className="flex gap-2">
              {[15, 30, 60].map((v) => <button key={v} onClick={() => { store.setSyncInterval(v); showToast(`同步间隔已设为 ${v} 分钟`); }} className="flex-1 h-10 rounded-lg text-[12.5px] font-medium" style={{ background: store.syncInterval === v ? "var(--brand)" : "var(--surface-2)", color: store.syncInterval === v ? "#fff" : "var(--text-2)" }}>{v} 分钟</button>)}
            </div>
            <div className="mt-5 space-y-2.5">
              {[
                { key: "incremental", label: "增量拉取", desc: "仅同步新增与变更数据，减少 API 调用" },
                { key: "rateLimit", label: "请求限流", desc: "自动排队与限速，规避平台风控" },
                { key: "retry", label: "失败重试", desc: "指数退避重试，最多 3 次" },
                { key: "offlineReadOnly", label: "离线只读", desc: "断网时只读本地历史数据，恢复后增量更新" },
              ].map((s) => {
                const key = s.key as keyof typeof store.syncOptions;
                return (
                  <label key={s.key} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer" style={{ background: "var(--surface-2)" }}>
                    <input type="checkbox" checked={store.syncOptions[key]} onChange={(e) => { store.setSyncOptions({ ...store.syncOptions, [key]: e.target.checked }); showToast(`${s.label}已${e.target.checked ? "启用" : "关闭"}`); }} className="accent-blue-600" />
                    <div><div className="text-[12px] font-medium">{s.label}</div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>{s.desc}</div></div>
                  </label>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      {/* ============ 主题 ============ */}
      {tab === "ui" && (
        <Section title="界面主题">
          <div className="grid grid-cols-2 gap-4 max-w-[440px]">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} onClick={() => setTheme(t)} className="p-4 rounded-xl text-left transition-all" style={{ border: `2px solid ${theme === t ? "var(--brand)" : "var(--border)"}` }}>
                <div className="h-24 rounded-lg mb-3 overflow-hidden flex" style={{ background: t === "light" ? "#f7f8fa" : "#0d1117", border: "1px solid var(--border)" }}>
                  <div className="w-1/4 h-full" style={{ background: t === "light" ? "#fff" : "#151b24", borderRight: "1px solid var(--border)" }} />
                  <div className="flex-1 p-2 space-y-1.5"><div className="h-3 rounded" style={{ background: t === "light" ? "#fff" : "#1c2430" }} /><div className="h-3 w-3/4 rounded" style={{ background: t === "light" ? "#e8ebf0" : "#263040" }} /><div className="h-8 rounded" style={{ background: t === "light" ? "#dbe7ff" : "#1a2a4a" }} /></div>
                </div>
                <div className="flex items-center justify-between"><span className="text-[12.5px] font-semibold flex items-center gap-2">{t === "light" ? <Sun size={14} /> : <Moon size={14} />}{t === "light" ? "浅色主题" : "暗色主题"}</span>{theme === t && <span className="tag" style={{ background: "var(--brand)", color: "#fff" }}><Check size={10} /> 当前</span>}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] mt-4" style={{ color: "var(--text-3)" }}>主题偏好保存在本地，下次启动自动应用。</p>
        </Section>
      )}

      {/* ============ 在线更新 ============ */}
      {tab === "update" && (
        <Section title="在线更新（程序内检查与安装）">
          <div className="max-w-[720px] space-y-4">
            {/* 当前版本卡片 */}
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)", color: "var(--brand)" }}><Rocket size={20} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">当前版本 v{appInfo.version}</div>
                <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-3)" }}>
                  {updater ? (appInfo.packaged ? "桌面安装版 · 支持在线更新" : "开发模式 · 更新检查以实际发布为准") : "浏览器预览模式 · 在线更新仅在桌面版可用"}
                </div>
              </div>
              <button className="btn btn-primary !h-9" onClick={doCheck} disabled={upStatus.state === "checking" || upStatus.state === "downloading"}>
                {upStatus.state === "checking" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} 检查更新
              </button>
            </div>

            {/* 版本更新说明：与 GitHub Release 同源 */}
            <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold"><FileText size={14} style={{ color: "var(--brand)" }} /> 版本更新说明</div>
                <a href="https://github.com/zwh9820-rgb/-/releases" target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px]" style={{ color: "var(--brand)" }}>在 GitHub 查看 <ExternalLink size={11} /></a>
              </div>
              <div className="text-[10.5px] mb-3 leading-relaxed" style={{ color: "var(--text-3)" }}>{CHANGELOG_POLICY}</div>
              <div className="space-y-2">
                {CHANGELOG.map((entry, idx) => (
                  <details key={entry.version} open={idx === 0} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                    <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" style={{ listStyle: "none" }}>
                      <span className="tag shrink-0" style={{ background: idx === 0 ? "var(--brand)" : "var(--border)", color: idx === 0 ? "#fff" : "var(--text-2)" }}>v{entry.version}</span>
                      <span className="flex-1 min-w-0 text-[12px] font-medium truncate">{entry.title}</span>
                      <span className="text-[10.5px] shrink-0" style={{ color: "var(--text-3)" }}>{entry.date}</span>
                    </summary>
                    <div className="px-3 pb-3 pt-1 space-y-2.5" style={{ borderTop: "1px solid var(--border)" }}>
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold mt-2.5 mb-1" style={{ color: "var(--red)" }}><AlertTriangle size={12} /> 发现的问题</div>
                        <ul className="pl-5 space-y-1 text-[11px] leading-relaxed" style={{ color: "var(--text-2)", listStyle: "disc" }}>
                          {entry.issues.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold mb-1" style={{ color: "var(--green)" }}><CheckCircle2 size={12} /> 解决的问题</div>
                        <ul className="pl-5 space-y-1 text-[11px] leading-relaxed" style={{ color: "var(--text-2)", listStyle: "disc" }}>
                          {entry.fixes.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                      <button className="btn !h-7 !text-[10.5px]" onClick={async () => {
                        try { await navigator.clipboard.writeText(formatReleaseNotes(entry)); showToast(`已复制 v${entry.version} 更新说明`); }
                        catch { showToast("复制失败，可手动选中文字复制"); }
                      }}><Copy size={11} /> 复制本版说明</button>
                    </div>
                  </details>
                ))}
              </div>
            </div>

            {/* 状态提示 */}
            {upStatus.message && (
              <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl text-[12px]" style={{
                background: upStatus.state === "error" ? "color-mix(in srgb, var(--red) 9%, transparent)" : upStatus.state === "downloaded" || upStatus.state === "available" ? "color-mix(in srgb, var(--green) 9%, transparent)" : "color-mix(in srgb, var(--brand) 8%, transparent)",
                color: upStatus.state === "error" ? "var(--red)" : upStatus.state === "downloaded" || upStatus.state === "available" ? "var(--green)" : "var(--brand)",
              }}>
                {upStatus.state === "error" ? <AlertTriangle size={15} className="shrink-0" /> : upStatus.state === "downloaded" || upStatus.state === "available" ? <CheckCircle2 size={15} className="shrink-0" /> : <Loader2 size={15} className="shrink-0 animate-spin" />}
                <span className="flex-1">{upStatus.message}</span>
                {upStatus.state === "available" && <button className="btn !h-7 !text-[11px]" onClick={doDownload}><Download size={12} /> 下载</button>}
                {upStatus.state === "downloaded" && <button className="btn btn-primary !h-7 !text-[11px]" onClick={doInstall}><Rocket size={12} /> 立即安装并重启</button>}
              </div>
            )}

            {/* 下载进度 */}
            {upStatus.state === "downloading" && (
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}><span>下载进度</span><span className="font-bold" style={{ color: "var(--brand)" }}>{upStatus.percent}%</span></div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }}><div className="h-full rounded-full transition-all" style={{ width: `${upStatus.percent}%`, background: "var(--brand)" }} /></div>
              </div>
            )}

            {/* 更新源配置 */}
            <div className="p-4 rounded-xl" style={{ background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="text-[12.5px] font-semibold">更新源配置</div>
                <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: "var(--border)", color: "var(--text-3)" }}>GitHub Releases</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="仓库所有者 (owner)" value={upCfg.owner} onChange={(v) => setUpCfg({ ...upCfg, owner: v })} placeholder="如：yourname" />
                <Field label="仓库名称 (repo)" value={upCfg.repo} onChange={(v) => setUpCfg({ ...upCfg, repo: v })} placeholder="如：cbh-release" />
              </div>
              <div className="mt-3 space-y-2.5">
                <label className="flex items-center gap-2.5 text-[11.5px] cursor-pointer" style={{ color: "var(--text-2)" }}>
                  <input type="checkbox" checked={upCfg.private} onChange={(e) => setUpCfg({ ...upCfg, private: e.target.checked })} className="accent-blue-600" /> 私有仓库（需访问令牌）
                </label>
                {upCfg.private && (
                  <Field label="访问令牌 (token)" value={upCfg.token} onChange={(v) => setUpCfg({ ...upCfg, token: v })} placeholder="仅下载更新需要，读取权限即可" />
                )}
                <label className="flex items-center gap-2.5 text-[11.5px] cursor-pointer" style={{ color: "var(--text-2)" }}>
                  <input type="checkbox" checked={upCfg.autoCheck} onChange={(e) => setUpCfg({ ...upCfg, autoCheck: e.target.checked })} className="accent-blue-600" /> 启动时自动检查更新
                </label>
                <details className="pt-1">
                  <summary className="text-[11px] cursor-pointer" style={{ color: "var(--brand)" }}>高级：自定义更新源地址（内网 / 自建服务器）</summary>
                  <div className="mt-2"><Field label="feedUrl（留空则用 GitHub）" value={upCfg.feedUrl} onChange={(v) => setUpCfg({ ...upCfg, feedUrl: v })} placeholder="https://your-server.com/updates/" /></div>
                </details>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button className="btn btn-primary !h-8" onClick={saveUpdateConfig} disabled={cfgSaving || !cfgValid}>
                  {cfgSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} 保存更新源
                </button>
                {!cfgValid && <span className="text-[10.5px]" style={{ color: "var(--amber)" }}>请填写 owner + repo，或自定义更新源地址</span>}
              </div>
            </div>

            {/* 说明 */}
            <div className="space-y-2 px-3.5 py-3 rounded-xl text-[11px] leading-relaxed" style={{ background: "color-mix(in srgb, var(--green) 7%, transparent)", color: "var(--text-2)" }}>
              <div className="flex items-start gap-2"><ShieldCheck size={14} className="mt-0.5 shrink-0" style={{ color: "var(--green)" }} /><span><b style={{ color: "var(--text)" }}>你的数据不会被改动：</b>订单、库存、SKU、密钥都存在本机应用数据目录。更新只替换程序文件；安装前还会自动多存一份数据快照，可随时找回。</span></div>
              <div className="flex items-start gap-2"><HardDriveDownload size={14} className="mt-0.5 shrink-0" style={{ color: "var(--brand)" }} /><span><b style={{ color: "var(--text)" }}>发布方式：</b>用 electron-builder 打包后，把安装版 EXE 和生成的 <code>latest.yml</code> 一起上传到 GitHub 仓库的 Releases，程序即可检测到新版本。</span></div>
              <div className="flex items-start gap-2"><Circle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--text-3)" }} /><span>便携版（portable）受系统限制无法自更新，如需在线更新请使用安装版。</span></div>
            </div>
          </div>
        </Section>
      )}

      {/* ============ 仓库编辑弹窗 ============ */}
      {whForm && (
        <Modal title={whFormNew ? "新增海外仓" : `编辑仓库 · ${whForm.code}`} onClose={() => setWhForm(null)} onSave={saveWh} saveLabel="保存仓库">
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="仓库名称" value={whForm.name} onChange={(v) => setWhForm({ ...whForm, name: v })} placeholder="如：洛杉矶海外仓" />
            <Field label="仓库编码" value={whForm.code} onChange={(v) => setWhForm({ ...whForm, code: v })} placeholder="如：US-LAX-01" />
            <Field label="国家" value={whForm.country} onChange={(v) => setWhForm({ ...whForm, country: v })} placeholder="如：美国" />
            <Field label="国家代码" value={whForm.countryCode} onChange={(v) => setWhForm({ ...whForm, countryCode: v.toUpperCase().slice(0, 2) })} placeholder="如：US" />
            <Field label="州 / 省" value={whForm.state} onChange={(v) => setWhForm({ ...whForm, state: v })} placeholder="如：加利福尼亚州" />
            <Field label="城市" value={whForm.city} onChange={(v) => setWhForm({ ...whForm, city: v })} placeholder="如：洛杉矶" />
            <Field label="经度 (lng)" type="number" value={String(whForm.lng)} onChange={(v) => setWhForm({ ...whForm, lng: +v })} placeholder="-118.24" />
            <Field label="纬度 (lat)" type="number" value={String(whForm.lat)} onChange={(v) => setWhForm({ ...whForm, lat: +v })} placeholder="34.05" />
            <Field label="总库容 (件)" type="number" value={String(whForm.capacity)} onChange={(v) => setWhForm({ ...whForm, capacity: +v })} placeholder="20000" />
            <Field label="已用库容 (件)" type="number" value={String(whForm.used)} onChange={(v) => setWhForm({ ...whForm, used: Math.max(0, Math.min(+v, whForm.capacity)) })} placeholder="0" />
            <div>
              <label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>库存状态</label>
              <select className="field w-full" value={whForm.health} onChange={(e) => setWhForm({ ...whForm, health: e.target.value as HealthStatus })}>
                <option value="healthy">库存充足</option><option value="warning">库存预警</option><option value="critical">断货风险</option>
              </select>
            </div>
            <Field label="SKU 数量" type="number" value={String(whForm.skuCount)} onChange={(v) => setWhForm({ ...whForm, skuCount: +v })} placeholder="0" />
            <Field label="日均出库 (单)" type="number" value={String(whForm.dailyOutbound)} onChange={(v) => setWhForm({ ...whForm, dailyOutbound: +v })} placeholder="0" />
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}><MapPin size={12} /> 经纬度将用于地图点位、仓配距离与航线测算（WGS-84 坐标系）</div>
        </Modal>
      )}

      {/* ============ API 配置弹窗 ============ */}
      {apiForm && (
        <Modal title={apiFormNew ? "新增 API 配置" : `配置 · ${apiForm.name}`} onClose={() => setApiForm(null)} onSave={saveApi} saveLabel={saving ? "加密保存中…" : "保存配置"} saving={saving}>
          <div className="space-y-3.5">
            <Field label="配置名称" value={apiForm.name} onChange={(v) => setApiForm({ ...apiForm, name: v })} placeholder="如：Amazon SP-API" />
            <Field label="接口地址 (Endpoint)" value={apiForm.endpoint} onChange={(v) => setApiForm({ ...apiForm, endpoint: v })} placeholder="https://api.example.com" />
            <Field label="App Key / Client ID" value={apiForm.appKey} onChange={(v) => setApiForm({ ...apiForm, appKey: v })} placeholder="输入 App Key" />
            <Field label="App Secret / Token" value={apiForm.appSecret} onChange={(v) => setApiForm({ ...apiForm, appSecret: v })} placeholder="输入 App Secret" />
            <label className="flex items-center justify-between p-3 rounded-lg cursor-pointer" style={{ background: "var(--surface-2)" }}>
              <div><div className="text-[12px] font-medium">启用此配置</div><div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>停用后该接口不参与数据同步</div></div>
              <input type="checkbox" checked={apiForm.enabled} onChange={(e) => setApiForm({ ...apiForm, enabled: e.target.checked })} className="accent-blue-600 w-4 h-4" />
            </label>
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-[11px]" style={{ background: "color-mix(in srgb, var(--green) 8%, transparent)", color: "var(--green)" }}>
              <ShieldCheck size={14} className="mt-0.5 shrink-0" /> 保存后密钥将被 AES-256-GCM 加密写入本地存储，关闭窗口后仅显示脱敏内容。
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============ 通用弹窗 ============
function Modal({ title, onClose, onSave, children, saveLabel, saving }: {
  title: string; onClose: () => void; onSave: () => void; children: React.ReactNode; saveLabel: string; saving?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-[540px] max-w-[94vw] max-h-[88vh] overflow-y-auto rounded-2xl shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-[15px] font-bold">{title}</h3>
          <button onClick={onClose} className="p-1 rounded" style={{ color: "var(--text-3)" }}><X size={18} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}>{label}</label>
      <input className="field w-full" type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
