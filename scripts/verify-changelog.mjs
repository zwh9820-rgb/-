// 验证应用内「系统设置 → 在线更新 → 版本更新说明」展示与 changelog.json 一致
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
const ELECTRON = path.resolve("dist/win-unpacked/LinkVue 联视.exe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS;
let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };

const data = JSON.parse(fs.readFileSync("changelog.json", "utf8"));
check("changelog.json 含所有版本", data.versions.length >= 4, `${data.versions.length} 个版本`);
check("每版都有 issues 与 fixes", data.versions.every((v) => v.issues.length && v.fixes.length));

if (!fs.existsSync(ELECTRON)) { check("EXE 存在", false); process.exit(1); }
const proc = spawn(ELECTRON, ["--remote-debugging-port=9251", "--no-sandbox"], { env, stdio: "ignore" });
let b;
try {
  for (let i = 0; i < 40; i++) { await sleep(500); try { b = await puppeteer.connect({ browserURL: "http://127.0.0.1:9251", defaultViewport: null }); break; } catch {} }
  if (!b) throw new Error("CDP fail");
  await sleep(4000);
  const page = (await b.pages()).find((p) => p.url().includes("127.0.0.1")) || (await b.pages())[0];
  const clickText = async (text) => page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll("button, a, div[role=button], span"));
    const el = els.find((e) => (e.textContent || "").trim() === t || (e.textContent || "").includes(t));
    if (el) { (el.closest("button") || el).click(); return true; }
    return false;
  }, text);
  check("打开系统设置", await clickText("系统设置"));
  await sleep(1200);
  check("切到在线更新页", await clickText("在线更新"));
  await sleep(1200);
  const body = await page.evaluate(() => document.body?.innerText || "");
  check("显示「版本更新说明」标题", body.includes("版本更新说明"));
  check("显示「发现的问题」", body.includes("发现的问题"));
  check("显示「解决的问题」", body.includes("解决的问题"));
  check("展示最新版本 v0.1.3", body.includes("v0.1.3"));
  check("展示历史版本 v0.1.1", body.includes("v0.1.1"));
  const sample = data.versions.find((v) => v.version === "0.1.3").issues[0];
  check("说明正文与数据源一致", body.includes(sample.slice(0, 12)), sample.slice(0, 20));
  check("无页面崩溃", !body.includes("Application error"));
  await page.evaluate(() => window.close()); await sleep(1000);
} catch (e) { check("应用内更新说明验证", false, String(e).slice(0, 200)); }
finally { try { await b?.disconnect(); } catch {} try { proc.kill("SIGKILL"); } catch {} }
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`); process.exit(fail ? 1 : 0);
