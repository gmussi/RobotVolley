const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css' };
const PORT = process.env.PORT || 8177;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log('serving on http://localhost:' + PORT));
