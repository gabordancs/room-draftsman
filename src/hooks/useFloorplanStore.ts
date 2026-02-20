import { useState, useCallback } from 'react';
import { Wall, Opening, Room, FloorplanState, ToolMode } from '@/types/floorplan';
import { generateId } from '@/utils/geometry';

const initialState: FloorplanState = {
  walls: [],
  openings: [],
  rooms: [],
  selectedWallId: null,
  selectedOpeningId: null,
  toolMode: 'draw',
  globalWallHeight: 2.8,
  northAngle: 0,
  gridSize: 100, // 100px = 1m
};

export function useFloorplanStore() {
  const [state, setState] = useState<FloorplanState>(initialState);

  const setToolMode = useCallback((mode: ToolMode) => {
    setState(s => ({ ...s, toolMode: mode, selectedWallId: null }));
  }, []);

  const addWall = useCallback((wall: Omit<Wall, 'id'>) => {
    const id = generateId();
    const newWall: Wall = { ...wall, id };
    setState(s => ({ ...s, walls: [...s.walls, newWall], selectedWallId: id }));
    return id;
  }, []);

  const updateWall = useCallback((id: string, updates: Partial<Wall>) => {
    setState(s => ({
      ...s,
      walls: s.walls.map(w => w.id === id ? { ...w, ...updates } : w),
    }));
  }, []);

  const deleteWall = useCallback((id: string) => {
    setState(s => ({
      ...s,
      walls: s.walls.filter(w => w.id !== id),
      openings: s.openings.filter(o => o.wallId !== id),
      selectedWallId: s.selectedWallId === id ? null : s.selectedWallId,
    }));
  }, []);

  const selectWall = useCallback((id: string | null) => {
    setState(s => ({ ...s, selectedWallId: id, selectedOpeningId: null }));
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

  return {
    state,
    setToolMode,
    addWall,
    updateWall,
    deleteWall,
    selectWall,
    setGlobalWallHeight,
    setNorthAngle,
    setGridSize,
  };
}
