// Dónde se guardan las conversaciones, el registro de preguntas del panel y los límites contra abuso.
//
// - Con Upstash Redis (variables UPSTASH_REDIS_REST_URL/TOKEN, o KV_REST_API_URL/TOKEN que crea
//   la integración de Vercel): todo se comparte entre las funciones de Vercel y persiste.
// - Sin Redis (tu computadora): memoria del servidor + el archivo data/preguntas.jsonl.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_REDIS = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN_REDIS = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const usaRedis = Boolean(URL_REDIS && TOKEN_REDIS);

const UNA_HORA = 60 * 60; // segundos
const LIMITE_POR_HORA = Number(process.env.LIMITE_POR_HORA) || 20; // preguntas por persona (IP) por hora
const LIMITE_POR_DIA = Number(process.env.LIMITE_POR_DIA) || 300; // preguntas totales por día, entre todos
const MAX_REGISTROS = 5000;

// Varios comandos de Redis en una sola petición (API REST de Upstash).
async function redis(...comandos) {
  const res = await fetch(`${URL_REDIS}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN_REDIS}`, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
  });
  if (!res.ok) throw new Error(`Redis respondió ${res.status}`);
  const respuestas = await res.json();
  const error = respuestas.find((r) => r.error);
  if (error) throw new Error(`Redis: ${error.error}`);
  return respuestas.map((r) => r.result);
}

// ---------- Respaldo local (sin Redis) ----------

const ARCHIVO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "preguntas.jsonl");
const conversaciones = new Map(); // id -> { datos, vence }
const usoPorIp = new Map(); // "ip:hora" -> cantidad
const usoPorDia = new Map(); // "AAAA-MM-DD" -> cantidad
let registrosLocales = null;

async function cargarRegistrosLocales() {
  if (registrosLocales) return registrosLocales;
  try {
    registrosLocales = (await fs.readFile(ARCHIVO, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    registrosLocales = [];
  }
  return registrosLocales;
}

// ---------- Conversaciones ----------

export async function leerConversacion(id) {
  if (typeof id !== "string" || !/^[\w-]{10,60}$/.test(id)) return null;
  if (usaRedis) {
    const [valor] = await redis(["GET", `conv:${id}`]);
    return valor ? JSON.parse(valor) : null;
  }
  const c = conversaciones.get(id);
  return c && c.vence > Date.now() ? c.datos : null;
}

export async function guardarConversacion(id, datos) {
  if (usaRedis) return void (await redis(["SET", `conv:${id}`, JSON.stringify(datos), "EX", UNA_HORA]));
  conversaciones.set(id, { datos, vence: Date.now() + UNA_HORA * 1000 });
  for (const [clave, c] of conversaciones) if (c.vence < Date.now()) conversaciones.delete(clave);
}

export async function borrarConversacion(id) {
  if (usaRedis) return void (await redis(["DEL", `conv:${id}`]));
  conversaciones.delete(id);
}

// ---------- Límites contra abuso (protegen el saldo de la API) ----------

// Devuelve un mensaje si la persona o el día ya llegaron al límite; si no, cuenta la pregunta.
export async function revisarLimites(ip) {
  const hora = Math.floor(Date.now() / 3_600_000);
  const dia = new Date().toISOString().slice(0, 10);
  const claveIp = `lim:ip:${ip}:${hora}`;
  const claveDia = `lim:dia:${dia}`;

  let [delDia, deLaPersona] = usaRedis
    ? (await redis(["GET", claveDia], ["GET", claveIp])).map(Number)
    : [usoPorDia.get(dia) ?? 0, usoPorIp.get(claveIp) ?? 0];

  if (delDia >= LIMITE_POR_DIA) {
    return "El asistente llegó a su límite de consultas por hoy. Vuelve a intentarlo mañana, o comunícate directamente con la dependencia.";
  }
  if (deLaPersona >= LIMITE_POR_HORA) {
    return "Hiciste muchas preguntas seguidas. Espera un rato y vuelve a intentarlo.";
  }

  if (usaRedis) {
    await redis(["INCR", claveIp], ["EXPIRE", claveIp, UNA_HORA], ["INCR", claveDia], ["EXPIRE", claveDia, 26 * UNA_HORA]);
  } else {
    usoPorIp.set(claveIp, deLaPersona + 1);
    usoPorDia.set(dia, delDia + 1);
    for (const clave of usoPorIp.keys()) if (!clave.endsWith(`:${hora}`)) usoPorIp.delete(clave);
  }
  return null;
}

// ---------- Registro de preguntas para el panel ----------

export async function registrarPregunta(pregunta, refs) {
  const registro = { fecha: new Date().toISOString(), pregunta: pregunta.slice(0, 300), refs };
  if (usaRedis) {
    await redis(["RPUSH", "preguntas", JSON.stringify(registro)], ["LTRIM", "preguntas", -MAX_REGISTROS, -1]);
    return;
  }
  (await cargarRegistrosLocales()).push(registro);
  try {
    await fs.appendFile(ARCHIVO, JSON.stringify(registro) + "\n");
  } catch {} // en un servidor de solo lectura se queda en memoria
}

export async function leerRegistros() {
  if (usaRedis) {
    const [lista] = await redis(["LRANGE", "preguntas", 0, -1]);
    return (lista ?? []).map((l) => JSON.parse(l));
  }
  return cargarRegistrosLocales();
}
