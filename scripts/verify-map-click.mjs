// 验证：地图点击区域默认不自动跳转视角；开启开关后才 flyTo。
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const USERDATA = path.resolve("scripts/.ud-mapclick");
const PORT = 9285;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
const RESULTS = [];
function check(name, ok, info) { RESULTS.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? " | " + info : ""}`); }
let browser, proc;
try {
  proc = spawn(ROOT, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${USERDATA}`, "--no-sandbox"], { env, stdio: "ignore" });
  let connected = false;
  for (let i = 0; i < 60; i++) { await sleep(500); try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: { width: 1500, height: 950 } }); connected = true; break; } catch {} }
  if (!connected) throw new Error("connect failed");
  let page;
  for (let i = 0; i < 40; i++) { const pages = await browser.pages(); page = pages.find((p) => p.url().includes("127.0.0.1")); if (page) break; await sleep(500); }
  if (!page) throw new Error("no app page");
  await sleep(2500);

  // 进入地图
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("地图下钻"))?.click());
  await sleep(3500);
  const getCenter = () => page.evaluate(() => document.querySelector(".maplibregl-map")?.dataset?.mapCenter || "");
  const center0 = await getCenter();
  check("地图加载并暴露中心", !!center0, center0);

  // 通过左侧排行点击一个国家，验证默认不跳转（排行榜异步加载，轮询等待）
  let clicked = null;
  for (let i = 0; i < 12 && !clicked; i++) {
    clicked = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")].filter((b) => /美国|俄罗斯|德国|英国|日本/.test(b.textContent || ""));
      const target = btns[0];
      if (target) { target.click(); return (target.textContent || "").trim(); } return null;
    });
    if (!clicked) await sleep(700);
  }
  check("找到并点击一个国家", !!clicked, clicked || "");
  await sleep(2000);
  const center1 = await getCenter();
  check("默认点击国家后视角不自动跳转", center0 === center1, `${center0} → ${center1}`);

  // 打开图层面板，勾选自动跳转开关
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => (b.title || "") === "图层" || (b.textContent || "").trim() === "图层")?.click());
  await sleep(600);
  const toggled = await page.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find((l) => (l.textContent || "").includes("点击区域后自动跳转视角"));
    const cb = label?.querySelector('input[type="checkbox"]');
    if (cb) { cb.click(); return true; } return false;
  });
  check("找到自动跳转开关并可勾选", toggled);
  await sleep(500);

  // 再次点击国家，验证会跳转
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => /美国|俄罗斯|德国|英国|日本|州/.test(b.textContent || ""));
    btns[0]?.click();
  });
  await sleep(2200);
  const center2 = await getCenter();
  check("开启开关后点击国家视角会跳转", center2 !== center1, `${center1} → ${center2}`);

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
}
