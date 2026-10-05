// Función de Vercel: POST /api/chat
import { manejarChat, leerCuerpo } from "../lib/rutas.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.writeHead(405).end();
  let cuerpo;
  try {
    // Vercel ya interpreta el JSON en req.body; si no, se lee a mano.
    cuerpo = req.body && typeof req.body === "object" ? req.body : await leerCuerpo(req);
  } catch {
    return res.writeHead(400).end();
  }
  // En Vercel, la IP real de la persona llega en x-forwarded-for (la pone la propia plataforma).
  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket?.remoteAddress || "desconocida";
  return manejarChat(res, { cuerpo, ip });
}
