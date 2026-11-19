"use client";

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import type { Warehouse, Order, Sku, InventoryItem, Container, PriceCard, Alert } from "./types";

// ============ 存储键 ============
const LS = {
  warehouses: "cbh_data_warehouses_v1",
  orders: "cbh_data_orders_v1",
  skus: "cbh_data_skus_v1",
  inventory: "cbh_data_inventory_v1",
  containers: "cbh_data_containers_v1",
  priceCards: "cbh_data_pricecards_v1",
  alerts: "cbh_data_alerts_v1",
  apiConfigs: "cbh_api_configs_v1",
  thresholds: "cbh_thresholds_v1",
  sync: "cbh_sync_v1",
  syncOptions: "cbh_sync_options_v1",
  snapshots: "cbh_snapshots_v1",
  transfers: "cbh_transfers_v1",
  cardVersions: "cbh_card_versions_v1",
  solutions: "cbh_solutions_v1",
  tasks: "cbh_tasks_v1",
  geo: "cbh_geo_v1",
  alertRead: "cbh_alert_read_v1",
  costRates: "cbh_cost_rates_v1",
  targets: "cbh_targets_v1",
  fileRoots: "cbh_file_roots_v1",
  filePrefs: "cbh_file_prefs_v1",
  fileSettings: "cbh_file_settings_v1",
} as const;

// ============ 文件中心类型 ============
export type FileRoot = {
  id: string;
  label: string;      // 备注名，如"产品说明书（网盘同步）"
  path: string;       // 本地绝对路径（网盘同步目录或本地硬盘目录）
  kind: "network" | "local"; // 网盘同步目录 / 本地目录
  enabled: boolean;
};
export type FilePref = {
  path: string;       // 文件路径（唯一键）
  fav: boolean;       // 收藏
  category?: string;  // 自定义分类
  downloadable?: boolean; // 是否允许下载（管理员控制），undefined=跟随全局默认
  viewable?: boolean;     // 是否允许预览（管理员控制），undefined=跟随全局默认
};
export type FileCenterSettings = {
  adminMode: boolean;          // 是否启用管理员权限控制
  defaultDownloadable: boolean; // 未单独设置时是否允许下载
  defaultViewable: boolean;     // 未单独设置时是否允许预览
};

// ============ 扩展实体类型 ============
export interface InventorySnapshot {
  id: string;
  label: string;
  createdAt: string;
  items: { warehouseId: string; skuId: string; available: number; reserved: number; total: number; safetyStock: number; ageDays: number }[];
}
export interface TransferRecord {
  id: string;
  fromWh: string;
  toWh: string;
  skuId: string;
  qty: number;
  cost: number;
  days: number;
  createdAt: string;
}
export interface CardVersion { version: string; createdAt: string; note: string; }
export interface SavedSolution {
  id: string; name: string; createdAt: string; weight: number; city: string;
  carrier: string; price: number; days: number; warehouse: string; total: number;
}
export interface ScheduledTask { id: string; name: string; cycle: string; enabled: boolean; lastRun: string; }
export interface GeoLayer { id: string; name: string; desc: string; size: string; active: boolean; source: "builtin" | "imported"; }
export interface SyncOptions { incremental: boolean; rateLimit: boolean; retry: boolean; offlineReadOnly: boolean; }
export const DEFAULT_SYNC_OPTIONS: SyncOptions = { incremental: true, rateLimit: true, retry: true, offlineReadOnly: true };

export interface ApiConfig {
  id: string; name: string; appKey: string; appSecret: string;
  endpoint: string; enabled: boolean; connected: boolean; updatedAt: string;
}
// API 接口模板（密钥为空，需用户自行填写；不再是"已连接"的假状态）
const API_SEED: ApiConfig[] = [
  { id: "amazon_sp", name: "Amazon SP-API", appKey: "", appSecret: "", endpoint: "https://sellingpartnerapi-na.amazon.com", enabled: false, connected: false, updatedAt: "" },
  { id: "ebay", name: "eBay API", appKey: "", appSecret: "", endpoint: "https://api.ebay.com", enabled: false, connected: false, updatedAt: "" },
  { id: "tiktok", name: "TikTok Shop API", appKey: "", appSecret: "", endpoint: "https://open-api.tiktokglobalshop.com", enabled: false, connected: false, updatedAt: "" },
  { id: "webhook", name: "独立站 Webhook", appKey: "", appSecret: "", endpoint: "", enabled: false, connected: false, updatedAt: "" },
  { id: "wms", name: "海外仓 WMS 接口", appKey: "", appSecret: "", endpoint: "", enabled: false, connected: false, updatedAt: "" },
  { id: "shipping", name: "海运追踪接口", appKey: "", appSecret: "", endpoint: "", enabled: false, connected: false, updatedAt: "" },
];

export interface Thresholds { lowStock: number; etaDelay: number; freightSurge: number; returnRate: number; }
export const DEFAULT_THRESHOLDS: Thresholds = { lowStock: 80, etaDelay: 3, freightSurge: 15, returnRate: 8 };

// 利润费用率（百分比，默认 0 = 不估算，只统计用户已录入的费用）
export interface CostRates {
  commissionRate: number; // 平台佣金 %
  firstMileRate: number;  // 头程 / 货值 %
  lastMileRate: number;   // 尾程 / 货值 %
  returnRate: number;     // 退货损耗 %
  otherRate: number;      // 其他 %
}
export const DEFAULT_COST_RATES: CostRates = { commissionRate: 0, firstMileRate: 0, lastMileRate: 0, returnRate: 0, otherRate: 0 };

// 月度销售目标：key = YYYY-MM，value = 目标金额
export type Targets = Record<string, number>;

// ============ AES-GCM 加密（Web Crypto，密钥本地派生）============
const ENC_SALT = "cross-border-data-hub::local-vault::2026";
let cryptoKey: CryptoKey | null = null;
async function getCryptoKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    if (cryptoKey) return cryptoKey;
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(ENC_SALT), { name: "PBKDF2" }, false, ["deriveKey"]);
    cryptoKey = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: new TextEncoder().encode("cbh-salt"), iterations: 100000, hash: "SHA-256" },
      material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
    return cryptoKey;
  } catch { return null; }
}
function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBuf(b64: string): ArrayBuffer {
  const s = atob(b64);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr.buffer;
}
export async function encryptSecret(plain: string): Promise<string> {
  if (!plain) return "";
  const key = await getCryptoKey();
  if (!key) return "ENC:" + btoa(unescape(encodeURIComponent(plain)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return "AES:" + bufToB64(iv) + ":" + bufToB64(ct);
}
export async function decryptSecret(cipher: string): Promise<string> {
  if (!cipher) return "";
  if (cipher.startsWith("ENC:")) {
    try { return decodeURIComponent(escape(atob(cipher.slice(4)))); } catch { return ""; }
  }
  if (!cipher.startsWith("AES:")) return cipher;
  const key = await getCryptoKey();
  if (!key) return "";
  try {
    const [, ivB64, ctB64] = cipher.split(":");
    const dec = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) }, key, b64ToBuf(ctB64)
    );
    return new TextDecoder().decode(dec);
  } catch { return ""; }
}

// ============ localStorage 读写 ============
function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 存储不可用 */ }
}

// ============ 通用持久化集合 hook（业务数据默认全部为空）============
type Setter<T> = (v: T[] | ((prev: T[]) => T[])) => void;

// 数值兜底：脏数据（空列/手录缺失/旧版本）里的 undefined/null/非数字统一转 0，
// 防止下游 .toFixed() 等崩溃。字符串数字也会转 number。
const num = (v: any, d = 0): number => {
  if (v === null || v === undefined || v === "") return d;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

// 按实体补齐关键数值字段，保证所有视图拿到的数据都是可安全计算的
function normalizeEntity(key: string, arr: any[]): any[] {
  if (!Array.isArray(arr)) return [];
  return arr.map((o) => {
    if (!o || typeof o !== "object") return o;
    switch (key) {
      case LS.orders:
        return {
          ...o,
          lng: num(o.lng), lat: num(o.lat),
          qty: num(o.qty, 1), amount: num(o.amount), weight: num(o.weight),
          returnRisk: num(o.returnRisk),
          commission: num(o.commission), firstMile: num(o.firstMile),
          lastMile: num(o.lastMile), returnLoss: num(o.returnLoss), other: num(o.other),
        };
      case LS.warehouses:
        return {
          ...o,
          lng: num(o.lng), lat: num(o.lat),
          capacity: num(o.capacity), used: num(o.used),
          skuCount: num(o.skuCount), dailyOutbound: num(o.dailyOutbound),
        };
      case LS.containers:
        return {
          ...o,
          originLng: num(o.originLng), originLat: num(o.originLat),
          destLng: num(o.destLng), destLat: num(o.destLat),
          progress: num(o.progress), cargoValue: num(o.cargoValue),
          volume: num(o.volume), skuCount: num(o.skuCount),
          items: Array.isArray(o.items) ? o.items : [],
        };
      case LS.inventory:
        return {
          ...o,
          available: num(o.available), reserved: num(o.reserved),
          total: num(o.total), safetyStock: num(o.safetyStock), ageDays: num(o.ageDays),
        };
      case LS.skus:
        return { ...o, price: num(o.price), weight: num(o.weight), cost: num(o.cost) };
      default:
        return o;
    }
  });
}

function usePersistedCollection<T>(key: string): [T[], Setter<T>] {
  const [value, setValue] = useState<T[]>(() =>
    typeof window === "undefined" ? [] : normalizeEntity(key, readLS<any[]>(key, [])) as T[]
  );
  const set = useCallback<Setter<T>>((next) => {
    setValue((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T[]) => T[])(prev) : next;
      writeLS(key, resolved);
      return normalizeEntity(key, resolved as any[]) as T[];
    });
  }, [key]);
  return [value, set];
}

// ============ 业务实体键 ============
export type EntityKey = "warehouses" | "orders" | "skus" | "inventory" | "containers" | "priceCards" | "alerts";

interface StoreValue {
  // 业务数据（默认空，由用户录入/导入）
  warehouses: Warehouse[]; setWarehouses: Setter<Warehouse>;
  upsertWarehouse: (w: Warehouse) => void;
  deleteWarehouse: (id: string) => void;
  orders: Order[]; setOrders: Setter<Order>;
  skus: Sku[]; setSkus: Setter<Sku>;
  inventory: InventoryItem[]; setInventory: Setter<InventoryItem>;
  containers: Container[]; setContainers: Setter<Container>;
  priceCards: PriceCard[]; setPriceCards: Setter<PriceCard>;
  alerts: Alert[]; setAlerts: Setter<Alert>;
  // 通用操作
  upsertRecord: (entity: EntityKey, record: any) => void;
  deleteRecord: (entity: EntityKey, id: string) => void;
  clearEntity: (entity: EntityKey) => void;
  // 配置
  apiConfigs: ApiConfig[];
  saveApiConfig: (cfg: ApiConfig) => Promise<void>;
  deleteApiConfig: (id: string) => void;
  thresholds: Thresholds; setThresholds: (t: Thresholds) => void;
  syncInterval: number; setSyncInterval: (n: number) => void;
  syncOptions: SyncOptions; setSyncOptions: (o: SyncOptions) => void;
  plainSecrets: Record<string, { appKey: string; appSecret: string }>;
  snapshots: InventorySnapshot[]; addSnapshot: (s: InventorySnapshot) => void; deleteSnapshot: (id: string) => void;
  transfers: TransferRecord[]; addTransfer: (t: TransferRecord) => void;
  cardVersions: CardVersion[]; addCardVersion: (v: CardVersion) => void;
  solutions: SavedSolution[]; addSolution: (s: SavedSolution) => void;
  tasks: ScheduledTask[]; upsertTask: (t: ScheduledTask) => void; deleteTask: (id: string) => void;
  geoLayers: GeoLayer[]; addGeoLayer: (g: GeoLayer) => void; toggleGeoLayer: (id: string) => void; deleteGeoLayer: (id: string) => void;
  alertRead: Record<string, boolean>; setAlertRead: (id: string, read: boolean) => void;
  costRates: CostRates; setCostRates: (r: CostRates) => void;
  targets: Targets; setTarget: (month: string, value: number) => void; deleteTarget: (month: string) => void;
  // 文件中心
  fileRoots: FileRoot[]; setFileRoots: (v: FileRoot[] | ((p: FileRoot[]) => FileRoot[])) => void;
  filePrefs: FilePref[]; setFilePrefs: (v: FilePref[] | ((p: FilePref[]) => FilePref[])) => void;
  fileSettings: FileCenterSettings; setFileSettings: (v: FileCenterSettings) => void;
}
const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // 所有业务数据：默认空数组
  const [warehouses, setWarehouses] = usePersistedCollection<Warehouse>(LS.warehouses);
  const [orders, setOrders] = usePersistedCollection<Order>(LS.orders);
  const [skus, setSkus] = usePersistedCollection<Sku>(LS.skus);
  const [inventory, setInventory] = usePersistedCollection<InventoryItem>(LS.inventory);
  const [containers, setContainers] = usePersistedCollection<Container>(LS.containers);
  const [priceCards, setPriceCards] = usePersistedCollection<PriceCard>(LS.priceCards);
  const [alerts, setAlerts] = usePersistedCollection<Alert>(LS.alerts);

  const [apiConfigs, setApiConfigs] = useState<ApiConfig[]>(() =>
    typeof window === "undefined" ? API_SEED : readLS(LS.apiConfigs, API_SEED)
  );
  const [thresholds, setThresholdsState] = useState<Thresholds>(() =>
    typeof window === "undefined" ? DEFAULT_THRESHOLDS : readLS(LS.thresholds, DEFAULT_THRESHOLDS)
  );
  const [syncInterval, setSyncIntervalState] = useState<number>(() =>
    typeof window === "undefined" ? 30 : readLS(LS.sync, 30)
  );
  const [syncOptions, setSyncOptionsState] = useState<SyncOptions>(() =>
    typeof window === "undefined" ? DEFAULT_SYNC_OPTIONS : readLS(LS.syncOptions, DEFAULT_SYNC_OPTIONS)
  );
  const [snapshots, setSnapshots] = useState<InventorySnapshot[]>(() =>
    typeof window === "undefined" ? [] : readLS(LS.snapshots, [])
  );
  const [transfers, setTransfers] = useState<TransferRecord[]>(() =>
    typeof window === "undefined" ? [] : readLS(LS.transfers, [])
  );
  const [cardVersions, setCardVersions] = useState<CardVersion[]>(() =>
    typeof window === "undefined" ? [] : readLS(LS.cardVersions, [])
  );
  const [solutions, setSolutions] = useState<SavedSolution[]>(() =>
    typeof window === "undefined" ? [] : readLS(LS.solutions, [])
  );
  const [tasks, setTasks] = useState<ScheduledTask[]>(() =>
    typeof window === "undefined" ? [] : readLS(LS.tasks, [])
  );
  const [geoLayers, setGeoLayers] = useState<GeoLayer[]>(() =>
    typeof window === "undefined" ? [] : readLS(LS.geo, [])
  );
  const [alertRead, setAlertReadState] = useState<Record<string, boolean>>(() =>
    typeof window === "undefined" ? {} : readLS(LS.alertRead, {})
  );
  const [costRates, setCostRatesState] = useState<CostRates>(() =>
    typeof window === "undefined" ? DEFAULT_COST_RATES : readLS(LS.costRates, DEFAULT_COST_RATES)
  );
  const [targets, setTargetsState] = useState<Targets>(() =>
    typeof window === "undefined" ? {} : readLS(LS.targets, {})
  );
  // 文件中心
  const [fileRoots, setFileRoots] = usePersistedCollection<FileRoot>(LS.fileRoots);
  const [filePrefs, setFilePrefs] = usePersistedCollection<FilePref>(LS.filePrefs);
  const DEFAULT_FILE_SETTINGS: FileCenterSettings = { adminMode: false, defaultDownloadable: true, defaultViewable: true };
  const [fileSettings, setFileSettingsState] = useState<FileCenterSettings>(() =>
    typeof window === "undefined" ? DEFAULT_FILE_SETTINGS : readLS(LS.fileSettings, DEFAULT_FILE_SETTINGS)
  );
  const setFileSettings = useCallback((v: FileCenterSettings) => {
    setFileSettingsState(v);
    writeLS(LS.fileSettings, v);
  }, []);
  const [plainSecrets, setPlainSecrets] = useState<Record<string, { appKey: string; appSecret: string }>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, { appKey: string; appSecret: string }> = {};
      for (const c of apiConfigs) {
        out[c.id] = { appKey: await decryptSecret(c.appKey), appSecret: await decryptSecret(c.appSecret) };
      }
      if (alive) setPlainSecrets(out);
    })();
    return () => { alive = false; };
  }, [apiConfigs]);

  // 通用实体操作
  const setters: Record<EntityKey, Setter<any>> = {
    warehouses: setWarehouses, orders: setOrders, skus: setSkus, inventory: setInventory,
    containers: setContainers, priceCards: setPriceCards, alerts: setAlerts,
  };
  const upsertRecord = useCallback((entity: EntityKey, record: any) => {
    setters[entity]((prev: any[]) => {
      const idx = prev.findIndex((x: any) => x.id === record.id);
      return idx >= 0 ? prev.map((x: any) => (x.id === record.id ? record : x)) : [record, ...prev];
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const deleteRecord = useCallback((entity: EntityKey, id: string) => {
    setters[entity]((prev: any[]) => prev.filter((x: any) => x.id !== id));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clearEntity = useCallback((entity: EntityKey) => { setters[entity]([]); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 兼容旧调用：仓库 upsert/delete
  const upsertWarehouse = useCallback((w: Warehouse) => upsertRecord("warehouses", w), [upsertRecord]);
  const deleteWarehouse = useCallback((id: string) => deleteRecord("warehouses", id), [deleteRecord]);

  const saveApiConfig = useCallback(async (cfg: ApiConfig) => {
    const encKey = await encryptSecret(cfg.appKey);
    const encSecret = await encryptSecret(cfg.appSecret);
    const stored: ApiConfig = { ...cfg, appKey: encKey, appSecret: encSecret, updatedAt: new Date().toISOString().slice(0, 10) };
    setApiConfigs((prev) => {
      const idx = prev.findIndex((x) => x.id === cfg.id);
      const next = idx >= 0 ? prev.map((x) => (x.id === cfg.id ? stored : x)) : [...prev, stored];
      writeLS(LS.apiConfigs, next);
      return next;
    });
  }, []);
  const deleteApiConfig = useCallback((id: string) => {
    setApiConfigs((prev) => { const next = prev.filter((x) => x.id !== id); writeLS(LS.apiConfigs, next); return next; });
  }, []);

  const setThresholds = useCallback((t: Thresholds) => { setThresholdsState(t); writeLS(LS.thresholds, t); }, []);
  const setSyncInterval = useCallback((n: number) => { setSyncIntervalState(n); writeLS(LS.sync, n); }, []);
  const setSyncOptions = useCallback((o: SyncOptions) => { setSyncOptionsState(o); writeLS(LS.syncOptions, o); }, []);
  const addSnapshot = useCallback((s: InventorySnapshot) => { setSnapshots((p) => { const n = [s, ...p]; writeLS(LS.snapshots, n); return n; }); }, []);
  const deleteSnapshot = useCallback((id: string) => { setSnapshots((p) => { const n = p.filter((x) => x.id !== id); writeLS(LS.snapshots, n); return n; }); }, []);
  const addTransfer = useCallback((t: TransferRecord) => { setTransfers((p) => { const n = [t, ...p]; writeLS(LS.transfers, n); return n; }); }, []);
  const addCardVersion = useCallback((v: CardVersion) => { setCardVersions((p) => { if (p.some((x) => x.version === v.version)) return p; const n = [v, ...p]; writeLS(LS.cardVersions, n); return n; }); }, []);
  const addSolution = useCallback((s: SavedSolution) => { setSolutions((p) => { const n = [s, ...p]; writeLS(LS.solutions, n); return n; }); }, []);
  const upsertTask = useCallback((t: ScheduledTask) => { setTasks((p) => { const idx = p.findIndex((x) => x.id === t.id); const n = idx >= 0 ? p.map((x) => x.id === t.id ? t : x) : [...p, t]; writeLS(LS.tasks, n); return n; }); }, []);
  const deleteTask = useCallback((id: string) => { setTasks((p) => { const n = p.filter((x) => x.id !== id); writeLS(LS.tasks, n); return n; }); }, []);
  const addGeoLayer = useCallback((g: GeoLayer) => { setGeoLayers((p) => { const n = [...p, g]; writeLS(LS.geo, n); return n; }); }, []);
  const toggleGeoLayer = useCallback((id: string) => { setGeoLayers((p) => { const n = p.map((x) => x.id === id ? { ...x, active: !x.active } : x); writeLS(LS.geo, n); return n; }); }, []);
  const deleteGeoLayer = useCallback((id: string) => { setGeoLayers((p) => { const n = p.filter((x) => x.id !== id); writeLS(LS.geo, n); return n; }); }, []);
  const setAlertRead = useCallback((id: string, read: boolean) => { setAlertReadState((p) => { const n = { ...p, [id]: read }; writeLS(LS.alertRead, n); return n; }); }, []);
  const setCostRates = useCallback((r: CostRates) => { setCostRatesState(r); writeLS(LS.costRates, r); }, []);
  const setTarget = useCallback((month: string, value: number) => { setTargetsState((p) => { const n = { ...p, [month]: value }; writeLS(LS.targets, n); return n; }); }, []);
  const deleteTarget = useCallback((month: string) => { setTargetsState((p) => { const n = { ...p }; delete n[month]; writeLS(LS.targets, n); return n; }); }, []);

  const value = useMemo<StoreValue>(() => ({
    warehouses, setWarehouses, orders, setOrders, skus, setSkus, inventory, setInventory,
    containers, setContainers, priceCards, setPriceCards, alerts, setAlerts,
    upsertRecord, deleteRecord, clearEntity, upsertWarehouse, deleteWarehouse,
    apiConfigs, saveApiConfig, deleteApiConfig,
    thresholds, setThresholds, syncInterval, setSyncInterval, plainSecrets,
    syncOptions, setSyncOptions,
    snapshots, addSnapshot, deleteSnapshot, transfers, addTransfer,
    cardVersions, addCardVersion, solutions, addSolution,
    tasks, upsertTask, deleteTask,     geoLayers, addGeoLayer, toggleGeoLayer, deleteGeoLayer,
    alertRead, setAlertRead,
    costRates, setCostRates, targets, setTarget, deleteTarget,
    fileRoots, setFileRoots, filePrefs, setFilePrefs, fileSettings, setFileSettings,
  }), [warehouses, orders, skus, inventory, containers, priceCards, alerts,
    upsertRecord, deleteRecord, clearEntity, upsertWarehouse, deleteWarehouse,
    apiConfigs, saveApiConfig, deleteApiConfig, thresholds, setThresholds, syncInterval, setSyncInterval, plainSecrets,
    syncOptions, setSyncOptions, snapshots, addSnapshot, deleteSnapshot, transfers, addTransfer,
    cardVersions, addCardVersion, solutions, addSolution, tasks, upsertTask, deleteTask,
    geoLayers, addGeoLayer, toggleGeoLayer, deleteGeoLayer, alertRead, setAlertRead,
    costRates, setCostRates, targets, setTarget, deleteTarget,
    setWarehouses, setOrders, setSkus, setInventory, setContainers, setPriceCards, setAlerts,
    fileRoots, setFileRoots, filePrefs, setFilePrefs, fileSettings, setFileSettings]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
