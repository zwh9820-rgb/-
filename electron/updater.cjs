// 在线更新模块：基于 electron-updater，GitHub Releases 作为更新源
// 设计原则：只替换程序文件，不触碰 userData（用户业务数据、API 密钥都在其中）
const { app, ipcMain, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

const CONFIG_FILE = () => path.join(app.getPath("userData"), "updater-config.json");
const BACKUP_DIR = () => path.join(app.getPath("userData"), "data-backups");

const DEFAULT_CONFIG = {
  provider: "github",
  owner: "",
  repo: "",
  private: false,
  token: "",
  // 自建/本地更新源（可选）。填写后用 generic provider 覆盖 GitHub。
  // 便于内网部署或本地验证；留空则走 GitHub。
  feedUrl: "",
  autoCheck: true,
};

function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_FILE(), "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify({ ...DEFAULT_CONFIG, ...cfg }, null, 2), "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

// 数据备份：把渲染进程传来的 localStorage 业务数据写到 userData 下。
// 安装更新前自动执行一次，确保即使意外也能还原。
function backupData(payload) {
  try {
    fs.mkdirSync(BACKUP_DIR(), { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = path.join(BACKUP_DIR(), `before-update-${stamp}.json`);
    fs.writeFileSync(file, JSON.stringify({ at: Date.now(), data: payload || {} }, null, 2), "utf8");
    return { ok: true, file };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

let status = {
  state: "idle", // idle | checking | available | not-available | downloading | downloaded | installing | error
  message: "",
  version: app.getVersion(),
  remoteVersion: "",
  percent: 0,
};

function push(patch) {
  status = { ...status, ...patch };
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send("updater:status", { ...status });
  }
}

function configured(cfg) {
  return !!(cfg.feedUrl || (cfg.owner && cfg.repo));
}

function applyFeed(cfg) {
  // 开发模式下没有 app-update.yml，允许用自定义 feed 检查
  try { autoUpdater.forceDevUpdateConfig = true; } catch { /* 老版本忽略 */ }
  if (cfg.feedUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: cfg.feedUrl });
  } else if (cfg.owner && cfg.repo) {
    const feed = { provider: "github", owner: cfg.owner, repo: cfg.repo, private: !!cfg.private };
    if (cfg.private && cfg.token) feed.token = cfg.token;
    autoUpdater.setFeedURL(feed);
  }
}

let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;

  // 不自动下载、不自动安装——由用户在设置页点击触发，避免打断录入
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // 静默日志，避免污染主进程输出
  autoUpdater.logger = { info() {}, warn() {}, error() {}, debug() {} };

  autoUpdater.on("checking-for-update", () => push({ state: "checking", message: "正在检查更新…", percent: 0 }));
  autoUpdater.on("update-available", (info) => {
    push({ state: "available", message: `发现新版本 ${info && info.version || ""}`, remoteVersion: (info && info.version) || "" });
  });
  autoUpdater.on("update-not-available", () => push({ state: "not-available", message: "当前已是最新版本" }));
  autoUpdater.on("download-progress", (p) => {
    push({ state: "downloading", message: "正在下载更新…", percent: Math.round(p.percent || 0) });
  });
  autoUpdater.on("update-downloaded", (info) => {
    push({ state: "downloaded", message: `新版本 ${(info && info.version) || ""} 已下载完成`, remoteVersion: (info && info.version) || "", percent: 100 });
  });
  autoUpdater.on("error", (err) => {
    push({ state: "error", message: `更新检查失败：${(err && err.message) ? err.message : String(err)}`.slice(0, 160) });
  });

  // ---- IPC ----
  ipcMain.handle("updater:get-info", () => ({
    version: app.getVersion(),
    platform: process.platform,
    packaged: app.isPackaged,
  }));

  ipcMain.handle("updater:get-config", () => readConfig());

  ipcMain.handle("updater:set-config", (_e, cfg) => {
    const ok = writeConfig(cfg || {});
    if (ok) {
      const c = readConfig();
      try { applyFeed(c); } catch { /* 配置错误时检查阶段再报错 */ }
    }
    return { ok };
  });

  ipcMain.handle("updater:check", async () => {
    const cfg = readConfig();
    if (!configured(cfg)) {
      push({ state: "error", message: "请先在下方填写 GitHub 仓库地址（owner / repo）" });
      return { ok: false, error: "未配置更新源" };
    }
    try {
      applyFeed(cfg);
      const result = await autoUpdater.checkForUpdates();
      if (!result) push({ state: "not-available", message: "当前已是最新版本" });
      return { ok: true };
    } catch (e) {
      push({ state: "error", message: `检查失败：${(e && e.message) || String(e)}`.slice(0, 160) });
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e) {
      push({ state: "error", message: `下载失败：${(e && e.message) || String(e)}`.slice(0, 160) });
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle("updater:backup", (_e, payload) => backupData(payload));

  ipcMain.handle("updater:install", async () => {
    try {
      push({ state: "installing", message: "即将安装更新并重启…" });
      // 稍延迟，让状态先推送到界面
      setTimeout(() => { autoUpdater.quitAndInstall(false, true); }, 400);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
}

// 启动自动检查（延迟，避免阻塞首屏；仅在已配置更新源时）
function autoCheckOnLaunch() {
  const cfg = readConfig();
  if (!cfg.autoCheck || !configured(cfg) || !app.isPackaged) return;
  setTimeout(() => {
    try {
      applyFeed(cfg);
      autoUpdater.checkForUpdates().catch(() => {});
    } catch { /* 静默 */ }
  }, 8000);
}

module.exports = { init, autoCheckOnLaunch, readConfig, writeConfig, backupData, BACKUP_DIR };
