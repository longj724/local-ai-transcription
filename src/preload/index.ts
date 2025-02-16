import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

console.log('Preload script starting...');

// Custom APIs for renderer
const api = {
  transcribeAudio: async (
    audioData: Uint8Array
  ): Promise<{ text: string; tokens: { text: string; start: number; end: number }[] }> => {
    return await ipcRenderer.invoke('transcribe-audio', audioData);
  },
  isWhisperReady: async (): Promise<boolean> => {
    return await ipcRenderer.invoke('is-whisper-ready');
  },
  onTranscriptionProgress: (callback: (progress: number) => void) => {
    const listener = (_event: IpcRendererEvent, progress: number) => callback(progress);
    ipcRenderer.on('transcription-progress', listener);
  },
  offTranscriptionProgress: (callback: (progress: number) => void) => {
    const listener = (_event: IpcRendererEvent, progress: number) => callback(progress);
    ipcRenderer.removeListener('transcription-progress', listener);
  }
};

// Expose the API immediately when the script loads
contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('electron', electronAPI);

console.log('Preload script completed, API exposed');
