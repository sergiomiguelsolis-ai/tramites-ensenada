// Función de Vercel: GET /api/populares
import { manejarPopulares } from "../lib/rutas.mjs";

export default function handler(req, res) {
  return manejarPopulares(res);
}
