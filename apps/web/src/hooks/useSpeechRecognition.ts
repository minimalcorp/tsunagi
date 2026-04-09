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

// 前回と今回のテキストの共通プレフィックス長を返す
const commonPrefixLength = (a: string, b: string): number => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

export const useSpeechRecognition = ({
  editorRef,
}: UseSpeechRecognitionProps): UseSpeechRecognitionReturn => {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isStartingRef = useRef(false);

  // 現在 editor に書き込まれている interim テキストとその開始オフセット
  // line/column ではなくモデルの文字オフセットで管理することで変換の誤差を排除する
  const interimTextRef = useRef('');
  const interimStartOffsetRef = useRef(0);

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
      const editorInstance = editorRef.current;
      if (!editorInstance) return;

      const model = editorInstance.getModel();
      if (!model) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Web Speech API は transcript の先頭に半角スペースを付けることがあるため除去する
        const transcript = result[0].transcript.trimStart();
        const prevInterimText = interimTextRef.current;

        // フレーズ先頭（prevInterimText が空）のとき、isFinal 後にユーザーがカーソルを
        // 移動していた場合に追従する。エディタの実際のカーソル位置を開始位置として採用する。
        if (prevInterimText === '') {
          const cursorPos = editorInstance.getPosition();
          if (cursorPos) {
            interimStartOffsetRef.current = model.getOffsetAt(cursorPos);
          }
        }

        const startOffset = interimStartOffsetRef.current;

        // 前回との共通プレフィックスを求め、差分部分だけを editor に適用する
        // これによりカーソルは常に変更箇所の末尾（前進方向）に留まる
        const prefixLen = commonPrefixLength(prevInterimText, transcript);
        const deleteFrom = startOffset + prefixLen;
        // prevInterimText が '' の場合は deleteTo == deleteFrom になり挿入のみになる
        const deleteTo = startOffset + prevInterimText.length;
        const insertText = transcript.slice(prefixLen);

        const deleteFromPos = model.getPositionAt(deleteFrom);
        const deleteToPos = model.getPositionAt(deleteTo);

        editorInstance.executeEdits('speech-recognition', [
          {
            range: {
              startLineNumber: deleteFromPos.lineNumber,
              startColumn: deleteFromPos.column,
              endLineNumber: deleteToPos.lineNumber,
              endColumn: deleteToPos.column,
            },
            text: insertText,
            forceMoveMarkers: true,
          },
        ]);

        // executeEdits 後のモデルから末尾位置を計算してカーソルを設定する
        const newEndOffset = startOffset + transcript.length;
        const newEndPos = model.getPositionAt(newEndOffset);
        editorInstance.setPosition(newEndPos);

        if (result.isFinal) {
          // 次フレーズの開始オフセット = 確定テキストの末尾
          interimStartOffsetRef.current = newEndOffset;
          interimTextRef.current = '';
        } else {
          interimTextRef.current = transcript;
        }
      }

      editorInstance.focus();
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

    // 音声入力開始時のカーソル位置をオフセットとして記録
    const model = editor?.getModel();
    const position = editor?.getPosition();
    if (model && position) {
      interimStartOffsetRef.current = model.getOffsetAt(position);
    } else {
      interimStartOffsetRef.current = 0;
    }
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
