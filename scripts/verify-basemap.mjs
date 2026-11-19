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

// 记录瓦片请求（按服务名分类）
const tiles = { light: 0, dark: 0, street: 0, satellite: 0, topo: 0, ref: 0 };
page.on("request", (req) => {
  const u = req.url();
  if (!u.includes("arcgisonline.com") || !u.includes("/tile/")) return;
  if (u.includes("World_Imagery")) tiles.satellite++;
  else if (u.includes("World_Street_Map")) tiles.street++;
  else if (u.includes("World_Topo_Map")) tiles.topo++;
  else if (u.includes("World_Dark_Gray")) tiles.dark++;
  else if (u.includes("World_Light_Gray_Reference") || u.includes("World_Boundaries")) tiles.ref++;
  else if (u.includes("World_Light_Gray_Base")) tiles.light++;
});

const state = () => page.evaluate(() => {
  const el = document.querySelector(".maplibregl-map");
  return {
    basemap: el?.dataset?.basemap || "", loading: el?.dataset?.basemapLoading || "", target: el?.dataset?.basemapTarget || "",
    tip: (document.body.textContent || "").includes("底图瓦片加载中"),
  };
});
const switchTo = async (label, key) => {
  // 仅当面板未打开时才点开（该按钮是 toggle）
  const panelOpen = await page.evaluate(() => (document.body.textContent || "").includes("底图样式"));
  if (!panelOpen) {
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.title || "") === "底图切换")?.click());
    await sleep(300);
  }
  // 点对应样式卡片：面板内卡片按钮文字为中文标签（浅灰/深色/街道/影像/地形）
  const clicked = await page.evaluate((lb) => {
    const buttons = [...document.querySelectorAll("button")];
    // 卡片按钮包含 svg 图标且文本恰为中文标签
    const b = buttons.find((x) => (x.textContent || "").trim() === lb && x.querySelector("svg"))
      || buttons.find((x) => (x.textContent || "").trim().includes(lb) && x.querySelector("svg"));
    if (b) { b.click(); return true; } return false;
  }, label);
  // 等待加载完成（最多 15 秒）
  for (let i = 0; i < 75; i++) {
    const s = await state();
    if (s.loading === "0" && s.basemap === key) break;
    await sleep(200);
  }
  return clicked;
};

try {
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "domcontentloaded" });
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图"))?.click());
  await sleep(3000);
  await page.waitForFunction(() => document.querySelector(".maplibregl-map")?.dataset?.basemap !== undefined, { timeout: 12000 }).catch(() => {});

  let s = await state();
  check("初始底图为浅灰且未加载中", s.basemap === "light" && s.loading === "0", JSON.stringify(s));
  check("初始浅灰瓦片已请求", tiles.light > 0, `light瓦片=${tiles.light}`);

  const cases = [
    ["街道", "street", "street"],
    ["影像", "satellite", "satellite"],
    ["地形", "topo", "topo"],
    ["深色", "dark", "dark"],
  ];
  for (const [label, key, tileKey] of cases) {
    const before = tiles[tileKey];
    const clicked = await switchTo(label, key);
    const after = await state();
    check(`点击切换到「${label}」`, clicked, `target=${after.target}`);
    check(`「${label}」切换完成(loading=0, basemap=${key})`, after.loading === "0" && after.basemap === key, JSON.stringify(after));
    check(`「${label}」瓦片真实请求`, tiles[tileKey] > before, `${tileKey}瓦片 ${before}→${tiles[tileKey]}`);
  }

  // 切回浅灰
  await switchTo("浅灰", "light");
  s = await state();
  check("切回浅灰成功", s.basemap === "light" && s.loading === "0", JSON.stringify(s));

  // 快速连续切换：不应卡死在 loading
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.title || "") === "底图切换")?.click());
  await sleep(200);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    ["街道", "影像", "地形"].forEach((lb) => {
      const map = { "街道": "street", "影像": "satellite", "地形": "topo" };
      const b = btns.find((x) => (x.textContent || "").trim().includes(map[lb]) && x.querySelector("svg"));
      if (b) b.click();
    });
  });
  await sleep(1500);
  for (let i = 0; i < 75; i++) {
    const st = await state();
    if (st.loading === "0") break;
    await sleep(200);
  }
  s = await state();
  check("快速连续切换后未卡在加载态", s.loading === "0", JSON.stringify(s));

  check("全程无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n瓦片请求统计: ${JSON.stringify(tiles)}`);
  console.log(`结果: ${pass} 通过 / ${fail} 失败`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 600)); fail++;
} finally {
  await browser.close(); server.close(); process.exit(fail ? 1 : 0);
}
