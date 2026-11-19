// 安全桥接：仅暴露更新与文件中心相关的最小 IPC 接口，不开放 Node 能力
const { contextBridge, ipcRenderer } = require("electron");

// 文件中心：目录选择/扫描/预览/打开/另存。所有文件路径校验在主进程完成。
contextBridge.exposeInMainWorld("fileAPI", {
  chooseFolder: () => ipcRenderer.invoke("file:choose-folder"),
  checkFolder: (folder) => ipcRenderer.invoke("file:check-folder", folder),
  scan: (roots) => ipcRenderer.invoke("file:scan", roots),
  listDir: (dir, roots) => ipcRenderer.invoke("file:list-dir", dir, roots),
  read: (filePath, roots) => ipcRenderer.invoke("file:read", filePath, roots),
  previewPdf: (filePath, roots, name) => ipcRenderer.invoke("file:preview-pdf", filePath, roots, name),
  open: (filePath, roots) => ipcRenderer.invoke("file:open", filePath, roots),
  reveal: (filePath, roots) => ipcRenderer.invoke("file:reveal", filePath, roots),
  saveAs: (filePath, roots) => ipcRenderer.invoke("file:save-as", filePath, roots),
});

contextBridge.exposeInMainWorld("updaterAPI", {
  getInfo: () => ipcRenderer.invoke("updater:get-info"),
  getConfig: () => ipcRenderer.invoke("updater:get-config"),
  setConfig: (cfg) => ipcRenderer.invoke("updater:set-config", cfg),
  check: () => ipcRenderer.invoke("updater:check"),
  download: () => ipcRenderer.invoke("updater:download"),
  install: () => ipcRenderer.invoke("updater:install"),
  backup: (payload) => ipcRenderer.invoke("updater:backup", payload),
  onStatus: (callback) => {
    const listener = (_e, data) => callback(data);
    ipcRenderer.on("updater:status", listener);
    return () => ipcRenderer.removeListener("updater:status", listener);
  },
  onOpenSettings: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("updater:open-settings", listener);
    return () => ipcRenderer.removeListener("updater:open-settings", listener);
  },
  // 让渲染层把业务 localStorage 数据打包成对象，安装前交给主进程备份
  collectDataForBackup: () => {
    const data = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("cbh_")) data[key] = localStorage.getItem(key);
      }
    } catch { /* ignore */ }
    return data;
  },
});
