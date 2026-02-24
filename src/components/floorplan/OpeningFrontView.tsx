import React from 'react';
import { Opening } from '@/types/floorplan';

interface Props {
  opening: Opening;
}

export default function OpeningFrontView({ opening }: Props) {
  const viewW = 240;
  const viewH = Math.round(viewW * (opening.height / opening.width));
  const clampedH = Math.min(viewH, 200);
  const scale = Math.min(viewW / opening.width, clampedH / opening.height);
  const w = opening.width * scale;
  const h = opening.height * scale;
  const ft = Math.max(opening.frameThickness * scale, 2);

  const isWindow = opening.type === 'window';

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={viewW}
      height={clampedH}
      className="border border-border rounded bg-muted/30"
    >
      {/* Outer frame */}
      <rect
        x={0} y={0} width={w} height={h}
        fill="hsl(var(--muted))"
        stroke="hsl(var(--foreground))"
        strokeWidth={1.5}
        rx={1}
      />
      {/* Inner frame border */}
      <rect
        x={ft} y={ft}
        width={w - ft * 2} height={h - ft * 2}
        fill="none"
        stroke="hsl(var(--foreground))"
        strokeWidth={1}
        rx={0.5}
      />
      {/* Glass / door panel */}
      <rect
        x={ft} y={ft}
        width={w - ft * 2} height={h - ft * 2}
        fill={isWindow ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted-foreground) / 0.15)'}
        rx={0.5}
      />

      {isWindow && (
        <>
          {/* Cross bar vertical */}
          <line
            x1={w / 2} y1={ft} x2={w / 2} y2={h - ft}
            stroke="hsl(var(--foreground) / 0.4)" strokeWidth={ft * 0.4}
          />
          {/* Cross bar horizontal */}
          <line
            x1={ft} y1={h / 2} x2={w - ft} y2={h / 2}
            stroke="hsl(var(--foreground) / 0.4)" strokeWidth={ft * 0.4}
          />
        </>
      )}

      {!isWindow && (
        <>
          {/* Door handle */}
          <circle
            cx={w - ft - 12} cy={h / 2}
            r={4}
            fill="hsl(var(--foreground) / 0.5)"
          />
          {/* Door panel lines */}
          <rect
            x={ft + 6} y={ft + 6}
            width={w - ft * 2 - 12} height={h * 0.35}
            fill="none" stroke="hsl(var(--foreground) / 0.2)" strokeWidth={1} rx={1}
          />
          <rect
            x={ft + 6} y={h * 0.5}
            width={w - ft * 2 - 12} height={h * 0.35}
            fill="none" stroke="hsl(var(--foreground) / 0.2)" strokeWidth={1} rx={1}
          />
        </>
      )}

      {/* Dimension labels */}
      <text x={w / 2} y={h + 0} textAnchor="middle" className="text-[8px] fill-muted-foreground">
        {opening.width.toFixed(2)} m
      </text>
    </svg>
  );
}
