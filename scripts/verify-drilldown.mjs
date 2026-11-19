import puppeteer from "puppeteer-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(3000, "127.0.0.1", r));

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const errors = [];
const check = (n, ok, detail) => { console.log(`${ok ? "✓" : "✗"} ${n}${detail ? " — " + detail : ""}`); ok ? pass++ : fail++; };
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 200)); });
const body = () => page.evaluate(() => document.body.textContent || "");

// 点击左侧第一个排行榜项（跳过面包屑/工具栏按钮）
const clickRank = (label) => page.evaluate((lb) => {
  const all = [...document.querySelectorAll("button")];
  const hit = all.find((b) => {
    const t = (b.textContent || "").trim();
    return t.includes(lb) && (t.includes("单") || t.includes("kg"));
  });
  if (hit) { hit.click(); return true; }
  return false;
}, label);

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  // 注入：美国有州(用缩写 CA/NY 测试归一化)、德国无州、多层城市
  const orders = [];
  let id = 0;
  const add = (cc, country, state, city, n) => { for (let i = 0; i < n; i++) orders.push({ id: `o${id}`, orderNo: `ORD${String(id).padStart(4,'0')}`, platform: "Amazon", skuId: "s1", qty: 2, amount: 50, weight: 1, status: "已签收", city, state, country, countryCode: cc, lng: -118 + (id%5)*0.2, lat: 34 + (id%5)*0.1, date: `2026-11-${String(5+i%20).padStart(2,'0')}`, warehouseId: "", returnRisk: 0.1 }); id++; };
  add("US", "美国", "CA", "Los Angeles", 10);
  add("US", "美国", "CA", "San Diego", 5);
  add("US", "美国", "NY", "New York", 8);
  add("DE", "德国", "", "Berlin", 6);
  add("DE", "德国", "", "Munich", 4);
  await page.evaluate((os) => {
    Object.keys(localStorage).filter((k) => k.startsWith("cbh_")).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem("cbh_data_orders_v1", JSON.stringify(os));
  }, orders);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(2000);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent||"").includes("地图下钻分析"))?.click());
  await sleep(3000);

  // 世界层：显示国家列表
  let txt = await body();
  check("世界层显示国家排行（美国/德国）", txt.includes("美国") && txt.includes("德国") && txt.includes("国家 / 地区"));
  check("有点击下钻提示", txt.includes("点击下钻"));

  // 下钻美国（用缩写数据验证归一化）
  const okUS = await clickRank("美国");
  await sleep(1800);
  txt = await body();
  check("点击美国进入州层", okUS && txt.includes("州 / 省"));
  check("州层显示 CA / NY 两州", txt.includes("CA") && txt.includes("NY"), txt.match(/\d+ 单[^<]*/g)?.slice(0,4)?.join(" | "));
  check("面包屑含 世界 > 美国", txt.includes("世界") && txt.includes("美国"));

  // 点击 CA 州 → 应显示城市列表（关键 bug 修复点）
  const okCA = await clickRank("CA");
  await sleep(1800);
  txt = await body();
  check("点击 CA 州进入城市层", okCA && txt.includes("城市"), "应进入城市层而非空白");
  check("城市层显示 Los Angeles / San Diego", txt.includes("Los Angeles") && txt.includes("San Diego"));
  const caCityCount = await page.evaluate(() => [...document.querySelectorAll("button")].filter(b => (b.textContent||"").includes("Los Angeles")).length);
  check("洛杉矶城市行可点击", caCityCount > 0);

  // 点击 Los Angeles 城市 → 订单明细
  const okLA = await clickRank("Los Angeles");
  await sleep(1800);
  txt = await body();
  check("点击城市进入订单明细层", okLA && txt.includes("订单明细"));
  const hasOrderNo = /ORD\d{4}/.test(txt);
  check("订单明细显示订单号/金额/平台", hasOrderNo && txt.includes("Amazon"));
  check("面包屑完整 世界>美国>CA>Los Angeles", txt.includes("Los Angeles") && txt.includes("CA") && txt.includes("美国"));

  // 返回上一级 → 回到城市层
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b => (b.textContent||"").includes("返回上一级"))?.click());
  await sleep(1500);
  txt = await body();
  const ordLeft = txt.match(/ORD\d{4}/g);
  check("返回上一级回到城市列表", txt.includes("Los Angeles") && txt.includes("San Diego"), ordLeft ? `残留订单号 ${ordLeft.slice(0,2).join(",")}（可能来自弹窗）` : "无订单号残留");

  // 重置 → 世界层 → 点德国（无州数据）应直接到城市层
  await page.evaluate(() => { const b=[...document.querySelectorAll("button")].find(b=>b.title==="重置视图"); if(b) b.click(); });
  await sleep(1800);
  const okDE = await clickRank("德国");
  await sleep(1800);
  txt = await body();
  check("德国无州数据直接下钻到城市层", okDE && txt.includes("城市") && txt.includes("Berlin") && txt.includes("Munich"));

  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/drilldown-city.png" });
  check("全程无页面/控制台错误", errors.length === 0, errors.length ? errors.slice(0,3).join(" | ") : "");
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
}
