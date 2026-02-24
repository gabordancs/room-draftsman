import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Wall, Opening, Room, Point, ToolMode, OpeningType } from '@/types/floorplan';
import {
  distance,
  snapEndPoint,
  snapToEndpoints,
  snapToGrid,
  formatLength,
} from '@/utils/geometry';
import { constraintLabel } from '@/utils/constraintSolver';
import { getRoomPolygonPoints, polygonCentroid } from '@/utils/roomDetection';

interface Props {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedRoomId: string | null;
  toolMode: ToolMode;
  gridSize: number;
  globalWallHeight: number;
  northAngle: number;
  onSetNorthAngle: (angle: number) => void;
  onAddWall: (wall: Omit<Wall, 'id'>) => string;
  onSelectWall: (id: string | null) => void;
  onAddOpening: (opening: Omit<Opening, 'id'>) => string;
  onSelectOpening: (id: string | null) => void;
  onSelectRoom: (id: string | null) => void;
  onUpdateWall: (id: string, updates: Partial<Wall>) => void;
}

const WALL_THICKNESS = 6;
const SNAP_RADIUS = 12;
const GRID_SUBDIVISIONS = 10;

export default function FloorplanCanvas({
  walls,
  openings,
  rooms,
  selectedWallId,
  selectedOpeningId,
  selectedRoomId,
  toolMode,
  gridSize,
  globalWallHeight,
  northAngle,
  onSetNorthAngle,
  onAddWall,
  onSelectWall,
  onAddOpening,
  onSelectOpening,
  onSelectRoom,
  onUpdateWall,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [drawStart, setDrawStart] = useState<Point | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  const [isDraggingCompass, setIsDraggingCompass] = useState(false);

  // Drag state for wall movement
  const [dragInfo, setDragInfo] = useState<{
    wallId: string;
    part: 'start' | 'end' | 'whole';
    startMouse: Point;
    origStart: Point;
    origEnd: Point;
    // Connected walls that share endpoints with the dragged wall
    connectedEndpoints: { wallId: string; endpoint: 'start' | 'end'; sharedWith: 'start' | 'end' }[];
  } | null>(null);
  const COMPASS_RADIUS = 40;
  const COMPASS_MARGIN = 20;
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

    // Draw room fills
    for (const room of rooms) {
      drawRoom(ctx, room, walls, room.id === selectedRoomId, offset, zoom, gridSize);
    }

    // Draw walls
    for (const wall of walls) {
      drawWall(ctx, wall, wall.id === selectedWallId, offset, zoom, gridSize);
      // Draw constraint icons
      if (wall.constraints && wall.constraints.length > 0) {
        drawConstraintIcons(ctx, wall, offset, zoom, gridSize);
      }
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

    // Compass
    drawCompass(ctx, w, northAngle, COMPASS_RADIUS, COMPASS_MARGIN);
  }, [walls, openings, rooms, selectedWallId, selectedOpeningId, selectedRoomId, drawStart, drawCurrent, offset, zoom, gridSize, northAngle, worldToScreen]);

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
        frameThickness: 0.06,
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

      // Check compass click
      const canvas = canvasRef.current;
      if (canvas) {
        const cw = canvas.width / window.devicePixelRatio;
        const compassCx = cw - COMPASS_MARGIN - COMPASS_RADIUS;
        const compassCy = COMPASS_MARGIN + COMPASS_RADIUS;
        const dist = Math.sqrt((sx - compassCx) ** 2 + (sy - compassCy) ** 2);
        if (dist <= COMPASS_RADIUS + 10) {
          setIsDraggingCompass(true);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          return;
        }
      }

      if (e.button !== 0) return;

      if (toolMode === 'draw' || toolMode === 'virtual') {
        const world = screenToWorld(sx, sy);
        const snappedToWall = snapToWallSegment(world, walls, SNAP_RADIUS / zoom);
        const snapped = snapToEndpoints(world, walls, SNAP_RADIUS / zoom)
          || snappedToWall
          || snapToGrid(world, gridSize / GRID_SUBDIVISIONS);

        if (!drawStart) {
          setDrawStart(snapped);
          setDrawCurrent(snapped);
        } else {
          const endSnappedToWall = snapToWallSegment(world, walls, SNAP_RADIUS / zoom);
          const end = snapToEndpoints(world, walls, SNAP_RADIUS / zoom)
            || endSnappedToWall
            || snapEndPoint(drawStart, snapToGrid(world, gridSize / GRID_SUBDIVISIONS));

          if (distance(drawStart, end) > 5) {
            onAddWall({
              start: drawStart,
              end,
              height: globalWallHeight,
              wallType: toolMode === 'virtual' ? 'virtual' : null,
              structureType: '',
              uValue: null,
              photos: [],
              constraints: [],
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

          // Determine if near an endpoint or middle of wall
          const dStart = distance(world, clicked.start);
          const dEnd = distance(world, clicked.end);
          const endpointThreshold = 14 / zoom;
          let part: 'start' | 'end' | 'whole' = 'whole';
          if (dStart < endpointThreshold) part = 'start';
          else if (dEnd < endpointThreshold) part = 'end';

          // Find connected walls
          const CONN_THRESHOLD = 1;
          const connectedEndpoints: { wallId: string; endpoint: 'start' | 'end'; sharedWith: 'start' | 'end' }[] = [];
          for (const w of walls) {
            if (w.id === clicked.id) continue;
            if (part === 'whole' || part === 'start') {
              if (distance(clicked.start, w.start) < CONN_THRESHOLD) connectedEndpoints.push({ wallId: w.id, endpoint: 'start', sharedWith: 'start' });
              if (distance(clicked.start, w.end) < CONN_THRESHOLD) connectedEndpoints.push({ wallId: w.id, endpoint: 'end', sharedWith: 'start' });
            }
            if (part === 'whole' || part === 'end') {
              if (distance(clicked.end, w.start) < CONN_THRESHOLD) connectedEndpoints.push({ wallId: w.id, endpoint: 'start', sharedWith: 'end' });
              if (distance(clicked.end, w.end) < CONN_THRESHOLD) connectedEndpoints.push({ wallId: w.id, endpoint: 'end', sharedWith: 'end' });
            }
          }

          setDragInfo({
            wallId: clicked.id,
            part,
            startMouse: world,
            origStart: { ...clicked.start },
            origEnd: { ...clicked.end },
            connectedEndpoints,
          });
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } else {
          // Check if clicked inside a room
          const clickedRoom = findRoomAtPoint(world, rooms, walls);
          if (clickedRoom) {
            onSelectRoom(clickedRoom.id);
          } else {
            onSelectWall(null);
            onSelectOpening(null);
            onSelectRoom(null);
          }
        }
      }
    },
    [toolMode, drawStart, walls, openings, rooms, offset, zoom, gridSize, screenToWorld, onAddWall, onSelectWall, onSelectOpening, onSelectRoom, globalWallHeight]
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

      if (isDraggingCompass) {
        const canvas = canvasRef.current;
        if (canvas) {
          const cw = canvas.width / window.devicePixelRatio;
          const compassCx = cw - COMPASS_MARGIN - COMPASS_RADIUS;
          const compassCy = COMPASS_MARGIN + COMPASS_RADIUS;
          const angle = Math.atan2(sy - compassCy, sx - compassCx);
          let degrees = ((angle * 180 / Math.PI) + 90 + 360) % 360;
          degrees = Math.round(degrees);
          onSetNorthAngle(degrees);
        }
        return;
      }

      // Wall dragging in select mode
      if (dragInfo) {
        const world = screenToWorld(sx, sy);
        const dx = world.x - dragInfo.startMouse.x;
        const dy = world.y - dragInfo.startMouse.y;

        if (dragInfo.part === 'whole') {
          const newStart = { x: dragInfo.origStart.x + dx, y: dragInfo.origStart.y + dy };
          const newEnd = { x: dragInfo.origEnd.x + dx, y: dragInfo.origEnd.y + dy };
          onUpdateWall(dragInfo.wallId, { start: newStart, end: newEnd });
          // Move connected walls' shared endpoints
          for (const conn of dragInfo.connectedEndpoints) {
            const movedPoint = conn.sharedWith === 'start' ? newStart : newEnd;
            onUpdateWall(conn.wallId, { [conn.endpoint]: { ...movedPoint } });
          }
        } else {
          // Moving a single endpoint
          const newPoint = {
            x: (dragInfo.part === 'start' ? dragInfo.origStart.x : dragInfo.origEnd.x) + dx,
            y: (dragInfo.part === 'start' ? dragInfo.origStart.y : dragInfo.origEnd.y) + dy,
          };
          // Snap to grid
          const snapped = snapToGrid(newPoint, gridSize / GRID_SUBDIVISIONS);
          onUpdateWall(dragInfo.wallId, { [dragInfo.part]: snapped });
          // Move connected walls' shared endpoints
          for (const conn of dragInfo.connectedEndpoints) {
            onUpdateWall(conn.wallId, { [conn.endpoint]: { ...snapped } });
          }
        }
        return;
      }

      if ((toolMode === 'draw' || toolMode === 'virtual') && drawStart) {
        const world = screenToWorld(sx, sy);
        const snapped = snapToEndpoints(world, walls, SNAP_RADIUS / zoom)
          || snapToWallSegment(world, walls, SNAP_RADIUS / zoom)
          || snapEndPoint(drawStart, snapToGrid(world, gridSize / GRID_SUBDIVISIONS));
        setDrawCurrent(snapped);
      }
    },
    [isPanning, panStart, toolMode, drawStart, walls, zoom, gridSize, screenToWorld, isDraggingCompass, onSetNorthAngle, dragInfo, onUpdateWall]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isPanning || isDraggingCompass || dragInfo) {
        setIsPanning(false);
        setIsDraggingCompass(false);
        setDragInfo(null);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
    },
    [isPanning, isDraggingCompass, dragInfo]
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
      className={`w-full h-full relative overflow-hidden ${toolMode === 'select' ? 'cursor-default' : 'cursor-crosshair'}`}
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

// ─── Compass ────────────────────────────────────────────

function drawCompass(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  northAngle: number,
  radius: number,
  margin: number
) {
  const cx = canvasWidth - margin - radius;
  const cy = margin + radius;
  const rad = (northAngle * Math.PI) / 180;

  // Background circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tick marks
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - rad;
    const inner = i % 2 === 0 ? radius - 10 : radius - 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * inner, cy - Math.cos(a) * inner);
    ctx.lineTo(cx + Math.sin(a) * (radius - 2), cy - Math.cos(a) * (radius - 2));
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = i % 2 === 0 ? 1.5 : 1;
    ctx.stroke();
  }

  // North arrow (red triangle)
  const northA = -rad;
  const arrowLen = radius - 6;
  const nx = cx + Math.sin(northA) * arrowLen;
  const ny = cy - Math.cos(northA) * arrowLen;
  const baseL = { x: cx + Math.sin(northA + 2.7) * 10, y: cy - Math.cos(northA + 2.7) * 10 };
  const baseR = { x: cx + Math.sin(northA - 2.7) * 10, y: cy - Math.cos(northA - 2.7) * 10 };

  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(baseL.x, baseL.y);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = '#ef5350';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(baseR.x, baseR.y);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = '#c62828';
  ctx.fill();

  // South arrow (white/gray)
  const southA = Math.PI - rad;
  const sx = cx + Math.sin(southA) * arrowLen;
  const sy = cy - Math.cos(southA) * arrowLen;
  const sBaseL = { x: cx + Math.sin(southA + 2.7) * 10, y: cy - Math.cos(southA + 2.7) * 10 };
  const sBaseR = { x: cx + Math.sin(southA - 2.7) * 10, y: cy - Math.cos(southA - 2.7) * 10 };

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sBaseL.x, sBaseL.y);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sBaseR.x, sBaseR.y);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fill();

  // "É" label at north
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#ef5350';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelDist = radius + 12;
  ctx.fillText('É', cx + Math.sin(northA) * labelDist, cy - Math.cos(northA) * labelDist);

  // Degree label in center
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${northAngle}°`, cx, cy);

  ctx.restore();
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

function drawRoom(
  ctx: CanvasRenderingContext2D, room: Room, walls: Wall[], selected: boolean,
  offset: Point, zoom: number, gridSize: number
) {
  const points = getRoomPolygonPoints(room, walls);
  if (!points || points.length < 3) return;

  const screenPoints = points.map(p => ({
    x: p.x * zoom + offset.x,
    y: p.y * zoom + offset.y,
  }));

  // Fill
  ctx.fillStyle = selected ? 'rgba(100, 181, 246, 0.15)' : 'rgba(255, 255, 255, 0.05)';
  ctx.beginPath();
  ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
  for (let i = 1; i < screenPoints.length; i++) {
    ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
  }
  ctx.closePath();
  ctx.fill();

  if (selected) {
    ctx.strokeStyle = 'rgba(100, 181, 246, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Label
  const centroid = polygonCentroid(points);
  const sc = { x: centroid.x * zoom + offset.x, y: centroid.y * zoom + offset.y };
  const areaM2 = calcPolygonArea(points) / (gridSize * gridSize);

  ctx.font = selected ? 'bold 12px sans-serif' : '11px sans-serif';
  ctx.fillStyle = selected ? '#64b5f6' : 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText(room.name, sc.x, sc.y - 6);

  ctx.font = '10px monospace';
  ctx.fillText(`${areaM2.toFixed(2)} m²`, sc.x, sc.y + 8);
}

function calcPolygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

function drawWall(
  ctx: CanvasRenderingContext2D, wall: Wall, selected: boolean,
  offset: Point, zoom: number, gridSize: number
) {
  const s = { x: wall.start.x * zoom + offset.x, y: wall.start.y * zoom + offset.y };
  const e = { x: wall.end.x * zoom + offset.x, y: wall.end.y * zoom + offset.y };

  const isVirtual = wall.wallType === 'virtual';
  
  if (isVirtual) {
    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = selected ? '#ce93d8' : '#9575cd';
    ctx.lineWidth = selected ? 3 : 2;
  } else {
    ctx.setLineDash([]);
    ctx.strokeStyle = selected ? '#ffd54f' : '#e0e0e0';
    ctx.lineWidth = selected ? WALL_THICKNESS + 2 : WALL_THICKNESS;
  }
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const p of [s, e]) {
    ctx.fillStyle = selected ? (isVirtual ? '#ce93d8' : '#ffd54f') : (isVirtual ? '#9575cd' : '#bdbdbd');
    ctx.beginPath();
    ctx.arc(p.x, p.y, isVirtual ? 3 : 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const lengthM = distance(wall.start, wall.end) / gridSize;
  const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };
  ctx.font = '11px monospace';
  ctx.fillStyle = selected ? (isVirtual ? '#ce93d8' : '#ffd54f') : 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText(formatLength(lengthM), mid.x, mid.y - 10);
}

function drawConstraintIcons(
  ctx: CanvasRenderingContext2D, wall: Wall,
  offset: Point, zoom: number, _gridSize: number
) {
  const s = { x: wall.start.x * zoom + offset.x, y: wall.start.y * zoom + offset.y };
  const e = { x: wall.end.x * zoom + offset.x, y: wall.end.y * zoom + offset.y };
  const mid = { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 };

  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return;
  const nx = -dy / len;
  const ny = dx / len;

  const constraints = wall.constraints || [];
  const labels = constraints.map(c => constraintLabel(c.type));

  labels.forEach((label, i) => {
    const offsetAlongWall = (i - (labels.length - 1) / 2) * 18;
    const px = mid.x + (dx / len) * offsetAlongWall + nx * 18;
    const py = mid.y + (dy / len) * offsetAlongWall + ny * 18;

    ctx.fillStyle = 'rgba(255, 193, 7, 0.85)';
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#1a1a2e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, py);
  });
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

/** Snap point to the nearest wall segment (not just endpoints) */
function snapToWallSegment(point: Point, walls: Wall[], radius: number): Point | null {
  let closest: Point | null = null;
  let closestDist = Infinity;
  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    let t = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lenSq;
    if (t <= 0.02 || t >= 0.98) continue; // skip near endpoints (handled by snapToEndpoints)
    t = Math.max(0, Math.min(1, t));
    const proj = { x: wall.start.x + t * dx, y: wall.start.y + t * dy };
    const d = distance(point, proj);
    if (d < radius && d < closestDist) {
      closestDist = d;
      closest = proj;
    }
  }
  return closest;
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

function findRoomAtPoint(point: Point, rooms: Room[], walls: Wall[]): Room | null {
  for (const room of rooms) {
    const points = getRoomPolygonPoints(room, walls);
    if (!points || points.length < 3) continue;
    if (isPointInPolygon(point, points)) return room;
  }
  return null;
}

function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > point.y) !== (yj > point.y) &&
        point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
