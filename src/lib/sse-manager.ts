type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

class SSEManager {
  private clients: Set<SSEClient> = new Set();

  addClient(client: SSEClient): void {
    this.clients.add(client);
    console.log(`[SSE] Client added: ${client.id}, total: ${this.clients.size}`);
  }

  removeClient(clientId: string): void {
    const client = Array.from(this.clients).find((c) => c.id === clientId);
    if (client) {
      this.clients.delete(client);
      console.log(`[SSE] Client removed: ${clientId}, total: ${this.clients.size}`);
    }
  }

  broadcast(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    console.log(`[SSE] Broadcasting ${event} to ${this.clients.size} clients`);

    for (const client of this.clients) {
      try {
        client.controller.enqueue(encoded);
      } catch (error) {
        console.error(`[SSE] Failed to send to client ${client.id}:`, error);
        this.removeClient(client.id);
      }
    }
  }
}

export const sseManager = new SSEManager();
