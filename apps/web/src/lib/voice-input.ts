// 音声入力(Whisper)関連のlocalStorageキー。Settings画面と音声入力本体の双方から参照する。

/** Settings画面の音声入力の有効/無効 */
export const VOICE_INPUT_ENABLED_STORAGE_KEY = 'tsunagi:voice-input-enabled';
/** Settings画面で編集できる、whisperのinitial_prompt(表記ゆれ・句読点等のヒント) */
export const WHISPER_PROMPT_STORAGE_KEY = 'tsunagi:whisper-prompt';
/** Settings画面で編集できる、LLM整形時のシステムプロンプト(空ならサーバー側の既定値を使う) */
export const LLM_SYSTEM_PROMPT_STORAGE_KEY = 'tsunagi:llm-system-prompt';
