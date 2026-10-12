import { ExternalLink, Mic } from 'lucide-react';

const MUKUCHI_URL = 'https://mukuchi.minimalcorp.com/';

/** 音声入力は tsunagi には持たず、どのアプリにも入力できる mukuchi を案内する */
export function VoiceInputGuide() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Voice Input</h2>
      <div className="flex items-center gap-3 rounded-md border border-border p-3">
        <Mic className="size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          音声入力は mukuchi（macOS /
          Windows・無料）をご利用ください。話した内容をターミナルにそのまま入力できます
        </p>
        <a
          href={MUKUCHI_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent"
        >
          mukuchi
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}
