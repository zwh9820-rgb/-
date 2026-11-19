"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import maplibregl, { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import { useStore } from "@/lib/store";
import {
  aggregateByCountry, aggregateByState, attachCountryValues, attachStateValues,
  featureCenter, normalizeStateName,
} from "@/lib/geo-agg";
import type { MapMetric, DrillLevel, Order, Warehouse as WarehouseT } from "@/lib/types";
import { ORDER_FIELDS, DEFAULT_ORDER_FIELDS, loadOrderFields, saveOrderFields, formatOrderField, FIELD_MAP } from "@/lib/order-fields";
import type { OrderFieldKey } from "@/lib/order-fields";
import {
  Globe2, ChevronLeft, ChevronRight, Layers3, BoxSelect, Download, Navigation,
  X, Warehouse, Ship, MousePointer2, RotateCcw, Check, BarChart3, MapPin,
  Satellite, Map as MapIcon, Mountain, Moon, Eye, Anchor, LocateFixed, Ruler,
  CalendarDays, TrendingUp, DollarSign, Package, ListFilter, GripVertical,
} from "lucide-react";
import clsx from "clsx";

const METRICS: { key: MapMetric; label: string; unit: string; color: string }[] = [
  { key: "orderCount", label: "订单量", unit: "单", color: "#3366ff" },
  { key: "sales", label: "销售额", unit: "$", color: "#7c3aed" },
  { key: "weight", label: "重量", unit: "kg", color: "#0891b2" },
  { key: "returnRate", label: "退货率", unit: "%", color: "#e11d48" },
];

// ============ Top N 热度标注配置 ============
type HeatPaletteKey = "blue" | "red" | "orange" | "green" | "purple";
// 前 5 名从深到浅各用一档；第 6 名及以后统一用 tail 色（tailFill/tailSolid），保证选前 10 时全部可见
const HEAT_PALETTES: Record<HeatPaletteKey, { label: string; solid: string[]; fill: string[]; tailSolid: string; tailFill: string }> = {
  blue: {
    label: "蓝", solid: ["#1e3a8a", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"],
    fill: ["rgba(30,58,138,.88)", "rgba(37,99,235,.76)", "rgba(59,130,246,.62)", "rgba(96,165,250,.48)", "rgba(147,197,253,.36)"],
    tailSolid: "#bfdbfe", tailFill: "rgba(191,219,254,.42)",
  },
  red: {
    label: "红", solid: ["#991b1b", "#dc2626", "#ef4444", "#f87171", "#fca5a5"],
    fill: ["rgba(153,27,27,.88)", "rgba(220,38,38,.76)", "rgba(239,68,68,.62)", "rgba(248,113,113,.48)", "rgba(252,165,165,.36)"],
    tailSolid: "#fecaca", tailFill: "rgba(254,202,202,.42)",
  },
  orange: {
    label: "橙", solid: ["#9a3412", "#ea580c", "#f97316", "#fb923c", "#fdba74"],
    fill: ["rgba(154,52,18,.88)", "rgba(234,88,12,.76)", "rgba(249,115,22,.62)", "rgba(251,146,60,.48)", "rgba(253,186,116,.36)"],
    tailSolid: "#fed7aa", tailFill: "rgba(254,215,170,.42)",
  },
  green: {
    label: "绿", solid: ["#14532d", "#16a34a", "#22c55e", "#4ade80", "#86efac"],
    fill: ["rgba(20,83,45,.88)", "rgba(22,163,74,.76)", "rgba(34,197,94,.62)", "rgba(74,222,128,.48)", "rgba(134,239,172,.36)"],
    tailSolid: "#bbf7d0", tailFill: "rgba(187,247,208,.42)",
  },
  purple: {
    label: "紫", solid: ["#4c1d95", "#7c3aed", "#8b5cf6", "#a78bfa", "#c4b5fd"],
    fill: ["rgba(76,29,149,.88)", "rgba(124,58,237,.76)", "rgba(139,92,246,.62)", "rgba(167,139,250,.48)", "rgba(196,181,253,.36)"],
    tailSolid: "#ddd6fe", tailFill: "rgba(221,214,254,.42)",
  },
};
const TOP_N_OPTIONS = [3, 5, 10];
const heatColorAt = (palette: HeatPaletteKey, rank: number, kind: "solid" | "fill") => {
  const p = HEAT_PALETTES[palette];
  if (rank >= 6) return kind === "solid" ? p.tailSolid : p.tailFill;
  return p[kind][Math.min(Math.max(rank - 1, 0), p[kind].length - 1)];
};

// ============ 真实底图（ArcGIS / Esri，全球 WGS-84）============
type BasemapKey = "light" | "dark" | "street" | "satellite" | "topo";
const BASEMAPS: Record<BasemapKey, {
  label: string; desc: string; icon: any; dark: boolean;
  layers: { url: string; label?: boolean }[];
}> = {
  light: {
    label: "浅灰", desc: "Canvas Light", icon: MapIcon, dark: false,
    layers: [
      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" },
      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", label: true },
    ],
  },
  dark: {
    label: "深色", desc: "Canvas Dark", icon: Moon, dark: true,
    layers: [
      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" },
      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", label: true },
    ],
  },
  street: {
    label: "街道", desc: "World Street", icon: Navigation, dark: false,
    layers: [{ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}" }],
  },
  satellite: {
    label: "影像", desc: "World Imagery", icon: Satellite, dark: true,
    layers: [
      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" },
      { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", label: true },
    ],
  },
  topo: {
    label: "地形", desc: "World Topo", icon: Mountain, dark: false,
    layers: [{ url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}" }],
  },
};

function makeStyle(): maplibregl.StyleSpecification {
  const sources: Record<string, any> = {};
  const layers: any[] = [];
  (Object.keys(BASEMAPS) as BasemapKey[]).forEach((key) => {
    BASEMAPS[key].layers.forEach((ly, i) => {
      const id = `base_${key}_${i}`;
      sources[id] = {
        type: "raster", tiles: [ly.url], tileSize: 256,
        attribution: "© Esri, HERE, Garmin, OpenStreetMap contributors",
      };
      layers.push({
        id, type: "raster", source: id,
        layout: { visibility: key === "light" ? "visible" : "none" },
        paint: { "raster-opacity": 1 },
      });
    });
  });
  return { version: 8, sources, layers } as maplibregl.StyleSpecification;
}

// 克制的区域着色：只有选中区域用主色，有数据区域极淡灰蓝，其余近乎透明
function choroExpr(selectedKey: string): any {
  return [
    "case",
    ["==", ["get", "_key"], selectedKey], "rgba(37,99,235,0.48)",
    [">", ["get", "_count"], 0], "rgba(148,163,184,0.15)",
    "rgba(148,163,184,0.03)",
  ];
}

// 州级热度：选中州最高优先级；其余 Top N 州按 _rank 取色系深浅；未入榜但有数据极淡；无数据透明
function stateHeatExpr(selectedKey: string, showHeat: boolean, palette: HeatPaletteKey): any {
  const HIGH = "rgba(37,99,235,0.58)";
  const LIGHT = "rgba(148,163,184,0.13)";
  const NONE = "rgba(148,163,184,0.03)";
  if (!showHeat) {
    return ["case", ["==", ["get", "_key"], selectedKey], HIGH, [">", ["get", "_count"], 0], LIGHT, NONE];
  }
  const p = HEAT_PALETTES[palette];
  const pairs: any[] = [];
  p.fill.forEach((c, i) => { pairs.push(i + 1, c); });
  return [
    "case",
    ["==", ["get", "_key"], selectedKey], HIGH,
    // 第 6 名及以后统一用 tail 色（选前 10 时全部可见）
    [">=", ["get", "_rank"], 6], p.tailFill,
    [">", ["get", "_rank"], 0], ["match", ["get", "_rank"], ...pairs, p.tailFill],
    [">", ["get", "_count"], 0], LIGHT,
    NONE,
  ];
}

type CityAgg = ReturnType<typeof aggregateByCity>[number];
function aggregateByCity(orders: Order[]) {
  const map = new Map<string, { lng: number; lat: number; city: string; state: string; country: string; countryCode: string; orders: Order[] }>();
  orders.forEach((o) => {
    const key = `${o.countryCode}_${o.state}_${o.city}`;
    if (!map.has(key)) map.set(key, { lng: o.lng, lat: o.lat, city: o.city, state: o.state, country: o.country, countryCode: o.countryCode, orders: [] });
    map.get(key)!.orders.push(o);
  });
  return Array.from(map.values()).map((g) => {
    const count = g.orders.length;
    return {
      ...g,
      orderCount: count,
      sales: Math.round(g.orders.reduce((s, o) => s + o.amount, 0)),
      weight: Math.round(g.orders.reduce((s, o) => s + o.weight, 0)),
      deliveryTime: 0,
      returnRate: +(g.orders.reduce((s, o) => s + (o.returnRisk || 0), 0) / Math.max(1, count) * 12).toFixed(1),
    };
  });
}

function ordersGeoJSON(CITY_AGG: CityAgg[]) {
  return {
    type: "FeatureCollection" as const,
    features: CITY_AGG.map((c) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
      properties: { label: c.city, country: c.country, state: c.state, count: c.orderCount, sales: c.sales },
    })),
  };
}
function warehouseGeoJSON(warehouses: WarehouseT[]) {
  return {
    type: "FeatureCollection" as const,
    features: warehouses.map((w) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [w.lng, w.lat] },
      properties: {
        id: w.id, name: w.name, code: w.code, health: w.health,
        used: w.used, capacity: w.capacity, skuCount: w.skuCount,
        utilization: Math.round((w.used / w.capacity) * 100),
      },
    })),
  };
}

function greatCircle(a: [number, number], b: [number, number], n = 64): [number, number][] {
  const rad = Math.PI / 180;
  const [lng1, lat1] = [a[0] * rad, a[1] * rad];
  const [lng2, lat2] = [b[0] * rad, b[1] * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2));
  if (!isFinite(d) || d === 0) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    out.push([Math.atan2(y, x) / rad, Math.atan2(z, Math.sqrt(x * x + y * y)) / rad]);
  }
  return out;
}
const DIST = (a: [number, number], b: [number, number]) => 6371 * 2 * Math.asin(Math.sqrt(Math.sin((b[1] - a[1]) * Math.PI / 360) ** 2 + Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin((b[0] - a[0]) * Math.PI / 360) ** 2));

function routesGeoJSON(containers: import("@/lib/types").Container[]) {
  return {
    type: "FeatureCollection" as const,
    features: containers.filter((c) => c.status !== "已到港").map((c) => ({
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: greatCircle([c.originLng, c.originLat], [c.destLng, c.destLat]) },
      properties: { status: c.status, no: c.containerNo, dest: c.destPort, origin: c.originPort },
    })),
  };
}

const PORTS: { name: string; en: string; lng: number; lat: number; country: string; type: "origin" | "dest" }[] = [
  { name: "上海港", en: "Shanghai", lng: 121.85, lat: 30.62, country: "中国", type: "origin" },
  { name: "深圳盐田港", en: "Yantian", lng: 114.27, lat: 22.56, country: "中国", type: "origin" },
  { name: "宁波舟山港", en: "Ningbo", lng: 121.85, lat: 29.92, country: "中国", type: "origin" },
  { name: "洛杉矶港", en: "Los Angeles", lng: -118.26, lat: 33.74, country: "美国", type: "dest" },
  { name: "长滩港", en: "Long Beach", lng: -118.19, lat: 33.77, country: "美国", type: "dest" },
  { name: "纽约港", en: "New York", lng: -74.05, lat: 40.67, country: "美国", type: "dest" },
  { name: "费利克斯托港", en: "Felixstowe", lng: 1.32, lat: 51.95, country: "英国", type: "dest" },
  { name: "汉堡港", en: "Hamburg", lng: 9.93, lat: 53.54, country: "德国", type: "dest" },
  { name: "东京港", en: "Tokyo", lng: 139.79, lat: 35.62, country: "日本", type: "dest" },
  { name: "悉尼港", en: "Sydney", lng: 151.21, lat: -33.85, country: "澳大利亚", type: "dest" },
];
function portsGeoJSON() {
  return {
    type: "FeatureCollection" as const,
    features: PORTS.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { name: p.name, en: p.en, country: p.country, type: p.type },
    })),
  };
}

const HEALTH_COLOR = { healthy: "#16a34a", warning: "#f59e0b", critical: "#ef4444" };

type RegionLevel = "country" | "state" | "city";
const LEVEL_ORDER: RegionLevel[] = ["country", "state", "city"];
// 路径节点：key 一律使用归一化值（countryCode / 归一化州名 / 城市名），label 用于展示
type PathNode = { level: RegionLevel; key: string; label: string };
type RegionSelection = { level: RegionLevel; key: string; label: string; center: [number, number] | null; orders: Order[] };
type RankItem = { key: string; label: string; count: number; sales: number; weight: number; orders: Order[]; center: [number, number] };

// 统一的分组键：与下钻过滤完全一致，避免 "CA" 与 "California" 不匹配导致断层
function groupKey(o: Order, level: RegionLevel): string {
  if (level === "country") return String(o.countryCode || "").toUpperCase();
  if (level === "state") return normalizeStateName(o.state || "");
  return String(o.city || "").trim();
}
function groupLabel(o: Order, level: RegionLevel): string {
  if (level === "country") return o.country || o.countryCode || groupKey(o, level);
  if (level === "state") return o.state || groupKey(o, level);
  return o.city || groupKey(o, level);
}

// 用订单真实坐标取稳健中心（经纬度中位数）：抗偏远离群点，且永远落在用户数据所在区域，
// 避免用 GeoJSON 边界中心时跨日期线国家（美国/俄罗斯）算到地球反面导致"飞到别的国家"。
function ordersCenter(orders: Order[]): [number, number] | null {
  const pts = orders
    .filter((o) => Number.isFinite(o.lng) && Number.isFinite(o.lat) && Math.abs(o.lng) <= 180 && Math.abs(o.lat) <= 90)
    .map((o) => [o.lng, o.lat] as [number, number]);
  if (!pts.length) return null;
  const median = (vals: number[]) => {
    const s = [...vals].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return [median(pts.map((p) => p[0])), median(pts.map((p) => p[1]))];
}

// 区域定位中心：优先订单坐标中位数（数据在哪飞哪），无订单时才退回 GeoJSON 中心
function regionCenter(orders: Order[], geoFallback?: [number, number] | null): [number, number] | null {
  return ordersCenter(orders) || geoFallback || null;
}

export default function MapWorkbench({ onNavigate }: { onNavigate: (k: any) => void }) {
  const store = useStore();
  const WAREHOUSES = store.warehouses;
  const ORDERS = store.orders;
  const CONTAINERS = store.containers;

  const [metric, setMetric] = useState<MapMetric>("orderCount");
  // Top N 热度标注配置
  const [showTopHeat, setShowTopHeat] = useState(true);
  const [topN, setTopN] = useState(3);
  const [heatPalette, setHeatPalette] = useState<HeatPaletteKey>("blue");
  const [month, setMonth] = useState<string>("all");
  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    ORDERS.forEach((o) => { if (o.date) s.add(String(o.date).slice(0, 7)); });
    return Array.from(s).sort().reverse();
  }, [ORDERS]);
  const scopedOrders = useMemo(() => month === "all" ? ORDERS : ORDERS.filter((o) => String(o.date || "").slice(0, 7) === month), [ORDERS, month]);

  const CITY_AGG = useMemo(() => aggregateByCity(scopedOrders), [scopedOrders]);
  const countryAgg = useMemo(() => aggregateByCountry(scopedOrders), [scopedOrders]);
  const stateAgg = useMemo(() => aggregateByState(scopedOrders), [scopedOrders]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<MLMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const infoMarker = useRef<maplibregl.Marker | null>(null);
  const labelMarkers = useRef<maplibregl.Marker[]>([]);
  const heatMarkers = useRef<maplibregl.Marker[]>([]);
  const countryGeo = useRef<any>(null);
  const stateGeo = useRef<any>(null);

  const [dark, setDark] = useState(false);
  const [basemap, setBasemap] = useState<BasemapKey>("light");
  const [basemapLoading, setBasemapLoading] = useState(false);
  const activeBaseRef = useRef<BasemapKey>("light");
  const basemapCleanup = useRef<(() => void) | null>(null);
  const [path, setPath] = useState<PathNode[]>([]);
  const drill: DrillLevel = useMemo(() => {
    if (path.length === 0) return { level: "world" };
    const c = path.find((p) => p.level === "country");
    const s = path.find((p) => p.level === "state");
    const ci = path.find((p) => p.level === "city");
    return {
      level: path[path.length - 1].level,
      country: c?.label, state: s?.label, city: ci?.label,
    };
  }, [path]);
  const [selected, setSelected] = useState<RegionSelection | null>(null);
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [showWarehouses, setShowWarehouses] = useState(true);
  const [showRoutes, setShowRoutes] = useState(true);
  const [showChoro, setShowChoro] = useState(true);
  const [showOrderPoints, setShowOrderPoints] = useState(false);
  const [showPorts, setShowPorts] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [opacity, setOpacity] = useState(100);
  const [boxMode, setBoxMode] = useState(false);
  const [boxSelection, setBoxSelection] = useState<CityAgg[] | null>(null);
  const [panel, setPanel] = useState<"layers" | "basemap" | "heat" | "fields" | null>(null);
  const [search, setSearch] = useState("");
  // 订单明细显示字段（用户可勾选，持久化）
  const [detailFields, setDetailFields] = useState<OrderFieldKey[]>(() => loadOrderFields());
  useEffect(() => { if (mapRef.current) mapRef.current.dataset.detailFields = detailFields.join("|"); }, [detailFields]);
  const [ready, setReady] = useState(false);
  const [geoVersion, setGeoVersion] = useState(0);
  const [coords, setCoords] = useState<[number, number]>([0, 0]);
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePts, setMeasurePts] = useState<[number, number][]>([]);
  const measureModeRef = useRef(false);
  measureModeRef.current = measureMode;
  const boxStart = useRef<{ x: number; y: number } | null>(null);
  const boxRect = useRef<HTMLDivElement | null>(null);
  const selectRegionRef = useRef<(level: RegionLevel, key: string, label: string, center?: [number, number] | null, orders?: Order[]) => void>(() => {});
  const clearSelectionRef = useRef<() => void>(() => {});

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains("dark")));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // ===== 地图初始化 =====
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: makeStyle(),
      center: [10, 22], zoom: 1.6, minZoom: 1, maxZoom: 18,
      attributionControl: false, dragRotate: true, pitchWithRotate: false,
    });
    mapInstance.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: "metric" }), "bottom-left");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    map.on("mousemove", (e) => setCoords([+e.lngLat.lng.toFixed(3), +e.lngLat.lat.toFixed(3)]));
    // 暴露地图中心，便于自动化校验定位是否正确（无害）
    const syncCenter = () => {
      const c = map.getCenter();
      if (mapRef.current) mapRef.current.dataset.mapCenter = `${c.lng.toFixed(2)},${c.lat.toFixed(2)}`;
    };
    map.on("moveend", syncCenter);
    syncCenter();

    map.on("load", () => {
      map.addSource("boundary", { type: "geojson", data: "/geo/world-countries.geo.json" });
      map.addSource("country-choro", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
      map.addLayer({
        id: "country-fill", type: "fill", source: "country-choro",
        paint: { "fill-color": choroExpr(""), "fill-opacity": 1 },
        layout: { visibility: "visible" },
      });
      map.addLayer({
        id: "boundary-line", type: "line", source: "boundary",
        paint: { "line-color": "#94a3b8", "line-width": 0.6, "line-opacity": 0.5 },
        layout: { visibility: "visible" },
      });
      map.addSource("us-states", { type: "geojson", data: "/geo/us-states.geo.json" });
      map.addSource("state-choro", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
      map.addLayer({
        id: "state-fill", type: "fill", source: "state-choro",
        paint: { "fill-color": stateHeatExpr("", true, "blue"), "fill-opacity": 1 },
        layout: { visibility: "none" },
      });
      map.addLayer({
        id: "us-state-line", type: "line", source: "us-states",
        paint: { "line-color": "#64748b", "line-width": 0.8, "line-opacity": 0.7 },
        layout: { visibility: "none" },
      });
      fetch("/geo/world-countries.geo.json").then((r) => r.json()).then((geo) => {
        countryGeo.current = geo;
        const src = map.getSource("country-choro") as GeoJSONSource;
        if (src) src.setData(attachCountryValues(geo, countryAgg, "count") as any);
        setGeoVersion((v) => v + 1);
      }).catch(() => {});
      fetch("/geo/us-states.geo.json").then((r) => r.json()).then((geo) => {
        stateGeo.current = geo;
        const src = map.getSource("state-choro") as GeoJSONSource;
        if (src) src.setData(attachStateValues(geo, stateAgg, "count") as any);
        setGeoVersion((v) => v + 1);
      }).catch(() => {});

      map.addSource("orders-pts", { type: "geojson", data: ordersGeoJSON(CITY_AGG) as any });
      map.addLayer({
        id: "order-glow", type: "circle", source: "orders-pts",
        paint: { "circle-radius": 12, "circle-color": "#3366ff", "circle-opacity": 0.16 },
        layout: { visibility: "none" },
      });
      map.addLayer({
        id: "order-circle", type: "circle", source: "orders-pts",
        paint: { "circle-radius": 5, "circle-color": "#3366ff", "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
        layout: { visibility: "none" },
      });
      map.addSource("routes", { type: "geojson", data: routesGeoJSON(CONTAINERS) as any });
      map.addLayer({ id: "route-glow", type: "line", source: "routes", paint: { "line-color": "#0ea5e9", "line-width": 5, "line-opacity": 0.12, "line-blur": 3 } });
      map.addLayer({ id: "route-line", type: "line", source: "routes", paint: { "line-color": ["case", ["==", ["get", "status"], "延误"], "#ef4444", "#0ea5e9"], "line-width": 1.8, "line-dasharray": [3, 2], "line-opacity": 0.85 } });
      map.addSource("ports", { type: "geojson", data: portsGeoJSON() as any });
      map.addLayer({ id: "port-dot", type: "circle", source: "ports", paint: { "circle-radius": 5, "circle-color": ["case", ["==", ["get", "type"], "origin"], "#0891b2", "#f59e0b"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      map.addSource("warehouses", { type: "geojson", data: warehouseGeoJSON(WAREHOUSES) as any });
      map.addLayer({ id: "wh-pulse", type: "circle", source: "warehouses", paint: { "circle-radius": 18, "circle-color": ["match", ["get", "health"], "healthy", "#16a34a", "warning", "#f59e0b", "#ef4444"], "circle-opacity": 0.15 } });
      map.addLayer({ id: "wh-circle", type: "circle", source: "warehouses", paint: { "circle-radius": 7, "circle-color": ["match", ["get", "health"], "healthy", "#16a34a", "warning", "#f59e0b", "#ef4444"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      WAREHOUSES.forEach((w) => {
        const el = document.createElement("div");
        el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;white-space:nowrap;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.92);color:#1e293b;border:1px solid rgba(148,163,184,.5);box-shadow:0 1px 4px rgba(0,0,0,.12)"><i style="width:5px;height:5px;border-radius:50%;background:${HEALTH_COLOR[w.health]}"></i>${w.name}</span>`;
        labelMarkers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([w.lng, w.lat]).addTo(map));
      });
      if (mapRef.current) { mapRef.current.dataset.basemap = "light"; mapRef.current.dataset.basemapLoading = "0"; }
      setReady(true);
    });

    map.on("click", "country-fill", (e) => {
      const f: any = e.features?.[0]; if (!f) return;
      const cc = String(f.properties?.iso2 || f.properties?._key || "").toUpperCase();
      // 不传 GeoJSON 中心：selectRegion 内部用订单坐标中位数定位，避免跨日期线国家飞到地球反面
      selectRegionRef.current("country", cc, f.properties?.name || cc);
    });
    map.on("click", "state-fill", (e) => {
      const f: any = e.features?.[0]; if (!f) return;
      const key = f.properties?._key || f.properties?.name || ""; // 归一化州名
      selectRegionRef.current("state", key, key);
    });
    map.on("click", "order-circle", (e) => {
      const p: any = e.features?.[0]?.properties;
      if (p) setSelectedFeature({ type: "order", ...p, lngLat: [e.lngLat.lng, e.lngLat.lat] });
    });
    map.on("click", "wh-circle", (e) => {
      const p: any = e.features?.[0]?.properties;
      if (p) setSelectedFeature({ type: "warehouse", ...p, lngLat: e.lngLat.toArray() });
    });
    map.on("click", "port-dot", (e) => {
      const p: any = e.features?.[0]?.properties;
      if (p) setSelectedFeature({ type: "port", ...p, lngLat: e.lngLat.toArray() });
    });
    ["order-circle", "wh-circle", "port-dot", "country-fill", "state-fill"].forEach((id) => {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    });
    map.on("click", (e) => {
      if (measureModeRef.current) { setMeasurePts((p) => [...p, [e.lngLat.lng, e.lngLat.lat]]); return; }
      const feats = map.queryRenderedFeatures(e.point, { layers: ["order-circle", "wh-circle", "port-dot", "country-fill", "state-fill"] });
      if (!feats.length) clearSelectionRef.current();
    });

    const resizeObs = new ResizeObserver(() => map.resize());
    resizeObs.observe(mapRef.current);
    setTimeout(() => map.resize(), 300);
    return () => {
      resizeObs.disconnect();
      labelMarkers.current.forEach((m) => m.remove()); labelMarkers.current = [];
      heatMarkers.current.forEach((m) => m.remove()); heatMarkers.current = [];
      infoMarker.current?.remove(); infoMarker.current = null;
      map.remove(); mapInstance.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== 按路径过滤出当前层可见订单 =====
  const pathOrders = useMemo(() => {
    let arr = scopedOrders;
    path.forEach((node) => { arr = arr.filter((o) => groupKey(o, node.level) === node.key); });
    return arr;
  }, [scopedOrders, path]);

  // 当前层的下一级维度：国家有州数据则下钻州，否则直接到城市；美国州下钻城市；城市层显示订单明细
  const nextLevel: RegionLevel | null = useMemo(() => {
    const cur = path.length ? path[path.length - 1].level : null;
    if (cur === "city") return null; // 城市层 → 订单明细
    if (cur === "state") return "city";
    // world 或 country 层
    const hasState = pathOrders.some((o) => normalizeStateName(o.state || ""));
    if (cur === "country") return hasState ? "state" : "city";
    // world 层：先看国家
    return "country";
  }, [path, pathOrders]);

  // ===== 选中区域（地图 与 左侧列表 共用入口）=====
  // 按层级下钻：自动截断更深层级，保证 key 用归一化值，层级链完整
  const selectRegion = useCallback((level: RegionLevel, key: string, label: string, center?: [number, number] | null, orders?: Order[]) => {
    const li = LEVEL_ORDER.indexOf(level);
    const nextPath: PathNode[] = [...path.filter((p) => LEVEL_ORDER.indexOf(p.level) < li), { level, key, label }];
    const list = orders || scopedOrders.filter((o) => {
      return nextPath.every((node) => groupKey(o, node.level) === node.key);
    });
    // 用订单真实数据推导展示名，保证国家/州/城市各层 label 一致（如 countryCode→中文国名、归一化州名→原始州名）
    const derivedLabel = list[0] ? groupLabel(list[0], level) : label;
    const finalPath = nextPath.map((p) => p.level === level ? { ...p, label: derivedLabel } : p);
    setPath(finalPath);
    // 定位中心优先用订单坐标中位数（数据在哪飞哪），GeoJSON 中心仅作无订单兜底，
    // 避免跨日期线国家（美国/俄罗斯）用边界中心算到地球反面而"飞到别的国家"。
    let geoFallback = center || null;
    if (!geoFallback) {
      if (level === "country") {
        const f = countryGeo.current?.features?.find((f: any) => String(f.properties?.iso2 || "").toUpperCase() === key);
        if (f) geoFallback = featureCenter(f);
      } else if (level === "state") {
        const f = stateGeo.current?.features?.find((f: any) => f.properties?.name === key);
        if (f) geoFallback = featureCenter(f);
      }
    }
    const c = regionCenter(list, geoFallback);
    setSelected({ level, key, label: derivedLabel, center: c, orders: list });
    setSelectedKey(key);
    setSelectedFeature(null); // 关闭下钻前残留的订单/仓库弹窗
    if (c) mapInstance.current?.flyTo({ center: c, zoom: level === "country" ? 4.5 : level === "state" ? 6.5 : 10, duration: 1200, essential: true });
  }, [scopedOrders, path]);
  selectRegionRef.current = selectRegion;
  clearSelectionRef.current = () => { setSelected(null); setSelectedKey(""); setSelectedFeature(null); };

  const clearSelection = () => { setSelected(null); setSelectedKey(""); setSelectedFeature(null); };
  const resetView = () => { setPath([]); clearSelection(); mapInstance.current?.flyTo({ center: [10, 22], zoom: 1.6, duration: 1300, essential: true }); };
  const drillBack = () => {
    if (path.length === 0) return;
    const nextPath = path.slice(0, -1);
    setPath(nextPath);
    clearSelection();
    // 飞到回退后的层级中心
    const last = nextPath[nextPath.length - 1];
    if (!last) { mapInstance.current?.flyTo({ center: [10, 22], zoom: 1.6, duration: 1300, essential: true }); return; }
    const list = scopedOrders.filter((o) => nextPath.every((node) => groupKey(o, node.level) === node.key));
    let geoFallback: [number, number] | null = null;
    if (last.level === "country") { const f = countryGeo.current?.features?.find((f: any) => String(f.properties?.iso2 || "").toUpperCase() === last.key); if (f) geoFallback = featureCenter(f); }
    else if (last.level === "state") { const f = stateGeo.current?.features?.find((f: any) => f.properties?.name === last.key); if (f) geoFallback = featureCenter(f); }
    const c = regionCenter(list, geoFallback);
    if (c) mapInstance.current?.flyTo({ center: c, zoom: last.level === "country" ? 4.5 : last.level === "state" ? 6.5 : 10, duration: 1300, essential: true });
  };
  // 点面包屑某级：回退到该级
  const jumpTo = (index: number) => {
    const nextPath = path.slice(0, index);
    setPath(nextPath); clearSelection();
    if (index === 0) { mapInstance.current?.flyTo({ center: [10, 22], zoom: 1.6, duration: 1200, essential: true }); return; }
    const last = nextPath[nextPath.length - 1];
    const list = scopedOrders.filter((o) => nextPath.every((node) => groupKey(o, node.level) === node.key));
    const c = regionCenter(list);
    if (c) mapInstance.current?.flyTo({ center: c, zoom: last.level === "country" ? 4.5 : last.level === "state" ? 6.5 : 10, duration: 1200, essential: true });
  };

  // ===== 左侧排行榜 =====
  const rankLevel = nextLevel;
  const rankItems = useMemo<RankItem[]>(() => {
    if (!rankLevel) return [];
    const groups = new Map<string, RankItem>();
    pathOrders.forEach((o) => {
      const key = groupKey(o, rankLevel);
      const label = groupLabel(o, rankLevel);
      if (!key) return;
      if (!groups.has(key)) groups.set(key, { key, label, count: 0, sales: 0, weight: 0, orders: [], center: [0, 0] });
      const g = groups.get(key)!;
      g.count++; g.sales += o.amount || 0; g.weight += o.weight || 0; g.orders.push(o);
    });
    const output = Array.from(groups.values()).map((g) => {
      if (rankLevel === "country") {
        const f = countryGeo.current?.features?.find((f: any) => String(f.properties?.iso2 || "").toUpperCase() === g.key);
        g.center = f ? (featureCenter(f) || [g.orders[0].lng, g.orders[0].lat]) : [g.orders[0].lng, g.orders[0].lat];
      } else if (rankLevel === "state") {
        const f = stateGeo.current?.features?.find((f: any) => f.properties?.name === g.key);
        g.center = f ? (featureCenter(f) || [g.orders[0].lng, g.orders[0].lat]) : [g.orders[0].lng, g.orders[0].lat];
      } else g.center = [g.orders[0].lng, g.orders[0].lat];
      return g;
    });
    return output.sort((a, b) => metric === "sales" ? b.sales - a.sales : metric === "weight" ? b.weight - a.weight : b.count - a.count);
  }, [pathOrders, rankLevel, metric, geoVersion]);
  const filteredRanks = rankItems.filter((d) => d.label.toLowerCase().includes(search.toLowerCase()));
  // 当前层级 Top N 榜单（按当前指标排序，供地图热度染色/标注使用）
  const heatTop = useMemo(() => rankItems.slice(0, topN), [rankItems, topN]);
  const heatRankMap = useMemo(() => {
    const m = new Map<string, number>();
    heatTop.forEach((d, i) => m.set(d.key, i + 1));
    return m;
  }, [heatTop]);
  const kpi = useMemo(() => ({
    count: scopedOrders.length,
    sales: scopedOrders.reduce((s, o) => s + (o.amount || 0), 0),
    countries: new Set(scopedOrders.map((o) => o.countryCode)).size,
    weight: scopedOrders.reduce((s, o) => s + (o.weight || 0), 0),
  }), [scopedOrders]);
  const primaryValue = (d: { count: number; sales: number; weight: number }) => metric === "sales" ? `$${Math.round(d.sales).toLocaleString()}` : metric === "weight" ? `${Math.round(d.weight).toLocaleString()} kg` : `${d.count.toLocaleString()} 单`;

  // ===== 仓库更新 =====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    (map.getSource("warehouses") as GeoJSONSource | undefined)?.setData(warehouseGeoJSON(WAREHOUSES) as any);
    labelMarkers.current.forEach((m) => m.remove()); labelMarkers.current = [];
    WAREHOUSES.forEach((w) => {
      const el = document.createElement("div");
      el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:600;white-space:nowrap;padding:2px 6px;border-radius:5px;background:rgba(255,255,255,.92);color:#1e293b;border:1px solid rgba(148,163,184,.5);box-shadow:0 1px 4px rgba(0,0,0,.12)"><i style="width:5px;height:5px;border-radius:50%;background:${HEALTH_COLOR[w.health]}"></i>${w.name}</span>`;
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([w.lng, w.lat]).addTo(map);
      labelMarkers.current.push(marker);
    });
    labelMarkers.current.forEach((m) => (m.getElement().style.display = showWarehouses ? "" : "none"));
  }, [WAREHOUSES, ready, showWarehouses]);

  // ===== 区域着色数据 + 显隐（Top N 热度）=====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    const cs = map.getSource("country-choro") as GeoJSONSource;
    const ss = map.getSource("state-choro") as GeoJSONSource;
    if (countryGeo.current && cs) cs.setData(attachCountryValues(countryGeo.current, countryAgg, "count") as any);
    if (stateGeo.current && ss) {
      const base = attachStateValues(stateGeo.current, stateAgg, "count");
      // 仅州层（nextLevel=state）给 Top N 州附加排名，供深浅染色
      const withRank = {
        ...base,
        features: base.features.map((f: any) => ({
          ...f,
          properties: { ...f.properties, _rank: nextLevel === "state" && showTopHeat ? (heatRankMap.get(f.properties?._key) || 0) : 0 },
        })),
      };
      ss.setData(withRank as any);
    }
    const countryNode = path.find((p) => p.level === "country");
    const inUS = countryNode?.key === "US";
    // 点进美国（有 country 节点）即显示州图层，便于查看 Top N 州热度；其余保持国家图层
    const showStates = inUS && Object.keys(stateAgg).length > 0;
    if (map.getLayer("country-fill")) map.setLayoutProperty("country-fill", "visibility", showChoro && !showStates ? "visible" : "none");
    if (map.getLayer("state-fill")) {
      map.setLayoutProperty("state-fill", "visibility", showChoro && showStates ? "visible" : "none");
      const stateKey = path.find((p) => p.level === "state")?.key || "";
      map.setPaintProperty("state-fill", "fill-color", stateHeatExpr(stateKey, showTopHeat, heatPalette));
    }
    if (map.getLayer("us-state-line")) map.setLayoutProperty("us-state-line", "visibility", showStates ? "visible" : "none");
    // 暴露热度态便于校验（不影响渲染）
    if (mapRef.current) {
      mapRef.current.dataset.heatOn = showTopHeat ? "1" : "0";
      mapRef.current.dataset.heatTopN = String(topN);
      mapRef.current.dataset.heatPalette = heatPalette;
      mapRef.current.dataset.heatLevel = nextLevel || "";
      mapRef.current.dataset.heatRanks = nextLevel === "state" && showTopHeat ? heatTop.map((d, i) => `${d.key}:${i + 1}`).join("|") : "";
      // 暴露实际着色表达式（含 6+ 名统一的 tail 色），便于自动化校验
      const expr = map.getLayer("state-fill") ? map.getPaintProperty("state-fill", "fill-color") : null;
      mapRef.current.dataset.heatFillExpr = expr ? JSON.stringify(expr) : "";
      mapRef.current.dataset.heatTailFill = HEAT_PALETTES[heatPalette].tailFill;
    }
  }, [ready, countryAgg, stateAgg, path, nextLevel, showChoro, showTopHeat, heatPalette, heatRankMap, heatTop, topN, geoVersion]);

  // ===== 选中高亮（由下钻路径驱动：国家层高亮国家，州层高亮州）=====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    const countryKey = path.find((p) => p.level === "country")?.key || "";
    const stateKey = path.find((p) => p.level === "state")?.key || "";
    if (map.getLayer("country-fill")) map.setPaintProperty("country-fill", "fill-color", choroExpr(countryKey));
    if (map.getLayer("state-fill")) map.setPaintProperty("state-fill", "fill-color", stateHeatExpr(stateKey, showTopHeat, heatPalette));
    // 暴露当前高亮态，便于无障碍与自动化校验（不影响渲染）
    if (mapRef.current) {
      mapRef.current.dataset.highlightCountry = countryKey;
      mapRef.current.dataset.highlightState = stateKey;
    }
  }, [path, ready, geoVersion, showTopHeat, heatPalette]);

  // ===== 选中区域气泡（唯一标点）=====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    infoMarker.current?.remove(); infoMarker.current = null;
    if (!selected?.center || !selected.orders.length) return;
    const el = document.createElement("div");
    const sales = selected.orders.reduce((s, o) => s + (o.amount || 0), 0);
    el.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:7px 10px;box-shadow:0 4px 16px rgba(0,0,0,.16);min-width:132px;white-space:nowrap">
      <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:4px">${selected.label}</div>
      <div style="display:flex;gap:10px;font-size:11px;color:var(--text-2)"><span><b style="color:var(--brand)">${selected.orders.length}</b> 单</span><span><b style="color:var(--brand)">$${Math.round(sales).toLocaleString()}</b></span></div>
    </div>`;
    infoMarker.current = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -6] }).setLngLat(selected.center).addTo(map);
    return () => { infoMarker.current?.remove(); infoMarker.current = null; };
  }, [selected, ready]);

  // ===== 城市 Top N 标注（点进州/省后，地图标出排名靠前的城市）=====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    heatMarkers.current.forEach((m) => m.remove()); heatMarkers.current = [];
    if (!showTopHeat || nextLevel !== "city" || !heatTop.length) return;
    heatTop.forEach((it, i) => {
      const rank = i + 1;
      const color = heatColorAt(heatPalette, rank, "solid");
      const el = document.createElement("div");
      el.className = "heat-city-mark";
      el.style.cssText = "cursor:pointer;display:flex;align-items:center;gap:5px;white-space:nowrap;background:rgba(255,255,255,.96);border:1px solid rgba(148,163,184,.7);border-radius:16px;padding:2px 8px 2px 2px;box-shadow:0 2px 10px rgba(0,0,0,.2);font-size:11px;color:#1e293b;font-family:inherit;";
      el.innerHTML = `<span style="display:inline-flex;width:19px;height:19px;border-radius:50%;color:#fff;font-weight:700;font-size:10px;align-items:center;justify-content:center;background:${color}">${rank}</span><b style="max-width:110px;overflow:hidden;text-overflow:ellipsis">${it.label}</b><span style="color:#64748b">${it.count} 单 · $${Math.round(it.sales).toLocaleString()}</span>`;
      el.onclick = (ev) => { ev.stopPropagation(); selectRegionRef.current("city", it.key, it.label, it.center, it.orders); };
      heatMarkers.current.push(new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -4] }).setLngLat(it.center).addTo(map));
    });
    if (mapRef.current) mapRef.current.dataset.heatCities = heatTop.map((d) => d.label).join("|");
    return () => { heatMarkers.current.forEach((m) => m.remove()); heatMarkers.current = []; };
  }, [ready, nextLevel, heatTop, showTopHeat, heatPalette, geoVersion]);

  // ===== 底图切换（交叉淡入：新底图瓦片就绪后才隐藏旧底图，避免白屏卡顿）=====
  const switchBasemap = useCallback((next: BasemapKey) => {
    const map = mapInstance.current; if (!map || !ready) { setBasemap(next); return; }
    const prev = activeBaseRef.current;
    if (next === prev) return;
    // 取消上一次未完成的切换：把上次的新图层隐藏、旧图层恢复
    if (basemapCleanup.current) { basemapCleanup.current(); basemapCleanup.current = null; }
    setBasemap(next);
    setBasemapLoading(true);

    const ids = (k: BasemapKey) => BASEMAPS[k].layers.map((_, i) => `base_${k}_${i}`);
    const nextIds = ids(next), prevIds = ids(prev);
    // 把新底图图层移到所有业务图层之下、但在旧底图之上（raster 后添加者在上，这里保证新图盖住旧图）
    const firstBizLayer = map.getStyle().layers?.find((l: any) => !l.id.startsWith("base_"))?.id;
    nextIds.forEach((id) => {
      if (!map.getLayer(id)) return;
      if (firstBizLayer) map.moveLayer(id, firstBizLayer);
      map.setLayoutProperty(id, "visibility", "visible");
      map.setPaintProperty(id, "raster-opacity", 0);
    });
    // 旧底图淡出
    prevIds.forEach((id) => { if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", 1); });

    let done = false;
    let poll: ReturnType<typeof setInterval>;
    let timeout: ReturnType<typeof setTimeout>;
    if (mapRef.current) { mapRef.current.dataset.basemapLoading = "1"; mapRef.current.dataset.basemapTarget = next; }
    const finish = () => {
      if (done) return; done = true;
      clearInterval(poll); clearTimeout(timeout);
      basemapCleanup.current = null;
      // 新图淡入到不透明，隐藏非当前底图
      (Object.keys(BASEMAPS) as BasemapKey[]).forEach((k) => {
        ids(k).forEach((id) => {
          if (!map.getLayer(id)) return;
          if (k === next) map.setPaintProperty(id, "raster-opacity", 1);
          else map.setLayoutProperty(id, "visibility", "none");
        });
      });
      activeBaseRef.current = next;
      setBasemapLoading(false);
      if (mapRef.current) { mapRef.current.dataset.basemapLoading = "0"; mapRef.current.dataset.basemap = next; }
    };
    basemapCleanup.current = () => {
      clearInterval(poll); clearTimeout(timeout);
      nextIds.forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none"); });
      prevIds.forEach((id) => { if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", 1); });
      setBasemapLoading(false);
      if (mapRef.current) { mapRef.current.dataset.basemapLoading = "0"; }
    };
    // 轮询：新底图所有 source 瓦片就绪后淡入；12 秒兜底（弱网也能切过去）
    poll = setInterval(() => {
      const loaded = nextIds.every((id) => {
        const src = map.getSource(id);
        return src && map.isSourceLoaded(id);
      });
      if (loaded) finish();
    }, 150);
    timeout = setTimeout(finish, 12000);
  }, [ready]);

  // ===== 订单点位 / 航线随数据更新 =====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    (map.getSource("orders-pts") as GeoJSONSource)?.setData(ordersGeoJSON(CITY_AGG) as any);
    (map.getSource("routes") as GeoJSONSource)?.setData(routesGeoJSON(CONTAINERS) as any);
  }, [CITY_AGG, CONTAINERS, ready]);

  // ===== 图层显隐 / 不透明度 =====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    const vis = (id: string, show: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", show ? "visible" : "none"); };
    vis("wh-pulse", showWarehouses); vis("wh-circle", showWarehouses);
    labelMarkers.current.forEach((m) => (m.getElement().style.display = showWarehouses ? "" : "none"));
    vis("route-line", showRoutes); vis("route-glow", showRoutes);
    vis("port-dot", showPorts);
    vis("boundary-line", showBoundary);
    vis("order-circle", showOrderPoints); vis("order-glow", showOrderPoints);
    const op = opacity / 100;
    ["order-circle", "order-glow", "wh-circle", "wh-pulse", "port-dot"].forEach((id) => {
      if (map.getLayer(id)) {
        const base = id.includes("glow") ? 0.16 : id.includes("pulse") ? 0.15 : 0.85;
        map.setPaintProperty(id, "circle-opacity", base * op);
      }
    });
  }, [showWarehouses, showRoutes, showPorts, showBoundary, showOrderPoints, opacity, ready]);

  // ===== 仓库 / 港口弹窗 =====
  useEffect(() => {
    const map = mapInstance.current; if (!map || !ready) return;
    popupRef.current?.remove();
    if (map.getSource("delivery-line")) { map.removeLayer("delivery-line"); map.removeSource("delivery-line"); }
    if (!selectedFeature || selectedFeature.type === "region") return;
    const p = selectedFeature;
    const nearest = p.lngLat && WAREHOUSES.length ? [...WAREHOUSES].sort((a, b) => DIST([a.lng, a.lat], p.lngLat) - DIST([b.lng, b.lat], p.lngLat))[0] : null;
    if (nearest && p.type === "order") {
      map.addSource("delivery-line", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: greatCircle(p.lngLat, [nearest.lng, nearest.lat], 32) }, properties: {} } as any });
      map.addLayer({ id: "delivery-line", type: "line", source: "delivery-line", paint: { "line-color": "#22c55e", "line-width": 2.5, "line-dasharray": [1, 1] } });
    }
    const html = p.type === "warehouse" ? popupWh(p) : p.type === "port" ? popupPort(p) : popupOrder(p, nearest, detailFields);
    popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: "340px", offset: 16 }).setLngLat(p.lngLat as [number, number]).setHTML(html).addTo(map);
  }, [selectedFeature, ready, WAREHOUSES, detailFields]);

  // ===== 框选 / 导出 =====
  const startBox = (e: React.PointerEvent) => {
    if (!boxMode || !mapRef.current) return;
    const r = mapRef.current.getBoundingClientRect();
    boxStart.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    const div = document.createElement("div");
    div.style.cssText = "position:absolute;border:1.5px dashed #3366ff;background:rgba(51,102,255,.1);pointer-events:none;z-index:9;";
    boxRect.current = div; mapRef.current.appendChild(div);
  };
  const moveBox = (e: React.PointerEvent) => {
    if (!boxStart.current || !boxRect.current || !mapRef.current) return;
    const r = mapRef.current.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    boxRect.current.style.left = `${Math.min(boxStart.current.x, cx)}px`;
    boxRect.current.style.top = `${Math.min(boxStart.current.y, cy)}px`;
    boxRect.current.style.width = `${Math.abs(cx - boxStart.current.x)}px`;
    boxRect.current.style.height = `${Math.abs(cy - boxStart.current.y)}px`;
  };
  const endBox = () => {
    if (!boxStart.current || !boxRect.current || !mapInstance.current) return;
    const x1 = parseFloat(boxRect.current.style.left), y1 = parseFloat(boxRect.current.style.top);
    const x2 = x1 + parseFloat(boxRect.current.style.width), y2 = y1 + parseFloat(boxRect.current.style.height);
    boxRect.current.remove(); boxRect.current = null; boxStart.current = null;
    if (x2 - x1 < 8 || y2 - y1 < 8) return;
    const map = mapInstance.current;
    setBoxSelection(CITY_AGG.filter((c) => { const pt = map.project([c.lng, c.lat]); return pt.x >= x1 && pt.x <= x2 && pt.y >= y1 && pt.y <= y2; }));
  };
  const [exported, setExported] = useState(false);
  const exportCsv = () => {
    const rows = boxSelection || CITY_AGG;
    const csv = ["城市,国家,州,订单量,销售额,重量kg,退货率%", ...rows.map((r) => `${r.city},${r.country},${r.state},${r.orderCount},${r.sales},${r.weight},${r.returnRate}`)].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "区域订单明细.csv"; a.click();
    setExported(true); setTimeout(() => setExported(false), 2000);
  };
  const measureDist = measurePts.length >= 2 ? measurePts.slice(1).reduce((s, p, i) => s + DIST(measurePts[i], p), 0) : 0;
  const levelTitle = !rankLevel ? "订单明细"
    : rankLevel === "country" ? "国家 / 地区" : rankLevel === "state" ? "州 / 省" : "城市";
  const activeMetric = METRICS.find((m) => m.key === metric)!;
  // 城市层：展开订单明细
  const cityOrders = useMemo(() => rankLevel === null
    ? [...pathOrders].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    : [], [rankLevel, pathOrders]);

  return (
    <div className="relative w-full h-full flex overflow-hidden">
      {/* ===== 左侧数据栏 ===== */}
      <div className="w-[300px] shrink-0 h-full flex flex-col border-r z-10" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="p-3.5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold"><BarChart3 size={16} style={{ color: "var(--brand)" }} />区域数据看板</div>
            <button onClick={resetView} title="重置视图" className="p-1 rounded" style={{ color: "var(--text-3)" }}><RotateCcw size={14} /></button>
          </div>

          {/* 月份筛选 */}
          <div className="flex items-center gap-1.5 mb-1.5 text-[10.5px]" style={{ color: "var(--text-3)" }}><CalendarDays size={12} />统计月份</div>
          <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
            <button onClick={() => setMonth("all")} className={clsx("px-2 h-6 rounded-md text-[11px] whitespace-nowrap shrink-0", month === "all" ? "text-white" : "")} style={month === "all" ? { background: "var(--brand)" } : { background: "var(--surface-2)", color: "var(--text-2)" }}>全部</button>
            {monthOptions.map((m) => (
              <button key={m} onClick={() => { setMonth(m); clearSelection(); }} className={clsx("px-2 h-6 rounded-md text-[11px] whitespace-nowrap shrink-0", month === m ? "text-white" : "")} style={month === m ? { background: "var(--brand)" } : { background: "var(--surface-2)", color: "var(--text-2)" }}>{m}</button>
            ))}
            {!monthOptions.length && <span className="text-[10.5px]" style={{ color: "var(--text-3)" }}>暂无订单，请先到数据中心录入</span>}
          </div>

          {/* KPI */}
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            <KpiCard icon={Package} label="订单" value={kpi.count.toLocaleString()} />
            <KpiCard icon={DollarSign} label="销售额" value={`$${(kpi.sales / 1000).toFixed(1)}k`} />
            <KpiCard icon={Globe2} label="国家" value={String(kpi.countries)} />
          </div>
        </div>

        {/* 面包屑 / 排序 / 搜索 */}
        <div className="px-3.5 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1 flex-wrap text-[11px]">
            <button onClick={() => jumpTo(0)} style={{ color: path.length === 0 ? "var(--brand)" : "var(--text-2)" }}>世界</button>
            {path.map((node, i) => (
              <span key={`${node.level}-${node.key}`} className="flex items-center gap-1">
                <ChevronRight size={11} style={{ color: "var(--text-3)" }} />
                <button onClick={() => jumpTo(i + 1)} style={{ color: i === path.length - 1 ? "var(--brand)" : "var(--text-2)" }}>{node.label}</button>
              </span>
            ))}
          </div>
          {path.length > 0 && <button onClick={drillBack} className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: "var(--brand)" }}><ChevronLeft size={13} /> 返回上一级</button>}
          <div className="flex gap-1 mt-2.5">
            {METRICS.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)} className="px-2 h-6 rounded-md text-[10.5px] flex-1 whitespace-nowrap" style={{ background: metric === m.key ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "var(--surface-2)", color: metric === m.key ? "var(--brand)" : "var(--text-3)" }}>{m.label}</button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5 h-8 px-2.5 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <SearchIcon />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="筛选区域…" className="flex-1 bg-transparent outline-none text-[12px]" style={{ color: "var(--text)" }} />
          </div>
        </div>

        {/* 排行榜 / 订单明细 */}
        <div className="flex-1 overflow-y-auto p-2">
          {rankLevel ? (
            <>
              <div className="px-1.5 py-1.5 flex items-center justify-between">
                <span className="text-[10.5px]" style={{ color: "var(--text-3)" }}>{levelTitle} · 按{activeMetric.label}排序</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--brand) 12%, transparent)", color: "var(--brand)" }}>点击下钻 ↓</span>
              </div>
              {filteredRanks.map((d, i) => (
                <button key={d.key} onClick={() => selectRegion(rankLevel, d.key, d.label, d.center, d.orders)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left"
                  style={{ background: selectedKey === d.key ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent" }}
                  onMouseEnter={(e) => { if (selectedKey !== d.key) e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={(e) => { if (selectedKey !== d.key) e.currentTarget.style.background = "transparent"; }}>
                  <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0" style={showTopHeat && i < topN ? { background: heatColorAt(heatPalette, i + 1, "solid"), color: "#fff" } : { background: "var(--surface-2)", color: "var(--text-3)" }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate" style={{ color: selectedKey === d.key ? "var(--brand)" : "var(--text)" }}>{d.label}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{d.count} 单 · ${Math.round(d.sales).toLocaleString()} · {Math.round(d.weight)}kg</div>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-0.5">
                    <div className="text-[11px] font-semibold" style={{ color: "var(--text-2)" }}>{primaryValue(d)}</div>
                    <ChevronRight size={12} style={{ color: "var(--text-3)" }} />
                  </div>
                </button>
              ))}
              {!filteredRanks.length && <div className="px-2 py-8 text-center text-[11px]" style={{ color: "var(--text-3)" }}>当前筛选下暂无订单数据</div>}
            </>
          ) : (
            <>
              <div className="px-1.5 py-1.5 flex items-center justify-between">
                <span className="text-[10.5px]" style={{ color: "var(--text-3)" }}>{levelTitle} · {pathOrders.length} 笔订单</span>
                <span className="text-[10px]" style={{ color: "var(--text-3)" }}>最新在前</span>
              </div>
              {cityOrders.filter((o) => {
                if (!search) return true;
                const q = search.toLowerCase();
                if ((o.orderNo || "").toLowerCase().includes(q) || (o.skuId || "").toLowerCase().includes(q)) return true;
                // 也搜索当前显示的字段值
                return detailFields.some((k) => (o as any)[k] != null && String((o as any)[k]).toLowerCase().includes(q));
              }).map((o) => {
                const titleKey: OrderFieldKey = detailFields.includes("orderNo") ? "orderNo" : (detailFields[0] || "orderNo");
                return (
                  <button key={o.id} onClick={() => setSelectedFeature({ type: "order", label: o.city || "订单", count: 1, sales: o.amount, lngLat: [o.lng, o.lat], order: o })}
                    className="w-full flex flex-col gap-1 px-2.5 py-2 rounded-lg text-left mb-1"
                    style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between w-full gap-2">
                      <span className="font-mono text-[11.5px] font-medium truncate" style={{ color: "var(--text)" }}>{formatOrderField(o, titleKey)}</span>
                      {detailFields.includes("amount") && titleKey !== "amount" && <span className="text-[12px] font-bold shrink-0" style={{ color: "var(--brand)" }}>{formatOrderField(o, "amount")}</span>}
                    </div>
                    {detailFields.length > 0 && (
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 w-full text-[10px]">
                        {detailFields.filter((k) => k !== titleKey && k !== "amount").map((k) => (
                          <div key={k} className="flex items-center gap-1 min-w-0">
                            <span className="shrink-0" style={{ color: "var(--text-3)" }}>{FIELD_MAP[k]?.label}</span>
                            <span className="truncate font-medium" style={{ color: "var(--text-2)" }}>{formatOrderField(o, k)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
              {!cityOrders.length && <div className="px-2 py-8 text-center text-[11px]" style={{ color: "var(--text-3)" }}>该城市下暂无订单明细</div>}
            </>
          )}
        </div>

        {/* 选中区域详情 */}
        {selected && (
          <div className="p-3 border-t" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold truncate" style={{ color: "var(--brand)" }}>{selected.label}</div>
              <button onClick={clearSelection} style={{ color: "var(--text-3)" }}><X size={13} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><span style={{ color: "var(--text-3)" }}>订单量</span><div className="font-bold" style={{ color: "var(--text)" }}>{selected.orders.length} 单</div></div>
              <div><span style={{ color: "var(--text-3)" }}>销售额</span><div className="font-bold" style={{ color: "var(--text)" }}>${Math.round(selected.orders.reduce((s, o) => s + (o.amount || 0), 0)).toLocaleString()}</div></div>
              <div><span style={{ color: "var(--text-3)" }}>重量</span><div className="font-bold" style={{ color: "var(--text)" }}>{Math.round(selected.orders.reduce((s, o) => s + (o.weight || 0), 0)).toLocaleString()} kg</div></div>
              <div><span style={{ color: "var(--text-3)" }}>覆盖城市</span><div className="font-bold" style={{ color: "var(--text)" }}>{new Set(selected.orders.map((o) => o.city)).size} 个</div></div>
            </div>
            {selected.level !== "city" && (() => {
              const cityMap = new Map<string, number>();
              selected.orders.forEach((o) => cityMap.set(o.city, (cityMap.get(o.city) || 0) + 1));
              const top = Array.from(cityMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);
              return top.length ? <div className="mt-2 pt-2 border-t text-[10.5px]" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>主要城市：{top.map(([c, n]) => `${c} ${n}单`).join(" · ")}</div> : null;
            })()}
          </div>
        )}

        <div className="p-3 border-t text-[10px] leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
          <div className="flex items-center gap-1.5 mb-1"><Anchor size={11} /> 底图：Esri ArcGIS 全球（WGS-84）</div>
          <div>点击国家 / 州查看指标 · 50m 国界 · 10m 州界</div>
        </div>
      </div>

      {/* ===== 地图区 ===== */}
      <div className="flex-1 relative min-w-0">
        <div ref={mapRef} className={clsx(boxMode && "cursor-crosshair")} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onPointerDown={startBox} onPointerMove={moveBox} onPointerUp={endBox} />

        {/* 顶部工具栏 */}
        <div className="absolute top-4 left-4 right-4 z-10 flex items-start pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-1 ml-auto">
            <button onClick={() => setPanel(panel === "basemap" ? null : "basemap")} className={clsx("btn !h-9 !px-2.5", panel === "basemap" && "!text-white")} style={panel === "basemap" ? { background: "var(--brand)" } : {}} title="底图切换"><Satellite size={15} /> 底图</button>
            <button onClick={() => setPanel(panel === "layers" ? null : "layers")} className={clsx("btn !h-9 !px-2.5", panel === "layers" && "!text-white")} style={panel === "layers" ? { background: "var(--brand)" } : {}} title="图层控制"><Layers3 size={15} /> 图层</button>
            <button onClick={() => setPanel(panel === "heat" ? null : "heat")} className={clsx("btn !h-9 !px-2.5", (panel === "heat" || showTopHeat) && "!text-white")} style={{ background: panel === "heat" || showTopHeat ? heatColorAt(heatPalette, 2, "solid") : "" }} title="Top 热度标注"><TrendingUp size={15} /> 热度</button>
            <button onClick={() => setPanel(panel === "fields" ? null : "fields")} className={clsx("btn !h-9 !px-2.5", panel === "fields" && "!text-white")} style={panel === "fields" ? { background: "var(--brand)" } : {}} title="订单明细字段设置"><ListFilter size={15} /> 字段</button>
            <button onClick={() => { setMeasureMode(!measureMode); setMeasurePts([]); }} className={clsx("btn !h-9 !px-2.5", measureMode && "!text-white")} style={measureMode ? { background: "var(--brand)" } : {}} title="距离测量"><Ruler size={15} /></button>
            <button onClick={() => { setBoxMode(!boxMode); setBoxSelection(null); }} className={clsx("btn !h-9 !px-2.5", boxMode && "!text-white")} style={boxMode ? { background: "var(--brand)" } : {}} title="框选区域"><BoxSelect size={15} /> 框选</button>
          </div>
        </div>

        {panel === "basemap" && (
          <div className="absolute top-16 right-4 w-[234px] rounded-xl p-3 z-20 shadow-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-[12px] font-semibold mb-3 flex items-center justify-between"><span className="flex items-center gap-1.5"><Satellite size={14} /> 底图样式</span><button onClick={() => setPanel(null)}><X size={14} /></button></div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(BASEMAPS) as BasemapKey[]).map((k) => {
                const bm = BASEMAPS[k]; const Icon = bm.icon;
                return <button key={k} onClick={() => switchBasemap(k)} className="relative rounded-lg overflow-hidden text-left transition-all" style={{ border: basemap === k ? "2px solid var(--brand)" : "1px solid var(--border)" }}>
                  <div className="h-12 flex items-center justify-center" style={{ background: k === "dark" ? "#1e293b" : k === "satellite" ? "linear-gradient(135deg,#1e3a5f,#4a7c59,#8b7355)" : k === "topo" ? "linear-gradient(135deg,#d4e6c8,#e8dcc0)" : k === "street" ? "linear-gradient(135deg,#f5f5f0,#e8e8e0)" : "linear-gradient(135deg,#eef2f7,#e2e8f0)" }}>
                    <Icon size={20} style={{ color: k === "dark" || k === "satellite" ? "#fff" : "#64748b" }} />
                  </div>
                  <div className="px-2 py-1.5 flex items-center justify-between"><span className="text-[11px] font-medium">{bm.label}</span>{basemap === k && <Check size={12} style={{ color: "var(--brand)" }} />}</div>
                </button>;
              })}
            </div>
            <div className="mt-2.5 text-[10px]" style={{ color: "var(--text-3)" }}>实时瓦片 · Esri ArcGIS Online</div>
          </div>
        )}

        {panel === "layers" && (
          <div className="absolute top-16 right-4 w-[222px] rounded-xl p-3 z-20 shadow-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-[12px] font-semibold mb-3 flex items-center justify-between"><span className="flex items-center gap-1.5"><Layers3 size={14} /> 图层控制</span><button onClick={() => setPanel(null)}><X size={14} /></button></div>
            {[
              { label: "区域着色", checked: showChoro, set: setShowChoro, icon: BarChart3 },
              { label: "订单点位（可选）", checked: showOrderPoints, set: setShowOrderPoints, icon: MapPin },
              { label: "海外仓点位", checked: showWarehouses, set: setShowWarehouses, icon: Warehouse },
              { label: "海运航线", checked: showRoutes, set: setShowRoutes, icon: Ship },
              { label: "港口点位", checked: showPorts, set: setShowPorts, icon: Anchor },
              { label: "国界边界", checked: showBoundary, set: setShowBoundary, icon: Globe2 },
            ].map((l) => { const Icon = l.icon; return (
              <label key={l.label} className="flex items-center gap-2 py-1.5 text-[12px] cursor-pointer" style={{ color: "var(--text-2)" }}>
                <input type="checkbox" checked={l.checked} onChange={(e) => l.set(e.target.checked)} className="accent-blue-600" /> <Icon size={13} /> {l.label}
              </label>
            ); })}
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: "var(--text-2)" }}><span className="flex items-center gap-1"><Eye size={12} /> 点位不透明度</span><b style={{ color: "var(--brand)" }}>{opacity}%</b></div>
              <input type="range" min={20} max={100} value={opacity} onChange={(e) => setOpacity(+e.target.value)} className="w-full accent-blue-600" />
            </div>
            <div className="mt-2 text-[10.5px]" style={{ color: "var(--text-3)" }}>地图仅高亮选中区域，指标见左侧数据栏。</div>
          </div>
        )}

        {panel === "heat" && (
          <div className="absolute top-16 right-4 w-[268px] rounded-xl p-3 z-20 shadow-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="text-[12px] font-semibold mb-3 flex items-center justify-between"><span className="flex items-center gap-1.5"><TrendingUp size={14} /> Top 热度标注</span><button onClick={() => setPanel(null)}><X size={14} /></button></div>
            <label className="flex items-center justify-between py-1.5 text-[12px] cursor-pointer" style={{ color: "var(--text-2)" }}>
              <span className="flex items-center gap-1.5"><Eye size={13} /> 开启热度标注</span>
              <input type="checkbox" checked={showTopHeat} onChange={(e) => setShowTopHeat(e.target.checked)} className="accent-blue-600" />
            </label>
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="text-[11px] mb-1.5" style={{ color: "var(--text-3)" }}>标注前几名（按左侧当前指标：{activeMetric.label}）</div>
              <div className="flex gap-1.5">
                {TOP_N_OPTIONS.map((n) => (
                  <button key={n} onClick={() => setTopN(n)} className={clsx("flex-1 h-7 rounded-md text-[11px] font-medium", topN === n ? "text-white" : "")} style={topN === n ? { background: "var(--brand)" } : { background: "var(--surface-2)", color: "var(--text-2)" }}>前 {n} 名</button>
                ))}
              </div>
            </div>
            <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="text-[11px] mb-1.5" style={{ color: "var(--text-3)" }}>标注颜色（第 1 名最深）</div>
              <div className="flex gap-2">
                {(Object.keys(HEAT_PALETTES) as HeatPaletteKey[]).map((k) => (
                  <button key={k} onClick={() => setHeatPalette(k)} title={HEAT_PALETTES[k].label} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ border: heatPalette === k ? "2px solid var(--brand)" : "1px solid var(--border)" }}>
                    <span className="w-5 h-5 rounded-full" style={{ background: `linear-gradient(135deg, ${HEAT_PALETTES[k].solid[0]}, ${HEAT_PALETTES[k].solid[2]}, ${HEAT_PALETTES[k].solid[4]})` }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 pt-2 border-t flex items-center gap-1.5" style={{ borderColor: "var(--border)" }}>
              {[1, 2, 3, 4, 5].map((r) => <span key={r} className="flex-1 h-2.5 rounded-sm" style={{ background: heatColorAt(heatPalette, r, "solid") }} title={`第 ${r} 名`} />)}
              {topN > 5 && <span className="flex-1 h-2.5 rounded-sm" style={{ background: HEAT_PALETTES[heatPalette].tailSolid }} title="第 6 名及以后（统一色）" />}
            </div>
            <div className="mt-2 text-[10px] leading-relaxed" style={{ color: "var(--text-3)" }}>前 5 名按深浅着色，第 6 名及以后统一浅色。进入国家看州热度，进入州看城市标注，点击可下钻。</div>
          </div>
        )}

        {panel === "fields" && (
          <div className="absolute top-16 right-4 w-[300px] rounded-xl z-20 shadow-xl flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)", maxHeight: "70vh" }}>
            <div className="px-3 py-2.5 flex items-center justify-between border-b shrink-0" style={{ borderColor: "var(--border)" }}>
              <span className="text-[12px] font-semibold flex items-center gap-1.5"><ListFilter size={14} /> 订单明细字段</span>
              <button onClick={() => setPanel(null)}><X size={14} /></button>
            </div>
            <div className="px-3 py-2 text-[10.5px] shrink-0" style={{ color: "var(--text-3)" }}>勾选要显示的字段，拖左侧手柄排序。左侧列表与地图弹窗同步生效。</div>
            <div className="overflow-y-auto px-2 pb-1 flex-1">
              {(["基础", "地理", "费用"] as const).map((grp) => {
                const items = ORDER_FIELDS.filter((f) => f.group === grp);
                return (
                  <div key={grp}>
                    <div className="px-1.5 py-1 text-[10px] font-semibold" style={{ color: "var(--text-3)" }}>{grp}</div>
                    {items.map((f) => {
                      const idx = detailFields.indexOf(f.key);
                      const on = idx >= 0;
                      return (
                        <div key={f.key}
                          draggable={on}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", f.key); e.dataTransfer.effectAllowed = "move"; }}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = e.dataTransfer.getData("text/plain") as OrderFieldKey;
                            if (!from || from === f.key) return;
                            setDetailFields((prev) => {
                              const fi = prev.indexOf(from);
                              if (fi < 0) return prev;
                              const next = [...prev];
                              next.splice(fi, 1);
                              const ti = next.indexOf(f.key);
                              next.splice(ti < 0 ? next.length : ti, 0, from);
                              saveOrderFields(next);
                              return next;
                            });
                          }}
                          className="flex items-center gap-1.5 px-1.5 py-1 rounded-md" style={{ background: on ? "color-mix(in srgb, var(--brand) 6%, transparent)" : "transparent", cursor: on ? "grab" : "default" }}>
                          <span style={{ color: on ? "var(--text-3)" : "transparent" }}><GripVertical size={13} /></span>
                          <input type="checkbox" checked={on} onChange={(e) => {
                            setDetailFields((prev) => {
                              const next = e.target.checked ? [...prev, f.key] : prev.filter((k) => k !== f.key);
                              saveOrderFields(next);
                              return next;
                            });
                          }} className="accent-blue-600" />
                          <span className="flex-1 text-[11.5px]" style={{ color: "var(--text-2)" }}>{f.label}</span>
                          {on && <span className="text-[9px] px-1 rounded" style={{ background: "color-mix(in srgb, var(--brand) 14%, transparent)", color: "var(--brand)" }}>#{idx + 1}</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t flex gap-2 shrink-0" style={{ borderColor: "var(--border)" }}>
              <button onClick={() => { const all = ORDER_FIELDS.map((f) => f.key); setDetailFields(all); saveOrderFields(all); }} className="btn flex-1 !text-[11px] !h-7">全选</button>
              <button onClick={() => { setDetailFields([]); saveOrderFields([]); }} className="btn flex-1 !text-[11px] !h-7">清空</button>
              <button onClick={() => { setDetailFields([...DEFAULT_ORDER_FIELDS]); saveOrderFields([...DEFAULT_ORDER_FIELDS]); }} className="btn btn-primary flex-1 !text-[11px] !h-7">恢复默认</button>
            </div>
          </div>
        )}

        {basemapLoading && (
          <div className="absolute top-[76px] left-1/2 -translate-x-1/2 z-20 px-3.5 py-2 rounded-full text-[11.5px] shadow-lg flex items-center gap-2" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}>
            <span className="inline-block w-3.5 h-3.5 rounded-full animate-spin" style={{ border: "2px solid var(--border)", borderTopColor: "var(--brand)" }} />
            底图瓦片加载中…
          </div>
        )}
        {measureMode && (
          <div className="absolute top-[76px] left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-[11.5px] shadow" style={{ background: "var(--brand)", color: "#fff" }}>
            <Ruler size={12} className="inline mr-1" />点击地图添加测量点{measureDist > 0 && ` · 累计 ${measureDist.toFixed(0)} km`}
            <button onClick={() => setMeasurePts([])} className="ml-2 underline">清除</button>
          </div>
        )}
        {boxMode && <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full text-[11px] shadow" style={{ background: "var(--brand)", color: "#fff" }}><MousePointer2 size={12} className="inline mr-1" />拖拽框选区域</div>}

        {/* 图例 */}
        <div className="absolute bottom-5 left-4 z-10 rounded-xl px-3 py-2.5 text-[11px]" style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(6px)" }}>
          <div className="flex items-center gap-3 mb-1.5 font-semibold"><span className="w-2 h-2 rounded-full" style={{ background: "#2563eb" }} />选中区域</div>
          {showTopHeat && (
            <div className="flex items-center gap-1 mb-1.5" style={{ color: "var(--text-2)" }}>
              <span className="mr-1">热度前 {topN}</span>
              {Array.from({ length: Math.min(topN, 5) }, (_, i) => i + 1).map((r) => (
                <span key={r} className="w-3.5 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] text-white font-bold" style={{ background: heatColorAt(heatPalette, r, "solid") }}>{r}</span>
              ))}
              {topN > 5 && <span className="w-4 h-3.5 rounded-sm inline-flex items-center justify-center text-[8px] font-bold" style={{ background: HEAT_PALETTES[heatPalette].tailSolid, color: "#334155" }}>{topN > 6 ? "6+" : "6"}</span>}
              <span style={{ color: "var(--text-3)" }}>深 → 浅</span>
            </div>
          )}
          <div className="flex items-center gap-3" style={{ color: "var(--text-2)" }}>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: HEALTH_COLOR.healthy }} />仓库充足</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: HEALTH_COLOR.warning }} />预警</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: HEALTH_COLOR.critical }} />断货</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full" style={{ background: "#0891b2" }} />起运港</span>
          </div>
        </div>

        <div className="absolute bottom-5 right-4 z-10 rounded-lg px-2.5 py-1.5 text-[10.5px] font-mono" style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          <LocateFixed size={11} className="inline mr-1" />{coords[1].toFixed(3)}°N, {coords[0].toFixed(3)}°E
        </div>

        {boxSelection && (
          <div className="absolute top-1/2 right-4 -translate-y-1/2 w-[282px] rounded-xl z-20 shadow-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-3.5 py-3 flex items-center justify-between border-b" style={{ borderColor: "var(--border)" }}>
              <div className="text-[13px] font-semibold flex items-center gap-2"><BoxSelect size={15} style={{ color: "var(--brand)" }} />框选分析结果</div>
              <button onClick={() => setBoxSelection(null)}><X size={15} style={{ color: "var(--text-3)" }} /></button>
            </div>
            <div className="p-3.5 space-y-2 text-[12px]">
              <StatLine label="选中区域" value={`${boxSelection.length} 个`} />
              <StatLine label="订单总量" value={`${boxSelection.reduce((s, c) => s + c.orderCount, 0)} 单`} />
              <StatLine label="销售额" value={`$${boxSelection.reduce((s, c) => s + c.sales, 0).toLocaleString()}`} />
              <StatLine label="总重量" value={`${boxSelection.reduce((s, c) => s + c.weight, 0)} kg`} />
              <div className="pt-2 mt-1 border-t" style={{ borderColor: "var(--border)" }}>
                <div className="text-[11px] mb-1.5" style={{ color: "var(--text-3)" }}>仓配推荐方案（成本优先）</div>
                {WAREHOUSES.slice(0, 3).map((w, i) => <div key={w.id} className="flex items-center gap-2 py-1"><span className={clsx("w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold", i === 0 ? "bg-emerald-500 text-white" : "")} style={i > 0 ? { background: "var(--surface-2)", color: "var(--text-2)" } : {}}>{i + 1}</span><span className="flex-1 truncate">{w.name}</span><span style={{ color: "var(--text-2)" }}>${(w.dailyOutbound * 0.12 * (i + 1)).toFixed(0)}</span></div>)}
              </div>
            </div>
            <div className="p-3 pt-0 flex gap-2">
              <button onClick={() => onNavigate("pricecard")} className="btn flex-1 !text-[11px]">批量测算</button>
              <button onClick={exportCsv} className="btn btn-primary flex-1 !text-[11px]"><Download size={13} />{exported ? "已导出" : "导出明细"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-3)" }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>; }
function KpiCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return <div className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
    <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-3)" }}><Icon size={11} />{label}</div>
    <div className="text-[12px] font-bold mt-0.5 truncate" style={{ color: "var(--text)" }}>{value}</div>
  </div>;
}
function StatLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span style={{ color: "var(--text-2)" }}>{label}</span><b>{value}</b></div>; }

function popupOrder(p: any, wh: any, fields: OrderFieldKey[]) {
  // 单笔订单：优先取 p.order（左侧明细点击时携带完整订单），否则从聚合属性拼装
  const order = p.order as Order | undefined;
  const isSingle = !!order || !!p.orderNo;
  const fieldsHtml = isSingle && order
    ? (fields.length ? fields : DEFAULT_ORDER_FIELDS).map((k) => {
        const def = FIELD_MAP[k];
        if (!def) return "";
        const val = formatOrderField(order, k);
        return `<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:var(--text-3)">${def.label}</span><b style="color:${def.accent ? "var(--brand)" : "var(--text)"};text-align:right;word-break:break-all">${val}</b></div>`;
      }).join("")
    : "";
  return `<div style="width:${isSingle ? 300 : 280}px;font-family:inherit">
    <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px;font-weight:700">${isSingle ? `订单 ${order?.orderNo || p.orderNo}` : `${p.label} 汇总`}</div>
    <div style="padding:10px 12px;font-size:11.5px;line-height:1.9;color:var(--text-2)">
      ${isSingle
        ? (fieldsHtml || `<div style="color:var(--text-3)">未选择显示字段，请点顶部「字段」按钮勾选</div>`)
        : `<div style="display:flex;justify-content:space-between"><span>订单量</span><b style="color:var(--text)">${p.count} 单</b></div>
           <div style="display:flex;justify-content:space-between"><span>销售额</span><b style="color:var(--brand)">$${Number(p.sales || 0).toLocaleString()}</b></div>`}
    </div>
    <div style="padding:8px 12px;background:rgba(51,102,255,.08);font-size:11px">${wh ? `最近仓：${wh.name}` : "暂无海外仓数据，可在数据中心录入"}</div>
  </div>`;
}
function popupWh(p: any) {
  const c = HEALTH_COLOR[p.health as keyof typeof HEALTH_COLOR];
  return `<div style="width:250px;font-family:inherit">
    <div style="padding:10px 12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${c}"></span><span style="font-size:13px;font-weight:700">${p.name}</span></div>
    <div style="padding:10px 12px;font-size:11.5px;line-height:1.9;color:var(--text-2)">
      <div style="display:flex;justify-content:space-between"><span>仓库编码</span><b style="color:var(--text)">${p.code}</b></div>
      <div style="display:flex;justify-content:space-between"><span>库容利用率</span><b style="color:${c}">${p.utilization}%</b></div>
      <div style="display:flex;justify-content:space-between"><span>SKU 数</span><b style="color:var(--text)">${p.skuCount}</b></div>
    </div>
  </div>`;
}
function popupPort(p: any) {
  return `<div style="width:220px;font-family:inherit">
    <div style="padding:10px 12px;border-bottom:1px solid var(--border);font-size:13px;font-weight:700">${p.name}</div>
    <div style="padding:10px 12px;font-size:11.5px;line-height:1.9;color:var(--text-2)">
      <div style="display:flex;justify-content:space-between"><span>英文</span><b style="color:var(--text)">${p.en}</b></div>
      <div style="display:flex;justify-content:space-between"><span>国家</span><b style="color:var(--text)">${p.country}</b></div>
      <div style="display:flex;justify-content:space-between"><span>类型</span><b style="color:var(--brand)">${p.type === "origin" ? "头程起运港" : "目的港"}</b></div>
    </div>
  </div>`;
}
