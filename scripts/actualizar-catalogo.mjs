// Descarga el catálogo público de trámites de la Ventanilla de Ensenada
// (la misma información que cualquier ciudadano ve en ventanilla.ensenada.gob.mx)
// y genera la base de conocimiento que usa el asistente.
//
// Uso: npm run catalogo

import https from "node:https";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://ventanilla.ensenada.gob.mx";
const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(here, "..", "data");

// El servidor del Ayuntamiento no envía su certificado intermedio completo, así que
// Node no puede validar la cadena. Solo se leen datos públicos de este dominio.
const agent = new https.Agent({ rejectUnauthorized: false });

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { agent, headers: { "User-Agent": "tramites-ensenada-demo" } }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} ${url}`));
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Respuesta no es JSON: ${url}`));
          }
        });
      })
      .on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => (s ?? "").toString().replace(/\s+/g, " ").trim();
const cleanList = (list) => (list ?? []).map(clean).filter(Boolean);

function costo(ficha, detalle) {
  const c = detalle?.cost ?? {};
  const partes = [clean(c.cost || ficha.cost), clean(c.costMXN || ficha.costMXN)].filter(Boolean);
  if (!ficha.hasCost && !c.hasCost) return "Gratuito";
  return partes.join(" / ") || "No especificado";
}

function aMarkdown(ficha, d) {
  const h = d.header ?? {};
  const lineas = [`### ${clean(h.name || ficha.name)} (ref. ${clean(h.reference || ficha.reference)})`];
  lineas.push(`- Dependencia: ${clean(h.dependency?.name || ficha.dependencyName)}`);
  if (clean(h.description || ficha.description)) lineas.push(`- Qué es: ${clean(h.description || ficha.description)}`);
  lineas.push(`- Costo: ${costo(ficha, d)}`);
  const modalidad = [h.modality?.personally && "presencial", h.modality?.online && "en línea"].filter(Boolean);
  lineas.push(`- Modalidad: ${modalidad.join(" y ") || "no especificada"}`);
  if (clean(h.estimatedResponseTime)) lineas.push(`- Tiempo de respuesta: ${clean(h.estimatedResponseTime)}`);
  const horario = (h.schedule ?? []).filter((s) => s.hours && s.hours !== "Cerrado").map((s) => `${s.day} ${s.hours.replace(/:00(?=\s|$)/g, "")}`);
  if (horario.length) lineas.push(`- Horario: ${horario.join(", ")}`);

  const req = cleanList(d.requirements?.list);
  if (req.length) lineas.push(`- Requisitos:\n${req.map((r) => `  - ${r}`).join("\n")}`);
  const pasos = cleanList(d.stepsInPerson?.list);
  if (pasos.length) lineas.push(`- Pasos presencial:\n${pasos.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}`);
  const online = cleanList(d.stepsOnLine?.list);
  if (online.length) lineas.push(`- Pasos en línea:\n${online.map((p, i) => `  ${i + 1}. ${p}`).join("\n")}`);
  const notas = cleanList(d.notes?.list);
  if (notas.length) lineas.push(`- Notas: ${notas.join(" | ")}`);
  if (clean(d.argument)) lineas.push(`- Importante: ${clean(d.argument)}`);

  for (const a of d.addresses ?? []) {
    const dir = a.address ?? {};
    const calle = [dir.street, dir.number, dir.interiorNumber && `int. ${dir.interiorNumber}`].filter(Boolean).join(" ");
    const tels = (a.phones ?? []).map((p) => `${p.phone}${p.extension ? ` ext. ${p.extension}` : ""}`).join(", ");
    lineas.push(
      `- Dónde: ${clean(a.name)} — ${clean([calle, dir.colony && `col. ${dir.colony}`, dir.postalCode && `C.P. ${dir.postalCode}`].filter(Boolean).join(", "))}` +
        (clean(dir.references) ? ` (${clean(dir.references)})` : "") +
        (tels ? `. Tel: ${tels}` : ""),
    );
  }
  if (h.latestUpdate) lineas.push(`- Última actualización de la ficha oficial: ${new Date(h.latestUpdate).toISOString().slice(0, 10)}`);
  lineas.push(`- Ficha oficial: ${BASE}/tramites`);
  return lineas.join("\n");
}

async function main() {
  console.log("Descargando lista de trámites…");
  const { list_data: fichas } = await getJSON(`${BASE}/api/ficha/list/1`);
  console.log(`${fichas.length} trámites en el catálogo. Descargando detalles…`);

  const catalogo = [];
  for (const [i, ficha] of fichas.entries()) {
    try {
      const detalle = await getJSON(`${BASE}/api/ficha/read/1/view/${ficha.idTramite}/`);
      catalogo.push({ ficha, detalle });
    } catch (err) {
      console.warn(`  No se pudo leer ${ficha.idTramite}: ${err.message}`);
      catalogo.push({ ficha, detalle: null });
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${fichas.length}`);
    await sleep(150); // sin saturar el servidor del Ayuntamiento
  }

  const enLinea = fichas.filter((f) => f.OnLine).length;
  const conCita = fichas.filter((f) => f.appointments).length;

  // Señales de fichas desactualizadas: sin actualizar desde antes de 2025, o que
  // todavía nombran a funcionarios de administraciones anteriores.
  const exFuncionarios = ["ARMANDO AYALA"];
  const sinActualizar = catalogo.filter(({ detalle }) => {
    const fecha = detalle?.header?.latestUpdate;
    return !fecha || new Date(fecha).getFullYear() < 2025;
  }).length;
  const nombranExFuncionarios = catalogo.filter(({ detalle }) =>
    exFuncionarios.some((n) => JSON.stringify(detalle ?? {}).toUpperCase().includes(n)),
  ).length;

  const resumen = {
    descargado: new Date().toISOString(),
    total: fichas.length,
    enLinea,
    conCita,
    sinActualizar,
    nombranExFuncionarios,
  };

  // Índice corto (una línea por trámite) para que la IA ubique el trámite correcto,
  // y fichas completas por referencia para consultarlas bajo demanda.
  const indice = catalogo
    .map(({ ficha }) => {
      const modalidad = ficha.OnLine ? "en línea" : "presencial";
      return `${clean(ficha.reference)} | ${clean(ficha.name)} | ${clean(ficha.dependencyName)} | ${modalidad}`;
    })
    .join("\n");
  const fichasPorRef = Object.fromEntries(
    catalogo.map(({ ficha, detalle }) => [
      clean(ficha.reference),
      {
        nombre: clean(ficha.name),
        dependencia: clean(ficha.dependencyName),
        texto: detalle ? aMarkdown(ficha, detalle) : `### ${clean(ficha.name)}\n- Costo: ${costo(ficha)}`,
      },
    ]),
  );

  const porDependencia = new Map();
  for (const item of catalogo) {
    const dep = clean(item.ficha.dependencyName) || "OTRAS";
    if (!porDependencia.has(dep)) porDependencia.set(dep, []);
    porDependencia.get(dep).push(item);
  }

  let md = `# Catálogo de trámites del Ayuntamiento de Ensenada\n\n`;
  md += `Fuente: catálogo público de ${BASE} (descargado ${resumen.descargado.slice(0, 10)}). `;
  md += `${resumen.total} trámites; ${enLinea} se pueden hacer en línea.\n`;
  for (const [dep, items] of [...porDependencia].sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `\n## ${dep}\n\n`;
    md += items.map(({ ficha, detalle }) => (detalle ? aMarkdown(ficha, detalle) : `### ${clean(ficha.name)}\n- Costo: ${costo(ficha)}`)).join("\n\n");
    md += "\n";
  }

  await fs.mkdir(DATA, { recursive: true });
  await fs.writeFile(path.join(DATA, "catalogo.json"), JSON.stringify({ resumen, catalogo }, null, 1));
  await fs.writeFile(path.join(DATA, "conocimiento.md"), md);
  await fs.writeFile(path.join(DATA, "indice.txt"), indice);
  await fs.writeFile(path.join(DATA, "fichas.json"), JSON.stringify({ resumen, fichas: fichasPorRef }, null, 1));
  console.log(
    `Listo: ${resumen.total} trámites (${enLinea} en línea, ${conCita} con cita en línea, ` +
      `${sinActualizar} sin actualizar desde antes de 2025, ${nombranExFuncionarios} nombran a ex funcionarios).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
