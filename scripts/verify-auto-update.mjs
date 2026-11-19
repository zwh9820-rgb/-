// 在线更新功能验证
// 1) 主进程模块语法 + updater.cjs 核心逻辑（mock electron）
// 2) 固定端口接线 + preload 桥接完整性（静态检查）
// 3) 浏览器端：设置页"在线更新"面板渲染与无 preload 时的优雅降级
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const check = (n, ok, d) => { console.log(`${ok ? "✓" : "✗"} ${n}${d ? " — " + d : ""}`); ok ? pass++ : fail++; };

// ---------- 1. 语法检查 ----------
for (const f of ["electron/main.cjs", "electron/preload.cjs", "electron/updater.cjs"]) {
  try { execSync(`node --check ${f}`, { stdio: "pipe" }); check(`${f} 语法有效`, true); }
  catch (e) { check(`${f} 语法有效`, false, String(e).slice(0, 100)); }
}

// ---------- 2. updater.cjs 逻辑（mock electron）----------
const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), "cbh-updater-"));
const handlers = {};
const pushed = [];
const mockAutoUpdater = {
  autoDownload: true, autoInstallOnAppQuit: true, logger: null,
  forceDevUpdateConfig: false,
  on: (evt, cb) => { (mockAutoUpdater._events ||= {})[evt] = cb; },
  setFeedURL: (url) => { mockAutoUpdater._feed = url; },
  checkForUpdates: async () => { return { version: "0.2.0" }; },
  downloadUpdate: async () => { return ["setup.exe"]; },
  quitAndInstall: () => { mockAutoUpdater._quitInstall = true; },
};
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return {
    app: { getVersion: () => "0.1.0", getPath: () => tmpUserData, isPackaged: true },
    ipcMain: { handle: (name, fn) => { handlers[name] = fn; } },
    BrowserWindow: { getAllWindows: () => [] },
    dialog: {},
  };
  if (request === "electron-updater") return { autoUpdater: mockAutoUpdater };
  return origLoad.apply(this, arguments);
};
const updater = require(path.resolve("electron/updater.cjs"));
Module._load = origLoad;

// 默认配置
const def = updater.readConfig();
check("默认配置 provider=github", def.provider === "github");
check("默认配置 autoCheck=true", def.autoCheck === true);
check("默认未配置 owner/repo", def.owner === "" && def.repo === "");

// 写读配置
const wOk = updater.writeConfig({ owner: "testuser", repo: "cbh-release", autoCheck: false });
const reread = updater.readConfig();
check("配置写入成功", wOk === true);
check("配置读回 owner 正确", reread.owner === "testuser" && reread.repo === "cbh-release");
check("配置读回 autoCheck=false", reread.autoCheck === false);

// init 注册 IPC
updater.init();
const expectedHandlers = ["updater:get-info", "updater:get-config", "updater:set-config", "updater:check", "updater:download", "updater:backup", "updater:install"];
check("IPC handler 全部注册", expectedHandlers.every((h) => typeof handlers[h] === "function"), `${Object.keys(handlers).length} 个`);

// get-info
const info = await handlers["updater:get-info"]();
check("get-info 返回版本", info.version === "0.1.0" && info.packaged === true);

// autoDownload/autoInstall 关闭（保护用户不被打断）
check("autoDownload 已关闭", mockAutoUpdater.autoDownload === false);
check("autoInstallOnAppQuit 已关闭", mockAutoUpdater.autoInstallOnAppQuit === false);

// 未配置时 check 返回失败（先清空配置，避免被前面的写测试污染）
updater.writeConfig({ owner: "", repo: "", feedUrl: "" });
const bad = await handlers["updater:check"]();
check("未配置更新源时 check 失败", bad.ok === false);

// 配置后 check 成功 + feed 走 github
await handlers["updater:set-config"](null, { owner: "u", repo: "r", autoCheck: true, feedUrl: "" });
const ok = await handlers["updater:check"]();
check("配置后 check 成功", ok.ok === true);
check("feed 使用 github provider", mockAutoUpdater._feed?.provider === "github", JSON.stringify(mockAutoUpdater._feed));

// 自定义 feedUrl 覆盖为 generic
await handlers["updater:set-config"](null, { owner: "u", repo: "r", feedUrl: "http://127.0.0.1:9999/upd/" });
await handlers["updater:check"]();
check("feedUrl 覆盖为 generic", mockAutoUpdater._feed?.provider === "generic", JSON.stringify(mockAutoUpdater._feed));

// 数据备份
const bk = await handlers["updater:backup"](null, { cbh_data_orders_v1: "[{\"id\":\"o1\"}]" });
check("数据备份写入成功", bk.ok === true, path.basename(bk.file || ""));
if (bk.ok) {
  const content = JSON.parse(fs.readFileSync(bk.file, "utf8"));
  check("备份内容含业务数据", content.data.cbh_data_orders_v1?.includes("o1"));
}

// 下载 / 安装
const dl = await handlers["updater:download"]();
check("download 调用成功", dl.ok === true);
await handlers["updater:install"]();
await new Promise((r) => setTimeout(r, 600));
check("install 触发 quitAndInstall", mockAutoUpdater._quitInstall === true);

// 事件推送映射
check("checking 事件有处理器", typeof mockAutoUpdater._events?.["checking-for-update"] === "function");
check("download-progress 事件有处理器", typeof mockAutoUpdater._events?.["download-progress"] === "function");
check("update-downloaded 事件有处理器", typeof mockAutoUpdater._events?.["update-downloaded"] === "function");

// ---------- 3. 静态接线检查 ----------
const mainSrc = fs.readFileSync("electron/main.cjs", "utf8");
const preSrc = fs.readFileSync("electron/preload.cjs", "utf8");
check("主进程使用固定端口", /STATIC_PORT\s*=\s*\d+/.test(mainSrc) && /tryListen\(STATIC_PORT/.test(mainSrc));
check("主进程接入 preload", /preload:\s*path\.join\(__dirname,\s*"preload\.cjs"\)/.test(mainSrc));
check("主进程 init updater", /updater\.init\(\)/.test(mainSrc));
check("主进程启动自动检查", /updater\.autoCheckOnLaunch\(\)/.test(mainSrc));
check("preload 暴露 updaterAPI", /exposeInMainWorld\(\s*"updaterAPI"/.test(preSrc));
for (const m of ["getInfo", "getConfig", "setConfig", "check", "download", "install", "backup", "onStatus", "onOpenSettings"]) {
  check(`preload 暴露 ${m}`, preSrc.includes(m));
}

// ---------- 4. 浏览器端渲染 ----------
const ROOT = path.resolve("out");
const M = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  fs.readFile(f, (e, d) => {
    if (e) { r.writeHead(404); r.end(); }
    else { r.writeHead(200, { "Content-Type": M[path.extname(f)] || "application/octet-stream" }); r.end(d); }
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

try {
  const puppeteer = require("puppeteer-core");
  const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox", "--use-gl=swiftshader"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 150)));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  await sleep(1500);
  // 进设置页
  await page.evaluate(() => [...document.querySelectorAll("nav button")].find((b) => (b.textContent || "").includes("设置"))?.click());
  await sleep(900);
  // 点"在线更新"tab
  const tabClicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "在线更新");
    if (b) { b.click(); return true; } return false;
  });
  check("设置页有在线更新 tab", tabClicked);
  await sleep(600);
  const txt = await page.evaluate(() => document.body.textContent || "");
  check("显示当前版本卡片", txt.includes("当前版本") && txt.includes("检查更新"));
  check("显示更新源配置", txt.includes("仓库所有者") && txt.includes("仓库名称"));
  check("显示数据不改动说明", txt.includes("数据不会被改动"));
  check("浏览器模式优雅降级", txt.includes("浏览器预览模式") || txt.includes("仅在桌面版可用"));
  check("无页面错误", errors.length === 0, errors.join(" | "));
  await browser.close();
} catch (e) {
  check("浏览器端渲染", false, String(e).slice(0, 200));
}
server.close();

fs.rmSync(tmpUserData, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
