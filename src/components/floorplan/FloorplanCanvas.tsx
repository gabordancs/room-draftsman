import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Wall, Opening, Point, ToolMode, OpeningType } from '@/types/floorplan';
import {
  distance,
  snapEndPoint,
  snapToEndpoints,
  snapToGrid,
  formatLength,
} from '@/utils/geometry';

interface Props {
  walls: Wall[];
  openings: Opening[];
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  toolMode: ToolMode;
  gridSize: number;
  globalWallHeight: number;
  onAddWall: (wall: Omit<Wall, 'id'>) => string;
  onSelectWall: (id: string | null) => void;
  onAddOpening: (opening: Omit<Opening, 'id'>) => string;
  onSelectOpening: (id: string | null) => void;
}

const WALL_THICKNESS = 6;
const SNAP_RADIUS = 12;
const GRID_SUBDIVISIONS = 10;

export default function FloorplanCanvas({
  walls,
  openings,
  selectedWallId,
  selectedOpeningId,
  toolMode,
  gridSize,
  globalWallHeight,
  onAddWall,
  onSelectWall,
  onAddOpening,
  onSelectOpening,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  const screenToWorld = useCallback(
    (sx: number, sy: number): Point => ({
      x: (sx - offset.x) / zoom,
      y: (sy - offset.y) / zoom,
    }),
    [offset, zoom]
  );

  const worldToScreen = useCallback(
    (wx: number, wy: number): Point => ({
      x: wx * zoom + offset.x,
      y: wy * zoom + offset.y,
    }),
    [offset, zoom]
  );

  // Resize
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx, w, h, offset, zoom, gridSize);

    // Draw walls
    for (const wall of walls) {
      drawWall(ctx, wall, wall.id === selectedWallId, offset, zoom, gridSize);
    }

    // Draw openings
    for (const opening of openings) {
      const wall = walls.find(w => w.id === opening.wallId);
      if (wall) {
        drawOpening(ctx, opening, wall, opening.id === selectedOpeningId, offset, zoom, gridSize);
      }
    }

    // In-progress wall
    if (drawStart && drawCurrent) {
      const s = worldToScreen(drawStart.x, drawStart.y);
      const e = worldToScreen(drawCurrent.x, drawCurrent.y);
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = WALL_THICKNESS;
      ctx.lineCap = 'round';
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const lengthM = distance(drawStart, drawCurrent) / gridSize;
      const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
      ctx.font = '13px monospace';
      ctx.fillStyle = '#4fc3f7';
      ctx.textAlign = 'center';
      ctx.fillText(formatLength(lengthM), mid.x, mid.y - 12);
    }

    // Origin crosshair
    const o = worldToScreen(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x, 0);
    ctx.lineTo(o.x, h);
    ctx.moveTo(0, o.y);
    ctx.lineTo(w, o.y);
    ctx.stroke();
  }, [walls, openings, selectedWallId, selectedOpeningId, drawStart, drawCurrent, offset, zoom, gridSize, worldToScreen]);

  // Handle drop of opening from palette
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const openingType = e.dataTransfer.getData('openingType') as OpeningType;
      if (!openingType) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);

      // Find closest wall
      const wall = findWallAtPoint(world, walls, 20 / zoom);
      if (!wall) return;

      // Calculate position along wall (0-1)
      const pos = projectPointOnSegment(world, wall.start, wall.end);
      const clampedPos = Math.max(0.05, Math.min(0.95, pos));

      // Check if opening fits (default width 1m)
      const wallLenM = distance(wall.start, wall.end) / gridSize;
      const defaultWidth = openingType === 'door' ? 0.9 : 1.2;
      const openingWidthRatio = defaultWidth / wallLenM;
      
      if (openingWidthRatio > 0.9) return; // wall too short

      // Check overlap with existing openings on this wall
      const wallOpenings = openings.filter(o => o.wallId === wall.id);
      const halfRatio = openingWidthRatio / 2;
      const canPlace = !wallOpenings.some(existing => {
        const existingHalf = (existing.width / wallLenM) / 2;
        return Math.abs(existing.position - clampedPos) < (halfRatio + existingHalf);
      });
      if (!canPlace) return;

      onAddOpening({
        type: openingType,
        wallId: wall.id,
        width: defaultWidth,
        height: openingType === 'door' ? 2.1 : 1.2,
        sillHeight: openingType === 'window' ? 0.9 : 0,
        uValue: null,
        position: clampedPos,
        photos: [],
      });
    },
    [walls, openings, zoom, gridSize, screenToWorld, onAddOpening]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Pointer events
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (e.button === 1 || toolMode === 'pan') {
        setIsPanning(true);
        setPanStart({ x: sx - offset.x, y: sy - offset.y });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;

      if (toolMode === 'draw') {
        const world = screenToWorld(sx, sy);
        const snapped = snapToEndpoints(world, walls, SNAP_RADIUS / zoom)
          || snapToGrid(world, gridSize / GRID_SUBDIVISIONS);

        if (!drawStart) {
          setDrawStart(snapped);
          setDrawCurrent(snapped);
        } else {
          const end = snapToEndpoints(world, walls, SNAP_RADIUS / zoom)
            || snapEndPoint(drawStart, snapToGrid(world, gridSize / GRID_SUBDIVISIONS));

          if (distance(drawStart, end) > 5) {
            onAddWall({
              start: drawStart,
              end,
              height: globalWallHeight,
              wallType: null,
              structureType: '',
              uValue: null,
              photos: [],
            });
          }
          setDrawStart(null);
          setDrawCurrent(null);
        }
      } else if (toolMode === 'select') {
        const world = screenToWorld(sx, sy);

        // Check openings first (smaller targets, higher priority)
        const clickedOpening = findOpeningAtPoint(world, openings, walls, 10 / zoom, gridSize);
        if (clickedOpening) {
          onSelectOpening(clickedOpening.id);
          return;
        }

        const clicked = findWallAtPoint(world, walls, 8 / zoom);
        if (clicked) {
          onSelectWall(clicked.id);
        } else {
          onSelectWall(null);
          onSelectOpening(null);
        }
      }
    },
    [toolMode, drawStart, walls, openings, offset, zoom, gridSize, screenToWorld, onAddWall, onSelectWall, onSelectOpening, globalWallHeight]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (isPanning) {
        setOffset({ x: sx - panStart.x, y: sy - panStart.y });
        return;
      }

      if (toolMode === 'draw' && drawStart) {
        const world = screenToWorld(sx, sy);
        const snapped = snapToEndpoints(world, walls, SNAP_RADIUS / zoom)
          || snapEndPoint(drawStart, snapToGrid(world, gridSize / GRID_SUBDIVISIONS));
        setDrawCurrent(snapped);
      }
    },
    [isPanning, panStart, toolMode, drawStart, walls, zoom, gridSize, screenToWorld]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning) {
        setIsPanning(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
    },
    [isPanning]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.1, Math.min(10, zoom * factor));

      setOffset({
        x: sx - (sx - offset.x) * (newZoom / zoom),
        y: sy - (sy - offset.y) * (newZoom / zoom),
      });
      setZoom(newZoom);
    },
    [zoom, offset]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawStart(null);
        setDrawCurrent(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative overflow-hidden cursor-crosshair"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      />
      <div className="absolute bottom-3 left-3 text-xs font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded">
        {Math.round(zoom * 100)}% | 1m = {Math.round(gridSize * zoom)}px
      </div>
    </div>
  );
}

// ─── Rendering helpers ──────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  offset: Point, zoom: number, gridSize: number
) {
  const subSize = (gridSize / GRID_SUBDIVISIONS) * zoom;
  const mainSize = gridSize * zoom;

  if (subSize > 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    const startX = offset.x % subSize;
    const startY = offset.y % subSize;
    ctx.beginPath();
    for (let x = startX; x < w; x += subSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = startY; y < h; y += subSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  const mainStartX = offset.x % mainSize;
  const mainStartY = offset.y % mainSize;
  ctx.beginPath();
  for (let x = mainStartX; x < w; x += mainSize) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = mainStartY; y < h; y += mainSize) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
}

function drawWall(
  ctx: CanvasRenderingContext2D, wall: Wall, selected: boolean,
  offset: Point, zoom: number, gridSize: number
) {
  const s = { x: wall.start.x * zoom + offset.x, y: wall.start.y * zoom + offset.y };
  const e = { x: wall.end.x * zoom + offset.x, y: wall.end.y * zoom + offset.y };

  ctx.strokeStyle = selected ? '#ffd54f' : '#e0e0e0';
  ctx.lineWidth = selected ? WALL_THICKNESS + 2 : WALL_THICKNESS;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  for (const p of [s, e]) {
    ctx.fillStyle = selected ? '#ffd54f' : '#bdbdbd';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const lengthM = distance(wall.start, wall.end) / gridSize;
  const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
  ctx.font = '11px monospace';
  ctx.fillStyle = selected ? '#ffd54f' : 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText(formatLength(lengthM), mid.x, mid.y - 10);
}

function drawOpening(
  ctx: CanvasRenderingContext2D,
  opening: Opening,
  wall: Wall,
  selected: boolean,
  offset: Point,
  zoom: number,
  gridSize: number
) {
  const wallLen = distance(wall.start, wall.end);
  if (wallLen === 0) return;

  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const ux = dx / wallLen;
  const uy = dy / wallLen;

  // Opening center position along wall
  const centerPx = opening.position * wallLen;
  const halfWidthPx = (opening.width * gridSize) / 2;

  const startAlongWall = centerPx - halfWidthPx;
  const endAlongWall = centerPx + halfWidthPx;

  const p1 = {
    x: (wall.start.x + ux * startAlongWall) * zoom + offset.x,
    y: (wall.start.y + uy * startAlongWall) * zoom + offset.y,
  };
  const p2 = {
    x: (wall.start.x + ux * endAlongWall) * zoom + offset.x,
    y: (wall.start.y + uy * endAlongWall) * zoom + offset.y,
  };

  // Normal perpendicular to wall
  const nx = -uy;
  const ny = ux;
  const normalLen = 8;

  if (opening.type === 'window') {
    // Window: double line with gap
    ctx.strokeStyle = selected ? '#64b5f6' : '#42a5f5';
    ctx.lineWidth = selected ? 4 : 3;
    ctx.setLineDash([]);

    // Clear wall behind opening
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = WALL_THICKNESS + 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();

    // Draw window symbol (two parallel lines)
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(p1.x + nx * normalLen * sign * zoom * 0.03, p1.y + ny * normalLen * sign * zoom * 0.03);
      ctx.lineTo(p2.x + nx * normalLen * sign * zoom * 0.03, p2.y + ny * normalLen * sign * zoom * 0.03);
      ctx.stroke();
    }

    // Center cross line
    ctx.lineWidth = 1;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.beginPath();
    ctx.moveTo(midX + nx * normalLen * zoom * 0.04, midY + ny * normalLen * zoom * 0.04);
    ctx.lineTo(midX - nx * normalLen * zoom * 0.04, midY - ny * normalLen * zoom * 0.04);
    ctx.stroke();
  } else {
    // Door: line with arc
    ctx.strokeStyle = selected ? '#81c784' : '#66bb6a';
    ctx.lineWidth = selected ? 4 : 3;

    // Clear wall behind
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.lineWidth = WALL_THICKNESS + 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();

    // Door swing arc
    ctx.strokeStyle = selected ? '#81c784' : '#66bb6a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    const arcRadius = distance(
      { x: 0, y: 0 },
      { x: p2.x - p1.x, y: p2.y - p1.y }
    );
    const wallAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, arcRadius, wallAngle, wallAngle - Math.PI / 2, true);
    ctx.stroke();
    ctx.setLineDash([]);

    // Door line
    ctx.lineWidth = 2;
    const doorEndX = p1.x + nx * arcRadius;
    const doorEndY = p1.y + ny * arcRadius;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(doorEndX, doorEndY);
    ctx.stroke();
  }

  // Selection indicator
  if (selected) {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    ctx.fillStyle = opening.type === 'window' ? '#64b5f6' : '#81c784';
    ctx.beginPath();
    ctx.arc(midX, midY, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function findWallAtPoint(point: Point, walls: Wall[], threshold: number): Wall | null {
  let best: Wall | null = null;
  let bestDist = Infinity;
  for (const wall of walls) {
    const d = pointToSegmentDistance(point, wall.start, wall.end);
    if (d < threshold && d < bestDist) { bestDist = d; best = wall; }
  }
  return best;
}

function findOpeningAtPoint(
  point: Point, openings: Opening[], walls: Wall[], threshold: number, gridSize: number
): Opening | null {
  let best: Opening | null = null;
  let bestDist = Infinity;

  for (const opening of openings) {
    const wall = walls.find(w => w.id === opening.wallId);
    if (!wall) continue;

    const wallLen = distance(wall.start, wall.end);
    if (wallLen === 0) continue;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;

    const centerX = wall.start.x + (dx * opening.position);
    const centerY = wall.start.y + (dy * opening.position);

    const d = distance(point, { x: centerX, y: centerY });
    if (d < threshold + (opening.width * gridSize) / 2 && d < bestDist) {
      bestDist = d;
      best = opening;
    }
  }
  return best;
}

function projectPointOnSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
