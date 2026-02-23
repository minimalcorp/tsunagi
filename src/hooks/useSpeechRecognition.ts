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
  const isListeningRef = useRef(false);

  // 各resultインデックスに対応する位置を管理
  const finalResultsMapRef = useRef<Map<number, ResultPosition>>(new Map());
  const interimResultsMapRef = useRef<Map<number, ResultPosition>>(new Map());

  // ブラウザのSpeechRecognitionサポート判定（マウント時のみ評価）
  // SSR 時は undefined、クライアント時は API コンストラクタを初期値として保持
  const SpeechRecognitionAPIRef = useRef(
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined
  );

  // isSupported は初期値を固定し、レンダー中に ref.current を読まない
  const [isSupported] = useState(
    typeof window !== 'undefined' && !!(window.SpeechRecognition ?? window.webkitSpeechRecognition)
  );

  // SpeechRecognition初期化（マウント時のみ）
  useEffect(() => {
    const SpeechRecognitionAPI = SpeechRecognitionAPIRef.current;
    console.log('[SR] useEffect run, SpeechRecognitionAPI:', !!SpeechRecognitionAPI);
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    console.log('[SR] recognition instance created:', recognition);
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ja-JP';

    // 挿入位置を計算するヘルパー（useEffect内にインライン化）
    const calculateInsertPosition = (resultIndex: number): { line: number; column: number } => {
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
    };

    // 認識開始ハンドラー（デバッグ用）
    (recognition as SpeechRecognition & { onstart: (() => void) | null }).onstart = () => {
      console.log('[SR] onstart fired - recognition is active');
    };

    // 認識結果のハンドラー
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      console.log('[SR] onresult fired, resultIndex:', event.resultIndex, 'results.length:', event.results.length);
      const editor = editorRef.current;
      console.log('[SR] editor:', !!editor);
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
      console.log('[SR] onerror:', event.error);
      if (event.error === 'no-speech') {
        // continuous モードでは一時的に音声が検出されなかっただけ。セッション継続
        return;
      }
      console.error('Speech recognition error:', event.error);
      isStartingRef.current = false;
      // not-allowed: マイク許可拒否、audio-capture: マイクなし など致命的なエラーは停止
      setIsListening(false);
    };

    // 認識終了ハンドラー
    recognition.onend = () => {
      console.log('[SR] onend fired, isListeningRef:', isListeningRef.current);
      isStartingRef.current = false;

      if (isListeningRef.current) {
        // ユーザーが意図的に停止していない場合、少し待って再起動
        // 即時再起動するとブラウザが no-speech ループに入るため遅延させる
        setTimeout(() => {
          if (isListeningRef.current && recognitionRef.current) {
            console.log('[SR] restarting recognition...');
            try {
              recognitionRef.current.start();
            } catch {
              isListeningRef.current = false;
              setIsListening(false);
              finalResultsMapRef.current.clear();
              interimResultsMapRef.current.clear();
            }
          }
        }, 300);
        return;
      }

      // stopListening によって意図的に止めた場合
      setIsListening(false);
      finalResultsMapRef.current.clear();
      interimResultsMapRef.current.clear();
    };

    recognitionRef.current = recognition;
    console.log('[SR] recognitionRef set, instance id:', recognition);

    // クリーンアップ時に ref.current を直接参照しないよう変数にコピー
    const finalResultsMap = finalResultsMapRef.current;
    const interimResultsMap = interimResultsMapRef.current;

    return () => {
      console.log('[SR] cleanup called');
      // ハンドラーを先に無効化してから abort することで、
      // abort 後に発火する可能性のある onend/onerror の副作用を防ぐ
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
      // 状態もリセット（onend が呼ばれないためここでリセット）
      isListeningRef.current = false;
      setIsListening(false);
      isStartingRef.current = false;
      finalResultsMap.clear();
      interimResultsMap.clear();
    };
  }, [editorRef]);

  const startListening = useCallback(() => {
    const recognition = recognitionRef.current;
    console.log('[SR] startListening called, recognition:', !!recognition, 'isListening:', isListeningRef.current, 'isStarting:', isStartingRef.current);
    if (!recognition || isListeningRef.current || isStartingRef.current) return;

    try {
      isStartingRef.current = true;
      isListeningRef.current = true; // setIsListening より先に同期的にフラグを立てる
      recognition.start();
      setIsListening(true);
      console.log('[SR] recognition.start() called');
    } catch (error) {
      console.error('Failed to start speech recognition:', error);
      isStartingRef.current = false;
      isListeningRef.current = false;

      // already started エラーの場合、一度停止してから再開
      if (error instanceof Error && error.message.includes('already started')) {
        try {
          recognition.stop();
          setTimeout(() => {
            if (recognitionRef.current && !isListeningRef.current) {
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
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition || !isListeningRef.current) return;

    // onend での再起動を抑制するために先にフラグを下げる
    isListeningRef.current = false;
    setIsListening(false);

    try {
      recognition.stop();
    } catch (error) {
      console.error('Failed to stop speech recognition:', error);
      isStartingRef.current = false;
    }
  }, []);

  return {
    isListening,
    isSupported,
    startListening,
    stopListening,
  };
};
