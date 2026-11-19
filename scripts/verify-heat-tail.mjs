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

const state = () => page.evaluate(() => {
  const el = document.querySelector(".maplibregl-map");
  return {
    topN: el?.dataset?.heatTopN || "", ranks: el?.dataset?.heatRanks || "",
    expr: el?.dataset?.heatFillExpr || "", tail: el?.dataset?.heatTailFill || "",
    palette: el?.dataset?.heatPalette || "", level: el?.dataset?.heatLevel || "",
  };
});
const clickRank = (label) => page.evaluate((l) => {
  const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes(l) && ((x.textContent || "").includes("单") || (x.textContent || "").includes("kg")));
  if (b) { b.click(); return true; } return false;
}, label);

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  // 美国 12 个州，各有不同订单数，便于排名
  const orders = [];
  let id = 0;
  const states = ["California", "Texas", "Florida", "New York", "Georgia", "North Carolina", "Arizona", "Maryland", "Tennessee", "Pennsylvania", "Ohio", "Michigan"];
  states.forEach((st, i) => {
    const n = 120 - i * 8;
    for (let k = 0; k < n; k++) orders.push({ id: "o" + id, orderNo: "ORD" + id, platform: "Amazon", skuId: "s1", qty: 1, amount: 50, weight: 1, status: "已签收", city: st + " City", state: st, country: "美国", countryCode: "US", lng: -95 + (i % 5) * 3, lat: 35 + (i % 4) * 3, date: "2026-11-10", warehouseId: "", returnRisk: 0.1 });
    id++;
  });
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_data_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2200);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图"))?.click());
  await sleep(3200);
  await page.waitForFunction(() => document.querySelector(".maplibregl-map")?.dataset?.heatTopN !== undefined, { timeout: 12000 }).catch(() => {});

  // 默认前3
  let s = await state();
  check("默认前3名", s.topN === "3", `topN=${s.topN}`);

  // 打开热度面板，切到前10
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.title || "") === "Top 热度标注")?.click());
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "前 10 名")?.click());
  await sleep(500);

  // 下钻到美国州层
  await clickRank("美国");
  await sleep(2500);
  s = await state();
  check("前10名配置生效", s.topN === "10", `topN=${s.topN}`);
  check("州层有10个排名", s.ranks.split("|").length === 10, `ranks=${s.ranks}`);
  check("6-10名都有排名(第10名存在)", s.ranks.includes(":10"), `ranks=${s.ranks}`);

  // 表达式含 >= 6 分支与 tail 色
  check("着色表达式含 >=6 分支", s.expr.includes(">=") && /,\s*6\]/.test(s.expr), s.expr.slice(0, 160));
  check("着色表达式含 tail 统一色", s.expr.includes(s.tail), `tail=${s.tail}`);
  check("tail 色为浅蓝(alpha .42)", s.tail.includes("191,219,254"), s.tail);
  // 前5名色各不相同（表达式里 5 个不同 rgba）
  const fillColors = [...new Set((s.expr.match(/rgba\([^)]+\)/g) || []))];
  check("表达式含多档深浅色+tail色", fillColors.length >= 6, `distinct=${fillColors.length}`);

  // 换色系到红，tail 变红
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.title === "红")?.click());
  await sleep(500);
  s = await state();
  check("换红色系后 tail 变浅红", s.palette === "red" && s.tail.includes("254,202,202"), `tail=${s.tail}`);

  // 图例显示 6+
  const body = await page.evaluate(() => document.body.textContent || "");
  check("图例显示 6+ 色块", body.includes("6+"));

  check("全程无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
}
