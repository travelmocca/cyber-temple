import { WebSocketServer } from 'ws';

export function createWebSocketServer() {
  return new WebSocketServer({ noServer: true, maxPayload: 16384, perMessageDeflate: false });
}

export function attachWebSocketTransport({ server, hub, wss, staticOnly }) {
  server.on('upgrade', (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    if (staticOnly || !['/presence/village', '/presence'].includes(url.pathname)) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    let allowedOrigin = !request.headers.origin;
    try {
      if (request.headers.origin)
        allowedOrigin = new URL(request.headers.origin).host === request.headers.host;
    } catch {}
    if (!allowedOrigin) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, (connection) => {
      const session = hub.connect(
        { room: url.searchParams.get('room') ?? 'maru', visit: url.searchParams.get('visit') },
        (data) => {
          if (connection.readyState === 1) connection.send(JSON.stringify(data));
        },
      );
      if (!session.active) {
        connection.close(4000, 'Admission rejected');
        return;
      }
      let windowAt = Date.now(),
        messages = 0;
      connection.on('message', (raw, binary) => {
        if (Date.now() - windowAt > 1000) {
          windowAt = Date.now();
          messages = 0;
        }
        if (++messages > 180) {
          connection.close(1008, 'Rate limit');
          return;
        }
        if (binary) {
          connection.send(JSON.stringify({ type: 'error', code: 'invalid-message' }));
          return;
        }
        try {
          hub.receive(session, JSON.parse(raw.toString()));
        } catch {
          connection.send(JSON.stringify({ type: 'error', code: 'invalid-message' }));
        }
      });
      connection.on('close', () => hub.disconnect(session));
      connection.on('error', () => hub.disconnect(session));
    });
  });
}
