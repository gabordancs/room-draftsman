import React from 'react';
import { Room, Wall } from '@/types/floorplan';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X, Home } from 'lucide-react';
import { getRoomPolygonPoints } from '@/utils/roomDetection';

interface Props {
  room: Room;
  allRooms: Room[];
  walls: Wall[];
  gridSize: number;
  onUpdate: (id: string, updates: Partial<Room>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function RoomEditorPanel({ room, allRooms, walls, gridSize, onUpdate, onDelete, onClose }: Props) {
  const points = getRoomPolygonPoints(room, walls);
  
  const area = points ? calcArea(points, gridSize) : 0;
  const volume = area * room.ceilingHeight;

  const isDuplicate = allRooms.some(r => r.id !== room.id && r.name === room.name);

  return (
    <div className="w-72 bg-card border-l border-border p-4 flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm text-card-foreground">Helyiség</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Név</Label>
          <Input
            value={room.name}
            onChange={e => {
              const newName = e.target.value;
              const wouldDuplicate = allRooms.some(r => r.id !== room.id && r.name === newName);
              if (!wouldDuplicate) {
                onUpdate(room.id, { name: newName });
              }
            }}
            className={`h-8 text-sm mt-1 ${isDuplicate ? 'border-destructive' : ''}`}
          />
          {isDuplicate && (
            <p className="text-xs text-destructive mt-1">Ez a név már foglalt!</p>
          )}
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Belmagasság (m)</Label>
          <Input
            type="number"
            step={0.01}
            min={1}
            max={10}
            value={room.ceilingHeight}
            onChange={e => onUpdate(room.id, { ceilingHeight: parseFloat(e.target.value) || 2.8 })}
            className="h-8 text-sm mt-1"
          />
        </div>

        <div className="bg-muted rounded-md p-3 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Alapterület</span>
            <span className="font-mono text-card-foreground">{area.toFixed(2)} m²</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Belmagasság</span>
            <span className="font-mono text-card-foreground">{room.ceilingHeight.toFixed(2)} m</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Légtérfogat</span>
            <span className="font-mono text-card-foreground">{volume.toFixed(2)} m³</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Falak száma</span>
            <span className="font-mono text-card-foreground">{room.wallIds.length}</span>
          </div>
        </div>

        <Button
          variant="destructive"
          size="sm"
          className="w-full text-xs"
          onClick={() => { onDelete(room.id); onClose(); }}
        >
          Helyiség törlése
        </Button>
      </div>
    </div>
  );
}

function calcArea(points: { x: number; y: number }[], gridSize: number): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2) / (gridSize * gridSize);
}
