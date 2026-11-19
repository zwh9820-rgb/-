// 完整复现：在数据中心用"导入 Excel/CSV"上传文件，然后切换 tab
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
await new Promise((r) => server.listen(3013, "127.0.0.1", r));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000 });
try {
  await page.goto("http://127.0.0.1:3013/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await page.evaluate(() => { Object.keys(localStorage).filter((k) => k.startsWith("cbh_")).forEach((k) => localStorage.removeItem(k)); });
  await page.reload({ waitUntil: "domcontentloaded" }); await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().includes("数据中心"))?.click());
  await sleep(1200);

  const clickCard = async (label) => {
    const ok = await page.evaluate((lb) => {
      const cards = [...document.querySelectorAll("button.card")];
      const c = cards.find((b) => (b.textContent || "").includes(lb));
      if (c) { c.click(); return true; } return false;
    }, label);
    await sleep(600); return ok;
  };
  const read = async (tag) => {
    const s = await page.evaluate(() => {
      const title = [...document.querySelectorAll("*")].map((e) => e.childNodes.length === 1 ? e.textContent?.trim() : "").find((t) => t && /数据$/.test(t) && /海外仓|订单|SKU/.test(t));
      const rows = [...document.querySelectorAll("tbody tr")].map((tr) => tr.innerText.replace(/\s+/g, " ").trim());
      const cards = [...document.querySelectorAll("button.card")].map((c) => c.textContent.replace(/\s+/g, " ").trim());
      return { title, n: rows.length, r0: rows[0], cards };
    });
    console.log(`${tag}: 标题=${s.title} 行数=${s.n}`);
    console.log(`   首行=${s.r0}`);
    console.log(`   卡片=${s.cards.slice(0,3).join(" / ")}`);
  };

  // 场景A：在【海外仓】tab 导入【订单导入模板.xlsx】
  console.log("\n===== 场景A：海外仓 tab 导入订单模板 =====");
  await clickCard("海外仓");
  const input = await page.$('input[type=file]');
  await input.uploadFile("D:/跨境全链路数据中控台/订单导入模板.xlsx");
  await sleep(2000);
  // 预览弹窗
  const preview = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll("h3")].find((h) => h.textContent?.includes("导入预览"));
    if (!dlg) return "无预览弹窗";
    return [...document.querySelectorAll("table")].slice(-1)[0]?.innerText.slice(0, 300);
  });
  console.log("预览:", preview);
  // 点"替换全部数据"
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("替换全部数据"));
    if (b) { b.click(); return true; } return false;
  });
  console.log("确认替换:", clicked);
  await sleep(1200);
  await read("导入后-海外仓tab");
  await clickCard("订单"); await read("切到-订单tab");
  await clickCard("SKU"); await read("切到-SKUtab");
  await clickCard("海外仓"); await read("切回-海外仓tab");

  // 读取各集合实际条数
  const store = await page.evaluate(() => {
    const o = {};
    for (const k of ["warehouses", "orders", "skus"]) {
      try { const v = JSON.parse(localStorage.getItem(`cbh_data_${k}_v1`) || "[]"); o[k] = { n: v.length, sample: v[0] }; } catch { o[k] = "err"; }
    }
    return o;
  });
  console.log("\n存储实际内容:");
  console.log(JSON.stringify(store, null, 2).slice(0, 1500));
} catch (e) { console.log("EXC", String(e).slice(0, 400)); }
finally { await browser.close(); server.close(); }
