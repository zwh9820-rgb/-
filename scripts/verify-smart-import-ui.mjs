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
const check = (n, ok, d) => { console.log(`${ok?"✓":"✗"} ${n}${d?" — "+d:""}`); ok?pass++:fail++; };
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type()==="error" && !m.text().includes("favicon")) errors.push(m.text().slice(0,200)); });
const body = () => page.evaluate(() => document.body.textContent || "");

const ORDER_FILE = "D:/跨境全链路数据中控台/OutboundOrderDetail-19000466-20261118140432/订单出库.xlsx";

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await page.evaluate(() => {
    Object.keys(localStorage).filter(k=>k.startsWith("cbh_")).forEach(k=>localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(1800);

  // 进入数据中心
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(b=>(b.textContent||"").includes("数据中心"))?.click());
  await sleep(1200);
  check("数据中心显示智能导入入口", (await body()).includes("智能导入"));

  // 打开智能导入工作台
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b=>(b.textContent||"").includes("智能导入"))?.click());
  await sleep(800);
  check("智能导入工作台已打开", (await body()).includes("智能导入工作台"));

  // 通过 file input 上传真实订单文件
  const input = await page.$('input[type=file][multiple]');
  await input.uploadFile(ORDER_FILE);
  await sleep(2500);

  let txt = await body();
  check("文件已添加并识别", txt.includes("订单出库.xlsx") && txt.includes("订单"), txt.match(/订单出库[^\n]{0,30}/)?.[0]);
  check("自动识别出映射字段数", /自动识别\s*\d+\s*个字段/.test(txt), txt.match(/自动识别\s*\d+\s*个字段/)?.[0]);
  check("显示字段映射表", txt.includes("字段映射") && txt.includes("文件里的列") && txt.includes("读成系统字段"));
  check("显示解析预览", txt.includes("解析预览") && txt.includes("共将导入"));

  // 检查映射表中"卖家订单号"被自动映射
  const mapped = await page.evaluate(() => {
    const sels = [...document.querySelectorAll("select")];
    return sels.map(s => ({ v: s.value, label: s.options[s.selectedIndex]?.text })).filter(x => x.v && x.v !== "");
  });
  check("卖家订单号列自动映射到 orderNo", mapped.some(m=>m.v==="orderNo"), JSON.stringify(mapped.slice(0,6)));
  check("金额列自动映射", mapped.some(m=>m.v==="amount"));
  check("国家代码/邮编列自动映射", mapped.some(m=>m.v==="countryCode") && mapped.some(m=>m.v==="zip"));

  // 保存映射方案
  await page.evaluate(() => {
    const inp = [...document.querySelectorAll("input")].find(i => i.placeholder === "方案名称");
    if (inp) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(inp, "订单出库方案"); inp.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await sleep(300);
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b=>(b.textContent||"").includes("存为方案"))?.click());
  await sleep(500);
  check("映射方案已保存", (await body()).includes("订单出库方案"));

  await page.screenshot({ path: "D:/work bu/GOZWENJIAN/2026-11-17-14-53-10/screenshots/smart-import-ui.png" });

  // 执行导入（替换）
  await page.evaluate(() => [...document.querySelectorAll("button")].find(b=>(b.textContent||"").includes("导入并替换"))?.click());
  await sleep(2000);
  txt = await body();
  check("导入后数据中心显示订单条数", /851|850/.test(txt), txt.match(/\d+\s*条真实数据/)?.[0]);

  // 去地图看州聚合
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find(b=>(b.textContent||"").includes("地图下钻分析"))?.click());
  await sleep(3000);
  txt = await body();
  check("地图能显示导入订单的国家", txt.includes("美国") || txt.includes("区域数据看板"));

  check("全程无页面/控制台错误", errors.length === 0, errors.length ? errors.slice(0,3).join(" | ") : "");
  console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close(); server.close();
  process.exit(fail?1:0);
}
