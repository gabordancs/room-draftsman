import { Wall, WallConstraint, Point } from '@/types/floorplan';
import { distance, angleBetweenPoints } from './geometry';

/**
 * Apply constraints to a wall's endpoint.
 * Priority: perpendicular > parallel > horizontal/vertical > fixedLength
 */
export function applyConstraints(
  wall: Wall,
  walls: Wall[],
  gridSize: number,
  movingEndpoint: 'end' | 'start' = 'end'
): Point {
  const constraints = wall.constraints;
  if (!constraints || constraints.length === 0) {
    return movingEndpoint === 'end' ? wall.end : wall.start;
  }

  const anchor = movingEndpoint === 'end' ? wall.start : wall.end;
  let target = movingEndpoint === 'end' ? wall.end : wall.start;
  const currentDist = distance(anchor, target);

  // Sort by priority: perpendicular(0) > parallel(1) > horizontal/vertical(2) > fixedLength(3)
  const sorted = [...constraints].sort((a, b) => priorityOf(a.type) - priorityOf(b.type));

  for (const c of sorted) {
    switch (c.type) {
      case 'perpendicular': {
        const refWall = walls.find(w => w.id === c.refWallId);
        if (!refWall) break;
        const refAngle = angleBetweenPoints(refWall.start, refWall.end);
        const perpAngle = refAngle + Math.PI / 2;
        target = projectOnAngle(anchor, target, perpAngle, currentDist);
        break;
      }
      case 'parallel': {
        const refWall = walls.find(w => w.id === c.refWallId);
        if (!refWall) break;
        const refAngle = angleBetweenPoints(refWall.start, refWall.end);
        target = projectOnAngle(anchor, target, refAngle, currentDist);
        break;
      }
      case 'horizontal':
        target = { x: target.x, y: anchor.y };
        break;
      case 'vertical':
        target = { x: anchor.x, y: target.y };
        break;
      case 'fixedLength': {
        if (c.fixedLengthM != null) {
          const lenPx = c.fixedLengthM * gridSize;
          const angle = angleBetweenPoints(anchor, target);
          target = {
            x: anchor.x + Math.cos(angle) * lenPx,
            y: anchor.y + Math.sin(angle) * lenPx,
          };
        }
        break;
      }
    }
  }

  return target;
}

function priorityOf(type: string): number {
  switch (type) {
    case 'perpendicular': return 0;
    case 'parallel': return 1;
    case 'horizontal':
    case 'vertical': return 2;
    case 'fixedLength': return 3;
    default: return 99;
  }
}

function projectOnAngle(anchor: Point, target: Point, angle: number, fallbackDist: number): Point {
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  // Project target onto the constraint direction
  let proj = dx * dirX + dy * dirY;
  if (Math.abs(proj) < 1) proj = fallbackDist; // avoid zero-length
  return {
    x: anchor.x + dirX * proj,
    y: anchor.y + dirY * proj,
  };
}

/** Find walls that share an endpoint with the given wall */
export function findConnectedWalls(wall: Wall, walls: Wall[], threshold: number = 1): Wall[] {
  return walls.filter(w => {
    if (w.id === wall.id) return false;
    return (
      distance(wall.start, w.start) < threshold ||
      distance(wall.start, w.end) < threshold ||
      distance(wall.end, w.start) < threshold ||
      distance(wall.end, w.end) < threshold
    );
  });
}

/** Get constraint display label */
export function constraintLabel(type: string): string {
  switch (type) {
    case 'perpendicular': return '⊥';
    case 'parallel': return '∥';
    case 'horizontal': return '—';
    case 'vertical': return '|';
    case 'fixedLength': return '🔒';
    default: return '?';
  }
}

export function constraintName(type: string): string {
  switch (type) {
    case 'perpendicular': return 'Derékszög (⊥)';
    case 'parallel': return 'Párhuzamos (∥)';
    case 'horizontal': return 'Vízszintes';
    case 'vertical': return 'Függőleges';
    case 'fixedLength': return 'Rögzített hossz';
    default: return type;
  }
}
