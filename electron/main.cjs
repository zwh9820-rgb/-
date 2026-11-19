const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const updater = require("./updater.cjs");

// 锁定 userData 目录：应用显示名改为 LinkVue/联视 后，仍读写原数据目录，历史录入数据不丢失。
// 必须在 app.ready 之前设置。
app.setPath("userData", path.join(app.getPath("appData"), "cross-border-data-hub"));

// 单实例锁：避免同时运行多个实例导致 localStorage 按不同端口隔离、数据读写混乱、
// 以及更新后旧实例仍占用窗口/端口，表现为"切换标签数据滞后/串台"。
// 第二个实例启动时激活已有窗口后自行退出。
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}
app.on("second-instance", () => {
  const wins = BrowserWindow.getAllWindows();
  if (wins.length) {
    const w = wins[0];
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }
});

const isDev = !!process.env.ELECTRON_DEV;
// 固定端口：localStorage 按 origin(协议+主机+端口)隔离，端口随机会导致每次启动读到空数据、
// 更新前后数据"消失"。固定后业务数据跨重启/跨版本稳定保留。
const STATIC_PORT = 41877;
const outDir = isDev
  ? path.join(app.getAppPath(), "out")
  : path.join(process.resourcesPath, "app", "out");

// ---------- 本地静态服务（让绝对路径资源正常加载） ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".geo.json": "application/geo+json; charset=utf-8", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};

function getMime(file) {
  if (file.endsWith(".geo.json")) return MIME[".geo.json"];
  const ext = path.extname(file).toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

let server = null;
let serverPort = 0;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      let urlPath;
      try { urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
      catch { urlPath = "/"; }
      if (urlPath === "/") urlPath = "/index.html";
      // 防目录穿越
      const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
      let filePath = path.join(outDir, safe);
      if (!filePath.startsWith(outDir)) { res.writeHead(403); return res.end("Forbidden"); }
      fs.stat(filePath, (err, st) => {
        if (err || !st.isFile()) {
          // SPA 回退
          filePath = path.join(outDir, "index.html");
          if (!fs.existsSync(filePath)) { res.writeHead(404); return res.end("Not Found"); }
        }
        res.writeHead(200, {
          "Content-Type": getMime(filePath),
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(filePath).pipe(res);
      });
    });
    // 监听固定端口；若被占用则尝试向上找可用端口，保证同一份数据始终可读
    const tryListen = (port, tries) => {
      const onError = (err) => {
        if (err && err.code === "EADDRINUSE" && tries > 0) {
          server.removeListener("error", onError);
          server.listen(port + 1, "127.0.0.1", () => { serverPort = server.address().port; resolve(serverPort); });
          server.on("error", (e2) => { if (e2.code !== "EADDRINUSE") reject(e2); });
        } else reject(err);
      };
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => { serverPort = server.address().port; resolve(serverPort); });
    };
    tryListen(STATIC_PORT, 20);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    title: "LinkVue 联视 · 跨境数据中台",
    show: false,
    backgroundColor: "#f7f8fa",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      spellcheck: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.once("ready-to-show", () => { win.show(); win.focus(); });

  win.loadURL(`http://127.0.0.1:${serverPort}/`);

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

// ---------- 应用菜单 ----------
function buildMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        { label: "重新加载", accelerator: "CmdOrCtrl+R", click: () => BrowserWindow.getFocusedWindow()?.reload() },
        { type: "separator" },
        { label: "退出", accelerator: "CmdOrCtrl+Q", click: () => app.quit() },
      ],
    },
    {
      label: "视图",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "检查更新…",
          click: () => {
            const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            if (win) win.webContents.send("updater:open-settings");
          },
        },
        { type: "separator" },
        {
          label: "关于",
          click: () => dialog.showMessageBox({
            type: "info",
            title: "关于",
            message: "LinkVue 联视 · 跨境全链路可视化数据中台",
            detail: `版本 ${app.getVersion()}\n多平台订单 · 海外仓 · 海运头程 · 尾程价卡一体化可视化中台\n\n技术栈：Next.js + Three.js + MapLibre GL JS + Electron`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// IPC：选择文件（为将来导入功能预留）
ipcMain.handle("choose-file", async () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [
      { name: "表格文件", extensions: ["xlsx", "xls", "csv"] },
      { name: "GeoJSON", extensions: ["json", "geojson"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

// ---------- 生命周期 ----------
app.whenReady().then(async () => {
  try {
    await startServer();
  } catch (e) {
    dialog.showErrorBox("启动失败", "本地服务启动失败：" + String(e));
    return app.quit();
  }
  buildMenu();
  updater.init();
  createWindow();
  updater.autoCheckOnLaunch();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (server) server.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => { if (server) server.close(); });
