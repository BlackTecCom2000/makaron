import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';

let wss: WebSocketServer | null = null;
const clients: Set<WebSocket> = new Set();

export function initWebSocketServer(httpServer: Server) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws/v1' });

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    console.log(`[WS] Client connected. Total active clients: ${clients.size}`);

    ws.send(JSON.stringify({
      event: 'CONNECTED',
      data: {
        message: 'Connected to BlackTecCom MAKARON Realtime WSS',
        serverTimestamp: new Date().toISOString()
      }
    }));

    ws.on('message', (message) => {
      try {
        const parsed = JSON.parse(message.toString());
        if (parsed.event === 'PING') {
          ws.send(JSON.stringify({ event: 'PONG', timestamp: new Date().toISOString() }));
        }
      } catch (e) {
        // ignore non-json
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[WS] Client disconnected. Total active: ${clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error', err);
      clients.delete(ws);
    });
  });

  return wss;
}

export function broadcastEvent(event: string, data: any) {
  if (!wss) return;
  const payload = JSON.stringify({
    event,
    data,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function broadcastWsEvent(channel: string, event: string, data: any) {
  if (!wss) return;
  const payload = JSON.stringify({
    channel,
    event,
    data,
    timestamp: new Date().toISOString()
  });

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

