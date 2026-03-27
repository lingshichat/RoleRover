import { contextBridge, ipcRenderer } from 'electron';

const secureSettings = {
  get: (key) => ipcRenderer.invoke('desktop:secure-setting:get', key),
  set: (key, value) => ipcRenderer.invoke('desktop:secure-setting:set', key, value),
  delete: (key) => ipcRenderer.invoke('desktop:secure-setting:delete', key),
  getItem: (key) => ipcRenderer.invoke('desktop:secure-setting:get', key),
  setItem: (key, value) => ipcRenderer.invoke('desktop:secure-setting:set', key, value),
  removeItem: (key) => ipcRenderer.invoke('desktop:secure-setting:delete', key),
};

const desktopApi = {
  isDesktop: true,
  getAppInfo: () => ipcRenderer.invoke('desktop:get-app-info'),
  secureSettings,
};

contextBridge.exposeInMainWorld('roleRoverDesktop', desktopApi);
contextBridge.exposeInMainWorld('electron', desktopApi);
