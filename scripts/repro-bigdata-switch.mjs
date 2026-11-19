// 复现：大数据量下（订单 851 条）点击订单后再点其他标签，表格是否停留在订单数据
import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve("out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => { if (err) { res.writeHead(404); return res.end("404"); } res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" }); res.end(data); });
});
await new Promise((r) => server.listen(3015, "127.0.0.1", r));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
try {
  await page.goto("http://127.0.0.1:3015/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  // 注入大数据量：订单 851、仓库 3、SKU 202
  await page.evaluate(() => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_")).forEach((k) => localStorage.removeItem(k));
    const orders = [];
    for (let i = 0; i < 851; i++) orders.push({
      id: `ORDER_MARK_${i}`, orderNo: `WO12${String(i).padStart(6, "0")}`, platform: ["Amazon", "eBay", "TikTok Shop"][i % 3],
      skuId: `SKU_MARK_${i % 202}`, qty: (i % 5) + 1, amount: i * 1.5, weight: i % 20, status: "已发货",
      city: "LA", state: "California", country: "美国", countryCode: "US", zip: "90001", lng: -118, lat: 34, date: "2026-11-01",
    });
    const warehouses = [];
    for (let i = 0; i < 3; i++) warehouses.push({
      id: `WH_MARK_${i}`, name: `仓库${i}`, code: `WHCODE-${i}`, country: "美国", countryCode: "US", state: "CA", city: "LA",
      lng: -118, lat: 34, capacity: 1000, used: 100, health: "healthy", skuCount: 10, dailyOutbound: 5,
    });
    const skus = [];
    for (let i = 0; i < 202; i++) skus.push({ id: `SKU_MARK_${i}`, sku: `SKU_MARK_${i}`, name: `商品${i}`, category: "3C", price: 10, cost: 5, weight: 1, image: "📦" });
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(orders));
    localStorage.setItem("cbh_data_warehouses_v1", JSON.stringify(warehouses));
    localStorage.setItem("cbh_data_skus_v1", JSON.stringify(skus));
  });
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("数据中心"))?.click());
  await sleep(1800);

  const read = async (tag) => {
    const s = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("button.card")];
      const activeCard = cards.find((c) => (c.className || "").includes("ring-2"))?.textContent?.replace(/\s+/g, " ").trim();
      const rows = [...document.querySelectorAll("tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim());
      const first = rows[0] || "";
      const kind = first.includes("ORDER_MARK") ? "订单" : first.includes("WH_MARK") ? "仓库" : first.includes("SKU_MARK") ? "SKU" : first ? "其他:" + first.slice(0, 30) : "空";
      return { activeCard, n: rows.length, kind, first: first.slice(0, 60) };
    });
    console.log(`${tag}: 选中卡片=[${s.activeCard}] 表格行数=${s.n} 数据类别=${s.kind}`);
    console.log(`   首行=${s.first}`);
    return s;
  };
  const click = async (label) => {
    await page.evaluate((lb) => {
      const c = [...document.querySelectorAll("button.card")].find((b) => (b.textContent || "").includes(lb));
      if (c) c.click();
    }, label);
  };

  console.log("=== 复现用户操作序列 ===");
  await click("订单"); await sleep(1200); await read("1. 点订单(等1.2s)");
  await click("海外仓");
  await read("2. 立刻点海外仓(0ms)");
  await sleep(300); await read("2b. 300ms后");
  await sleep(1200); await read("2c. 1.5s后");
  await click("SKU"); await sleep(100); await read("3. 点SKU(100ms)");
  await sleep(1500); await read("3b. 1.6s后");
  await click("订单"); await sleep(100); await read("4. 点订单(100ms)");
  await sleep(1500); await read("4b. 1.6s后");

  // 模拟"切到其他界面再返回"
  console.log("\n=== 模拟切走再返回 ===");
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("驾驶舱"))?.click());
  await sleep(1000);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("数据中心"))?.click());
  await sleep(1500);
  await read("5. 返回数据中心后");

  // 反复快速点击压测
  console.log("\n=== 快速连续切换压测 ===");
  for (let i = 0; i < 5; i++) {
    await click("订单"); await sleep(120);
    await click("海外仓"); await sleep(120);
    await click("SKU"); await sleep(120);
  }
  await sleep(1500);
  await read("6. 压测后当前状态");
} catch (e) { console.log("EXC", String(e).slice(0, 400)); }
finally { await browser.close(); server.close(); }
