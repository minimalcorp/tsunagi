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

  // ブラウザのSpeechRecognitionサポート判定（初期化時のみ）
  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognitionAPI;

  // SpeechRecognition初期化
  useEffect(() => {

    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'ja-JP';

      // 認識結果のハンドラー
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const editor = editorRef.current;
        if (!editor) return;

        // 最新の結果を取得
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript;

        // 確定した結果のみエディタに挿入
        if (result.isFinal) {
          const position = editor.getPosition();
          if (position) {
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            };

            editor.executeEdits('speech-recognition', [
              {
                range,
                text: transcript,
              },
            ]);

            // カーソルを挿入したテキストの末尾に移動
            const newColumn = position.column + transcript.length;
            editor.setPosition({
              lineNumber: position.lineNumber,
              column: newColumn,
            });

            // フォーカスを維持
            editor.focus();
          }
        }
      };

      // エラーハンドラー
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech' || event.error === 'aborted') {
          // ユーザーが話していない、または中断された場合は自動的に停止
          setIsListening(false);
        } else if (event.error === 'not-allowed') {
          // マイクの許可が拒否された
          console.error('Microphone permission denied');
          setIsListening(false);
        }
      };

      // 認識終了ハンドラー
      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [editorRef, SpeechRecognitionAPI]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || isListening) return;

    try {
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !isListening) return;

    try {
      recognition.stop();
      setIsListening(false);
    } catch (error) {
      console.error('Failed to stop speech recognition:', error);
    }
  }, [isListening]);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
  };
};
