import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, ExitInfo, isValidInput, isValidResize } from './shared';

type DataHandler = (data: string) => void;
type ExitHandler = (info: ExitInfo) => void;

// Narrow, validated bridge. The renderer has no Node access and can only
// send terminal input/resize and receive terminal data/exit through these
// five functions. Invalid payloads are dropped here and again in main.
contextBridge.exposeInMainWorld('tiyeTerminal', {
  ready(): void {
    ipcRenderer.send(CHANNELS.READY);
  },
  onData(cb: DataHandler): void {
    ipcRenderer.on(CHANNELS.DATA, (_event, data: unknown) => {
      if (typeof data === 'string') cb(data);
    });
  },
  onExit(cb: ExitHandler): void {
    ipcRenderer.on(CHANNELS.EXIT, (_event, info: unknown) => {
      if (
        typeof info === 'object' &&
        info !== null &&
        typeof (info as ExitInfo).exitCode === 'number'
      ) {
        cb(info as ExitInfo);
      }
    });
  },
  sendInput(data: string): void {
    if (isValidInput(data)) ipcRenderer.send(CHANNELS.INPUT, data);
  },
  resize(cols: number, rows: number): void {
    if (isValidResize({ cols, rows })) ipcRenderer.send(CHANNELS.RESIZE, { cols, rows });
  },
});
