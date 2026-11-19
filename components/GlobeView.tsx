"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PORTS_DISPLAY, computeStats } from "@/lib/mock-data";
import { useStore } from "@/lib/store";
import { ArrowRight, Globe2, Package, Ship, Warehouse, Activity, Layers3, MousePointer2, Database as DatabaseIcon, Pause, Play, RotateCcw } from "lucide-react";

type HoverInfo = { name: string; sub: string; color: string; x: number; y: number } | null;

// 经纬度 → 球面三维坐标
function latLngToVec3(lat: number, lng: number, r: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// 生成地球纹理（程序化，无需外部贴图）
function makeEarthTexture(dark: boolean) {
  const w = 2048, h = 1024;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = dark ? "#0e1a2e" : "#12325c";
  ctx.fillRect(0, 0, w, h);

  // 简化的大陆轮廓（经纬度多边形）
  const land: [number, number][][] = [
    [[-168,65],[-155,71],[-130,70],[-110,68],[-95,68],[-80,70],[-60,60],[-55,48],[-65,45],[-70,42],[-76,35],[-81,25],[-97,26],[-105,20],[-115,30],[-125,40],[-130,50],[-145,58],[-168,65]],
    [[-50,60],[-30,68],[-20,76],[-35,83],[-55,82],[-62,75],[-55,66],[-50,60]],
    [[-80,10],[-68,12],[-58,8],[-48,2],[-35,-6],[-38,-16],[-45,-24],[-52,-34],[-58,-40],[-66,-54],[-73,-50],[-75,-38],[-72,-18],[-79,-4],[-80,10]],
    [[-10,36],[0,44],[12,45],[22,40],[30,41],[36,36],[45,40],[52,46],[62,50],[72,55],[82,60],[92,66],[105,70],[125,72],[145,70],[162,66],[172,60],[160,54],[145,48],[142,40],[130,36],[122,30],[112,20],[104,8],[100,2],[95,10],[88,21],[80,8],[72,20],[64,25],[56,26],[46,13],[42,13],[36,30],[28,36],[18,40],[8,44],[-2,43],[-10,36]],
    [[-17,15],[-5,20],[10,25],[24,32],[34,31],[43,12],[50,11],[42,-2],[40,-15],[32,-25],[25,-34],[18,-34],[12,-18],[8,-5],[0,5],[-10,5],[-17,15]],
    [[113,-22],[122,-18],[132,-12],[142,-11],[153,-25],[150,-35],[140,-38],[130,-32],[115,-34],[113,-22]],
    [[130,31],[136,34],[141,38],[143,43],[145,44],[141,40],[137,35],[133,33],[130,31]],
    [[-6,50],[1,51],[1,55],[-3,58],[-6,57],[-6,50]],
    [[47,-13],[50,-16],[49,-25],[45,-25],[44,-18],[47,-13]],
  ];
  const project = (lng: number, lat: number): [number, number] => [((lng + 180) / 360) * w, ((90 - lat) / 180) * h];
  ctx.fillStyle = dark ? "#1c4a7a" : "#2a6bb0";
  ctx.strokeStyle = dark ? "#3a7ac0" : "#6aa8e8";
  ctx.lineWidth = 2;
  land.forEach((poly) => {
    ctx.beginPath();
    poly.forEach(([lng, lat], i) => {
      const [x, y] = project(lng, lat);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  });
  // 经纬网格
  ctx.strokeStyle = dark ? "rgba(90,150,220,.12)" : "rgba(220,235,255,.16)";
  ctx.lineWidth = 1;
  for (let lng = -180; lng <= 180; lng += 15) {
    const x = ((lng + 180) / 360) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 15) {
    const y = ((90 - lat) / 180) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function GlobeView({ onEnterMap, onGoData }: { onEnterMap: () => void; onGoData?: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo>(null);
  const [dark, setDark] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);
  const resetSpinRef = useRef<(() => void) | null>(null);
  autoRotateRef.current = autoRotate;
  const store = useStore();
  const WAREHOUSES = store.warehouses;
  const ORDERS = store.orders;
  const CONTAINERS = store.containers;
  const STATS = computeStats({ orders: ORDERS, warehouses: WAREHOUSES, containers: CONTAINERS, alerts: store.alerts });

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const el = mountRef.current;
    const W = el.clientWidth, H = el.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 1000);
    camera.position.set(0, 0.4, 5.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);

    // 地球
    const globe = new THREE.Group();
    scene.add(globe);
    const R = 1.6;
    const earthMat = new THREE.MeshPhongMaterial({
      color: dark ? "#1a3a5c" : "#dbe7f5",
      shininess: 6,
      specular: new THREE.Color(dark ? "#1b3a5c" : "#2a4a6a"),
    });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 48), earthMat);
    globe.add(earth);
    // 真实地球纹理（本地资源，离线可用；失败时回退到程序化贴图）
    const texUrl = dark ? "/textures/earth-blue-marble.jpg" : "/textures/earth-day.jpg";
    new THREE.TextureLoader().load(
      texUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        earthMat.map = tex;
        earthMat.color.set(dark ? "#9fb4c8" : "#ffffff");
        earthMat.needsUpdate = true;
      },
      undefined,
      () => {
        earthMat.map = makeEarthTexture(dark);
        earthMat.color.set("#ffffff");
        earthMat.needsUpdate = true;
      }
    );

    // 大气辉光
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.055, 48, 36),
      new THREE.MeshBasicMaterial({ color: dark ? "#3b82f6" : "#5b9dff", transparent: true, opacity: 0.08, side: THREE.BackSide })
    );
    globe.add(glow);

    // 光照
    scene.add(new THREE.AmbientLight(0xffffff, dark ? 0.75 : 1.0));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 2, 4);
    scene.add(dir);

    const colorOf = (h: string) => h === "healthy" ? "#22c55e" : h === "warning" ? "#f59e0b" : "#ef4444";

    // 海外仓点位 + 光环
    const markers: { mesh: THREE.Mesh; wh: typeof WAREHOUSES[number] }[] = [];
    const rings: THREE.Mesh[] = [];
    WAREHOUSES.forEach((wh) => {
      const pos = latLngToVec3(wh.lat, wh.lng, R + 0.012);
      const color = colorOf(wh.health);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 16, 16),
        new THREE.MeshBasicMaterial({ color })
      );
      dot.position.copy(pos);
      dot.userData = { name: wh.name, sub: `${wh.code} · 利用率 ${Math.round((wh.used / wh.capacity) * 100)}%`, color };
      globe.add(dot);
      markers.push({ mesh: dot, wh });

      // 脉冲环
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.035, 0.05, 24),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
      );
      ring.position.copy(pos);
      ring.lookAt(pos.clone().multiplyScalar(2));
      ring.userData.phase = Math.random() * Math.PI * 2;
      globe.add(ring);
      rings.push(ring);
    });

    // 国内港口点位（青色）
    PORTS_DISPLAY.forEach((p) => {
      const pos = latLngToVec3(p.lat, p.lng, R + 0.012);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 12), new THREE.MeshBasicMaterial({ color: "#22d3ee" }));
      dot.position.copy(pos);
      dot.userData = { name: `${p.name}港`, sub: "头程出发港口", color: "#22d3ee" };
      globe.add(dot);
    });

    // 订单热力点（聚合近似：按城市抽样）
    const heatGeo = new THREE.BufferGeometry();
    const heatPos: number[] = [];
    const seen = new Set<string>();
    ORDERS.forEach((o) => {
      const lng = Number(o.lng), lat = Number(o.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return; // 跳过无有效坐标的订单
      const key = `${lng.toFixed(1)}_${lat.toFixed(1)}`;
      if (seen.has(key)) return;
      seen.add(key);
      const v = latLngToVec3(lat, lng, R + 0.008);
      heatPos.push(v.x, v.y, v.z);
    });
    heatGeo.setAttribute("position", new THREE.Float32BufferAttribute(heatPos, 3));
    const heat = new THREE.Points(heatGeo, new THREE.PointsMaterial({ color: "#fb923c", size: 0.022, transparent: true, opacity: 0.75, sizeAttenuation: true }));
    globe.add(heat);

    // 海运航线弧线 + 流动点
    const arcs: { line: THREE.Line; dot: THREE.Mesh; curve: THREE.QuadraticBezierCurve3 }[] = [];
    CONTAINERS.slice(0, 8).forEach((c) => {
      const start = latLngToVec3(c.originLat, c.originLng, R + 0.01);
      const end = latLngToVec3(c.destLat, c.destLng, R + 0.01);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(R + 0.45);
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const pts = curve.getPoints(60);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: c.status === "延误" ? "#ef4444" : "#38bdf8", transparent: true, opacity: 0.5 });
      const line = new THREE.Line(geo, mat);
      globe.add(line);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 10), new THREE.MeshBasicMaterial({ color: c.status === "延误" ? "#ef4444" : "#7dd3fc" }));
      globe.add(dot);
      arcs.push({ line, dot, curve });
    });

    // 星空背景
    const starGeo = new THREE.BufferGeometry();
    const starPos: number[] = [];
    for (let i = 0; i < 600; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 12);
      starPos.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: "#9db4d0", size: 0.03, transparent: true, opacity: 0.45 })));

    // 交互
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 0.04;
    const mouse = new THREE.Vector2();
    let dragging = false, moved = false, lastX = 0, lastY = 0;
    let targetRotY = 0.35, targetRotX = 0.05, rotY = 0.35, rotX = 0.05;
    const autoSpin = () => { targetRotY += 0.0009; };

    const onDown = (e: PointerEvent) => { dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY; };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        targetRotY += dx * 0.005; targetRotX = Math.max(-0.8, Math.min(0.8, targetRotX + dy * 0.005));
        lastX = e.clientX; lastY = e.clientY;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(markers.map((m) => m.mesh));
      if (hits.length) {
        const d = hits[0].object.userData;
        setHover({ name: d.name, sub: d.sub, color: d.color, x: e.clientX - rect.left, y: e.clientY - rect.top });
        renderer.domElement.style.cursor = "pointer";
      } else { setHover(null); renderer.domElement.style.cursor = "grab"; }
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (!moved) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.intersectObjects(markers.map((m) => m.mesh)).length) onEnterMap();
      }
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); camera.position.z = Math.max(3.4, Math.min(7, camera.position.z + e.deltaY * 0.002)); };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // 暴露复位视角：回到初始朝向（配合"重置视角"按钮）
    resetSpinRef.current = () => {
      targetRotY = 0.35; targetRotX = 0.05;
    };
    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      if (autoRotateRef.current && !dragging) autoSpin();
      rotY += (targetRotY - rotY) * 0.06;
      rotX += (targetRotX - rotX) * 0.06;
      globe.rotation.y = rotY;
      globe.rotation.x = rotX;
      rings.forEach((r: any) => {
        const s = 1 + ((t * 0.7 + r.userData.phase) % 1.6);
        r.scale.setScalar(s);
        (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (1 - (s - 1) / 0.9));
      });
      arcs.forEach((a, i) => {
        const p = (t * 0.14 + i * 0.13) % 1;
        a.dot.position.copy(a.curve.getPoint(p));
      });
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      el.removeChild(renderer.domElement);
      renderer.dispose();
      resetSpinRef.current = null;
    };
  }, [dark, onEnterMap, WAREHOUSES, ORDERS, CONTAINERS]);

  return (
    <div className="relative w-full h-full overflow-hidden" data-auto-rotate={autoRotate ? "1" : "0"} style={{ background: dark ? "radial-gradient(ellipse at 50% 40%, #101c30 0%, #080d16 70%)" : "radial-gradient(ellipse at 50% 40%, #eaf1ff 0%, #f7f9fc 70%)" }}>
      <div ref={mountRef} className="absolute inset-0" />

      {/* 顶部 KPI 条 */}
      <div className="absolute top-5 left-5 right-5 flex gap-3 flex-wrap pointer-events-none">
        <Kpi icon={<ShoppingBagIcon />} label="累计订单" value={STATS.totalOrders.toLocaleString()} unit="单" dark={dark} />
        <Kpi icon={<Warehouse size={15} />} label="海外仓" value={String(STATS.warehouseCount)} unit="个" dark={dark} />
        <Kpi icon={<Ship size={15} />} label="在途柜" value={String(STATS.activeContainers)} unit="柜" dark={dark} />
        <Kpi icon={<Activity size={15} />} label="未读预警" value={String(STATS.unreadAlerts)} unit="条" dark={dark} warn />
      </div>

      {/* 左侧说明卡 */}
      <div className="absolute left-5 top-[104px] w-[228px] rounded-xl p-4 pointer-events-none hidden lg:block" style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(8px)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Globe2 size={16} style={{ color: "var(--brand)" }} />
          <span className="text-[13px] font-semibold">全球仓网态势</span>
        </div>
        <div className="space-y-2.5 text-[11.5px]">
          <LegendRow color="#22c55e" label="库存充足" value={`${WAREHOUSES.filter(w=>w.health==="healthy").length} 个仓`} />
          <LegendRow color="#f59e0b" label="库存预警" value={`${WAREHOUSES.filter(w=>w.health==="warning").length} 个仓`} />
          <LegendRow color="#ef4444" label="断货风险" value={`${WAREHOUSES.filter(w=>w.health==="critical").length} 个仓`} />
          <div className="h-px my-2" style={{ background: "var(--border)" }} />
          <LegendRow color="#38bdf8" label="海运航线" value={`${CONTAINERS.length} 条在途`} />
          <LegendRow color="#fb923c" label="订单热力" value="聚合点位" />
        </div>
        <div className="mt-3 pt-3 border-t text-[10.5px] leading-relaxed" style={{ borderColor: "var(--border)", color: "var(--text-3)" }}>
          3D 视图仅用于态势展示，所有成本 / 距离计算均基于 2D 地理数据。
        </div>
      </div>

      {/* 悬浮提示 */}
      {hover && (
        <div className="absolute z-20 pointer-events-none rounded-lg px-3 py-2 text-[12px] shadow-lg" style={{ left: hover.x + 14, top: hover.y + 14, background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-1.5 font-semibold"><span className="w-2 h-2 rounded-full" style={{ background: hover.color }} />{hover.name}</div>
          <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-3)" }}>{hover.sub}</div>
        </div>
      )}

      {/* 自转控制条 */}
      <div className="absolute bottom-[68px] left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-2 py-1.5 rounded-full shadow-lg" style={{ background: "color-mix(in srgb, var(--surface) 94%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(8px)" }}>
        <button onClick={() => setAutoRotate((v) => !v)} title={autoRotate ? "暂停自动旋转" : "恢复自动旋转"}
          className="h-8 px-3 rounded-full text-[11.5px] font-medium flex items-center gap-1.5 text-white transition-transform hover:scale-[1.04]"
          style={{ background: autoRotate ? "var(--brand)" : "#64748b" }}>
          {autoRotate ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          {autoRotate ? "暂停旋转" : "自动旋转"}
        </button>
        <button onClick={() => resetSpinRef.current?.()} title="重置视角到初始朝向"
          className="h-8 px-2.5 rounded-full text-[11.5px] font-medium flex items-center gap-1 transition-transform hover:scale-[1.04]"
          style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
          <RotateCcw size={13} /> 重置视角
        </button>
        <span className="text-[10.5px] px-1.5" style={{ color: "var(--text-3)" }}>{autoRotate ? "自动转动中" : "已暂停 · 可自由拖动"}</span>
      </div>

      {/* 操作提示 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-full" style={{ background: "color-mix(in srgb, var(--surface) 85%, transparent)", border: "1px solid var(--border)", color: "var(--text-3)", backdropFilter: "blur(6px)" }}>
        <MousePointer2 size={12} /> 拖拽旋转地球 · 滚轮缩放 · 点击仓库进入 2D 下钻
      </div>

      {/* 无数据引导 */}
      {(WAREHOUSES.length + ORDERS.length + CONTAINERS.length) === 0 && onGoData && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] max-w-[86vw] rounded-2xl p-6 text-center shadow-2xl" style={{ background: "color-mix(in srgb, var(--surface) 94%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(10px)" }}>
          <div className="text-[38px] mb-2">🌐</div>
          <div className="text-[15px] font-bold mb-2">地球已就绪，等待你的数据</div>
          <p className="text-[11.5px] leading-relaxed mb-4" style={{ color: "var(--text-3)" }}>程序未预置任何虚拟数据。请在「数据中心」录入或导入真实仓库、订单、海运数据，点位与航线将自动呈现在地球上。</p>
          <button onClick={onGoData} className="btn btn-primary"><DatabaseIcon size={14} /> 前往数据中心录入</button>
        </div>
      )}

      {/* 进入 2D 按钮 */}
      <button onClick={onEnterMap} className="absolute bottom-6 right-6 h-10 px-4 rounded-xl text-[13px] font-semibold text-white flex items-center gap-2 shadow-lg transition-transform hover:scale-[1.03]" style={{ background: "linear-gradient(135deg,#3b6dff,#7a4dff)" }}>
        <Layers3 size={16} /> 进入 2D 业务下钻 <ArrowRight size={15} />
      </button>
    </div>
  );
}

function ShoppingBagIcon() { return <Package size={15} />; }

function Kpi({ icon, label, value, unit, dark, warn }: { icon: React.ReactNode; label: string; value: string; unit: string; dark: boolean; warn?: boolean }) {
  return (
    <div className="rounded-xl px-3.5 py-2.5 min-w-[128px]" style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)", border: "1px solid var(--border)", backdropFilter: "blur(8px)" }}>
      <div className="flex items-center gap-1.5 text-[10.5px]" style={{ color: "var(--text-3)" }}>{icon}{label}</div>
      <div className="mt-1 flex items-baseline gap-1"><span className="text-[20px] font-bold leading-none" style={{ color: warn ? "var(--red)" : "var(--text)" }}>{value}</span><span className="text-[10.5px]" style={{ color: "var(--text-3)" }}>{unit}</span></div>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      <span style={{ color: "var(--text-2)" }}>{label}</span>
      <span className="ml-auto font-semibold" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}
