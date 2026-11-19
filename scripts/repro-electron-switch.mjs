// 在真实 Electron 环境复现 tab 切换（用注入的标记数据，连接真实应用 userData）
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const proc = spawn(ELECTRON, ["--remote-debugging-port=9260", "--no-sandbox"], { env, stdio: "ignore" });
let b;
try {
  for (let i = 0; i < 40; i++) { await sleep(500); try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9260", defaultViewport: null }); break; } catch {} }
  if (!b) throw new Error("CDP fail");
  await sleep(4000);
  const page = (await b.pages()).find((p) => p.url().includes("127.0.0.1")) || (await b.pages())[0];
  // 注入标记数据（在应用 origin 下）
  await page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    const orders = [];
    for (let i = 0; i < 851; i++) orders.push({ id: `ORDER_MARK_${i}`, orderNo: `WO${i}`, platform: "Amazon", skuId: `SKU_${i}`, qty: 1, amount: 10, status: "已发货", lng: -118, lat: 34, country: "美国", date: "2026-11-01" });
    const warehouses = [
      { id: "WH_MARK_0", name: "仓库甲", code: "WH-A", country: "美国", countryCode: "US", state: "CA", city: "LA", lng: -118, lat: 34, capacity: 100, used: 10, health: "healthy", skuCount: 1, dailyOutbound: 1 },
      { id: "WH_MARK_1", name: "仓库乙", code: "WH-B", country: "德国", countryCode: "DE", state: "", city: "Berlin", lng: 13, lat: 52, capacity: 200, used: 20, health: "healthy", skuCount: 2, dailyOutbound: 2 },
    ];
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(orders));
    localStorage.setItem("cbh_data_warehouses_v1", JSON.stringify(warehouses));
  });
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("数据中心"))?.click());
  await sleep(1500);
  const read = async (tag) => {
    const s = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim());
      const first = rows[0] || "";
      const kind = first.includes("ORDER_MARK") ? "订单" : first.includes("WH_MARK") ? "仓库" : first ? "其他" : "空";
      const cards = [...document.querySelectorAll("button.card")];
      const active = cards.find((c) => (c.className || "").includes("ring-2"))?.textContent?.replace(/\s+/g, " ").trim();
      return { n: rows.length, kind, first: first.slice(0, 40), active };
    });
    console.log(`${tag}: 行数=${s.n} 类型=${s.kind} 卡片=[${s.active}] 首行=${s.first}`);
  };
  const click = async (lb) => { await page.evaluate((l) => { const c = [...document.querySelectorAll("button.card")].find((b) => (b.textContent || "").includes(l)); if (c) c.click(); }, lb); };
  await click("订单"); await sleep(1500); await read("点订单");
  await click("海外仓");
  await read("立刻点海外仓");
  await sleep(1000); await read("1s后海外仓");
  await click("订单"); await sleep(1500); await read("再点订单");
  await click("海外仓"); await sleep(1500); await read("再点海外仓");
  await page.evaluate(() => window.close()); await sleep(1000);
} catch (e) { console.log("EXC", String(e).slice(0, 300)); }
finally { try { await b?.disconnect(); } catch {}; try { proc.kill("SIGKILL"); } catch {} }
