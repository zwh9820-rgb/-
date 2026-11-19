// 文件中心主进程能力：选目录、递归扫描、读取预览、打开文件/所在文件夹。
// 安全约束：所有读取/打开操作必须落在已登记的根目录内（roots 由渲染层从持久化配置传入），
// 防止借此访问系统任意文件。
const { ipcMain, dialog, shell, BrowserWindow } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

// 常见文档/图片/文本后缀，扫描时纳入索引；其余忽略（避免索引系统文件）
const INCLUDE_EXT = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt", ".md", ".json",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".zip", ".rar", ".7z",
]);

function isInside(root, target) {
  try {
    const r = path.resolve(root);
    const t = path.resolve(target);
    return t === r || t.startsWith(r + path.sep);
  } catch { return false; }
}

function checkAllowed(target, roots) {
  if (!Array.isArray(roots) || !roots.length) return false;
  return roots.some((r) => isInside(r, target));
}

/**
 * 递归扫描目录，返回文件条目数组。
 * @param {string[]} roots 允许访问的根目录
 */
async function scanOne(dir, roots, out, depth) {
  if (depth > 8) return;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue; // 跳过隐藏文件/目录
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await scanOne(full, roots, out, depth + 1);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (!INCLUDE_EXT.has(ext)) continue;
      try {
        const st = await fsp.stat(full);
        out.push({
          path: full,
          name: e.name,
          ext,
          size: st.size,
          mtime: st.mtimeMs,
          root: roots.find((r) => isInside(r, full)) || dir,
        });
      } catch { /* 跳过无法 stat 的文件 */ }
    }
  }
}

function registerFileCenterIPC() {
  // 选择文件夹（网盘同步目录或本地硬盘目录）
  ipcMain.handle("file:choose-folder", async () => {
    const win = require("electron").BrowserWindow.getFocusedWindow();
    const opts = { properties: ["openDirectory"] };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return result.canceled ? null : result.filePaths[0];
  });

  // 校验目录是否存在
  ipcMain.handle("file:check-folder", async (_e, folder) => {
    try {
      const st = await fsp.stat(folder);
      return { ok: st.isDirectory() };
    } catch { return { ok: false }; }
  });

  // 扫描一批根目录（用于全局搜索索引）
  ipcMain.handle("file:scan", async (_e, roots) => {
    const out = [];
    for (const r of (roots || [])) await scanOne(r, roots, out, 0);
    // 去重 + 按修改时间倒序
    const seen = new Set();
    return out.filter((f) => !seen.has(f.path) && seen.add(f.path)).sort((a, b) => b.mtime - a.mtime);
  });

  // 列出某个目录下的一级子项（NAS 式浏览：文件夹优先，然后文件）
  // 返回 { dir, folders:[{path,name,mtime}], files:[ScannedFile] }
  ipcMain.handle("file:list-dir", async (_e, dir, roots) => {
    if (!checkAllowed(dir, roots)) return { error: "路径不在已配置的目录内" };
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const folders = [];
      const files = [];
      for (const e of entries) {
        if (e.name.startsWith(".")) continue; // 跳过隐藏项
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          let mtime = 0;
          try { mtime = (await fsp.stat(full)).mtimeMs; } catch {}
          folders.push({ path: full, name: e.name, isDir: true, mtime });
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (!INCLUDE_EXT.has(ext)) continue;
          try {
            const st = await fsp.stat(full);
            files.push({ path: full, name: e.name, ext, size: st.size, mtime: st.mtimeMs, root: roots.find((r) => isInside(r, full)) || dir });
          } catch {}
        }
      }
      folders.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
      return { dir, folders, files };
    } catch (e) { return { error: "读取目录失败：" + String(e) }; }
  });

  // 读取文件用于预览：返回 { kind, mime, data }
  // kind: text | base64
  ipcMain.handle("file:read", async (_e, filePath, roots) => {
    if (!checkAllowed(filePath, roots)) return { error: "路径不在已配置的目录内" };
    try {
      const ext = path.extname(filePath).toLowerCase();
      const textExt = new Set([".txt", ".md", ".csv", ".json", ".geojson", ".svg"]);
      if (textExt.has(ext)) {
        const data = await fsp.readFile(filePath, "utf8");
        return { kind: "text", data: data.slice(0, 2_000_000), mime: "text/plain; charset=utf-8" };
      }
      if (ext === ".pdf") {
        const buf = await fsp.readFile(filePath);
        return { kind: "base64", data: buf.toString("base64"), mime: "application/pdf" };
      }
      if ([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"].includes(ext)) {
        const buf = await fsp.readFile(filePath);
        const mime = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".bmp": "image/bmp", ".webp": "image/webp" }[ext];
        return { kind: "base64", data: buf.toString("base64"), mime };
      }
      // 其他类型（Word/Excel/PPT/压缩包等）不支持内嵌预览，提示用系统程序打开
      return { error: "UNPREVIEWABLE" };
    } catch (e) { return { error: "读取失败：" + String(e) }; }
  });

  // PDF 在线预览：data: URL 在 Electron/Chromium 中无法启动内置 PDF 查看器（会白屏），
  // 因此用独立窗口 loadFile 加载本地文件，交给 Electron 内置 PDF 查看器渲染。
  ipcMain.handle("file:preview-pdf", async (_e, filePath, roots, displayName) => {
    if (!checkAllowed(filePath, roots)) return { ok: false, error: "路径不在已配置的目录内" };
    try {
      const win = new BrowserWindow({
        width: 1040, height: 820,
        title: displayName || path.basename(filePath),
        backgroundColor: "#1e1e1e",
        webPreferences: { nodeIntegration: false, contextIsolation: true, plugins: true },
      });
      await win.loadFile(filePath);
      return { ok: true };
    } catch (e) { return { ok: false, error: "PDF 预览失败：" + String(e) }; }
  });

  // 用系统默认程序打开文件
  ipcMain.handle("file:open", async (_e, filePath, roots) => {
    if (!checkAllowed(filePath, roots)) return { ok: false, error: "路径不在已配置的目录内" };
    try { await shell.openPath(filePath); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  // 在资源管理器中定位文件
  ipcMain.handle("file:reveal", async (_e, filePath, roots) => {
    if (!checkAllowed(filePath, roots)) return { ok: false, error: "路径不在已配置的目录内" };
    try { shell.showItemInFolder(filePath); return { ok: true }; }
    catch (e) { return { ok: false, error: String(e) }; }
  });

  // 另存为（其他主机下载/拷贝文件到本地）
  ipcMain.handle("file:save-as", async (_e, filePath, roots) => {
    if (!checkAllowed(filePath, roots)) return { ok: false, error: "路径不在已配置的目录内" };
    try {
      const win = require("electron").BrowserWindow.getFocusedWindow();
      const opts = { defaultPath: path.basename(filePath), properties: ["showOverwriteConfirmation"] };
      const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
      if (result.canceled || !result.filePath) return { ok: false, canceled: true };
      await fsp.copyFile(filePath, result.filePath);
      return { ok: true, savedTo: result.filePath };
    } catch (e) { return { ok: false, error: String(e) }; }
  });
}

module.exports = { registerFileCenterIPC, isInside };
