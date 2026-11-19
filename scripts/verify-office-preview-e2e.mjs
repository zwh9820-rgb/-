// 端到端：在真实打包的 Electron 里，文件中心应用内预览 xlsx / docx。
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const ROOT = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const TEST_DIR = "D:\\work bu\\Office预览测试";
const USERDATA = path.resolve("scripts/.ud-officepreview");
const PORT = 9277;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, info = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? " | " + info : ""}`); ok ? pass++ : fail++; };

function seed() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["SKU编码", "品名", "数量"], ["M3-001", "十字螺丝", 120], ["M4-002", "六角螺母", 80],
  ]), "库存表");
  XLSX.writeFile(wb, path.join(TEST_DIR, "测试库存.xlsx"));
  fs.copyFileSync("node_modules/mammoth/test/test-data/single-paragraph.docx", path.join(TEST_DIR, "测试文档.docx"));
}

const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
let browser, proc;
try {
  seed();
  proc = spawn(ROOT, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${USERDATA}`, "--no-sandbox"], { env, stdio: "ignore" });
  let connected = false;
  for (let i = 0; i < 50; i++) { await sleep(400); try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1500, height: 950 } }); connected = true; break; } catch {} }
  check("Electron 启动并可连接", connected);
  if (!connected) throw new Error("connect failed");

  let page;
  for (let i = 0; i < 40; i++) { const pages = await browser.pages(); page = pages.find((p) => p.url().includes("127.0.0.1")); if (page) break; await sleep(500); }
  check("找到应用页面", !!page, page?.url());
  if (!page) throw new Error("no app page");
  await sleep(2500);

  await page.evaluate((dir) => {
    localStorage.setItem("cbh_file_roots_v1", JSON.stringify([{ id: "r", label: "Office测试库", path: dir, kind: "local", enabled: true }]));
    localStorage.setItem("cbh_file_settings_v1", JSON.stringify({ adminMode: false, defaultDownloadable: true, defaultViewable: true }));
  }, TEST_DIR);
  await page.reload({ waitUntil: "domcontentloaded" });
  await sleep(3000);

  const navOk = await page.evaluate(() => { const b = [...document.querySelectorAll("button,[role=button]")].find((x) => (x.textContent || "").trim() === "文件中心"); if (b) { b.click(); return true; } return false; });
  check("进入文件中心", navOk);
  await sleep(1500);
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("重建索引")); b?.click(); });
  await sleep(3000);

  // 点击“预览”按钮（按所在行文件名匹配）
  async function previewFile(name) {
    return await page.evaluate((n) => {
      // 精确匹配：遍历每个“预览”按钮，取其所在行(tr)或父容器，判断该行文本是否含目标文件名
      const pvs = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "预览");
      for (const pv of pvs) {
        const row = pv.closest("tr") || pv.parentElement?.parentElement;
        if (row && (row.textContent || "").includes(n)) { pv.click(); return true; }
      }
      return false;
    }, name);
  }

  // --- xlsx ---
  let clicked = await previewFile("测试库存.xlsx");
  if (!clicked) clicked = await page.evaluate(() => { const bs = [...document.querySelectorAll("button")].filter((b) => (b.textContent || "").trim() === "预览"); if (bs[0]) { bs[0].click(); return true; } return false; });
  check("点击 xlsx 预览按钮", clicked);
  await sleep(2000);
  let dom = await page.evaluate(() => {
    const box = document.querySelector(".doc-preview");
    return { hasBox: !!box, tables: box?.querySelectorAll("table").length || 0, text: (box?.textContent || "").slice(0, 200) };
  });
  check("xlsx 应用内渲染出表格", dom.hasBox && dom.tables >= 1, `表格数=${dom.tables} 文本=${dom.text.replace(/\s+/g, " ").slice(0, 60)}`);
  check("xlsx 显示单元格数据", dom.text.includes("M3-001") || dom.text.includes("SKU"), dom.text.replace(/\s+/g, " ").slice(0, 60));
  // 关闭弹窗：点预览弹窗右上角的 X（z-[90] 遮罩内的按钮）
  await page.evaluate(() => {
    const overlay = [...document.querySelectorAll("div")].find((d) => (d.className || "").includes("z-[90]"));
    const xb = overlay && [...overlay.querySelectorAll("button")].find((b) => b.querySelector("svg") && !(b.textContent || "").trim());
    if (xb) xb.click();
  });
  await sleep(800);
  const closed = await page.evaluate(() => !document.querySelector(".doc-preview") && !(document.body.innerText || "").includes("测试库存.xlsx\nD:"));
  check("关闭 xlsx 预览弹窗", closed);

  // --- docx ---
  clicked = await previewFile("测试文档.docx");
  check("点击 docx 预览按钮", clicked);
  await sleep(2500);
  dom = await page.evaluate(() => {
    const box = document.querySelector(".doc-preview");
    return { hasBox: !!box, paragraphs: box?.querySelectorAll("p").length || 0, text: (box?.textContent || "").trim().slice(0, 200) };
  });
  check("docx 应用内渲染出正文", dom.hasBox && dom.text.includes("Walking on imported air"), `段落=${dom.paragraphs} 文本=${dom.text.slice(0, 80)}`);
  check("docx 内容不同于上一份(xlsx已正确关闭)", !dom.text.includes("库存表"), dom.text.slice(0, 60));
  check("docx 无“暂不支持”提示", !(await page.evaluate(() => (document.body.innerText || "").includes("此格式暂不支持在线预览"))));
} catch (e) {
  check("执行过程无异常", false, String(e).slice(0, 200));
} finally {
  try { await browser?.disconnect(); } catch {}
  try { proc?.kill("SIGKILL"); } catch {}
  try { fs.rmSync(USERDATA, { recursive: true, force: true }); } catch {}
}

console.log(`结果: ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exitCode = 1;
