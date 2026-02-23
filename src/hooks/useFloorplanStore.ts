import { useState, useCallback, useEffect } from 'react';
import { Wall, Opening, Room, FloorplanState, ToolMode, Point } from '@/types/floorplan';
import { generateId, distance } from '@/utils/geometry';
import { detectRooms } from '@/utils/roomDetection';
import { applyConstraints } from '@/utils/constraintSolver';

const SPLIT_THRESHOLD = 8; // pixels

/** Check if a point lies on the interior of a wall segment */
function pointOnWallInterior(p: Point, wall: Wall, threshold: number): number | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return null;
  const t = ((p.x - wall.start.x) * dx + (p.y - wall.start.y) * dy) / lenSq;
  if (t <= 0.02 || t >= 0.98) return null; // too close to endpoints
  const proj = { x: wall.start.x + t * dx, y: wall.start.y + t * dy };
  const d = distance(p, proj);
  return d < threshold ? t : null;
}

/** Split existing walls where the new wall's endpoints land on them */
function trySplitWalls(
  newWall: Wall,
  existingWalls: Wall[],
  existingOpenings: Opening[],
  _gridSize: number
): { walls: Wall[]; openings: Opening[] } {
  let walls = [...existingWalls];
  let openings = [...existingOpenings];

  for (const endpoint of [newWall.start, newWall.end]) {
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const t = pointOnWallInterior(endpoint, w, SPLIT_THRESHOLD);
      if (t === null) continue;

      // Split wall w at parameter t
      const splitPoint = { x: w.start.x + t * (w.end.x - w.start.x), y: w.start.y + t * (w.end.y - w.start.y) };
      const wall1: Wall = { ...w, id: generateId(), end: splitPoint };
      const wall2: Wall = { ...w, id: generateId(), start: splitPoint };

      // Reassign openings on this wall
      openings = openings.map(o => {
        if (o.wallId !== w.id) return o;
        if (o.position < t) {
          return { ...o, wallId: wall1.id, position: o.position / t };
        } else {
          return { ...o, wallId: wall2.id, position: (o.position - t) / (1 - t) };
        }
      });

      walls.splice(i, 1, wall1, wall2);
      break; // one split per endpoint
    }
  }

  return { walls, openings };
}

const initialState: FloorplanState = {
  walls: [],
  openings: [],
  rooms: [],
  selectedWallId: null,
  selectedOpeningId: null,
  selectedRoomId: null,
  toolMode: 'draw',
  globalWallHeight: 2.8,
  northAngle: 0,
  gridSize: 100,
};

export function useFloorplanStore() {
  const [state, setState] = useState<FloorplanState>(initialState);

  const setToolMode = useCallback((mode: ToolMode) => {
    setState(s => ({ ...s, toolMode: mode, selectedWallId: null, selectedOpeningId: null }));
  }, []);

  const addWall = useCallback((wall: Omit<Wall, 'id'>) => {
    const id = generateId();
    const newWall: Wall = { ...wall, id };
    setState(s => {
      // Check if new wall endpoint lands on the middle of an existing wall — split it
      const splitResult = trySplitWalls(newWall, s.walls, s.openings, s.gridSize);
      return {
        ...s,
        walls: [...splitResult.walls, newWall],
        openings: splitResult.openings,
        selectedWallId: id,
        selectedOpeningId: null,
      };
    });
    return id;
  }, []);

  const updateWall = useCallback((id: string, updates: Partial<Wall>) => {
    setState(s => {
      const updatedWalls = s.walls.map(w => {
        if (w.id !== id) return w;
        const updated = { ...w, ...updates };
        // Apply constraints if any
        if (updated.constraints && updated.constraints.length > 0) {
          const newEnd = applyConstraints(updated, s.walls, s.gridSize);
          return { ...updated, end: newEnd };
        }
        return updated;
      });
      return { ...s, walls: updatedWalls };
    });
  }, []);

  const deleteWall = useCallback((id: string) => {
    setState(s => ({
      ...s,
      walls: s.walls.filter(w => w.id !== id),
      openings: s.openings.filter(o => o.wallId !== id),
      selectedWallId: s.selectedWallId === id ? null : s.selectedWallId,
      selectedOpeningId: null,
    }));
  }, []);

  const selectWall = useCallback((id: string | null) => {
    setState(s => ({ ...s, selectedWallId: id, selectedOpeningId: null }));
  }, []);

  // ─── Opening actions ─────────────────────────
  const addOpening = useCallback((opening: Omit<Opening, 'id'>) => {
    const id = generateId();
    const newOpening: Opening = { ...opening, id };
    setState(s => ({ ...s, openings: [...s.openings, newOpening], selectedOpeningId: id, selectedWallId: null }));
    return id;
  }, []);

  const updateOpening = useCallback((id: string, updates: Partial<Opening>) => {
    setState(s => ({
      ...s,
      openings: s.openings.map(o => o.id === id ? { ...o, ...updates } : o),
    }));
  }, []);

  const deleteOpening = useCallback((id: string) => {
    setState(s => ({
      ...s,
      openings: s.openings.filter(o => o.id !== id),
      selectedOpeningId: s.selectedOpeningId === id ? null : s.selectedOpeningId,
    }));
  }, []);

  const selectOpening = useCallback((id: string | null) => {
    setState(s => ({ ...s, selectedOpeningId: id, selectedWallId: null }));
  }, []);

  const setGlobalWallHeight = useCallback((height: number) => {
    setState(s => ({ ...s, globalWallHeight: height }));
  }, []);

  const setNorthAngle = useCallback((angle: number) => {
    setState(s => ({ ...s, northAngle: angle }));
  }, []);

  const setGridSize = useCallback((size: number) => {
    setState(s => ({ ...s, gridSize: size }));
  }, []);

  // Room actions
  const updateRoom = useCallback((id: string, updates: Partial<Room>) => {
    setState(s => ({
      ...s,
      rooms: s.rooms.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  }, []);

  const deleteRoom = useCallback((id: string) => {
    setState(s => ({
      ...s,
      rooms: s.rooms.filter(r => r.id !== id),
      selectedRoomId: s.selectedRoomId === id ? null : s.selectedRoomId,
    }));
  }, []);

  const selectRoom = useCallback((id: string | null) => {
    setState(s => ({ ...s, selectedRoomId: id, selectedWallId: null, selectedOpeningId: null }));
  }, []);

  // Auto-detect rooms when walls change
  const recalcRooms = useCallback(() => {
    setState(s => {
      const newRooms = detectRooms(s.walls, s.gridSize, s.rooms);
      return { ...s, rooms: newRooms };
    });
  }, []);

  // Load full state (for JSON import)
  const loadState = useCallback((newState: FloorplanState) => {
    setState({
      ...newState,
      selectedWallId: null,
      selectedOpeningId: null,
      selectedRoomId: null,
      toolMode: 'select',
    });
  }, []);

  return {
    state,
    setToolMode,
    addWall,
    updateWall,
    deleteWall,
    selectWall,
    addOpening,
    updateOpening,
    deleteOpening,
    selectOpening,
    setGlobalWallHeight,
    setNorthAngle,
    setGridSize,
    updateRoom,
    deleteRoom,
    selectRoom,
    recalcRooms,
    loadState,
  };
}
