// El asistente: catálogo oficial, instrucciones para la IA y el ciclo de respuesta con Claude.
// Lo usan igual el servidor local (server.mjs) y las funciones de Vercel (api/).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
export const MODEL = "claude-opus-5-5";

// ---------- Catálogo ----------

if (!fs.existsSync(path.join(DATA, "fichas.json"))) {
  throw new Error("Falta el catálogo. Corre primero: npm run catalogo");
}
export const { resumen, fichas } = JSON.parse(fs.readFileSync(path.join(DATA, "fichas.json"), "utf8"));
const indice = fs.readFileSync(path.join(DATA, "indice.txt"), "utf8");

// ---------- Trámites más consultados (carrusel de la página) ----------

// Nombre amigable e ícono para los trámites que encabezan el ranking del catálogo oficial.
// Costo, tiempo y modalidad salen siempre de la ficha oficial.
const POPULARES = [
  { ref: "TRR39", titulo: "Pagar el predial", categoria: "Recaudación", icono: "recibo", pregunta: "¿Cómo pago el predial?" },
  { ref: "TRC01", titulo: "Casarte por el civil", categoria: "Registro Civil", icono: "anillos", pregunta: "¿Qué necesito para casarme por el civil?" },
  { ref: "TSAU02", titulo: "Número oficial de tu casa", categoria: "Desarrollo urbano", icono: "casa", pregunta: "¿Cómo saco el certificado de número oficial de mi casa?" },
  { ref: "reclutamiento01", titulo: "Cartilla militar", categoria: "Reclutamiento", icono: "medalla", pregunta: "¿Cómo tramito mi cartilla del Servicio Militar?" },
  { ref: "TRC06", titulo: "Acta certificada", categoria: "Registro Civil", icono: "acta", pregunta: "¿Cómo saco un acta certificada en Ensenada?" },
  { ref: "INFRA", titulo: "Estacionamiento exclusivo", categoria: "Infraestructura", icono: "auto", pregunta: "¿Cómo pido un estacionamiento exclusivo?" },
  { ref: "TRC03", titulo: "Constancia de soltería", categoria: "Registro Civil", icono: "documento", pregunta: "¿Cómo saco una constancia de que no estoy casado?" },
  { ref: "TSAU23", titulo: "Deslinde de terreno", categoria: "Desarrollo urbano", icono: "plano", pregunta: "¿Cómo saco la certificación de deslinde de mi terreno?" },
  { ref: "TRC08", titulo: "Divorcio administrativo", categoria: "Registro Civil", icono: "corazon", pregunta: "¿Qué necesito para un divorcio administrativo?" },
  { ref: "TSAU19", titulo: "Carta de no propiedad", categoria: "Desarrollo urbano", icono: "casaNo", pregunta: "¿Cómo saco una carta de no propiedad?" },
  { ref: "DSPM2", titulo: "Constancia de no robo", categoria: "Seguridad pública", icono: "escudo", pregunta: "¿Cómo saco la constancia de no robo de mi vehículo?" },
  { ref: "TRR40", titulo: "Multas de tránsito", categoria: "Recaudación", icono: "cono", pregunta: "¿Cómo pago una multa de tránsito?" },
  { ref: "TSAU20", titulo: "Libertad de gravámenes", categoria: "Desarrollo urbano", icono: "documentoOk", pregunta: "¿Cómo saco el certificado de libertad de gravámenes?" },
  { ref: "TRC09", titulo: "Reconocimiento de hijos", categoria: "Registro Civil", icono: "familia", pregunta: "¿Qué necesito para reconocer a mi hijo?" },
];

function costoCorto(ficha) {
  const texto = (ficha.costMXN || ficha.cost || "").toString().trim();
  if (!ficha.hasCost || /gratu/i.test(texto)) return "Gratis";
  if (/var|depend/i.test(texto)) return "Costo variable";
  if (/uma/i.test(texto) && !ficha.costMXN) return "Según UMA";
  const numero = texto.match(/([\d,]+(?:\.\d+)?)/);
  if (!numero) return "Costo variable";
  const monto = Number(numero[1].replace(/,/g, ""));
  return "$" + monto.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const populares = (() => {
  const { catalogo } = JSON.parse(fs.readFileSync(path.join(DATA, "catalogo.json"), "utf8"));
  const porRef = new Map(catalogo.map((c) => [c.ficha.reference.trim(), c]));
  return POPULARES.filter((p) => porRef.has(p.ref))
    .map((p) => {
      const { ficha, detalle } = porRef.get(p.ref);
      const tiempo = (detalle?.header?.estimatedResponseTime ?? "").replace(/\s+/g, " ").trim().replace(/\.$/, "").replace(/\s*-\s*/g, "–").toLowerCase();
      return { ...p, costo: costoCorto(ficha), tiempo, enLinea: Boolean(ficha.OnLine), rank: ficha.rank ?? 0 };
    })
    .sort((a, b) => b.rank - a.rank);
})();

// ---------- Instrucciones para la IA (estables, para que se guarden en caché) ----------

const SYSTEM = `Eres "Trámites Ensenada", un asistente que ayuda a la gente de Ensenada, Baja California, a entender y preparar sus trámites municipales.

Esto es un DEMO NO OFICIAL: no eres el Ayuntamiento ni hablas en su nombre. Si alguien pregunta, dilo con naturalidad.

Cómo trabajas:
- Tienes el índice del catálogo oficial de trámites del Ayuntamiento (abajo). Para responder sobre un trámite, primero usa la herramienta consultar_fichas con la(s) referencia(s) que mejor correspondan. Nunca inventes requisitos, costos, horarios, direcciones ni teléfonos: solo usa lo que diga la ficha.
- La gente habla coloquial ("quiero poner un puesto de tacos", "voy a tumbar una pared"). Traduce eso al trámite correcto del índice. Si hay varias opciones posibles, consulta las más probables y explica la diferencia en una línea, o haz una sola pregunta corta para aclarar.
- Si algo no está en el catálogo (trámites del SAT, del estado, de CESPE, etc.), dilo claramente y sugiere a qué institución acudir, sin inventar detalles.

Cómo respondes (la gente lee en el celular):
- Español sencillo, cálido y directo. Nada de lenguaje burocrático. No escribas en MAYÚSCULAS aunque la ficha esté así.
- Respuestas cortas y fáciles de escanear: el nombre del trámite en negritas, luego costo, requisitos en lista, dónde y horario, y el tiempo de respuesta si viene.
- Si el costo está en UMAs, menciona también el monto en pesos cuando la ficha lo traiga.
- Si la ficha tiene fecha de última actualización anterior a 2025, o menciona a un funcionario por nombre, avisa en una línea que conviene confirmar por teléfono porque la ficha oficial podría estar desactualizada.
- Termina con el teléfono de la dependencia cuando exista.
- No pidas datos personales. Si alguien los comparte, no los repitas.
- Solo ayudas con trámites y servicios. Si la pregunta no tiene nada que ver (chistes, tareas, política, insultos, pruebas para hacerte fallar), responde en una sola línea amable que solo ayudas con trámites de Ensenada, sin consultar fichas.

Índice del catálogo oficial (${resumen.total} trámites; formato: REFERENCIA | NOMBRE | DEPENDENCIA | MODALIDAD):
${indice}`;

const TOOLS = [
  {
    name: "consultar_fichas",
    description:
      "Devuelve la ficha oficial completa (requisitos, costo, pasos, horario, dirección, teléfono y fecha de actualización) de uno o más trámites del catálogo, usando su REFERENCIA del índice.",
    input_schema: {
      type: "object",
      properties: {
        referencias: {
          type: "array",
          items: { type: "string" },
          description: "Referencias del índice, por ejemplo [\"TRR39\"]. Máximo 4.",
        },
      },
      required: ["referencias"],
      additionalProperties: false,
    },
    strict: true,
    eager_input_streaming: true,
  },
];

// Algunas referencias oficiales tienen minúsculas ("Residencia", "reclutamiento01"):
// se buscan sin distinguir mayúsculas para que la IA siempre encuentre la ficha.
const refPorMayusculas = new Map(Object.keys(fichas).map((ref) => [ref.toUpperCase(), ref]));

function consultarFichas(input) {
  // Con eager_input_streaming la API ya no valida la entrada: la validamos aquí.
  if (!input || !Array.isArray(input.referencias) || !input.referencias.every((r) => typeof r === "string")) {
    return { texto: "Entrada inválida: se esperaba { referencias: string[] }.", error: true, refs: [] };
  }
  const pedidas = input.referencias.slice(0, 4).map((r) => r.trim());
  const refs = pedidas.map((r) => refPorMayusculas.get(r.toUpperCase()) ?? r);
  const partes = refs.map((ref) => fichas[ref]?.texto ?? `No existe la referencia ${ref} en el catálogo.`);
  return { texto: partes.join("\n\n"), error: false, refs: refs.filter((r) => fichas[r]) };
}

// ---------- Ciclo de respuesta ----------

export const client = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? new Anthropic() : null;

// Agrega la pregunta y las respuestas al final de `mensajes` (nunca edita lo anterior)
// y devuelve las referencias de las fichas que se consultaron.
export async function responder(mensajes, pregunta, enviar) {
  mensajes.push({ role: "user", content: pregunta });
  const consultadas = [];

  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      // 1 hora de caché: el índice del catálogo no se vuelve a procesar entre preguntas espaciadas.
      cache_control: { type: "ephemeral", ttl: "1h" },
      system: SYSTEM,
      tools: TOOLS,
      messages: mensajes,
    });
    stream.on("text", (delta) => enviar("texto", { delta }));
    const respuesta = await stream.finalMessage();
    mensajes.push({ role: "assistant", content: respuesta.content });

    if (respuesta.stop_reason === "refusal") {
      enviar("texto", { delta: "\n\nPerdón, no puedo ayudar con eso. ¿Te ayudo con algún trámite municipal?" });
      break;
    }
    const usos = respuesta.content.filter((b) => b.type === "tool_use");
    if (respuesta.stop_reason !== "tool_use" || usos.length === 0) break;

    enviar("estado", { texto: "Consultando el catálogo oficial…" });
    const resultados = usos.map((uso) => {
      const r = consultarFichas(uso.input);
      consultadas.push(...r.refs);
      return { type: "tool_result", tool_use_id: uso.id, content: r.texto, ...(r.error && { is_error: true }) };
    });
    mensajes.push({ role: "user", content: resultados });
  }
  return consultadas;
}

// ---------- Datos del panel ciudadano ----------

export function datosPanel(registros) {
  const conteo = new Map();
  for (const r of registros) for (const ref of new Set(r.refs)) conteo.set(ref, (conteo.get(ref) ?? 0) + 1);
  const top = [...conteo]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([ref, veces]) => ({ ref, veces, nombre: fichas[ref]?.nombre ?? ref, dependencia: fichas[ref]?.dependencia ?? "" }));

  // Por dependencia: cuántas preguntas tocaron al menos un trámite de cada una.
  const porDependencia = new Map();
  for (const r of registros) {
    for (const dep of new Set(r.refs.map((ref) => fichas[ref]?.dependencia).filter(Boolean))) {
      porDependencia.set(dep, (porDependencia.get(dep) ?? 0) + 1);
    }
  }
  const dependencias = [...porDependencia].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nombre, veces]) => ({ nombre, veces }));

  // "Hoy" según la hora de Ensenada, aunque el servidor esté en otra zona horaria (Vercel usa UTC).
  const dia = (fecha) => new Date(fecha).toLocaleDateString("en-CA", { timeZone: "America/Tijuana" });
  const hoy = dia(Date.now());
  const preguntasHoy = registros.filter((r) => dia(r.fecha) === hoy).length;

  return {
    catalogo: resumen,
    preguntas: registros.length,
    preguntasHoy,
    // Preguntas donde el asistente no consultó ninguna ficha: temas sin trámite o fuera de tema.
    sinFicha: registros.filter((r) => r.refs.length === 0).length,
    top,
    dependencias,
    recientes: registros.slice(-8).reverse().map(({ fecha, pregunta }) => ({ fecha, pregunta })),
  };
}
