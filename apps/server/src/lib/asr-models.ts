import type { AsrModel, VoiceInputSettings } from '@minimalcorp/tsunagi-shared';
import { readAppSetting, writeAppSetting } from './local-llm-env.js';

// 音声入力で選べる音声認識モデルの一覧(唯一の定義元)。whisper-server には
// engine と repo を環境変数で渡し、どのモデルを読み込むかを切り替える。
// expectedBytes は Hugging Face 上のファイル合計(2026-09時点)で、進捗・ETAの目安に使う。
export const ASR_MODELS: AsrModel[] = [
  {
    id: 'whisper-large-v3-turbo',
    label: 'Whisper large-v3-turbo',
    description: 'OpenAI Whisper。読み上げ調の音声に強く、句読点も出力する',
    engine: 'whisper',
    repo: 'mlx-community/whisper-large-v3-turbo',
    expectedBytes: 1_614_000_000,
    license: 'MIT',
  },
  {
    id: 'qwen3-asr-1.7b',
    label: 'Qwen3-ASR 1.7B',
    description:
      '会話音声の日本語ベンチマークで高精度。プロンプトの単語を語彙ヒントとして使う (8bit量子化版)',
    engine: 'qwen3-asr',
    repo: 'mlx-community/Qwen3-ASR-1.7B-8bit',
    expectedBytes: 2_468_000_000,
    license: 'Apache-2.0',
  },
  {
    id: 'qwen3-asr-1.7b-ja',
    label: 'Qwen3-ASR 1.7B JA',
    description:
      'Qwen3-ASR 1.7B を日本語向けに追加学習したモデル (neosophie)。固有名詞・専門用語の表記を重視',
    engine: 'qwen3-asr',
    repo: 'neosophie/Qwen3-ASR-1.7B-JA',
    expectedBytes: 4_092_000_000,
    license: 'Apache-2.0',
  },
];

export const DEFAULT_ASR_MODEL_ID = ASR_MODELS[0].id;

export function findAsrModel(id: string): AsrModel | undefined {
  return ASR_MODELS.find((m) => m.id === id);
}

export function findAsrModelByRepo(repo: string): AsrModel | undefined {
  return ASR_MODELS.find((m) => m.repo === repo);
}

const SETTING_KEY = 'voice-input';

export async function getVoiceInputSettings(): Promise<VoiceInputSettings> {
  const settings = await readAppSetting<VoiceInputSettings>(SETTING_KEY, {
    modelId: DEFAULT_ASR_MODEL_ID,
  });
  // 一覧から外れたモデルが保存されていた場合は既定のモデルに戻す
  return findAsrModel(settings.modelId) ? settings : { modelId: DEFAULT_ASR_MODEL_ID };
}

export function saveVoiceInputSettings(settings: VoiceInputSettings): Promise<VoiceInputSettings> {
  return writeAppSetting(SETTING_KEY, settings);
}
