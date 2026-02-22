import React from 'react';
import { ToolMode, OpeningType, FloorplanState } from '@/types/floorplan';
import { Button } from '@/components/ui/button';
import { MousePointer2, Pencil, Hand } from 'lucide-react';
import { cn } from '@/lib/utils';
import ExportDialog from './ExportDialog';

interface Props {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  wallCount: number;
  openingCount: number;
  roomCount: number;
  state: FloorplanState;
  onImport: (state: FloorplanState) => void;
}

const tools: { mode: ToolMode; icon: React.ElementType; label: string }[] = [
  { mode: 'select', icon: MousePointer2, label: 'Kiválasztás' },
  { mode: 'draw', icon: Pencil, label: 'Falrajzolás' },
  { mode: 'pan', icon: Hand, label: 'Mozgatás' },
];

const openingItems: { type: OpeningType; emoji: string; label: string }[] = [
  { type: 'window', emoji: '🪟', label: 'Ablak' },
  { type: 'door', emoji: '🚪', label: 'Ajtó' },
];

export default function Toolbar({ toolMode, onSetToolMode, wallCount, openingCount, roomCount, state, onImport }: Props) {
  const handleDragStart = (e: React.DragEvent, type: OpeningType) => {
    e.dataTransfer.setData('openingType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="flex items-center gap-1 bg-card border-b border-border px-3 py-1.5">
      <span className="text-xs font-semibold text-card-foreground mr-3 tracking-wide uppercase">Alaprajz</span>

      <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
        {tools.map(({ mode, icon: Icon, label }) => (
          <Button
            key={mode}
            variant={toolMode === mode ? 'default' : 'ghost'}
            size="sm"
            className={cn('h-8 px-3 text-xs', toolMode === mode && 'shadow-sm')}
            onClick={() => onSetToolMode(mode)}
            title={label}
          >
            <Icon className="h-4 w-4 mr-1" />
            {label}
          </Button>
        ))}
      </div>

      {/* Opening palette - drag from here onto walls */}
      <div className="ml-4 flex gap-1 items-center">
        <span className="text-xs text-muted-foreground mr-1">Nyílászárók:</span>
        {openingItems.map(({ type, emoji, label }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => handleDragStart(e, type)}
            className="flex items-center gap-1 px-2.5 py-1 bg-muted rounded-md cursor-grab active:cursor-grabbing text-xs text-card-foreground hover:bg-accent transition-colors select-none border border-transparent hover:border-border"
            title={`Húzd egy falra: ${label}`}
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="flex-1" />

      <span className="text-xs text-muted-foreground font-mono mr-3">
        {wallCount} fal · {openingCount} nyílászáró · {roomCount} helyiség
      </span>

      <ExportDialog state={state} onImport={onImport} />
    </div>
  );
}
