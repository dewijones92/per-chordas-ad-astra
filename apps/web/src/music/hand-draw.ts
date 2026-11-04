import { FINGERS, poseAt, type HandLayer } from './hand-pose.ts';

export interface HandArea {
  keyTop: number;
  keyHeight: number;
  whiteWidth: number;
}

export const HAND_FILL_ALPHA = 0.26;
export const HAND_LINE_ALPHA = 0.9;
const MIN_TIP = 5;
const MAX_TIP = 15;
const MIN_DIGIT_TIP = 7;
const DIP_SHARE = 0.8;
const PRESSED = 0.5;

const tipY = new Float64Array(FINGERS);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function tipRadius(whiteWidth: number): number {
  return clamp(whiteWidth * 0.42, MIN_TIP, MAX_TIP);
}

function capsule(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  baseX: number,
  baseY: number,
  r: number,
): void {
  const dx = baseX - tipX;
  const dy = baseY - tipY;
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(Math.atan2(-dx, dy));
  ctx.roundRect(-r, -r, r * 2, Math.hypot(dx, dy) + r, r);
  ctx.restore();
}

export function drawHands(
  ctx: CanvasRenderingContext2D,
  layers: readonly HandLayer[],
  position: number,
  area: HandArea,
): void {
  const ww = area.whiteWidth;
  const r = tipRadius(ww);
  const body = r * 0.8;
  const rest = area.keyTop + r + 3;
  const reach = Math.min(Math.max(area.keyHeight * 0.45, r * 2), 60);
  const spread = Math.max(ww * 0.95, r * 1.6);
  const digitPx = Math.floor(r * 1.25);
  for (const layer of layers) {
    const pose = poseAt(layer.timeline, position, layer.pose);
    const dir = layer.side === 'right' ? 1 : -1;
    let sum = 0;
    for (let f = 0; f < FINGERS; f++) {
      const x = (pose.u[f] ?? 0) * ww;
      layer.x[f] = x;
      sum += x;
      tipY[f] = rest + (pose.dip[f] ?? 0) * r * DIP_SHARE;
    }
    const centre = sum / FINGERS;
    const knuckleY = rest + reach;

    ctx.beginPath();
    ctx.roundRect(
      centre - 2 * spread - body,
      knuckleY - body * 0.4,
      4 * spread + body * 2,
      area.keyHeight + 60,
      body,
    );
    for (let f = 0; f < FINGERS; f++) {
      const thumb = f === 0;
      capsule(
        ctx,
        layer.x[f] ?? 0,
        tipY[f] ?? rest,
        centre + dir * (thumb ? -1.7 : f - 2) * spread,
        thumb ? knuckleY + reach * 0.55 : knuckleY,
        body,
      );
    }
    ctx.fillStyle = layer.colour.fill;
    ctx.globalAlpha = pose.alpha * HAND_FILL_ALPHA;
    ctx.fill();
    ctx.strokeStyle = layer.colour.edge;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = pose.alpha * HAND_LINE_ALPHA;
    ctx.stroke();

    ctx.font = `900 ${String(digitPx)}px Nunito Variable, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let f = 0; f < FINGERS; f++) {
      const x = layer.x[f] ?? 0;
      const y = tipY[f] ?? rest;
      const dip = pose.dip[f] ?? 0;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.globalAlpha = pose.alpha * 0.75;
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      if (dip > 0) {
        ctx.globalAlpha = pose.alpha * dip;
        ctx.fillStyle = layer.colour.fill;
        ctx.fill();
      }
      ctx.globalAlpha = pose.alpha * HAND_LINE_ALPHA;
      ctx.strokeStyle = layer.colour.edge;
      ctx.lineWidth = dip > PRESSED ? 2.5 : 1.5;
      ctx.stroke();
      if (r >= MIN_DIGIT_TIP) {
        ctx.fillStyle = dip > PRESSED ? '#ffffff' : layer.colour.edge;
        ctx.fillText(String(f + 1), x, y + 0.5);
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
}
