import type { BpmPoint } from './stats.ts';

const W = 320;
const H = 140;
const PAD = { left: 34, right: 10, top: 12, bottom: 22 };

export function BpmChart({
  points,
  target,
}: {
  points: readonly BpmPoint[];
  target: number | null;
}) {
  if (points.length === 0) {
    return <p className="muted">Log a session with a tempo to see your progress here.</p>;
  }
  const values = points.map((p) => p.bpm).concat(target ?? []);
  const min = Math.max(0, Math.min(...values) - 10);
  const max = Math.max(...values) + 10;
  const x = (i: number) =>
    PAD.left +
    (points.length === 1
      ? (W - PAD.left - PAD.right) / 2
      : (i / (points.length - 1)) * (W - PAD.left - PAD.right));
  const y = (bpm: number) => PAD.top + (1 - (bpm - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.bpm).toFixed(1)}`)
    .join(' ');
  const first = points[0];
  const last = points.at(-1);
  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      className="bpm-chart"
      role="img"
      aria-label={`Best tempo rose from ${String(first?.bpm)} to ${String(last?.bpm)} bpm`}
    >
      {[min, Math.round((min + max) / 2), max].map((v) => (
        <g key={v}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text
            x={PAD.left - 6}
            y={y(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="10"
            fill="var(--ink-soft)"
          >
            {Math.round(v)}
          </text>
        </g>
      ))}
      {target !== null && (
        <g>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(target)}
            y2={y(target)}
            stroke="var(--coral)"
            strokeDasharray="5 4"
            strokeWidth="2"
          />
          <text
            x={W - PAD.right}
            y={y(target) - 5}
            textAnchor="end"
            fontSize="10"
            fontWeight="800"
            fill="var(--coral)"
          >
            target {target}
          </text>
        </g>
      )}
      <path d={line} fill="none" stroke="var(--violet)" strokeWidth="3" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle
          key={p.day}
          cx={x(i)}
          cy={y(p.bpm)}
          r="4.5"
          fill="var(--sun)"
          stroke="var(--ink)"
          strokeWidth="2"
        >
          <title>{`${p.day}: ${String(p.bpm)} bpm`}</title>
        </circle>
      ))}
      {first && (
        <text x={x(0)} y={H - 6} fontSize="10" fill="var(--ink-soft)">
          {first.day.slice(5)}
        </text>
      )}
      {last && points.length > 1 && (
        <text
          x={x(points.length - 1)}
          y={H - 6}
          fontSize="10"
          textAnchor="end"
          fill="var(--ink-soft)"
        >
          {last.day.slice(5)}
        </text>
      )}
    </svg>
  );
}
