import { Wall, Room, Point } from '@/types/floorplan';
import { distance, generateId } from './geometry';

interface WallEndpoint {
  point: Point;
  wallId: string;
  isStart: boolean;
}

const EPSILON = 2; // pixels snap threshold for matching endpoints

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

/** Build adjacency graph from wall endpoints */
function buildGraph(walls: Wall[]): Map<string, { point: Point; neighbors: { key: string; wallId: string }[] }> {
  const graph = new Map<string, { point: Point; neighbors: { key: string; wallId: string }[] }>();

  const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

  // Collect all endpoints, merging nearby ones
  const endpoints: { key: string; point: Point }[] = [];
  
  const getOrCreateKey = (p: Point): string => {
    for (const ep of endpoints) {
      if (pointsEqual(ep.point, p)) return ep.key;
    }
    const key = pointKey(p);
    endpoints.push({ key, point: p });
    return key;
  };

  for (const wall of walls) {
    const startKey = getOrCreateKey(wall.start);
    const endKey = getOrCreateKey(wall.end);
    if (startKey === endKey) continue;

    if (!graph.has(startKey)) graph.set(startKey, { point: wall.start, neighbors: [] });
    if (!graph.has(endKey)) graph.set(endKey, { point: wall.end, neighbors: [] });

    graph.get(startKey)!.neighbors.push({ key: endKey, wallId: wall.id });
    graph.get(endKey)!.neighbors.push({ key: startKey, wallId: wall.id });
  }

  return graph;
}

/** Find all minimal cycles (rooms) using the planar graph face-finding algorithm */
export function detectRooms(walls: Wall[], gridSize: number, existingRooms: Room[]): Room[] {
  if (walls.length < 3) return [];

  const graph = buildGraph(walls);
  const cycles: string[][] = [];
  const foundCycleKeys = new Set<string>();

  // For each node, try to find minimal cycles using "next edge" traversal
  // (left-most turn / smallest angle)
  for (const [startKey] of graph) {
    const node = graph.get(startKey)!;
    for (const firstNeighbor of node.neighbors) {
      const cycle = traceCycle(graph, startKey, firstNeighbor.key);
      if (cycle && cycle.length >= 3) {
        const cycleKey = normalizeCycleKey(cycle);
        if (!foundCycleKeys.has(cycleKey)) {
          foundCycleKeys.add(cycleKey);
          cycles.push(cycle);
        }
      }
    }
  }

  // Convert cycles to rooms
  return cycles.map(cycle => {
    const points = cycle.map(key => graph.get(key)!.point);
    const area = polygonArea(points) / (gridSize * gridSize); // m²

    // Find wallIds for this cycle
    const wallIds: string[] = [];
    for (let i = 0; i < cycle.length; i++) {
      const fromKey = cycle[i];
      const toKey = cycle[(i + 1) % cycle.length];
      const node = graph.get(fromKey)!;
      const edge = node.neighbors.find(n => n.key === toKey);
      if (edge && !wallIds.includes(edge.wallId)) {
        wallIds.push(edge.wallId);
      }
    }

    // Try to preserve existing room data (name, ceiling height) if walls match
    const existing = existingRooms.find(r => {
      const sortedExisting = [...r.wallIds].sort();
      const sortedNew = [...wallIds].sort();
      return sortedExisting.length === sortedNew.length &&
        sortedExisting.every((id, i) => id === sortedNew[i]);
    });

    return {
      id: existing?.id || generateId(),
      name: existing?.name || `Helyiség ${cycles.indexOf(cycle) + 1}`,
      wallIds,
      ceilingHeight: existing?.ceilingHeight || 2.8,
    };
  });
}

function traceCycle(
  graph: Map<string, { point: Point; neighbors: { key: string; wallId: string }[] }>,
  startKey: string,
  secondKey: string
): string[] | null {
  const path: string[] = [startKey, secondKey];
  let prevKey = startKey;
  let currentKey = secondKey;
  const maxSteps = 20;

  for (let step = 0; step < maxSteps; step++) {
    const current = graph.get(currentKey);
    if (!current) return null;

    // Get incoming angle
    const prev = graph.get(prevKey)!;
    const inAngle = Math.atan2(
      current.point.y - prev.point.y,
      current.point.x - prev.point.x
    );

    // Find the neighbor with the smallest left turn (counterclockwise)
    let bestKey: string | null = null;
    let bestAngle = Infinity;

    for (const neighbor of current.neighbors) {
      if (neighbor.key === prevKey) continue;
      const next = graph.get(neighbor.key);
      if (!next) continue;

      const outAngle = Math.atan2(
        next.point.y - current.point.y,
        next.point.x - current.point.x
      );

      // Calculate the signed turn angle (want smallest right turn = largest left turn)
      let turnAngle = outAngle - inAngle;
      // Normalize to (-PI, PI]
      while (turnAngle <= -Math.PI) turnAngle += 2 * Math.PI;
      while (turnAngle > Math.PI) turnAngle -= 2 * Math.PI;

      // We want the rightmost turn (most negative angle), which traces the minimal face
      if (turnAngle < bestAngle) {
        bestAngle = turnAngle;
        bestKey = neighbor.key;
      }
    }

    if (!bestKey) return null;

    if (bestKey === startKey) {
      // Completed cycle - check it's counterclockwise (positive area = interior face)
      const points = path.map(k => graph.get(k)!.point);
      const area = signedPolygonArea(points);
      if (area > 0) return path; // CCW = valid room
      return null; // CW = outer boundary
    }

    if (path.includes(bestKey)) return null; // self-intersection
    path.push(bestKey);
    prevKey = currentKey;
    currentKey = bestKey;
  }

  return null;
}

function normalizeCycleKey(cycle: string[]): string {
  // Normalize: start from smallest key, try both directions
  const forward = [...cycle];
  const backward = [...cycle].reverse();
  
  const normalize = (arr: string[]) => {
    const minIdx = arr.indexOf(arr.reduce((a, b) => a < b ? a : b));
    return [...arr.slice(minIdx), ...arr.slice(0, minIdx)].join('|');
  };

  const fKey = normalize(forward);
  const bKey = normalize(backward);
  return fKey < bKey ? fKey : bKey;
}

function signedPolygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

function polygonArea(points: Point[]): number {
  return Math.abs(signedPolygonArea(points));
}

/** Get the centroid of a polygon for label placement */
export function polygonCentroid(points: Point[]): Point {
  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / points.length, y: cy / points.length };
}

/** Get polygon points for a room from its walls */
export function getRoomPolygonPoints(room: Room, walls: Wall[]): Point[] | null {
  const roomWalls = room.wallIds.map(id => walls.find(w => w.id === id)).filter(Boolean) as Wall[];
  if (roomWalls.length < 3) return null;

  // Build ordered point list by following connected walls
  const points: Point[] = [];
  const used = new Set<string>();
  
  let current = roomWalls[0];
  used.add(current.id);
  points.push(current.start);
  let lastPoint = current.end;
  points.push(lastPoint);

  for (let i = 1; i < roomWalls.length; i++) {
    const next = roomWalls.find(w => {
      if (used.has(w.id)) return false;
      return pointsEqual(w.start, lastPoint) || pointsEqual(w.end, lastPoint);
    });
    if (!next) break;
    used.add(next.id);
    if (pointsEqual(next.start, lastPoint)) {
      lastPoint = next.end;
    } else {
      lastPoint = next.start;
    }
    points.push(lastPoint);
  }

  // Remove last point if it equals first (closed polygon)
  if (points.length > 1 && pointsEqual(points[0], points[points.length - 1])) {
    points.pop();
  }

  return points.length >= 3 ? points : null;
}
