import { Button } from './components/ui/button';
import { Progress } from './components/ui/progress';
import { useState, useRef, useEffect } from 'react';

interface Token {
  text: string;
  start: number;
  end: number;
}

function App(): JSX.Element {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string>('');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [isWhisperReady, setIsWhisperReady] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if Whisper is ready
  useEffect(() => {
    const checkWhisperStatus = async () => {
      console.log('Checking Whisper status...');
      try {
        if (!window.api) {
          console.log('API not available yet');
          return;
        }
        const ready = await window.api.isWhisperReady();

        if (ready) {
          setIsWhisperReady(ready);
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error checking Whisper status:', error);
      }
    };

    // Run immediately and then every second
    checkWhisperStatus();
    const interval = setInterval(checkWhisperStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup audio URL when component unmounts or when audioBlob changes
  useEffect(() => {
    if (audioBlob) {
      console.log('Creating URL from blob:', audioBlob);
      const url = URL.createObjectURL(audioBlob);
      console.log('Created URL:', url);
      setAudioURL(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [audioBlob]);

  // Add progress event listener
  useEffect(() => {
    if (!window.api) return;

    const handleProgress = (progress: number) => {
      console.log('Transcription progress:', progress);
      setTranscriptionProgress(progress * 100);
    };

    window.api.onTranscriptionProgress(handleProgress);

    return () => {
      window.api.offTranscriptionProgress(handleProgress);
    };
  }, []);

  const startRecording = async () => {
    try {
      console.log('Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');

      // Reset state
      setAudioBlob(null);
      setAudioURL(null);
      setTranscription('');
      chunksRef.current = [];

      const options = { mimeType: 'audio/webm;codecs=opus' };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        console.log('Data available:', e.data.size, 'bytes');
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('Recording stopped, chunks:', chunksRef.current.length);
        if (chunksRef.current.length > 0) {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
          console.log('Created blob:', blob.size, 'bytes');
          setAudioBlob(blob);
          transcribeAudio(blob);
        } else {
          console.error('No audio data collected');
        }
      };

      // Start recording with 100ms timeslices to ensure regular ondataavailable events
      mediaRecorder.start(100);
      console.log('Recording started');
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping recording...');
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => {
        track.stop();
        console.log('Track stopped:', track.kind);
      });
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    if (!isWhisperReady) {
      console.error('Whisper is not ready yet');
      return;
    }

    try {
      setIsTranscribing(true);
      setTranscriptionProgress(0);
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const result = await window.api.transcribeAudio(uint8Array);
      setTranscription(result.text);
      setTokens(result.tokens);
    } catch (error) {
      console.error('Transcription error:', error);
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress(0);
    }
  };

  const formatTime = (seconds: number): string => {
    if (typeof seconds !== 'number' || isNaN(seconds)) {
      return '00:00';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('video/mp4')) {
      alert('Please upload an MP4 file');
      return;
    }

    setSelectedFile(file);
    setAudioBlob(null);
    setAudioURL(null);
    setTranscription('');
    setTokens([]);
    setTranscriptionProgress(0);

    try {
      setIsTranscribing(true);
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const result = await window.api.transcribeAudio(uint8Array);
      setTranscription(result.text);
      setTokens(result.tokens);
    } catch (error) {
      console.error('Transcription error:', error);
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress(0);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  console.log('audioURL', audioURL);

  return (
    <div className="container mx-auto p-4 max-w-md">
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Audio Recorder</h1>
          {!isWhisperReady && (
            <div className="mb-4">
              <p className="text-sm text-yellow-600">Initializing Whisper model...</p>
            </div>
          )}
          <div className="space-y-2">
            <Button
              variant={isRecording ? 'destructive' : 'default'}
              onClick={isRecording ? stopRecording : startRecording}
              className="w-full"
              disabled={!isWhisperReady}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Button>

            <input
              type="file"
              accept="video/mp4"
              onChange={handleFileUpload}
              className="hidden"
              ref={fileInputRef}
            />
            <Button
              variant="outline"
              onClick={triggerFileUpload}
              className="w-full"
              disabled={!isWhisperReady || isRecording}
            >
              Upload MP4 File
            </Button>
            {selectedFile && (
              <p className="text-sm text-gray-500">Selected file: {selectedFile.name}</p>
            )}
          </div>
        </div>

        {audioURL && (
          <div className="mt-4">
            <h2 className="text-lg font-semibold mb-2">Recorded Audio</h2>
            <audio controls className="w-full" src={audioURL} key={audioURL} />
          </div>
        )}

        {isTranscribing && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-gray-500">Transcribing audio...</p>
            <Progress value={transcriptionProgress} className="w-full" />
            <p className="text-xs text-gray-500 text-center">
              {Math.round(transcriptionProgress)}% complete
            </p>
          </div>
        )}

        {transcription && (
          <div className="mt-4 space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">Full Transcription</h2>
              <div className="p-4 bg-gray-100 rounded-lg">
                <p>{transcription}</p>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">Sentences with Timestamps</h2>
              <div className="p-4 bg-gray-100 rounded-lg space-y-2">
                {tokens.map((token, index) => (
                  <div key={index} className="flex items-start space-x-2 text-sm">
                    <span className="font-mono text-gray-500 whitespace-nowrap">
                      {formatTime(token.start)} - {formatTime(token.end)}
                    </span>
                    <span className="flex-1">{token.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
