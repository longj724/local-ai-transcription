import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { downloadWhisperModel, installWhisperCpp, transcribe } from '@remotion/install-whisper-cpp';
import ffmpeg from 'fluent-ffmpeg';

let isWhisperInitialized = false;
const whisperPath = path.join(app.getPath('userData'), 'whisper.cpp');

// Convert audio to WAV format
function convertToWav(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(tmpdir(), `${Date.now()}.wav`);

    ffmpeg(inputPath)
      .toFormat('wav')
      .audioFrequency(16000) // Required by Whisper
      .on('end', () => {
        // Clean up input file and resolve with output path
        try {
          unlinkSync(inputPath);
        } catch (error) {
          console.error('Error cleaning up input file:', error);
        }
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      })
      .save(outputPath);
  });
}

function timestampToSeconds(timestamp: string): number {
  try {
    const [time, ms] = timestamp.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + parseInt(ms) / 1000;
  } catch (error) {
    console.error('Error parsing timestamp:', timestamp, error);
    return 0;
  }
}

async function initWhisper(): Promise<void> {
  try {
    console.log('Starting Whisper initialization...');
    await installWhisperCpp({
      to: whisperPath,
      version: '1.5.5'
    });

    await downloadWhisperModel({
      model: 'medium.en',
      folder: whisperPath
    });

    isWhisperInitialized = true;
    console.log('Whisper model loaded successfully');
  } catch (error) {
    console.error('Error loading Whisper model:', error);
    isWhisperInitialized = false;
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Set up IPC handlers for this window
  ipcMain.handle('is-whisper-ready', () => {
    console.log('Checking Whisper ready status:', isWhisperInitialized);
    return isWhisperInitialized;
  });

  ipcMain.handle('transcribe-audio', async (_, audioData: Uint8Array) => {
    if (!isWhisperInitialized) {
      throw new Error('Whisper model not initialized. Please wait for initialization to complete.');
    }

    let tempWebmFile: string | null = null;
    let tempWavFile: string | null = null;

    try {
      // Save WebM file
      tempWebmFile = path.join(tmpdir(), `recording-${Date.now()}.webm`);
      writeFileSync(tempWebmFile, Buffer.from(audioData));
      console.log('Saved WebM file:', tempWebmFile);

      // Convert to WAV
      console.log('Converting to WAV...');
      tempWavFile = await convertToWav(tempWebmFile);
      console.log('Converted to WAV:', tempWavFile);

      console.log('Starting transcription...');
      // Transcribe the audio with word-level timestamps
      const result = await transcribe({
        model: 'medium.en',
        whisperPath,
        inputPath: tempWavFile,
        tokenLevelTimestamps: true,
        language: 'en',
        onProgress: (progress) => {
          console.log('Transcription progress:', progress);
          mainWindow.webContents.send('transcription-progress', progress);
        }
      });

      // Get the transcription from the result
      const { transcription } = result;

      // Group tokens into sentences
      let currentSentence: typeof transcription = [];
      const sentences: Array<{
        text: string;
        start: number;
        end: number;
      }> = [];

      transcription.forEach((token, index) => {
        currentSentence.push(token);

        // Check if this token ends a sentence (period, exclamation, or question mark)
        // or if it's the last token
        if (token.text.trim().match(/[.!?]$/) || index === transcription.length - 1) {
          // Calculate start time from first token in sentence
          const startToken = currentSentence[0]?.timestamps;
          const endToken = token.timestamps;
          const start = startToken?.from ? timestampToSeconds(startToken.from) : 0;
          const end = endToken?.to ? timestampToSeconds(endToken.to) : 0;

          // Combine all tokens in the sentence
          const text = currentSentence
            .map((t) => t.text)
            .join('')
            .trim()
            .replace(/\s+/g, ' '); // Replace multiple spaces with single space

          if (text) {
            sentences.push({
              text,
              start: Math.round(start),
              end: Math.round(end)
            });
          }

          // Reset current sentence
          currentSentence = [];
        }
      });

      // Get the full text
      const text = sentences.map((s) => s.text).join(' ');

      console.log('Processed sentences:', JSON.stringify(sentences, null, 2));

      return {
        text,
        tokens: sentences
      };
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    } finally {
      // Clean up temporary files
      try {
        if (tempWavFile) {
          unlinkSync(tempWavFile);
        }
      } catch (error) {
        console.error('Error cleaning up temporary files:', error);
      }
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  console.log('App ready, initializing...');
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Initialize Whisper before creating the window
  await initWhisper();

  // Create window after initialization
  createWindow();

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
