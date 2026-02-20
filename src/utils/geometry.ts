import { Point, Wall } from '@/types/floorplan';

export function distance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function wallLength(wall: Wall): number {
  return distance(wall.start, wall.end);
}

export function angleBetweenPoints(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function angleDeg(a: Point, b: Point): number {
  return (angleBetweenPoints(a, b) * 180) / Math.PI;
}

/** Snap angle to nearest 0/90/180/270 if within threshold (degrees) */
export function snapAngle(angle: number, threshold: number = 5): number {
  const snaps = [0, 90, 180, 270, 360, -90, -180, -270];
  for (const s of snaps) {
    if (Math.abs(angle - s) < threshold) return s;
  }
  return angle;
}

/** Given start point and a raw end point, snap the end to 0/90/180/270 if close */
export function snapEndPoint(start: Point, rawEnd: Point, threshold: number = 5): Point {
  const angle = angleDeg(start, rawEnd);
  const snapped = snapAngle(angle, threshold);
  if (snapped === angle) return rawEnd;
  
  const dist = distance(start, rawEnd);
  const rad = (snapped * Math.PI) / 180;
  return {
    x: start.x + dist * Math.cos(rad),
    y: start.y + dist * Math.sin(rad),
  };
}

/** Snap point to nearest existing endpoint within radius */
export function snapToEndpoints(
  point: Point,
  walls: Wall[],
  radius: number,
  excludeWallId?: string
): Point | null {
  let closest: Point | null = null;
  let closestDist = Infinity;

  for (const wall of walls) {
    if (wall.id === excludeWallId) continue;
    for (const ep of [wall.start, wall.end]) {
      const d = distance(point, ep);
      if (d < radius && d < closestDist) {
        closestDist = d;
        closest = ep;
      }
    }
  }
  return closest;
}

/** Snap point to grid */
export function snapToGrid(point: Point, gridSpacing: number): Point {
  return {
    x: Math.round(point.x / gridSpacing) * gridSpacing,
    y: Math.round(point.y / gridSpacing) * gridSpacing,
  };
}

/** Get compass direction string from angle in degrees */
export function compassDirection(angleDegrees: number): string {
  // Normalize to 0-360
  let a = ((angleDegrees % 360) + 360) % 360;
  const dirs = ['É', 'ÉK', 'K', 'DK', 'D', 'DNy', 'Ny', 'ÉNy'];
  const idx = Math.round(a / 45) % 8;
  return dirs[idx];
}

/** Wall orientation considering north angle */
export function wallOrientation(wall: Wall, northAngle: number): { degrees: number; compass: string } {
  // Wall normal direction (perpendicular to wall, pointing "outward")
  const angle = angleDeg(wall.start, wall.end);
  // Normal is perpendicular: angle + 90
  const normalAngle = ((angle + 90 - northAngle) % 360 + 360) % 360;
  return {
    degrees: Math.round(normalAngle * 100) / 100,
    compass: compassDirection(normalAngle),
  };
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/** Meters to display string */
export function formatLength(meters: number): string {
  return meters.toFixed(2) + ' m';
}
