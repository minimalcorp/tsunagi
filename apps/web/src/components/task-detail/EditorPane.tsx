'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Editor, type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useSubmitOnSend } from '@/hooks/useTaskViewMode';
import { MONACO_IME_OPTIONS, MONACO_INDENT_OPTIONS } from '@/lib/monaco-options';
import { getFocusTarget, registerFocusTarget, setPaneFocusTarget } from '@/lib/focus-target';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

const DRAFT_AUTHORITY = 'tsunagi-draft';
const NO_TAB_DRAFT_ID = '__none__';

/** 下書きのモデルを識別する path。タブごとに別モデルにし、切り替えても内容・Undo 履歴を保つ */
function draftPath(draftId: string) {
  return `inmemory://${DRAFT_AUTHORITY}/${draftId}.md`;
}

interface EditorPaneProps {
  /** 下書きを持つタブ ID。未選択なら null */
  draftId: string | null;
  /** 存在するタブ ID。消えたタブの下書きモデルを破棄するのに使う */
  draftIds: string[];
  /** 送信先のタブが接続中か */
  canSend: boolean;
  /** アクティブなタブへ送信する。送信できたら true */
  onSend: (text: string, submit: boolean) => boolean;
}

/**
 * アクティブなタブへ送る Markdown を書くペイン。
 * 内容は Monaco のモデルが持つ（uncontrolled）。React の state で value を制御すると、
 * IME 変換中に古い value でモデル全体が書き換わり、変換が壊れるため。
 */
export function EditorPane({ draftId, draftIds, canSend, onSend }: EditorPaneProps) {
  const { effectiveTheme } = useTheme();
  const { submitOnSend, setSubmitOnSend } = useSubmitOnSend();
  // useMonaco() は読み込み前のアンマウントで未処理の reject を出すため、onMount で受け取る
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // 送信ボタンの活性判定にだけ使う。真偽値が変わらない限り再レンダーされない
  const [isEmpty, setIsEmpty] = useState(true);
  const readOnly = draftId === null;
  const isSendable = canSend && !isEmpty;

  function handleSend() {
    const instance = editorRef.current;
    const model = instance?.getModel();
    if (!instance || !model || !canSend) return;
    const text = model.getValue();
    if (text.trim() === '') return;
    if (!onSend(text, submitOnSend)) return;
    // Undo で戻せるよう setValue ではなく編集操作で消す
    instance.executeEdits('send', [{ range: model.getFullModelRange(), text: '' }]);
    instance.pushUndoStop();
  }

  // Monaco のキーハンドラはマウント時に一度だけ登録するため、最新の処理を ref で参照する
  const handleSendRef = useRef(handleSend);
  useLayoutEffect(() => {
    handleSendRef.current = handleSend;
  });

  useEffect(() => registerFocusTarget('editor', () => editorRef.current?.focus()), []);

  // 削除されたタブの下書きモデルを破棄する
  useEffect(() => {
    if (!monaco) return;
    // 表示中のモデルは、タブ切り替えが反映されるまで残す
    const alive = new Set([...draftIds, draftId ?? NO_TAB_DRAFT_ID].map(draftPath));
    for (const model of monaco.editor.getModels()) {
      if (model.uri.authority !== DRAFT_AUTHORITY) continue;
      if (!alive.has(model.uri.toString())) model.dispose();
    }
  }, [monaco, draftIds, draftId]);

  // 毎レンダーで新しいオブジェクトを渡すと、その都度 updateOptions が走るため固定する
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(
    () => ({
      ...MONACO_INDENT_OPTIONS,
      ...MONACO_IME_OPTIONS,
      minimap: { enabled: false },
      lineNumbers: 'on',
      wordWrap: 'on',
      fontSize: 13,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      readOnly,
    }),
    [readOnly]
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          defaultValue=""
          path={draftPath(draftId ?? NO_TAB_DRAFT_ID)}
          // 表示モードの切り替えでアンマウントされても下書きを残す
          keepCurrentModel
          onMount={(instance, monacoInstance) => {
            editorRef.current = instance;
            setMonaco(monacoInstance);
            const syncIsEmpty = () => setIsEmpty(instance.getValue().trim() === '');
            syncIsEmpty();
            instance.onDidChangeModelContent(syncIsEmpty);
            instance.onDidChangeModel(syncIsEmpty);
            instance.onDidFocusEditorText(() => setPaneFocusTarget('editor'));
            instance.onKeyDown((e) => {
              if (e.keyCode === monacoInstance.KeyCode.Enter && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.stopPropagation();
                handleSendRef.current();
              }
            });
            if (getFocusTarget() === 'editor') {
              // 表示直後は実サイズが未反映で focus が効かないため、先に layout する
              instance.layout();
              instance.focus();
            }
          }}
          options={options}
          theme={effectiveTheme === 'dark' ? 'vs-dark' : 'vs-light'}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 p-2 border-t border-border flex-shrink-0">
        <span className="mr-auto text-xs text-muted-foreground">
          {isMac ? 'Cmd+Enter' : 'Ctrl+Enter'} で送信
        </span>
        <label
          className="flex items-center gap-1.5 text-xs text-foreground cursor-pointer select-none"
          title="ON: 送信後に Enter を押して確定します。OFF: テキストを入力するだけで確定しません"
        >
          <input
            type="checkbox"
            checked={submitOnSend}
            onChange={(e) => setSubmitOnSend(e.target.checked)}
            className="size-3.5 accent-primary"
          />
          送信後にEnter
        </label>
        <Button size="sm" onClick={handleSend} disabled={!isSendable}>
          <SendHorizontal className="w-4 h-4" />
          送信
        </Button>
      </div>
    </div>
  );
}
