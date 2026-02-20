import React from 'react';
import { Wall, WallType } from '@/types/floorplan';
import { wallLength, formatLength, wallOrientation } from '@/utils/geometry';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Trash2 } from 'lucide-react';

interface Props {
  wall: Wall;
  gridSize: number;
  northAngle: number;
  onUpdate: (id: string, updates: Partial<Wall>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const WALL_TYPE_LABELS: Record<WallType, string> = {
  external: 'Külső fal',
  internal: 'Belső fal',
  unheated: 'Fűtetlen tér felé',
};

export default function WallEditorPanel({ wall, gridSize, northAngle, onUpdate, onDelete, onClose }: Props) {
  const lengthM = wallLength(wall) / gridSize;
  const areaM2 = lengthM * wall.height;
  const orientation = wallOrientation(wall, northAngle);

  return (
    <div className="w-72 bg-card border-l border-border h-full overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-card-foreground">Fal szerkesztése</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Length */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hossz (m)</Label>
          <div className="text-lg font-mono text-card-foreground">{formatLength(lengthM)}</div>
        </div>

        {/* Height */}
        <div className="space-y-1">
          <Label htmlFor="wall-height" className="text-xs text-muted-foreground">Magasság (m)</Label>
          <Input
            id="wall-height"
            type="number"
            step="0.01"
            min="0.1"
            value={wall.height}
            onChange={(e) => onUpdate(wall.id, { height: parseFloat(e.target.value) || 0 })}
            className="h-8 text-sm font-mono"
          />
        </div>

        {/* Area */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Felület (m²)</Label>
          <div className="text-sm font-mono text-card-foreground">{areaM2.toFixed(2)} m²</div>
        </div>

        {/* Orientation */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tájolás</Label>
          <div className="text-sm font-mono text-card-foreground">
            {orientation.degrees}° – {orientation.compass}
          </div>
        </div>

        {/* Wall type */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Fal típusa</Label>
          <Select
            value={wall.wallType || ''}
            onValueChange={(v) => onUpdate(wall.id, { wallType: v as WallType })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Válassz..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="external">Külső fal</SelectItem>
              <SelectItem value="internal">Belső fal</SelectItem>
              <SelectItem value="unheated">Fűtetlen tér felé</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Structure type */}
        <div className="space-y-1">
          <Label htmlFor="wall-structure" className="text-xs text-muted-foreground">Szerkezeti típus</Label>
          <Input
            id="wall-structure"
            value={wall.structureType}
            onChange={(e) => onUpdate(wall.id, { structureType: e.target.value })}
            placeholder="pl. tégla 38cm"
            className="h-8 text-sm"
          />
        </div>

        {/* U-value */}
        <div className="space-y-1">
          <Label htmlFor="wall-uvalue" className="text-xs text-muted-foreground">U-érték (W/m²K)</Label>
          <Input
            id="wall-uvalue"
            type="number"
            step="0.01"
            min="0"
            value={wall.uValue ?? ''}
            onChange={(e) => onUpdate(wall.id, { uValue: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="—"
            className="h-8 text-sm font-mono"
          />
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(wall.id)}>
          <Trash2 className="h-4 w-4 mr-1" /> Fal törlése
        </Button>
      </div>
    </div>
  );
}
