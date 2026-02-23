import React, { useEffect } from 'react';
import FloorplanCanvas from '@/components/floorplan/FloorplanCanvas';
import WallEditorPanel from '@/components/floorplan/WallEditorPanel';
import OpeningEditorPanel from '@/components/floorplan/OpeningEditorPanel';
import RoomEditorPanel from '@/components/floorplan/RoomEditorPanel';
import Toolbar from '@/components/floorplan/Toolbar';
import { useFloorplanStore } from '@/hooks/useFloorplanStore';

const Index = () => {
  const {
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
    updateRoom,
    deleteRoom,
    selectRoom,
    recalcRooms,
    setNorthAngle,
    loadState,
  } = useFloorplanStore();

  // Recalc rooms whenever walls change
  const wallFingerprint = JSON.stringify(state.walls.map(w => [w.id, Math.round(w.start.x), Math.round(w.start.y), Math.round(w.end.x), Math.round(w.end.y)]));
  useEffect(() => {
    recalcRooms();
  }, [wallFingerprint, recalcRooms]);

  const selectedWall = state.walls.find(w => w.id === state.selectedWallId) || null;
  const selectedOpening = state.openings.find(o => o.id === state.selectedOpeningId) || null;
  const selectedOpeningWall = selectedOpening
    ? state.walls.find(w => w.id === selectedOpening.wallId) || null
    : null;
  const selectedRoom = state.rooms.find(r => r.id === state.selectedRoomId) || null;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Toolbar
        toolMode={state.toolMode}
        onSetToolMode={setToolMode}
        wallCount={state.walls.length}
        openingCount={state.openings.length}
        roomCount={state.rooms.length}
        state={state}
        onImport={loadState}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <FloorplanCanvas
            walls={state.walls}
            openings={state.openings}
            rooms={state.rooms}
            selectedWallId={state.selectedWallId}
            selectedOpeningId={state.selectedOpeningId}
            selectedRoomId={state.selectedRoomId}
            toolMode={state.toolMode}
            gridSize={state.gridSize}
            globalWallHeight={state.globalWallHeight}
            northAngle={state.northAngle}
            onSetNorthAngle={setNorthAngle}
            onAddWall={addWall}
            onSelectWall={selectWall}
            onAddOpening={addOpening}
            onSelectOpening={selectOpening}
            onSelectRoom={selectRoom}
          />
        </div>
        {selectedWall && (
          <WallEditorPanel
            wall={selectedWall}
            walls={state.walls}
            gridSize={state.gridSize}
            northAngle={state.northAngle}
            onUpdate={updateWall}
            onDelete={deleteWall}
            onClose={() => selectWall(null)}
          />
        )}
        {selectedOpening && selectedOpeningWall && (
          <OpeningEditorPanel
            opening={selectedOpening}
            wall={selectedOpeningWall}
            gridSize={state.gridSize}
            northAngle={state.northAngle}
            onUpdate={updateOpening}
            onDelete={deleteOpening}
            onClose={() => selectOpening(null)}
          />
        )}
        {selectedRoom && (
          <RoomEditorPanel
            room={selectedRoom}
            walls={state.walls}
            gridSize={state.gridSize}
            onUpdate={updateRoom}
            onDelete={deleteRoom}
            onClose={() => selectRoom(null)}
          />
        )}
      </div>
    </div>
  );
};

export default Index;
