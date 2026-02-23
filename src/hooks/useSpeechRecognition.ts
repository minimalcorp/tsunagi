'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { editor } from 'monaco-editor';

// Web Speech API型定義
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
  isFinal?: boolean;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface UseSpeechRecognitionProps {
  editorRef: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
}

interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
}

export const useSpeechRecognition = ({
  editorRef,
}: UseSpeechRecognitionProps): UseSpeechRecognitionReturn => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isStartingRef = useRef(false);

  // 現在 editor に書き込まれている interim テキストとその開始位置
  // startListening 時にカーソル位置で初期化し、onresult で更新する
  const interimTextRef = useRef('');
  const interimStartLineRef = useRef(1);
  const interimStartColumnRef = useRef(1);

  // ブラウザのSpeechRecognitionサポート判定（初期化時のみ）
  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognitionAPI;

  // SpeechRecognition初期化
  useEffect(() => {
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const editor = editorRef.current;
      if (!editor) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        const interimText = interimTextRef.current;
        const startLine = interimStartLineRef.current;
        const startColumn = interimStartColumnRef.current;

        // 現在の interim 範囲を transcript で置換（interim/final 共通）
        editor.executeEdits('speech-recognition', [
          {
            range: {
              startLineNumber: startLine,
              startColumn: startColumn,
              endLineNumber: startLine,
              endColumn: startColumn + interimText.length,
            },
            text: transcript,
          },
        ]);

        if (result.isFinal) {
          // executeEdits 後の実際のカーソル位置を次のフレーズ開始位置とする
          // （計算値ではなく Monaco が管理する実際の位置を使うことでズレを防ぐ）
          const pos = editor.getPosition();
          interimStartLineRef.current = pos?.lineNumber ?? startLine;
          interimStartColumnRef.current = pos?.column ?? startColumn + transcript.length;
          interimTextRef.current = '';
        } else {
          // interim テキストを更新
          interimTextRef.current = transcript;

          // カーソルを末尾に移動
          editor.setPosition({
            lineNumber: startLine,
            column: startColumn + transcript.length,
          });
        }
      }

      editor.focus();
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech') return;
      console.error('Speech recognition error:', event.error);
      isStartingRef.current = false;
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      isStartingRef.current = false;
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [editorRef, SpeechRecognitionAPI]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    const editor = editorRef.current;
    if (!recognition || isListening || isStartingRef.current) return;

    // 音声入力開始時のカーソル位置を記録
    const position = editor?.getPosition();
    interimStartLineRef.current = position?.lineNumber ?? 1;
    interimStartColumnRef.current = position?.column ?? 1;
    interimTextRef.current = '';

    try {
      isStartingRef.current = true;
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      isStartingRef.current = false;

      if (error instanceof Error && error.message.includes('already started')) {
        try {
          recognition.stop();
          setTimeout(() => {
            if (recognitionRef.current && !isListening) {
              try {
                isStartingRef.current = true;
                recognitionRef.current.start();
                setIsListening(true);
              } catch (retryError) {
                console.error('Failed to restart speech recognition:', retryError);
                isStartingRef.current = false;
              }
            }
          }, 100);
        } catch (stopError) {
          console.error('Failed to stop speech recognition:', stopError);
        }
      }
    }
  }, [isListening, editorRef]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !isListening) return;

    try {
      recognition.stop();
    } catch (error) {
      console.error('Failed to stop speech recognition:', error);
      setIsListening(false);
      isStartingRef.current = false;
    }
  }, [isListening]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
  };
};
