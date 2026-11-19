// 验证 PDF 预览修复：点预览后主进程打开独立窗口用 loadFile 加载 PDF（不再白屏）。
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const TEST_DIR = "D:\\work bu\\pdf预览测试";
const PDF_SRC = path.resolve("scripts/.test-preview.pdf");
const USERDATA = path.resolve("scripts/.ud-pdfpreview");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RESULTS = [];
function check(name, ok, info) { RESULTS.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? " | " + info : ""}`); }

const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
let browser, proc;
try {
  // 准备测试目录与 PDF
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const pdfPath = path.join(TEST_DIR, "测试说明书.pdf");
  fs.copyFileSync(PDF_SRC, pdfPath);

  proc = spawn(ROOT, [`--remote-debugging-port=9277`, `--user-data-dir=${USERDATA}`, "--no-sandbox"], { env, stdio: "ignore" });
  let connected = false;
  for (let i = 0; i < 50; i++) { await sleep(400); try { browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:9277", defaultViewport: { width: 1400, height: 900 } }); connected = true; break; } catch {} }
  check("Electron 启动并可连接", connected);
  if (!connected) throw new Error("connect failed");

  let page;
  for (let i = 0; i < 30; i++) { const pages = await browser.pages(); page = pages.find((p) => p.url().includes("127.0.0.1")); if (page) break; await sleep(400); }
  check("找到应用页面", !!page);
  await sleep(2500);

  await page.evaluate((dir) => {
    localStorage.setItem("cbh_file_roots_v1", JSON.stringify([{ id: "r", label: "PDF测试", path: dir, kind: "local", enabled: true }]));
    localStorage.setItem("cbh_file_settings_v1", JSON.stringify({ adminMode: false, defaultDownloadable: true, defaultViewable: true }));
  }, TEST_DIR);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3000);

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "文件中心")?.click());
  await sleep(1200);
  let body = await page.evaluate(() => document.body.innerText);
  check("文件中心显示 PDF 文件", body.includes("测试说明书"));

  const pagesBefore = (await browser.pages()).length;
  // 点该 PDF 的「预览」按钮
  const clicked = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tr")];
    const row = rows.find((tr) => (tr.textContent || "").includes("测试说明书"));
    const btn = row ? [...row.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "预览") : null;
    if (btn) { btn.click(); return true; } return false;
  });
  check("找到并点击 PDF 预览按钮", clicked);
  await sleep(3000);

  // 检查是否新增了独立窗口，且其 URL 指向该 PDF 文件
  const allPages = await browser.pages();
  const pdfWin = allPages.find((p) => p.url().startsWith("file://") && p.url().includes("pdf"));
  check("打开了独立 PDF 预览窗口", allPages.length > pagesBefore && !!pdfWin, `页面数 ${pagesBefore}→${allPages.length}`);
  let pdfUrlDecoded = "";
  try { pdfUrlDecoded = decodeURIComponent(pdfWin?.url() || ""); } catch { pdfUrlDecoded = pdfWin?.url() || ""; }
  check("预览窗口加载的是本地 PDF 文件", !!pdfWin && pdfUrlDecoded.includes("测试说明书.pdf"), pdfUrlDecoded);

  // 确认主应用没有出现白屏预览弹窗（内嵌弹窗不应出现）
  body = await page.evaluate(() => document.body.innerText);
  check("主应用未出现空白内嵌预览弹窗", !body.includes("无预览数据"));

  const passed = RESULTS.filter(Boolean).length;
  console.log(`\n结果: ${passed}/${RESULTS.length} 通过`);
  if (passed < RESULTS.length) process.exitCode = 1;
} catch (e) {
  console.log("EXCEPTION", String(e).slice(0, 300));
  process.exitCode = 1;
} finally {
  try { await browser?.disconnect(); } catch {}
  try { proc?.kill("SIGKILL"); } catch {}
  try { fs.rmSync(USERDATA, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
}
