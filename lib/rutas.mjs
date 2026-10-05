// Lo que responde cada dirección de la API. Lo usan el servidor local y las funciones de Vercel.

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { client, responder, populares, datosPanel } from "./asistente.mjs";
import { leerConversacion, guardarConversacion, borrarConversacion, revisarLimites, registrarPregunta, leerRegistros } from "./almacen.mjs";

const MAX_PREGUNTAS_CONVERSACION = 15;

export async function leerCuerpo(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) throw new Error("Mensaje demasiado largo");
  }
  return JSON.parse(body || "{}");
}

// POST /api/chat → respuesta en vivo (Server-Sent Events)
export async function manejarChat(res, { cuerpo, ip }) {
  const pregunta = (cuerpo?.mensaje ?? "").toString().trim().slice(0, 1000);
  if (!pregunta) return res.writeHead(400).end();

  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  const enviar = (evento, payload) => res.write(`event: ${evento}\ndata: ${JSON.stringify(payload)}\n\n`);
  const terminar = (texto) => {
    if (texto) enviar("texto", { delta: texto });
    enviar("fin", {});
    res.end();
  };

  let limite;
  try {
    limite = await revisarLimites(ip);
  } catch (err) {
    console.error(err);
    return terminar("El asistente no está disponible en este momento. Intenta de nuevo en unos minutos.");
  }
  if (limite) return terminar(limite);
  if (!client) return terminar("⚠️ Falta configurar la clave de la IA (`ANTHROPIC_API_KEY`).");

  let id = cuerpo.conversacion;
  let conversacion = await leerConversacion(id).catch(() => null);
  if (!conversacion) {
    id = crypto.randomUUID();
    conversacion = { mensajes: [], preguntas: 0 };
  }
  if (++conversacion.preguntas > MAX_PREGUNTAS_CONVERSACION) {
    await borrarConversacion(id).catch(() => {});
    return terminar("Esta conversación ya es muy larga. Toca “Nueva consulta” para empezar otra.");
  }
  enviar("conversacion", { id });

  try {
    const refs = await responder(conversacion.mensajes, pregunta, enviar);
    await guardarConversacion(id, conversacion);
    await registrarPregunta(pregunta, refs);
  } catch (err) {
    console.error(err);
    // La conversación quedó a medias: se descarta para no reenviar un historial incompleto.
    await borrarConversacion(id).catch(() => {});
    let texto = "Ocurrió un error al consultar la IA. Intenta de nuevo en un momento.";
    if (err instanceof Anthropic.AuthenticationError) texto = "La clave de la IA no es válida. Revisa `ANTHROPIC_API_KEY`.";
    else if (err instanceof Anthropic.RateLimitError) texto = "Hay muchas consultas en este momento. Intenta de nuevo en unos segundos.";
    enviar("error", { texto });
  }
  terminar();
}

// GET /api/populares
export function manejarPopulares(res) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" });
  res.end(JSON.stringify(populares));
}

// GET /api/panel
export async function manejarPanel(res) {
  try {
    const datos = datosPanel(await leerRegistros());
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(datos));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "No se pudieron leer los datos del panel" }));
  }
}
