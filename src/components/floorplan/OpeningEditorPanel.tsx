import React, { useRef } from 'react';
import { Opening, Wall, Photo, OpeningType } from '@/types/floorplan';
import { distance, formatLength, wallOrientation, generateId } from '@/utils/geometry';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Trash2, ImagePlus, Camera } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import OpeningFrontView from './OpeningFrontView';

interface Props {
  opening: Opening;
  wall: Wall;
  gridSize: number;
  northAngle: number;
  onUpdate: (id: string, updates: Partial<Opening>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function OpeningEditorPanel({ opening, wall, gridSize, northAngle, onUpdate, onDelete, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wallLenM = distance(wall.start, wall.end) / gridSize;
  const area = opening.width * opening.height;
  const orientation = wallOrientation(wall, northAngle);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const newPhoto: Photo = {
          id: generateId(),
          data: reader.result as string,
          date: new Date().toISOString().split('T')[0],
          label: file.name,
        };
        onUpdate(opening.id, { photos: [...opening.photos, newPhoto] });
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removePhoto = (photoId: string) => {
    onUpdate(opening.id, { photos: opening.photos.filter(p => p.id !== photoId) });
  };

  return (
    <div className="w-72 bg-card border-l border-border h-full overflow-y-auto flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-card-foreground">
          {opening.type === 'window' ? '🪟 Ablak' : '🚪 Ajtó'} szerkesztése
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Type */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Típus</Label>
          <Select
            value={opening.type}
            onValueChange={(v) => onUpdate(opening.id, {
              type: v as OpeningType,
              sillHeight: v === 'door' ? 0 : opening.sillHeight || 0.9,
              height: v === 'door' ? 2.1 : 1.2,
            })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="window">Ablak</SelectItem>
              <SelectItem value="door">Ajtó</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Width */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Szélesség (m)</Label>
          <Input
            type="number" step="0.01" min="0.1" max={wallLenM * 0.9}
            value={opening.width}
            onChange={(e) => onUpdate(opening.id, { width: parseFloat(e.target.value) || 0 })}
            className="h-8 text-sm font-mono"
          />
        </div>

        {/* Height */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Magasság (m)</Label>
          <Input
            type="number" step="0.01" min="0.1"
            value={opening.height}
            onChange={(e) => onUpdate(opening.id, { height: parseFloat(e.target.value) || 0 })}
            className="h-8 text-sm font-mono"
          />
        </div>

        {/* Sill height (window only) */}
        {opening.type === 'window' && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Parapetmagasság (m)</Label>
            <Input
              type="number" step="0.01" min="0"
              value={opening.sillHeight}
              onChange={(e) => onUpdate(opening.id, { sillHeight: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm font-mono"
            />
          </div>
        )}

        {/* Frame thickness */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Keret vastagság (m)</Label>
          <Input
            type="number" step="0.01" min="0.01" max="0.3"
            value={opening.frameThickness}
            onChange={(e) => onUpdate(opening.id, { frameThickness: parseFloat(e.target.value) || 0.06 })}
            className="h-8 text-sm font-mono"
          />
        </div>

        {/* Front view */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Előnézet (szemből)</Label>
          <div className="flex justify-center py-2">
            <OpeningFrontView opening={opening} />
          </div>
        </div>

        {/* Area */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Felület (m²)</Label>
          <div className="text-sm font-mono text-card-foreground">{area.toFixed(2)} m²</div>
        </div>

        {/* U-value */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">U-érték (W/m²K)</Label>
          <Input
            type="number" step="0.01" min="0"
            value={opening.uValue ?? ''}
            onChange={(e) => onUpdate(opening.id, { uValue: e.target.value ? parseFloat(e.target.value) : null })}
            placeholder="—"
            className="h-8 text-sm font-mono"
          />
        </div>

        {/* Position along wall */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Pozíció a fal mentén ({Math.round(opening.position * 100)}%)
          </Label>
          <Slider
            value={[opening.position * 100]}
            onValueChange={([v]) => onUpdate(opening.id, { position: v / 100 })}
            min={5} max={95} step={1}
            className="mt-2"
          />
        </div>

        {/* Orientation (inherited from wall) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tájolás (faltól örökölt)</Label>
          <div className="text-sm font-mono text-card-foreground">
            {orientation.degrees}° – {orientation.compass}
          </div>
        </div>

        {/* Photos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Fotók ({opening.photos.length})</Label>
            <Button
              variant="ghost" size="sm" className="h-7 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5 mr-1" /> Hozzáadás
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />
          
          {opening.photos.length > 0 && (
            <div className="space-y-2">
              {opening.photos.map(photo => (
                <div key={photo.id} className="relative group rounded overflow-hidden border border-border">
                  <img src={photo.data} alt={photo.label} className="w-full h-24 object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      variant="destructive" size="sm" className="h-7 text-xs"
                      onClick={() => removePhoto(photo.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" /> Törlés
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-0.5">
                    <Input
                      value={photo.label}
                      onChange={(e) => {
                        const updated = opening.photos.map(p =>
                          p.id === photo.id ? { ...p, label: e.target.value } : p
                        );
                        onUpdate(opening.id, { photos: updated });
                      }}
                      className="h-5 text-[10px] bg-transparent border-none text-white p-0"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(opening.id)}>
          <Trash2 className="h-4 w-4 mr-1" /> Nyílászáró törlése
        </Button>
      </div>
    </div>
  );
}
