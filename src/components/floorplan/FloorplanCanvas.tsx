import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Wall, Point, ToolMode } from '@/types/floorplan';
import {
  distance,
  snapEndPoint,
  snapToEndpoints,
  snapToGrid,
  formatLength,
  generateId,
} from '@/utils/geometry';

interface Props {
  walls: Wall[];
  selectedWallId: string | null;
  toolMode: ToolMode;
  gridSize: number; // px per meter
  globalWallHeight: number;
  onAddWall: (wall: Omit<Wall, 'id'>) => string;
  onSelectWall: (id: string | null) => void;
}

const WALL_THICKNESS = 6;
const SNAP_RADIUS = 12; // pixels
const GRID_SUBDIVISIONS = 10; // sub-grid lines per meter

export default function FloorplanCanvas({
  walls,
  selectedWallId,
  toolMode,
  gridSize,
  globalWallHeight,
  onAddWall,
  onSelectWall,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // View transform
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  // Drawing state
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);

  // Panning state
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Screen to world coords
  const screenToWorld = useCallback(
    (sx: number, sy: number): Point => ({
      x: (sx - offset.x) / zoom,
      y: (sy - offset.y) / zoom,
    }),
    [offset, zoom]
  );

  // World to screen coords
  const worldToScreen = useCallback(
    (wx: number, wy: number): Point => ({
      x: wx * zoom + offset.x,
      y: wy * zoom + offset.y,
    }),
    [offset, zoom]
  );

  // Resize canvas
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

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    drawGrid(ctx, w, h, offset, zoom, gridSize);

    // Draw walls
    for (const wall of walls) {
      drawWall(ctx, wall, wall.id === selectedWallId, offset, zoom, gridSize);
    }

    // Draw in-progress wall
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

      // Length label
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
  }, [walls, selectedWallId, drawStart, drawCurrent, offset, zoom, gridSize, worldToScreen]);

  // Pointer events
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Middle button or pan mode
      if (e.button === 1 || toolMode === 'pan') {
        setIsPanning(true);
        setPanStart({ x: sx - offset.x, y: sy - offset.y });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (e.button !== 0) return;

      if (toolMode === 'draw') {
        const world = screenToWorld(sx, sy);
        // Snap to existing endpoints
        const snapped = snapToEndpoints(world, walls, SNAP_RADIUS / zoom) 
          || snapToGrid(world, gridSize / GRID_SUBDIVISIONS);

        if (!drawStart) {
          setDrawStart(snapped);
          setDrawCurrent(snapped);
        } else {
          // Finish wall
          const end = snapToEndpoints(world, walls, SNAP_RADIUS / zoom)
            || snapEndPoint(drawStart, snapToGrid(world, gridSize / GRID_SUBDIVISIONS));
          
          const lengthPx = distance(drawStart, end);
          if (lengthPx > 5) {
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
        // Find closest wall
        const clicked = findWallAtPoint(world, walls, 8 / zoom);
        onSelectWall(clicked?.id || null);
      }
    },
    [toolMode, drawStart, walls, offset, zoom, gridSize, screenToWorld, onAddWall, onSelectWall, globalWallHeight]
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

      // Zoom towards cursor
      setOffset({
        x: sx - (sx - offset.x) * (newZoom / zoom),
        y: sy - (sy - offset.y) * (newZoom / zoom),
      });
      setZoom(newZoom);
    },
    [zoom, offset]
  );

  // Cancel drawing on Escape
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
    <div ref={containerRef} className="w-full h-full relative overflow-hidden cursor-crosshair">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      />
      {/* Zoom indicator */}
      <div className="absolute bottom-3 left-3 text-xs font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded">
        {Math.round(zoom * 100)}% | 1m = {Math.round(gridSize * zoom)}px
      </div>
    </div>
  );
}

// ─── Rendering helpers ──────────────────────────────────

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  offset: Point,
  zoom: number,
  gridSize: number
) {
  const subSize = (gridSize / GRID_SUBDIVISIONS) * zoom;
  const mainSize = gridSize * zoom;

  // Sub grid
  if (subSize > 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    const startX = offset.x % subSize;
    const startY = offset.y % subSize;
    ctx.beginPath();
    for (let x = startX; x < w; x += subSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = startY; y < h; y += subSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  // Main grid (1m)
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  const mainStartX = offset.x % mainSize;
  const mainStartY = offset.y % mainSize;
  ctx.beginPath();
  for (let x = mainStartX; x < w; x += mainSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = mainStartY; y < h; y += mainSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  wall: Wall,
  selected: boolean,
  offset: Point,
  zoom: number,
  gridSize: number
) {
  const s = { x: wall.start.x * zoom + offset.x, y: wall.start.y * zoom + offset.y };
  const e = { x: wall.end.x * zoom + offset.x, y: wall.end.y * zoom + offset.y };

  // Wall line
  ctx.strokeStyle = selected ? '#ffd54f' : '#e0e0e0';
  ctx.lineWidth = selected ? WALL_THICKNESS + 2 : WALL_THICKNESS;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();

  // Endpoints
  for (const p of [s, e]) {
    ctx.fillStyle = selected ? '#ffd54f' : '#bdbdbd';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Length label
  const lengthM = distance(wall.start, wall.end) / gridSize;
  const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
  ctx.font = '11px monospace';
  ctx.fillStyle = selected ? '#ffd54f' : 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText(formatLength(lengthM), mid.x, mid.y - 10);
}

function findWallAtPoint(point: Point, walls: Wall[], threshold: number): Wall | null {
  let best: Wall | null = null;
  let bestDist = Infinity;

  for (const wall of walls) {
    const d = pointToSegmentDistance(point, wall.start, wall.end);
    if (d < threshold && d < bestDist) {
      bestDist = d;
      best = wall;
    }
  }
  return best;
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return distance(p, proj);
}
