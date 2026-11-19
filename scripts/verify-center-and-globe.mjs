import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(3000, "127.0.0.1", r));

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

const parseCenter = (s) => { const [lng, lat] = String(s || "").split(",").map(Number); return { lng, lat }; };
const getCenter = () => page.evaluate(() => document.querySelector(".maplibregl-map")?.dataset?.mapCenter || "");
const clickRank = (label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(l) && ((x.textContent || "").includes("单") || (x.textContent || "").includes("kg")));
  if (b) { b.click(); return true; } return false;
}, label);

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1200);
  // v0.1.7 起默认页改为轻量驾驶舱，需主动进入 3D 地球
  await page.evaluate(() => [...document.querySelectorAll("nav button, button")].find((b) => (b.textContent || "").trim().includes("3D 地球"))?.click());
  await sleep(2500);

  // ===== 球体旋转控制验证 =====
  const globeRoot = () => page.evaluate(() => document.querySelector("[data-auto-rotate]")?.getAttribute("data-auto-rotate"));
  check("球体默认自动旋转", (await globeRoot()) === "1");
  const body1 = await page.evaluate(() => document.body.textContent || "");
  check("球体有暂停旋转按钮", body1.includes("暂停旋转"));
  // 点暂停
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("暂停旋转"))?.click());
  await sleep(400);
  check("点击后变为暂停态", (await globeRoot()) === "0");
  const body2 = await page.evaluate(() => document.body.textContent || "");
  check("暂停后显示恢复按钮与提示", body2.includes("自动旋转") && body2.includes("已暂停"));
  // 点恢复
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("自动旋转") && !(b.textContent || "").includes("暂停"))?.click());
  await sleep(400);
  check("点击后恢复自动旋转", (await globeRoot()) === "1");
  // 重置视角按钮存在
  check("有重置视角按钮", (await page.evaluate(() => document.body.textContent || "")).includes("重置视角"));

  // ===== 地图定位验证 =====
  const orders = [];
  let id = 0;
  const mk = (cc, co, st, ci, lng, lat, n) => {
    for (let i = 0; i < n; i++) orders.push({ id: "o" + id, orderNo: "ORD" + id, platform: "Amazon", skuId: "s1", qty: 1, amount: 60, weight: 1, status: "已签收", city: ci, state: st, country: co, countryCode: cc, lng: lng + i * 0.02, lat: lat + i * 0.01, date: "2026-11-10", warehouseId: "", returnRisk: 0.1 });
    id++;
  };
  // 美国订单集中在加州/德州/纽约（北美经度 -125~-70）
  mk("US", "美国", "California", "Los Angeles", -118, 34, 20);
  mk("US", "美国", "Texas", "Houston", -95, 30, 15);
  mk("US", "美国", "NY", "New York", -74, 40, 10);
  mk("DE", "德国", "", "Berlin", 13, 52, 8);
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图"))?.click());
  await sleep(3500);

  // 点美国 → 中心应落在北美（经度 -130~-60），而非法国（~0.8）
  await clickRank("美国");
  await sleep(4000);
  let c = parseCenter(await getCenter());
  check("点美国后地图中心落在北美(非欧洲反面)", c.lng < -60 && c.lng > -130 && c.lat > 25 && c.lat < 50, `center=${c.lng},${c.lat}`);

  // 点 California 州 → 中心应落在加州附近
  await clickRank("California");
  await sleep(4000);
  c = parseCenter(await getCenter());
  check("点 California 后中心落在加州附近", c.lng < -110 && c.lng > -125 && c.lat > 30 && c.lat < 40, `center=${c.lng},${c.lat}`);

  // 返回上一级 → 中心回到美国范围
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("返回上一级"))?.click());
  await sleep(4000);
  c = parseCenter(await getCenter());
  check("返回上级后中心仍在北美", c.lng < -60 && c.lng > -130, `center=${c.lng},${c.lat}`);

  // 回世界 → 中心接近 [10,22]
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.title === "重置视图")?.click());
  await sleep(3500);
  c = parseCenter(await getCenter());
  check("重置后回到世界视角中心", Math.abs(c.lng - 10) < 15 && Math.abs(c.lat - 22) < 15, `center=${c.lng},${c.lat}`);

  check("全程无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
}
