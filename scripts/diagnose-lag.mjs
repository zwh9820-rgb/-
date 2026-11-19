import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const proc = spawn(ELECTRON, ["--remote-debugging-port=9262", "--no-sandbox"], { env, stdio: "ignore" });
let b;
try {
  for (let i = 0; i < 40; i++) { await sleep(500); try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9262", defaultViewport: null }); break; } catch {} }
  if (!b) throw new Error("CDP fail");
  await sleep(4000);
  const page = (await b.pages()).find((p) => p.url().includes("127.0.0.1")) || (await b.pages())[0];
  await page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    const orders = [];
    for (let i = 0; i < 851; i++) orders.push({ id: `ORDER_MARK_${i}`, orderNo: `WO${i}`, platform: "Amazon", skuId: `SKU_${i}`, qty: 1, amount: 10, status: "已发货", lng: -118, lat: 34, country: "美国", date: "2026-11-01" });
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(orders));
    localStorage.setItem("cbh_data_warehouses_v1", JSON.stringify([
      { id: "WH_MARK_0", name: "仓库甲", code: "WH-A", country: "美国", countryCode: "US", state: "CA", city: "LA", lng: -118, lat: 34, capacity: 100, used: 10, health: "healthy", skuCount: 1, dailyOutbound: 1 },
    ]));
  });
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("数据中心"))?.click());
  await sleep(1500);

  const read = async (tag, waitMs) => {
    if (waitMs) await sleep(waitMs);
    const s = await page.evaluate(() => {
      const active = [...document.querySelectorAll("button.card")].find((c) => (c.className || "").includes("ring-2"))?.textContent?.replace(/\s+/g, " ").trim();
      const headers = [...document.querySelectorAll("thead th")].map((th) => th.textContent.trim());
      const rows = [...document.querySelectorAll("tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim());
      const first = rows[0] || "";
      const dataKind = first.includes("ORDER_MARK") ? "订单" : first.includes("WH_MARK") ? "仓库" : first ? "?" : "空";
      const headKind = headers.some((h) => h.includes("订单")) ? "订单表头" : headers.some((h) => h.includes("仓库")) ? "仓库表头" : headers.join(",");
      return { active, headKind, n: rows.length, dataKind, headers: headers.slice(0,7).join("|") };
    });
    console.log(`${tag}: 卡片=[${s.active}] 表头=${s.headKind} 数据=${s.dataKind} 行数=${s.n}`);
    console.log(`   表头列=${s.headers}`);
  };
  const click = async (lb) => { await page.evaluate((l) => { const c = [...document.querySelectorAll("button.card")].find((b) => (b.textContent || "").includes(l)); if (c) c.click(); }, lb); };

  await click("订单"); await sleep(2000); await read("1.点订单+2s", 0);
  await click("海外仓"); await read("2.点海外仓+0s", 0);
  await read("2b.+3s", 3000);
  await click("订单"); await read("3.点订单+0s", 0);
  await read("3b.+3s", 3000);
  await click("海外仓"); await read("4.点海外仓+0s", 0);
  await read("4b.+3s", 3000);
  await page.evaluate(() => window.close()); await sleep(800);
} catch (e) { console.log("EXC", String(e).slice(0, 300)); }
finally { try { await b?.disconnect(); } catch {}; try { proc.kill("SIGKILL"); } catch {} }
