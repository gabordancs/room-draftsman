import React from 'react';
import { Wall, WallType, WallConstraint, ConstraintType } from '@/types/floorplan';
import { wallLength, formatLength, wallOrientation } from '@/utils/geometry';
import { findConnectedWalls, constraintName } from '@/utils/constraintSolver';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { X, Trash2, ImagePlus } from 'lucide-react';
import { Photo } from '@/types/floorplan';

interface Props {
  wall: Wall;
  walls: Wall[];
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
  virtual: 'Virtuális fal',
};

const SIMPLE_CONSTRAINTS: ConstraintType[] = ['horizontal', 'vertical', 'fixedLength'];
const REF_CONSTRAINTS: ConstraintType[] = ['perpendicular', 'parallel'];

export default function WallEditorPanel({ wall, walls, gridSize, northAngle, onUpdate, onDelete, onClose }: Props) {
  const lengthM = wallLength(wall) / gridSize;
  const areaM2 = lengthM * wall.height;
  const orientation = wallOrientation(wall, northAngle);
  const connectedWalls = findConnectedWalls(wall, walls);
  const constraints = wall.constraints || [];
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const photo: Photo = {
          id: Math.random().toString(36).substr(2, 9),
          data: reader.result as string,
          date: new Date().toISOString(),
          label: '',
        };
        onUpdate(wall.id, { photos: [...(wall.photos || []), photo] });
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (photoId: string) => {
    onUpdate(wall.id, { photos: (wall.photos || []).filter(p => p.id !== photoId) });
  };

  const hasConstraint = (type: ConstraintType, refId?: string) =>
    constraints.some(c => c.type === type && (refId == null || c.refWallId === refId));

  const toggleSimpleConstraint = (type: ConstraintType) => {
    if (hasConstraint(type)) {
      onUpdate(wall.id, { constraints: constraints.filter(c => c.type !== type) });
    } else {
      const newC: WallConstraint = { type };
      if (type === 'fixedLength') {
        newC.fixedLengthM = Math.round(lengthM * 100) / 100;
      }
      // Remove conflicting: horizontal <-> vertical
      let filtered = constraints.filter(c => {
        if (type === 'horizontal' && c.type === 'vertical') return false;
        if (type === 'vertical' && c.type === 'horizontal') return false;
        return true;
      });
      onUpdate(wall.id, { constraints: [...filtered, newC] });
    }
  };

  const toggleRefConstraint = (type: ConstraintType, refWallId: string) => {
    if (hasConstraint(type, refWallId)) {
      onUpdate(wall.id, { constraints: constraints.filter(c => !(c.type === type && c.refWallId === refWallId)) });
    } else {
      // Remove conflicting ref constraints of same type
      let filtered = constraints.filter(c => c.type !== type);
      onUpdate(wall.id, { constraints: [...filtered, { type, refWallId }] });
    }
  };

  const updateFixedLength = (val: number) => {
    onUpdate(wall.id, {
      constraints: constraints.map(c =>
        c.type === 'fixedLength' ? { ...c, fixedLengthM: val } : c
      ),
    });
  };

  const fixedLengthConstraint = constraints.find(c => c.type === 'fixedLength');

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
              <SelectItem value="virtual">Virtuális fal</SelectItem>
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

        {/* ── Photos section ── */}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Fotók ({(wall.photos || []).length})</Label>
            <Button
              variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => photoInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5 mr-1" /> Hozzáadás
            </Button>
          </div>
          <input
            ref={photoInputRef}
            type="file" accept="image/*" multiple className="hidden"
            onChange={handlePhotoUpload}
          />
          {(wall.photos || []).map(photo => (
            <div key={photo.id} className="relative group">
              <img src={photo.data} alt={photo.label || 'Fotó'} className="w-full rounded border border-border" />
              <Button
                variant="destructive" size="icon"
                className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removePhoto(photo.id)}
              >
                <X className="h-3 w-3" />
              </Button>
              <Input
                value={photo.label}
                onChange={(e) => onUpdate(wall.id, {
                  photos: (wall.photos || []).map(p => p.id === photo.id ? { ...p, label: e.target.value } : p)
                })}
                placeholder="Címke..."
                className="h-7 text-xs mt-1"
              />
            </div>
          ))}
        </div>

        {/* ── Constraints section ── */}
        <div className="border-t border-border pt-4 space-y-3">
          <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Kényszerek</Label>

          {/* Simple constraints */}
          {SIMPLE_CONSTRAINTS.map(type => (
            <div key={type} className="flex items-center justify-between">
              <span className="text-xs text-card-foreground">{constraintName(type)}</span>
              <Switch
                checked={hasConstraint(type)}
                onCheckedChange={() => toggleSimpleConstraint(type)}
              />
            </div>
          ))}

          {/* Fixed length value input */}
          {fixedLengthConstraint && (
            <div className="space-y-1 pl-2">
              <Label htmlFor="fixed-len" className="text-xs text-muted-foreground">Rögzített hossz (m)</Label>
              <Input
                id="fixed-len"
                type="number"
                step="0.01"
                min="0.01"
                value={fixedLengthConstraint.fixedLengthM ?? ''}
                onChange={(e) => updateFixedLength(parseFloat(e.target.value) || 0.01)}
                className="h-8 text-sm font-mono"
              />
            </div>
          )}

          {/* Reference constraints (need connected walls) */}
          {connectedWalls.length > 0 && (
            <div className="space-y-2 pt-1">
              <Label className="text-xs text-muted-foreground">Csatlakozó falakhoz képest</Label>
              {connectedWalls.map(ref => {
                const refLenM = wallLength(ref) / gridSize;
                return (
                  <div key={ref.id} className="bg-muted/50 rounded-md p-2 space-y-1.5">
                    <span className="text-xs text-muted-foreground font-mono">
                      Fal ({formatLength(refLenM)})
                    </span>
                    {REF_CONSTRAINTS.map(type => (
                      <div key={type} className="flex items-center justify-between pl-1">
                        <span className="text-xs text-card-foreground">{constraintName(type)}</span>
                        <Switch
                          checked={hasConstraint(type, ref.id)}
                          onCheckedChange={() => toggleRefConstraint(type, ref.id)}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
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
