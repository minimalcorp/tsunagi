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

interface ResultPosition {
  position: { line: number; column: number };
  length: number;
}

export const useSpeechRecognition = ({
  editorRef,
}: UseSpeechRecognitionProps): UseSpeechRecognitionReturn => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isStartingRef = useRef(false);

  // 各resultインデックスに対応する位置を管理
  const finalResultsMapRef = useRef<Map<number, ResultPosition>>(new Map());
  const interimResultsMapRef = useRef<Map<number, ResultPosition>>(new Map());

  // ブラウザのSpeechRecognitionサポート判定（初期化時のみ）
  const SpeechRecognitionAPI =
    typeof window !== 'undefined'
      ? window.SpeechRecognition || window.webkitSpeechRecognition
      : undefined;

  const isSupported = !!SpeechRecognitionAPI;

  // 挿入位置を計算するヘルパー
  const calculateInsertPosition = useCallback(
    (resultIndex: number): { line: number; column: number } => {
      const editor = editorRef.current;
      if (!editor) return { line: 1, column: 1 };

      // 前の結果（最終 or 中間）の末尾位置を取得
      for (let i = resultIndex - 1; i >= 0; i--) {
        const finalData = finalResultsMapRef.current.get(i);
        if (finalData) {
          return {
            line: finalData.position.line,
            column: finalData.position.column + finalData.length,
          };
        }

        const interimData = interimResultsMapRef.current.get(i);
        if (interimData) {
          return {
            line: interimData.position.line,
            column: interimData.position.column + interimData.length,
          };
        }
      }

      // 前の結果がない場合、現在のカーソル位置
      const position = editor.getPosition();
      return position
        ? { line: position.lineNumber, column: position.column }
        : { line: 1, column: 1 };
    },
    [editorRef]
  );

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

        // resultIndexからループして処理
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;

          if (result.isFinal) {
            // 最終結果の処理
            const interimData = interimResultsMapRef.current.get(i);

            if (interimData) {
              // 中間結果を最終結果に置き換え
              const range = {
                startLineNumber: interimData.position.line,
                startColumn: interimData.position.column,
                endLineNumber: interimData.position.line,
                endColumn: interimData.position.column + interimData.length,
              };

              editor.executeEdits('speech-recognition', [
                {
                  range,
                  text: transcript,
                },
              ]);

              // finalResultsMapに登録
              finalResultsMapRef.current.set(i, {
                position: interimData.position,
                length: transcript.length,
              });

              // interimResultsMapから削除
              interimResultsMapRef.current.delete(i);
            } else {
              // 中間結果がない場合（最初から最終結果）
              const insertPosition = calculateInsertPosition(i);

              const range = {
                startLineNumber: insertPosition.line,
                startColumn: insertPosition.column,
                endLineNumber: insertPosition.line,
                endColumn: insertPosition.column,
              };

              editor.executeEdits('speech-recognition', [
                {
                  range,
                  text: transcript,
                },
              ]);

              finalResultsMapRef.current.set(i, {
                position: insertPosition,
                length: transcript.length,
              });
            }

            // カーソルを最終結果の末尾に移動
            const finalData = finalResultsMapRef.current.get(i);
            if (finalData) {
              editor.setPosition({
                lineNumber: finalData.position.line,
                column: finalData.position.column + finalData.length,
              });
            }
          } else {
            // 中間結果の処理
            const existingInterim = interimResultsMapRef.current.get(i);

            if (existingInterim) {
              // 既存の中間結果を上書き
              const range = {
                startLineNumber: existingInterim.position.line,
                startColumn: existingInterim.position.column,
                endLineNumber: existingInterim.position.line,
                endColumn: existingInterim.position.column + existingInterim.length,
              };

              editor.executeEdits('speech-recognition', [
                {
                  range,
                  text: transcript,
                },
              ]);

              interimResultsMapRef.current.set(i, {
                position: existingInterim.position,
                length: transcript.length,
              });
            } else {
              // 新しい中間結果
              const insertPosition = calculateInsertPosition(i);

              const range = {
                startLineNumber: insertPosition.line,
                startColumn: insertPosition.column,
                endLineNumber: insertPosition.line,
                endColumn: insertPosition.column,
              };

              editor.executeEdits('speech-recognition', [
                {
                  range,
                  text: transcript,
                },
              ]);

              interimResultsMapRef.current.set(i, {
                position: insertPosition,
                length: transcript.length,
              });
            }

            // カーソルを中間結果の末尾に移動
            const interimData = interimResultsMapRef.current.get(i);
            if (interimData) {
              editor.setPosition({
                lineNumber: interimData.position.line,
                column: interimData.position.column + interimData.length,
              });
            }
          }
        }

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
        // Mapをクリア
        finalResultsMapRef.current.clear();
        interimResultsMapRef.current.clear();
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [editorRef, SpeechRecognitionAPI, calculateInsertPosition]);

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
