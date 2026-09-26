#!/usr/bin/env node
/**
 * ローカルLLM（Ollama / LM Studio）の Anthropic 互換 API を、Claude Code に近い負荷で計測する。
 * 依存なし（Node.js 20+）。ホストで直接実行する:
 *
 *   node apps/server/scripts/bench-local-llm.mjs --provider lmstudio --model qwen3.6-35b-a3b
 *   node apps/server/scripts/bench-local-llm.mjs --provider ollama --model qwen3.6:35b-a3b-coding-nvfp4
 *
 * 計測内容:
 *   1. warmup:       短いリクエストでモデルを読み込む（読み込み時間は計測から除く）
 *   2. prefill cold: 約 N トークンの system + tools（Claude Code 相当）+ 質問を max_tokens=1 で送る。
 *                    プロンプトキャッシュなしの prefill 時間になる
 *   3. prefill warm: 同じ system + tools に別の質問を max_tokens=1 で送る（先頭が共通なのでキャッシュが効く）
 *   4. decode:       3 と同じ内容を max_tokens で送り、(時間 - 3 の時間) / 出力トークン数で生成速度を出す
 * LM Studio は thinking をストリームに出さないため、最初のトークンの到着時刻ではなく
 * max_tokens=1 の所要時間で prefill を測る。
 *
 * Ollama は Anthropic 互換 API で num_ctx を渡せないため、tsunagi と同じく num_ctx を焼き込んだ
 * 派生モデル（<model>-tsunagi-ctx<N>）を作って使う。
 */

import http from 'node:http';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .join(' ')
    .split(/\s*--/)
    .filter(Boolean)
    .map((a) => {
      const [k, ...v] = a.split(/\s+/);
      return [k, v.join(' ') || 'true'];
    })
);

const provider = args.provider;
const model = args.model;
if (!provider || !model || !['ollama', 'lmstudio'].includes(provider)) {
  console.error(
    'usage: --provider ollama|lmstudio --model <name> [--baseUrl URL] [--promptTokens 20000] [--maxTokens 256] [--context 65536]'
  );
  process.exit(1);
}
const baseUrl = (
  args.baseUrl ?? (provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234')
).replace(/\/+$/, '');
const promptTokens = Number(args.promptTokens ?? 20000);
const maxTokens = Number(args.maxTokens ?? 256);
const context = Number(args.context ?? 65536);

// 1 単語 ≒ 1.3 トークン程度の英文を並べて、system をおよそ promptTokens にする
function buildSystem(tokens) {
  const paragraph =
    'You are an interactive coding agent. Follow the repository conventions, prefer small focused edits, ' +
    'run the type checker and linter after changes, and explain decisions briefly. Never commit without being asked. ';
  const approxTokensPerParagraph = 40;
  const parts = [];
  for (let i = 0; i < Math.ceil(tokens / approxTokensPerParagraph); i++) {
    parts.push(`[${i}] ${paragraph}`);
  }
  return parts.join('\n');
}

// Claude Code の組み込みツールに似た形のツール定義（数とスキーマの大きさを近づける）
function buildTools() {
  const names = [
    'Bash',
    'Read',
    'Edit',
    'Write',
    'Glob',
    'Grep',
    'WebFetch',
    'TodoWrite',
    'Task',
    'NotebookEdit',
    'web_search',
    'tsunagi_get_task',
  ];
  return names.map((name) => ({
    name,
    description: `${name} tool. `.repeat(30),
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path of the target file or directory.' },
        query: { type: 'string', description: 'Query or command to run.' },
        limit: { type: 'number', description: 'Maximum number of items to return.' },
      },
      required: ['path'],
    },
  }));
}

async function ollamaContextModel() {
  const withTag = model.includes(':') ? model : `${model}:latest`;
  const name = `${withTag}-tsunagi-ctx${context}`;
  const show = await fetch(`${baseUrl}/api/show`, {
    method: 'POST',
    body: JSON.stringify({ model: name }),
  });
  if (!show.ok) {
    const res = await fetch(`${baseUrl}/api/create`, {
      method: 'POST',
      body: JSON.stringify({
        model: name,
        from: model,
        parameters: { num_ctx: context },
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`failed to create ${name}: ${await res.text()}`);
  }
  return name;
}

async function lmstudioLoad() {
  const res = await fetch(`${baseUrl}/api/v1/models`);
  const { models } = await res.json();
  const loaded = models.flatMap((m) =>
    (m.loaded_instances ?? []).map((i) => ({ key: m.key, id: i.id }))
  );
  // メモリを空けるため、対象以外は解放する
  for (const l of loaded.filter((l) => l.key !== model)) {
    await fetch(`${baseUrl}/api/v1/models/unload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instance_id: l.id }),
    });
  }
  if (!loaded.some((l) => l.key === model)) {
    const r = await fetch(`${baseUrl}/api/v1/models/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, context_length: context }),
    });
    if (!r.ok) throw new Error(`failed to load ${model}: ${await r.text()}`);
  }
  return model;
}

/** ストリーミングで1回リクエストし、TTFT と生成速度を測る */
async function run(runModel, body) {
  const started = performance.now();
  // fetch は 5 分無通信で打ち切られる（dense モデルの prefill は超えうる）ため node:http を使う
  const res = await new Promise((resolve, reject) => {
    const req = http.request(
      `${baseUrl}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': provider,
          'anthropic-version': '2023-06-01',
        },
      },
      resolve
    );
    req.on('error', reject);
    req.end(JSON.stringify({ model: runModel, max_tokens: maxTokens, stream: true, ...body }));
  });
  if (res.statusCode !== 200) {
    let text = '';
    for await (const chunk of res) text += chunk;
    throw new Error(`HTTP ${res.statusCode}: ${text}`);
  }

  let firstTokenAt = null;
  let inputTokens = null;
  let outputTokens = 0;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of res) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      let event;
      try {
        event = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (event.type === 'message_start')
        inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
      if (event.type === 'content_block_delta' && firstTokenAt === null)
        firstTokenAt = performance.now();
      if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? outputTokens;
        inputTokens = event.usage?.input_tokens ?? inputTokens;
      }
    }
  }
  const ended = performance.now();
  const ttft = ((firstTokenAt ?? ended) - started) / 1000;
  const decodeSec = (ended - (firstTokenAt ?? ended)) / 1000;
  return {
    inputTokens,
    outputTokens,
    ttft,
    prefillTps: inputTokens ? inputTokens / ttft : null,
    decodeTps: decodeSec > 0 ? outputTokens / decodeSec : null,
    total: (ended - started) / 1000,
  };
}

const runModel = provider === 'ollama' ? await ollamaContextModel() : await lmstudioLoad();
console.log(
  `# ${provider} ${model} (context ${context}, prompt ~${promptTokens} tokens, max_tokens ${maxTokens})`
);

const warmupStart = performance.now();
await run(runModel, { max_tokens: 8, messages: [{ role: 'user', content: 'hi' }] });
console.log(`warmup (model load): ${((performance.now() - warmupStart) / 1000).toFixed(1)}s`);

// 前回の実行のプロンプトキャッシュが効かないよう、先頭を毎回変える
const system = `Session ${crypto.randomUUID()}\n${buildSystem(promptTokens)}`;
const tools = buildTools();
const coldBody = {
  system,
  tools,
  messages: [
    { role: 'user', content: 'List three risks of editing a shared configuration file, briefly.' },
  ],
};
const warmBody = {
  system,
  tools,
  messages: [
    {
      role: 'user',
      content: 'Suggest three names for a function that parses context lengths, briefly.',
    },
  ],
};
const cold = await run(runModel, { ...coldBody, max_tokens: 1 });
console.log(
  `prefill cold: in=${cold.inputTokens ?? '-'} ${cold.total.toFixed(1)}s (${cold.inputTokens ? (cold.inputTokens / cold.total).toFixed(0) : '-'} tok/s)`
);
const warm = await run(runModel, { ...warmBody, max_tokens: 1 });
console.log(`prefill warm: ${warm.total.toFixed(1)}s`);
const decode = await run(runModel, warmBody);
const decodeSec = decode.total - warm.total;
console.log(
  `decode: out=${decode.outputTokens} ${decodeSec.toFixed(1)}s (${decodeSec > 0 ? (decode.outputTokens / decodeSec).toFixed(1) : '-'} tok/s)`
);

if (provider === 'ollama') {
  // 次のモデルの計測のためにメモリから外す
  await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({ model: runModel, keep_alive: 0 }),
  });
}
