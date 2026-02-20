import React from 'react';
import { ToolMode } from '@/types/floorplan';
import { Button } from '@/components/ui/button';
import { MousePointer2, Pencil, Hand, Undo2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  toolMode: ToolMode;
  onSetToolMode: (mode: ToolMode) => void;
  wallCount: number;
}

const tools: { mode: ToolMode; icon: React.ElementType; label: string }[] = [
  { mode: 'select', icon: MousePointer2, label: 'Kiválasztás' },
  { mode: 'draw', icon: Pencil, label: 'Falrajzolás' },
  { mode: 'pan', icon: Hand, label: 'Mozgatás' },
];

export default function Toolbar({ toolMode, onSetToolMode, wallCount }: Props) {
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

      <div className="flex-1" />
      
      <span className="text-xs text-muted-foreground font-mono">
        {wallCount} fal
      </span>
    </div>
  );
}
