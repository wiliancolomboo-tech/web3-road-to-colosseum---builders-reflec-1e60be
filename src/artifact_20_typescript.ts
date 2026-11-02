// Appended to src/daemon.ts for active uptime monitoring
import * as http from "http";

const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "UP", timestamp: Date.now() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(8080);