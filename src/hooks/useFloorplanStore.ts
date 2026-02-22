import { useState, useCallback, useEffect } from 'react';
import { Wall, Opening, Room, FloorplanState, ToolMode } from '@/types/floorplan';
import { generateId } from '@/utils/geometry';
import { detectRooms } from '@/utils/roomDetection';
import { applyConstraints } from '@/utils/constraintSolver';

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
    setState(s => ({ ...s, walls: [...s.walls, newWall], selectedWallId: id, selectedOpeningId: null }));
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
