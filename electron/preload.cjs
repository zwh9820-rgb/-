// 安全桥接：仅暴露更新相关的最小 IPC 接口，不开放 Node 能力
const { contextBridge, ipcRenderer } = require("electron");

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
