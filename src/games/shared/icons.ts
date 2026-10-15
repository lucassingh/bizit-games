import type { IconNode } from "lucide";

/**
 * Dibuja íconos de Lucide en un canvas 2D (misma iconografía que la UI en React).
 * Los íconos de Lucide son trazos de grosor 2 en un viewBox de 24.
 */
const cache = new Map<IconNode, { tag: string; p: Path2D }[]>();

function compile(icon: IconNode) {
  let c = cache.get(icon);
  if (c) return c;
  c = [];
  for (const [tag, attrs] of icon) {
    const a = attrs as Record<string, string | number>;
    let d = "";
    switch (tag) {
      case "path":
        d = String(a.d);
        break;
      case "circle":
        d = `M${+a.cx - +a.r},${a.cy}a${a.r},${a.r} 0 1,0 ${+a.r * 2},0a${a.r},${a.r} 0 1,0 ${-(+a.r * 2)},0`;
        break;
      case "rect": {
        const rx = +(a.rx ?? 0), x = +a.x, y = +a.y, w = +a.width, h = +a.height;
        d = rx
          ? `M${x + rx},${y}h${w - 2 * rx}a${rx},${rx} 0 0 1 ${rx},${rx}v${h - 2 * rx}a${rx},${rx} 0 0 1 ${-rx},${rx}h${-(w - 2 * rx)}a${rx},${rx} 0 0 1 ${-rx},${-rx}v${-(h - 2 * rx)}a${rx},${rx} 0 0 1 ${rx},${-rx}z`
          : `M${x},${y}h${w}v${h}h${-w}z`;
        break;
      }
      case "line":
        d = `M${a.x1},${a.y1}L${a.x2},${a.y2}`;
        break;
      case "polyline":
      case "polygon":
        d = "M" + String(a.points).trim().split(/\s+/).join("L") + (tag === "polygon" ? "z" : "");
        break;
      case "ellipse":
        d = `M${+a.cx - +a.rx},${a.cy}a${a.rx},${a.ry} 0 1,0 ${+a.rx * 2},0a${a.rx},${a.ry} 0 1,0 ${-(+a.rx * 2)},0`;
        break;
    }
    if (d) c.push({ tag, p: new Path2D(d) });
  }
  cache.set(icon, c);
  return c;
}

/** Dibuja el ícono centrado en (x, y) con el tamaño dado (ancho del viewBox). */
export function drawIcon(ctx: CanvasRenderingContext2D, icon: IconNode, x: number, y: number, size: number, color: string, lineWidth = 2) {
  const s = size / 24;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const { p } of compile(icon)) ctx.stroke(p);
  ctx.restore();
}
