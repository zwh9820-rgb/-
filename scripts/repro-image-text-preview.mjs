// 真实复现：中文路径下的图片/文本预览，检查 image <img> / text <pre> 是否渲染
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const TEST_DIR = "D:\\work bu\\预览测试目录";
const USERDATA = path.resolve("scripts/.ud-imgprev");
const PORT = 9283;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
let browser, proc;
try {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
  fs.writeFileSync(path.join(TEST_DIR, "测试图片.png"), png);
  fs.writeFileSync(path.join(TEST_DIR, "测试文本.txt"), "这是一段中文预览测试内容。\n第二行 Second line.\n", "utf8");

  proc = spawn(ROOT, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${USERDATA}`, "--no-sandbox"], { env, stdio: "ignore" });
  let connected = false;
  for (let i = 0; i < 60; i++) { await sleep(500); try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1500, height: 950 } }); connected = true; break; } catch {} }
  if (!connected) throw new Error("connect failed");

  let page;
  // puppeteer.connect 时应用页可能尚未创建；轮询并在必要时重连
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(2500);
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes("127.0.0.1"));
    if (page) break;
    try { await browser.disconnect(); } catch {}
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1500, height: 950 } });
  }
  if (!page) throw new Error("no app page: " + (await browser.pages()).map(p=>p.url()).join(","));
  await sleep(2500);

  await page.evaluate((dir) => {
    localStorage.setItem("cbh_file_roots_v1", JSON.stringify([{ id: "r", label: "预览测试", path: dir, kind: "local", enabled: true }]));
    localStorage.setItem("cbh_file_settings_v1", JSON.stringify({ adminMode: false, defaultDownloadable: true, defaultViewable: true }));
  }, TEST_DIR);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3000);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "文件中心")?.click());
  await sleep(1200);
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("重建索引"))?.click());
  await sleep(2500);

  async function checkPreview(fileName) {
    const clicked = await page.evaluate((name) => {
      const rows = [...document.querySelectorAll("tr")];
      const row = rows.find((tr) => (tr.textContent || "").includes(name));
      const btn = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "预览") : null;
      if (btn) { btn.click(); return true; } return false;
    }, fileName);
    await sleep(2000);
    const state = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("img")].filter((i) => (i.src || "").startsWith("data:image") || (i.src || "").startsWith("blob:"));
      const pres = [...document.querySelectorAll("pre")];
      const body = document.body.innerText;
      return {
        imgCount: imgs.length,
        imgOk: imgs.some((i) => i.complete && i.naturalWidth > 0),
        preText: pres.map((p) => p.textContent || "").join(" ").trim().slice(0, 60),
        hasError: body.includes("读取失败") || body.includes("路径不在") || body.includes("无预览数据") || body.includes("不支持在线预览"),
      };
    });
    await page.evaluate(() => {
      const overlay = document.querySelector(".fixed.inset-0");
      if (overlay) { const btns = overlay.querySelectorAll("button"); btns[btns.length-1]?.click(); }
    });
    await sleep(500);
    return { clicked, ...state };
  }

  const img = await checkPreview("测试图片.png");
  console.log("图片预览:", JSON.stringify(img));
  const txt = await checkPreview("测试文本.txt");
  console.log("文本预览:", JSON.stringify(txt));
} catch (e) {
  console.log("EXCEPTION", String(e).slice(0, 300));
} finally {
  try { await browser?.disconnect(); } catch {}
  try { proc?.kill("SIGKILL"); } catch {}
  try { fs.rmSync(USERDATA, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}
