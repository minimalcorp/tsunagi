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
  const interimPositionRef = useRef<{ line: number; column: number } | null>(null);
  const lastInterimLengthRef = useRef(0);

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

        if (result.isFinal) {
          // 最終結果: 中間結果をクリアして確定テキストを挿入
          if (interimPositionRef.current) {
            // 中間結果があれば削除して確定結果を挿入
            const range = {
              startLineNumber: interimPositionRef.current.line,
              startColumn: interimPositionRef.current.column,
              endLineNumber: interimPositionRef.current.line,
              endColumn: interimPositionRef.current.column + lastInterimLengthRef.current,
            };

            editor.executeEdits('speech-recognition', [
              {
                range,
                text: transcript,
              },
            ]);

            // カーソル位置を更新
            editor.setPosition({
              lineNumber: interimPositionRef.current.line,
              column: interimPositionRef.current.column + transcript.length,
            });

            // リセット
            interimPositionRef.current = null;
            lastInterimLengthRef.current = 0;
          } else {
            // 中間結果がない場合（最初の確定結果）
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

              editor.setPosition({
                lineNumber: position.lineNumber,
                column: position.column + transcript.length,
              });
            }
          }
        } else {
          // 中間結果: 一時的に表示
          if (!interimPositionRef.current) {
            // 初回: 現在のカーソル位置を保存
            const pos = editor.getPosition();
            if (pos) {
              interimPositionRef.current = { line: pos.lineNumber, column: pos.column };
            }
          }

          if (interimPositionRef.current) {
            // 前回の中間結果を削除して新しい中間結果を挿入
            const range = {
              startLineNumber: interimPositionRef.current.line,
              startColumn: interimPositionRef.current.column,
              endLineNumber: interimPositionRef.current.line,
              endColumn: interimPositionRef.current.column + lastInterimLengthRef.current,
            };

            editor.executeEdits('speech-recognition', [
              {
                range,
                text: transcript,
              },
            ]);

            lastInterimLengthRef.current = transcript.length;

            // カーソル位置を中間テキストの末尾に移動
            editor.setPosition({
              lineNumber: interimPositionRef.current.line,
              column: interimPositionRef.current.column + transcript.length,
            });
          }
        }

        // フォーカスを維持
        editor.focus();
      };

      // エラーハンドラー
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        isStartingRef.current = false;
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
        isStartingRef.current = false;
        // 中間結果のクリーンアップ
        interimPositionRef.current = null;
        lastInterimLengthRef.current = 0;
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
    if (!recognition || isListening || isStartingRef.current) return;

    try {
      isStartingRef.current = true;
      recognition.start();
      setIsListening(true);
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      isStartingRef.current = false;

      // already started エラーの場合、一度停止してから再開
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
  }, [isListening]);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !isListening) return;

    try {
      recognition.stop();
      // onend で setIsListening(false) が呼ばれるのを待つ
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
