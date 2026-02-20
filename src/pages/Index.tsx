import React from 'react';
import FloorplanCanvas from '@/components/floorplan/FloorplanCanvas';
import WallEditorPanel from '@/components/floorplan/WallEditorPanel';
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
  } = useFloorplanStore();

  const selectedWall = state.walls.find(w => w.id === state.selectedWallId) || null;

  return (
    <div className="flex flex-col h-screen bg-background">
      <Toolbar
        toolMode={state.toolMode}
        onSetToolMode={setToolMode}
        wallCount={state.walls.length}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <FloorplanCanvas
            walls={state.walls}
            selectedWallId={state.selectedWallId}
            toolMode={state.toolMode}
            gridSize={state.gridSize}
            globalWallHeight={state.globalWallHeight}
            onAddWall={addWall}
            onSelectWall={selectWall}
          />
        </div>
        {selectedWall && (
          <WallEditorPanel
            wall={selectedWall}
            gridSize={state.gridSize}
            northAngle={state.northAngle}
            onUpdate={updateWall}
            onDelete={(id) => { deleteWall(id); }}
            onClose={() => selectWall(null)}
          />
        )}
      </div>
    </div>
  );
};

export default Index;
