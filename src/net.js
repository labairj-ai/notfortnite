// WebSocket client for online matches. The server speaks newline-free JSON
// messages; see server/server.js for the protocol.

export function connect(url, handlers) {
  const ws = new WebSocket(url);
  const net = {
    ws,
    connected: false,
    myId: null,
    send(msg) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close() { ws.close(); },
  };

  ws.addEventListener('open', () => {
    net.connected = true;
    handlers.onOpen && handlers.onOpen();
  });
  ws.addEventListener('message', (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.t === 'welcome') net.myId = msg.id;
    handlers.onMessage(msg);
  });
  ws.addEventListener('close', () => {
    net.connected = false;
    handlers.onClose && handlers.onClose();
  });
  ws.addEventListener('error', () => {
    handlers.onError && handlers.onError();
  });

  return net;
}

export function getServerUrl() {
  const param = new URLSearchParams(location.search).get('server');
  if (param) return param;
  return localStorage.getItem('nf_server') || '';
}

export function saveServerUrl(url) {
  localStorage.setItem('nf_server', url);
}
