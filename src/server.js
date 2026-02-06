const http = require('http');
const url = require('url');

function createServer(bot, { port = 5001 } = {}) {
  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const { pathname } = parsedUrl;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      return res.end();
    }

    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let data = {};
      if (body) {
        try { data = JSON.parse(body); } catch {}
      }

      if (pathname === '/status' && req.method === 'GET') {
        return json(res, bot.getStatus());
      }

      if (pathname === '/accept-friend-requests' && req.method === 'POST') {
        return json(res, bot.acceptAllPendingFriendRequests());
      }

      if (pathname === '/is-friend' && req.method === 'POST') {
        if (!data.steamId) return error(res, 400, 'steamId is required');
        return json(res, { isFriend: bot.isFriend(data.steamId) });
      }

      if (pathname === '/send-message' && req.method === 'POST') {
        if (!data.steamId || !data.message) {
          return error(res, 400, 'steamId and message are required');
        }
        bot.sendMessage(data.steamId, data.message);
        return json(res, { success: true });
      }

      error(res, 404, 'Not found');
    });
  });

  server.listen(port);
  return server;
}

function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function error(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

module.exports = { createServer };
