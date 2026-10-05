// Función de Vercel: GET /api/panel
import { manejarPanel } from "../lib/rutas.mjs";

export default function handler(req, res) {
  return manejarPanel(res);
}
