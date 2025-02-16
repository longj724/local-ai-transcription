import { ElectronAPI } from '@electron-toolkit/preload';

interface Token {
  text: string;
  start: number;
  end: number;
}

interface TranscriptionAPI {
  transcribeAudio: (audioData: Uint8Array) => Promise<{ text: string; tokens: Token[] }>;
  isWhisperReady: () => Promise<boolean>;
  onTranscriptionProgress: (callback: (progress: number) => void) => void;
  offTranscriptionProgress: (callback: (progress: number) => void) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: TranscriptionAPI;
  }
}
