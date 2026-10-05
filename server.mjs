// Servidor local del demo "Trámites Ensenada": sirve las páginas de public/ y la misma API
// que en Vercel usan las funciones de api/ (toda la lógica vive en lib/).
//
// Uso: npm start  (requiere ANTHROPIC_API_KEY en .env y haber corrido `npm run catalogo`)

import http from "node:http";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { client } from "./lib/asistente.mjs";
import { usaRedis } from "./lib/almacen.mjs";
import { manejarChat, manejarPanel, manejarPopulares, leerCuerpo } from "./lib/rutas.mjs";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const PORT = Number(process.env.PORT) || 3000;
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/chat") {
    let cuerpo;
    try {
      cuerpo = await leerCuerpo(req);
    } catch {
      return res.writeHead(400).end();
    }
    return manejarChat(res, { cuerpo, ip: req.socket.remoteAddress ?? "desconocida" });
  }
  if (req.method === "GET" && url.pathname === "/api/populares") return manejarPopulares(res);
  if (req.method === "GET" && url.pathname === "/api/panel") return manejarPanel(res);

  if (req.method === "GET") {
    // Igual que Vercel con cleanUrls: /panel sirve panel.html
    const archivo = url.pathname === "/" ? "index.html" : url.pathname.slice(1) + (path.extname(url.pathname) ? "" : ".html");
    const ruta = path.normalize(path.join(PUBLIC, archivo));
    if (!ruta.startsWith(PUBLIC + path.sep)) return res.writeHead(403).end();
    try {
      const contenido = await fsp.readFile(ruta);
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(ruta)] ?? "application/octet-stream" });
      return res.end(contenido);
    } catch {}
  }

  res.writeHead(404).end("No encontrado");
});

server.listen(PORT, () => {
  console.log(`Trámites Ensenada: http://localhost:${PORT}  (panel: http://localhost:${PORT}/panel)`);
  console.log(usaRedis ? "Datos guardados en Upstash Redis." : "Datos guardados en memoria y en data/preguntas.jsonl.");
  if (!client) console.warn("Aviso: falta ANTHROPIC_API_KEY en .env. El chat mostrará un aviso hasta que la agregues.");
});
