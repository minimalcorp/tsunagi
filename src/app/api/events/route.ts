import { sseManager } from '@/lib/sse-manager';
import { eventStore } from '@/lib/event-store';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // EventStoreを初期化（初回のみ）
  eventStore.init();

  const encoder = new TextEncoder();
  const lastEventId = request.headers.get('Last-Event-ID');
  const lastSequence = lastEventId ? parseInt(lastEventId, 10) : 0;

  console.log('[SSE] Client connecting', { lastEventId, lastSequence });

  const stream = new ReadableStream({
    start(controller) {
      const clientId = crypto.randomUUID();

      console.log(`[SSE] New connection: ${clientId}, Last-Event-ID: ${lastEventId}`);

      // 抜けたイベントを送信
      if (lastSequence > 0) {
        const missedEvents = eventStore.getEventsSince(lastSequence);

        if (missedEvents.length > 0) {
          console.log(`[SSE] Sending ${missedEvents.length} missed events to ${clientId}`);

          missedEvents.forEach((event) => {
            controller.enqueue(
              encoder.encode(
                `id: ${event.sequence}\n` +
                  `event: ${event.type}\n` +
                  `data: ${JSON.stringify(event.data)}\n\n`
              )
            );
          });
        }
      }

      // 現在のsequenceを通知
      const currentSequence = eventStore.getCurrentSequence();
      controller.enqueue(
        encoder.encode(
          `id: ${currentSequence}\n` +
            `event: connected\n` +
            `data: ${JSON.stringify({ sequence: currentSequence })}\n\n`
        )
      );

      // クライアントを登録
      sseManager.addClient({ id: clientId, controller });

      // Heartbeat設定（30秒ごと）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(':heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // クリーンアップ
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        console.log(`[SSE] Client disconnected: ${clientId}`);
        sseManager.removeClient(clientId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
