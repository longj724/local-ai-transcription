import { ElectronAPI } from '@electron-toolkit/preload'

interface Token {
  text: string
  start: number
  end: number
}

interface TranscriptionAPI {
  transcribeAudio: (audioData: Uint8Array) => Promise<{ text: string; tokens: Token[] }>
  isWhisperReady: () => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TranscriptionAPI
  }
}
