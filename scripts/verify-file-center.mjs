// 验证 NAS 式文件中心：目录树下钻、面包屑、预览、权限、全局搜索。
// 用独立 userData，注入一个测试目录根，在真实 Electron 里操作 UI。
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const TEST_DIR = "D:\\work bu\\文件中心测试";
const USERDATA = path.resolve("scripts/.ud-filecenter");
const RESULTS = [];
function check(name, ok, info) { RESULTS.push({ name, ok: !!ok, info }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? " | " + info : ""}`); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 预置 localStorage：一个启用的根目录
function seedLocalStorage() {
  const dir = path.join(USERDATA, "Default", "Local Storage", "leveldb");
  fs.mkdirSync(dir, { recursive: true });
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
let browser, proc;
try {
  seedLocalStorage();
  proc = spawn(ROOT, [
    `--remote-debugging-port=9276`,
    `--user-data-dir=${USERDATA}`,
    "--no-sandbox",
  ], { env, stdio: "ignore" });

  let connected = false;
  for (let i = 0; i < 50; i++) {
    await sleep(400);
    try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9276", defaultViewport: { width: 1500, height: 950 } }); connected = true; break; } catch {}
  }
  check("Electron 启动并可连接", connected);
  if (!connected) throw new Error("connect failed");

  let page;
  for (let i = 0; i < 30; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes("127.0.0.1") || p.url().includes("localhost"));
    if (page) break;
    await sleep(400);
  }
  check("找到应用页面", !!page, page?.url());
  if (!page) throw new Error("no app page");

  await sleep(2500);

  // 注入文件根目录配置（usePersistedCollection 读的 key）
  await page.evaluate((dir) => {
    localStorage.setItem("cbh_file_roots_v1", JSON.stringify([
      { id: "root-test", label: "产品资料库", path: dir, kind: "local", enabled: true },
    ]));
    localStorage.setItem("cbh_file_settings_v1", JSON.stringify({ adminMode: false, defaultDownloadable: true, defaultViewable: true }));
  }, TEST_DIR);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3000);

  // 导航到文件中心（左侧菜单）
  const navOk = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button, [role=button]")].find((b) => (b.textContent || "").trim() === "文件中心");
    if (btn) { btn.click(); return true; } return false;
  });
  check("可进入文件中心", navOk);
  await sleep(1200);

  // 页面出现目录树 / 面包屑
  let body = await page.evaluate(() => document.body?.innerText || "");
  check("显示存储目录树（测试根目录）", body.includes("文件中心测试") || body.includes("产品资料库"));
  check("显示 NAS 式面包屑/快捷访问", body.includes("快捷访问") || body.includes("全部文件"));

  // 重建索引，等待扫描完成
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("重建索引"));
    btn?.click();
  });
  await sleep(2500);
  body = await page.evaluate(() => document.body?.innerText || "");
  check("扫描到测试文件", body.includes("3 个文件"), (body.match(/\d+ 个文件/) || [])[0]);

  // 展开目录树第一个根，出现子文件夹（产品说明书/产品清单）
  await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("div")].filter((d) => (d.textContent || "").trim() === "产品资料库");
    // 点展开箭头：找到包含该文本的行内的第一个 button
    const row = nodes.map((n) => n.parentElement).find((p) => p && p.querySelector("button"));
    row?.querySelector("button")?.click();
  });
  await sleep(1000);
  body = await page.evaluate(() => document.body?.innerText || "");
  check("目录树展开显示子文件夹", body.includes("产品说明书") && body.includes("产品清单"));

  // 双击进入"产品说明书"文件夹，面包屑更新、显示子文件夹
  await page.evaluate(() => {
    const cell = [...document.querySelectorAll("td")].find((td) => (td.textContent || "").trim().includes("产品说明书"));
    if (cell) { const row = cell.closest("tr"); row?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); }
  });
  await sleep(1000);
  body = await page.evaluate(() => document.body?.innerText || "");
  check("下钻进入文件夹（面包屑含产品说明书）", body.includes("产品说明书"));
  check("子目录可见（欧洲站/美国站）", body.includes("欧洲站") || body.includes("美国站"));

  // 全局搜索：搜索"说明书"，应命中文件
  await page.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((i) => (i.placeholder || "").includes("搜索"));
    if (input) { const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(input, "说明书"); input.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await sleep(900);
  body = await page.evaluate(() => document.body?.innerText || "");
  check("全局搜索命中文件", body.includes("搜索结果") && (body.includes("说明书A") || body.includes("说明书B")));

  // 预览：点"预览"按钮，弹窗出现文件内容
  const previewClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "预览");
    if (btn) { btn.click(); return true; } return false;
  });
  await sleep(1500);
  body = await page.evaluate(() => document.body?.innerText || "");
  check("可打开预览弹窗", previewClicked && !body.includes("无预览数据"));
  const hasText = await page.evaluate(() => {
    const pre = document.querySelector("pre");
    return !!(pre && (pre.textContent || "").length > 0);
  });
  check("预览展示文本内容", hasText);

  const passed = RESULTS.filter((r) => r.ok).length;
  console.log(`\n结果: ${passed}/${RESULTS.length} 通过`);
  if (passed < RESULTS.length) process.exitCode = 1;
} catch (e) {
  console.log("EXCEPTION", String(e).slice(0, 300));
  process.exitCode = 1;
} finally {
  try { await browser?.disconnect(); } catch {}
  try { proc?.kill("SIGKILL"); } catch {}
  try { fs.rmSync(USERDATA, { recursive: true, force: true }); } catch {}
}
