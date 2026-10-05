// Código compartido por todas las páginas de Trámites Ensenada:
// modo noche, estrellas del fondo nocturno y partículas guinda del encabezado.
// Se carga antes del script de cada página (define reducirMovimiento).

const reducirMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ================= Modo noche =================
const botonTema = document.getElementById("tema");
function pintarTema() {
  if (!botonTema) return;
  const oscuro = document.documentElement.dataset.tema === "oscuro";
  botonTema.setAttribute("aria-label", oscuro ? "Activar modo día" : "Activar modo noche");
  botonTema.title = oscuro ? "Modo día" : "Modo noche";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = oscuro ? "#0b0708" : "#741c3c";
}
botonTema?.addEventListener("click", () => {
  const oscuro = document.documentElement.dataset.tema !== "oscuro";
  if (oscuro) document.documentElement.dataset.tema = "oscuro";
  else delete document.documentElement.dataset.tema;
  try { localStorage.setItem("tema", oscuro ? "oscuro" : "claro"); } catch {}
  pintarTema();
});
pintarTema();

// ================= Estrellas (cada capa es un solo div con muchas sombras) =================
function estrellas(id, cantidad, desenfoque, min, max) {
  const puntos = [];
  for (let i = 0; i < cantidad; i++) {
    const alfa = (min + Math.random() * (max - min)).toFixed(2);
    puntos.push(`${(Math.random() * 100).toFixed(2)}vw ${(Math.random() * 100).toFixed(2)}vh ${desenfoque}px 0 rgba(255,255,255,${alfa})`);
  }
  const capa = document.getElementById(id);
  if (capa) capa.style.boxShadow = puntos.join(",");
}
estrellas("estA", 150, 0, 0.05, 0.3);
estrellas("estB", 18, 1.2, 0.35, 0.7);

// ================= Partículas guinda del hero =================
// Puntitos suaves que suben despacio. Con mouse (computadora) se apartan del cursor
// y regresan a su lugar al alejarse. Solo se animan cuando el hero está a la vista.
(function () {
  const lienzo = document.getElementById("particulas");
  const ctx = lienzo?.getContext("2d");
  if (!ctx) return;
  const conMouse = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const RADIO_CURSOR = 150, EMPUJE = 48;
  let ancho = 0, alto = 0, puntos = [], activo = false, ultimo = null;
  const cursor = { x: 0, y: 0, dentro: false };
  const leerColor = () => getComputedStyle(document.documentElement).getPropertyValue("--particula").trim() || "116, 28, 60";
  let rgb = leerColor();

  function nueva(enCualquierAltura) {
    return {
      x: Math.random() * ancho,
      y: enCualquierAltura ? Math.random() * alto : alto + 10,
      r: 1.1 + Math.random() * 2.6,
      a: 0.1 + Math.random() * 0.34,
      vx: (Math.random() - 0.5) * 6,
      vy: -(3 + Math.random() * 9),
      fase: Math.random() * Math.PI * 2,
      dx: 0, dy: 0, // desplazamiento por el cursor
    };
  }
  function medir() {
    const caja = lienzo.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ancho = caja.width; alto = caja.height;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Más pantalla, más partículas, pero siempre pocas para que se sienta sutil.
    const cantidad = Math.round(Math.min(70, Math.max(20, (ancho * alto) / 22000)));
    while (puntos.length < cantidad) puntos.push(nueva(true));
    puntos.length = cantidad;
    for (const p of puntos) if (p.x > ancho) p.x = Math.random() * ancho;
  }
  function dibujar() {
    ctx.clearRect(0, 0, ancho, alto);
    for (const p of puntos) {
      ctx.beginPath();
      ctx.arc(p.x + p.dx, p.y + p.dy, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${rgb}, ${p.a})`;
      ctx.fill();
    }
  }
  function avanzar(dt, t) {
    const suavizado = Math.min(1, dt * 5);
    for (const p of puntos) {
      p.x += (p.vx + Math.sin(t / 1700 + p.fase) * 5) * dt;
      p.y += p.vy * dt;
      if (p.y < -12) Object.assign(p, nueva(false));
      if (p.x < -12) p.x = ancho + 12;
      if (p.x > ancho + 12) p.x = -12;
      let ox = 0, oy = 0;
      if (cursor.dentro) {
        const ex = p.x - cursor.x, ey = p.y - cursor.y, d = Math.hypot(ex, ey);
        if (d < RADIO_CURSOR && d > 0.1) {
          const fuerza = (1 - d / RADIO_CURSOR) ** 2 * EMPUJE;
          ox = (ex / d) * fuerza; oy = (ey / d) * fuerza;
        }
      }
      p.dx += (ox - p.dx) * suavizado;
      p.dy += (oy - p.dy) * suavizado;
    }
  }
  function cuadro(t) {
    if (!activo) return;
    const dt = ultimo === null ? 0 : Math.min((t - ultimo) / 1000, 0.05);
    ultimo = t;
    avanzar(dt, t);
    dibujar();
    requestAnimationFrame(cuadro);
  }

  medir(); dibujar();
  new ResizeObserver(() => { medir(); dibujar(); }).observe(lienzo);
  // Si cambia el modo día/noche, cambia el tono de las partículas.
  new MutationObserver(() => { rgb = leerColor(); dibujar(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
  if (reducirMovimiento) return;

  if (conMouse) {
    addEventListener("pointermove", (e) => {
      const caja = lienzo.getBoundingClientRect();
      cursor.x = e.clientX - caja.left;
      cursor.y = e.clientY - caja.top;
      cursor.dentro = cursor.y > -RADIO_CURSOR && cursor.y < alto + RADIO_CURSOR;
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => (cursor.dentro = false));
  }
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !activo) { activo = true; ultimo = null; requestAnimationFrame(cuadro); }
    if (!e.isIntersecting) activo = false;
  }).observe(lienzo);
  document.addEventListener("visibilitychange", () => { ultimo = null; });
})();
