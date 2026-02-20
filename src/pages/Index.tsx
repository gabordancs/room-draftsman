import React from 'react';
import FloorplanCanvas from '@/components/floorplan/FloorplanCanvas';
import WallEditorPanel from '@/components/floorplan/WallEditorPanel';
import OpeningEditorPanel from '@/components/floorplan/OpeningEditorPanel';
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
  } = useFloorplanStore();

  const selectedWall = state.walls.find(w => w.id === state.selectedWallId) || null;
  const selectedOpening = state.openings.find(o => o.id === state.selectedOpeningId) || null;
  const selectedOpeningWall = selectedOpening
    ? state.walls.find(w => w.id === selectedOpening.wallId) || null
    : null;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Toolbar
        toolMode={state.toolMode}
        onSetToolMode={setToolMode}
        wallCount={state.walls.length}
        openingCount={state.openings.length}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <FloorplanCanvas
            walls={state.walls}
            openings={state.openings}
            selectedWallId={state.selectedWallId}
            selectedOpeningId={state.selectedOpeningId}
            toolMode={state.toolMode}
            gridSize={state.gridSize}
            globalWallHeight={state.globalWallHeight}
            onAddWall={addWall}
            onSelectWall={selectWall}
            onAddOpening={addOpening}
            onSelectOpening={selectOpening}
          />
        </div>
        {selectedWall && (
          <WallEditorPanel
            wall={selectedWall}
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
      </div>
    </div>
  );
};

export default Index;
