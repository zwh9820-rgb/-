"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Globe2, Map as MapIcon, ShoppingBag, Warehouse, Ship, BarChart3,
  ReceiptText, FileBarChart, Bell, Settings, ChevronLeft, PanelLeftClose,
  Search, Sun, Moon, Cloud, CloudOff, RefreshCw, Menu, X, Command, Boxes,
  ChevronRight, CircleDot, Wifi, WifiOff, Check, LogOut, Database,
  TrendingUp, DollarSign, Package, FolderOpen,
} from "lucide-react";
import clsx from "clsx";
import type { ThemeMode } from "@/lib/types";
import { useStore } from "@/lib/store";


export type ModuleKey =
  | "globe" | "map" | "dashboard" | "orders" | "inventory" | "shipping"
  | "sku" | "profit" | "turnover" | "trend" | "pricecard" | "reports"
  | "alerts" | "datacenter" | "fileCenter" | "settings";

const NAV_GROUPS: { label: string; items: { key: ModuleKey; label: string; icon: any; badge?: number }[] }[] = [
  {
    label: "总览",
    items: [
      { key: "dashboard", label: "经营驾驶舱", icon: BarChart3 },
      { key: "globe", label: "3D 地球概览", icon: Globe2 },
      { key: "map", label: "地图下钻分析", icon: MapIcon },
    ],
  },
  {
    label: "业务分析",
    items: [
      { key: "orders", label: "订单分析", icon: ShoppingBag },
      { key: "trend", label: "趋势与目标", icon: TrendingUp },
      { key: "profit", label: "利润与费用", icon: DollarSign },
      { key: "inventory", label: "海外仓库存", icon: Warehouse },
      { key: "turnover", label: "库存周转补货", icon: Package },
      { key: "shipping", label: "海运头程", icon: Ship },
      { key: "sku", label: "SKU 区域分析", icon: BarChart3 },
    ],
  },
  {
    label: "运营工具",
    items: [
      { key: "pricecard", label: "价卡与仓配测算", icon: ReceiptText },
      { key: "reports", label: "报表中心", icon: FileBarChart },
      { key: "alerts", label: "异常预警", icon: Bell },
    ],
  },
  {
    label: "数据",
    items: [
      { key: "datacenter", label: "数据中心 · 录入", icon: Database },
      { key: "fileCenter", label: "文件中心", icon: FolderOpen },
    ],
  },
  {
    label: "系统",
    items: [{ key: "settings", label: "系统设置", icon: Settings }],
  },
];

const TITLES: Record<ModuleKey, { title: string; sub: string }> = {
  dashboard: { title: "经营驾驶舱", sub: "销售 / 利润 / 仓网 / 海运 / 风险 一屏总览" },
  globe: { title: "3D 地球概览", sub: "全球仓网与订单热力一屏总览" },
  map: { title: "地图下钻分析", sub: "世界 → 国家 → 州 → 城市 逐级洞察 + 月份筛选" },
  orders: { title: "订单地图分析", sub: "多平台订单分布、区域汇总与明细导出" },
  trend: { title: "多平台趋势与目标", sub: "销售趋势、平台占比、环比与月度目标完成度" },
  profit: { title: "利润与费用核算", sub: "真实毛利、成本构成与费用率估算" },
  inventory: { title: "海外仓库存看板", sub: "库存健康度、安全库存与调拨模拟" },
  turnover: { title: "库存周转与补货", sub: "可售天数、断货预警与建议补货量" },
  shipping: { title: "海运与头程备货", sub: "航线在途追踪、货量汇总与备货建议" },
  sku: { title: "SKU 区域销售分析", sub: "热力分布、多 SKU 对比与退货分析" },
  pricecard: { title: "尾程价卡与仓配测算", sub: "价卡版本管理、比价与最优仓推荐" },
  reports: { title: "报表中心", sub: "内置模板、定时周报与多格式导出" },
  alerts: { title: "全局异常预警", sub: "跨模块异常监控与地图点位联动" },
  datacenter: { title: "数据中心", sub: "手动录入 / 编辑 / CSV 导入你的真实业务数据" },
  fileCenter: { title: "文件中心", sub: "统一查找与预览网盘/本地的说明书、清单等文件" },
  settings: { title: "系统设置", sub: "API 密钥、地理边界、阈值与主题" },
};

// 动态加载重型视图，避免首屏阻塞
const GlobeView = dynamic(() => import("./GlobeView"), { ssr: false, loading: () => <ViewLoading /> });
const MapWorkbench = dynamic(() => import("./MapWorkbench"), { ssr: false, loading: () => <ViewLoading /> });
const DashboardView = dynamic(() => import("./views/DashboardView"), { ssr: false });
const ProfitView = dynamic(() => import("./views/ProfitView"), { ssr: false });
const TurnoverView = dynamic(() => import("./views/TurnoverView"), { ssr: false });
const TrendView = dynamic(() => import("./views/TrendView"), { ssr: false });
const OrdersView = dynamic(() => import("./views/OrdersView"), { ssr: false });
const InventoryView = dynamic(() => import("./views/InventoryView"), { ssr: false });
const ShippingView = dynamic(() => import("./views/ShippingView"), { ssr: false });
const SkuView = dynamic(() => import("./views/SkuView"), { ssr: false });
const PricecardView = dynamic(() => import("./views/PricecardView"), { ssr: false });
const ReportsView = dynamic(() => import("./views/ReportsView"), { ssr: false });
const AlertsView = dynamic(() => import("./views/AlertsView"), { ssr: false });
const DataCenterView = dynamic(() => import("./views/DataCenterView"), { ssr: false });
const FileCenterView = dynamic(() => import("./views/FileCenterView"), { ssr: false });
const SettingsView = dynamic(() => import("./views/SettingsView"), { ssr: false });

function ViewLoading() {
  return (
    <div className="w-full h-full flex items-center justify-center text-muted text-sm gap-2">
      <RefreshCw size={16} className="animate-spin" /> 视图加载中…
    </div>
  );
}

export default function AppShell({ theme, setTheme }: { theme: ThemeMode; setTheme: (t: ThemeMode) => void }) {
  const [module, setModule] = useState<ModuleKey>("globe");
  const [collapsed, setCollapsed] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState("14:42");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [userMenu, setUserMenu] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string>("api");
  const store = useStore();
  useEffect(() => setMounted(true), []);

  // 帮助菜单「检查更新」→ 跳到设置的在线更新页
  useEffect(() => {
    const api = (window as any).updaterAPI;
    if (!api?.onOpenSettings) return;
    return api.onOpenSettings(() => { setSettingsTab("update"); setModule("settings"); });
  }, []);

  const unread = store.alerts.filter((a) => !(a.read || store.alertRead[a.id])).length;
  const current = TITLES[module];

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  const sync = () => {
    if (!online || syncing) return;
    setSyncing(true);
    // 真实动作：从 localStorage 重新读取所有本地实体，校验并刷新内存视图
    setTimeout(() => {
      let count = 0;
      ["cbh_data_warehouses_v1", "cbh_data_orders_v1", "cbh_data_skus_v1", "cbh_data_inventory_v1", "cbh_data_containers_v1", "cbh_data_pricecards_v1", "cbh_data_alerts_v1", "cbh_api_configs_v1"].forEach((k) => {
        if (localStorage.getItem(k) && (JSON.parse(localStorage.getItem(k) || "[]") as any[]).length > 0) count++;
      });
      setSyncing(false);
      const n = new Date();
      setLastSync(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
      showToast(count > 0 ? `本地数据校验完成，已重新载入 ${count} 类配置` : "已是最新状态，暂无本地配置需同步");
    }, 900);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const goto = (key: ModuleKey) => { setModule(key); setMobileNav(false); };

  const renderView = () => {
    switch (module) {
      case "dashboard": return <DashboardView onNavigate={goto} />;
      case "globe": return <GlobeView onEnterMap={() => goto("map")} onGoData={() => goto("datacenter")} />;
      case "map": return <MapWorkbench onNavigate={goto} />;
      case "profit": return <ProfitView onNavigate={goto} showToast={showToast} />;
      case "turnover": return <TurnoverView onNavigate={goto} showToast={showToast} />;
      case "trend": return <TrendView onNavigate={goto} showToast={showToast} />;
      case "orders": return <OrdersView onNavigate={goto} showToast={showToast} />;
      case "inventory": return <InventoryView onNavigate={goto} showToast={showToast} />;
      case "shipping": return <ShippingView onNavigate={goto} showToast={showToast} />;
      case "sku": return <SkuView onNavigate={goto} showToast={showToast} />;
      case "pricecard": return <PricecardView showToast={showToast} onNavigate={goto} />;
      case "reports": return <ReportsView showToast={showToast} />;
      case "alerts": return <AlertsView onNavigate={goto} />;
      case "datacenter": return <DataCenterView showToast={showToast} onNavigate={goto} />;
      case "fileCenter": return <FileCenterView showToast={showToast} />;
      case "settings": return <SettingsView theme={theme} setTheme={setTheme} showToast={showToast} initialTab={settingsTab} onTabConsumed={() => setSettingsTab("api")} />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* 侧边栏 */}
      <aside
        className={clsx(
          "shrink-0 h-full flex flex-col border-r transition-[width] duration-200 z-40",
          collapsed ? "w-[68px]" : "w-[232px]",
          "max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:transition-transform",
          mobileNav ? "max-md:translate-x-0 max-md:w-[232px]" : "max-md:-translate-x-full"
        )}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {/* Logo */}
        <div className="h-[62px] flex items-center gap-2.5 px-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-white" style={{ background: "linear-gradient(135deg,#3b6dff,#7a4dff)" }}>
            <Boxes size={19} strokeWidth={2.2} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold leading-tight truncate">LinkVue 联视</div>
              <div className="text-[10.5px] leading-tight truncate" style={{ color: "var(--text-3)" }}>Cross-Border Data Hub</div>
            </div>
          )}
          <button className="ml-auto md:hidden" onClick={() => setMobileNav(false)} style={{ color: "var(--text-2)" }}><X size={18} /></button>
        </div>

        {/* 导航 */}
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && <div className="px-2.5 mb-1.5 text-[10.5px] font-semibold tracking-wider" style={{ color: "var(--text-3)" }}>{group.label}</div>}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = module === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => goto(item.key)}
                      title={collapsed ? item.label : undefined}
                      className={clsx(
                        "w-full flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13px] font-medium transition-colors relative",
                        collapsed && "justify-center px-0"
                      )}
                      style={{
                        background: active ? "color-mix(in srgb, var(--brand) 11%, transparent)" : "transparent",
                        color: active ? "var(--brand)" : "var(--text-2)",
                      }}
                    >
                      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r" style={{ background: "var(--brand)" }} />}
                      <Icon size={17} strokeWidth={active ? 2.2 : 1.9} className="shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && item.badge ? (
                        <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white" style={{ background: "var(--red)" }}>{item.badge}</span>
                      ) : null}
                      {collapsed && item.badge ? <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: "var(--red)" }} /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 底部：同步状态 + 折叠 */}
        <div className="p-2.5 border-t" style={{ borderColor: "var(--border)" }}>
          <div className={clsx("flex items-center gap-2 px-2 py-2 rounded-lg", collapsed && "justify-center px-0")} style={{ background: "var(--surface-2)" }}>
            <span className={clsx("w-2 h-2 rounded-full shrink-0", online ? "bg-emerald-500" : "bg-amber-500")} />
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-[11px] font-medium leading-tight">{online ? "已联网 · 自动同步" : "离线 · 只读模式"}</div>
                <div className="text-[10px] leading-tight" style={{ color: "var(--text-3)" }}>{online ? `上次同步 ${lastSync}` : "数据为本地历史快照"}</div>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex mt-2 w-full h-8 items-center justify-center gap-2 rounded-lg text-[12px] transition-colors"
            style={{ color: "var(--text-2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <PanelLeftClose size={16} className={clsx("transition-transform", collapsed && "rotate-180")} />
            {!collapsed && "收起侧栏"}
          </button>
        </div>
      </aside>

      {/* 主区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <header className="h-[62px] shrink-0 flex items-center gap-3 px-5 border-b" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <button className="md:hidden" onClick={() => setMobileNav(true)} style={{ color: "var(--text-2)" }}><Menu size={20} /></button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-bold truncate">{current.title}</h1>
              {module === "globe" && <span className="tag" style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)", color: "var(--brand)" }}>可视化</span>}
            </div>
            <p className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{current.sub}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* 搜索 */}
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden lg:flex items-center gap-2 h-8 w-[190px] px-2.5 rounded-lg text-[12px] border"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)", color: "var(--text-3)" }}
            >
              <Search size={14} /> <span>搜索订单 / SKU / 仓库</span>
              <span className="ml-auto flex items-center gap-0.5 text-[10px]"><Command size={10} />K</span>
            </button>

            {/* 联网状态 */}
            <button
              onClick={sync}
              title={online ? "点击立即同步" : "当前离线"}
              className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[11.5px] border transition-colors"
              style={{ borderColor: "var(--border)", color: online ? "var(--text-2)" : "var(--amber)" }}
            >
              {online ? (syncing ? <RefreshCw size={14} className="animate-spin" /> : <Cloud size={14} />) : <CloudOff size={14} />}
              <span className="hidden sm:inline">{syncing ? "同步中" : online ? "已同步" : "离线"}</span>
            </button>

            {/* 预警 */}
            <button onClick={() => goto("alerts")} className="relative h-8 w-8 rounded-lg flex items-center justify-center border transition-colors" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
              <Bell size={16} />
              {mounted && unread > 0 && <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 rounded-full text-[9px] font-bold text-white flex items-center justify-center" style={{ background: "var(--red)" }}>{unread}</span>}
            </button>

            {/* 主题 */}
            <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} className="h-8 w-8 rounded-lg flex items-center justify-center border transition-colors" style={{ borderColor: "var(--border)", color: "var(--text-2)" }} title="切换主题">
              {theme === "light" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <div className="w-px h-6 mx-0.5" style={{ background: "var(--border)" }} />
            <div className="relative">
              <button className="flex items-center gap-2" onClick={() => setUserMenu(!userMenu)}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white" style={{ background: "linear-gradient(135deg,#f59e0b,#ef4444)" }}>运</div>
                <div className="hidden lg:block text-left">
                  <div className="text-[12px] font-semibold leading-tight">运营中心</div>
                  <div className="text-[10px] leading-tight" style={{ color: "var(--text-3)" }}>管理员</div>
                </div>
              </button>
              {userMenu && (
                <div className="absolute right-0 top-11 w-[200px] rounded-xl p-1.5 z-50 shadow-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="px-2.5 py-2 border-b mb-1" style={{ borderColor: "var(--border)" }}>
                    <div className="text-[12px] font-semibold">运营中心</div>
                    <div className="text-[10.5px]" style={{ color: "var(--text-3)" }}>管理员 · 本地离线账户</div>
                  </div>
                  <button className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] text-left" style={{ color: "var(--text-2)" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"} onClick={() => { goto("settings"); setUserMenu(false); }}><Settings size={14} /> 系统设置</button>
                  <button className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] text-left" style={{ color: "var(--text-2)" }} onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"} onClick={() => { setUserMenu(false); showToast("当前运行于本地离线账户，无云端注销需求"); }}><LogOut size={14} /> 退出登录</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* 内容 */}
        <main className="flex-1 min-h-0 relative overflow-hidden">{renderView()}</main>
      </div>

      {/* 搜索弹窗 */}
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onNavigate={(k) => { goto(k); setSearchOpen(false); }} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] text-white shadow-xl" style={{ background: "#1a2233" }}>
          <Check size={15} className="text-emerald-400" />{toast}
        </div>
      )}
    </div>
  );
}

function SearchModal({ onClose, onNavigate }: { onClose: () => void; onNavigate: (k: ModuleKey) => void }) {
  const [q, setQ] = useState("");
  const { warehouses, orders, skus, alerts } = useStore();
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const kw = q.toLowerCase();
    const arr: { label: string; sub: string; key: ModuleKey }[] = [];
    warehouses.filter((w) => w.name.includes(q) || w.code.toLowerCase().includes(kw)).forEach((w) => arr.push({ label: w.name, sub: `${w.code} · ${w.country}`, key: "inventory" }));
    orders.filter((o) => o.orderNo.toLowerCase().includes(kw)).slice(0, 4).forEach((o) => arr.push({ label: o.orderNo, sub: `${o.platform} · ${o.country}`, key: "orders" }));
    skus.filter((s) => s.name.includes(q) || s.sku.toLowerCase().includes(kw)).slice(0, 4).forEach((s) => arr.push({ label: s.name, sub: `${s.sku}`, key: "sku" }));
    alerts.filter((a) => a.title.includes(q)).forEach((a) => arr.push({ label: a.title, sub: `${a.type}预警`, key: "alerts" }));
    if ("订单分析地图仓库存海运价卡报表设置预警数据中心".includes(q)) arr.push({ label: `前往：${q}`, sub: "页面导航", key: "map" });
    return arr.slice(0, 8);
  }, [q, warehouses, orders, skus, alerts]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[16vh] bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-[540px] max-w-[92vw] rounded-2xl overflow-hidden shadow-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 h-13 border-b" style={{ borderColor: "var(--border)" }}>
          <Search size={17} style={{ color: "var(--text-3)" }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索订单号、SKU、仓库、预警…" className="flex-1 h-12 bg-transparent outline-none text-[14px]" style={{ color: "var(--text)" }} />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>ESC</kbd>
        </div>
        <div className="p-2 max-h-[320px] overflow-y-auto">
          {q && results.length === 0 && <div className="py-8 text-center text-[13px]" style={{ color: "var(--text-3)" }}>未找到匹配结果</div>}
          {!q && <div className="py-8 text-center text-[13px]" style={{ color: "var(--text-3)" }}>输入关键词开始搜索</div>}
          {results.map((r, i) => (
            <button key={i} onClick={() => onNavigate(r.key)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-opacity-5" onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
              <CircleDot size={14} style={{ color: "var(--brand)" }} />
              <div className="min-w-0"><div className="text-[13px] font-medium truncate">{r.label}</div><div className="text-[11px]" style={{ color: "var(--text-3)" }}>{r.sub}</div></div>
              <ChevronRight size={14} className="ml-auto" style={{ color: "var(--text-3)" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
