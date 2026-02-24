import { Wall, Room, Point } from '@/types/floorplan';
import { distance, generateId } from './geometry';

const EPSILON = 4; // pixels snap threshold for matching endpoints

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

interface GraphNode {
  point: Point;
  neighbors: { key: string; wallId: string }[];
}

/** Build adjacency graph from wall endpoints */
function buildGraph(walls: Wall[]): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();
  const endpoints: { key: string; point: Point }[] = [];

  const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

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

    // Avoid duplicate edges
    const startNode = graph.get(startKey)!;
    const endNode = graph.get(endKey)!;
    if (!startNode.neighbors.some(n => n.key === endKey))
      startNode.neighbors.push({ key: endKey, wallId: wall.id });
    if (!endNode.neighbors.some(n => n.key === startKey))
      endNode.neighbors.push({ key: startKey, wallId: wall.id });
  }

  // Sort each node's neighbors by angle (ascending atan2)
  for (const [, node] of graph) {
    node.neighbors.sort((a, b) => {
      const aNode = graph.get(a.key)!;
      const bNode = graph.get(b.key)!;
      const aAngle = Math.atan2(aNode.point.y - node.point.y, aNode.point.x - node.point.x);
      const bAngle = Math.atan2(bNode.point.y - node.point.y, bNode.point.x - node.point.x);
      return aAngle - bAngle;
    });
  }

  return graph;
}

/** Find all minimal faces using the planar face traversal (DCEL-style) algorithm */
export function detectRooms(walls: Wall[], gridSize: number, existingRooms: Room[]): Room[] {
  if (walls.length < 3) return [];

  const graph = buildGraph(walls);

  // Track used directed edges
  const usedEdges = new Set<string>();
  const cycles: string[][] = [];

  for (const [nodeKey, node] of graph) {
    for (const neighbor of node.neighbors) {
      const edgeKey = `${nodeKey}->${neighbor.key}`;
      if (usedEdges.has(edgeKey)) continue;

      const cycle = traceFace(graph, nodeKey, neighbor.key, usedEdges);
      if (cycle && cycle.length >= 3) {
        cycles.push(cycle);
      }
    }
  }

  if (cycles.length === 0) return [];

  // Compute areas, exclude outer face (largest absolute area)
  const cycleData = cycles.map(cycle => {
    const points = cycle.map(k => graph.get(k)!.point);
    const area = Math.abs(signedPolygonArea(points));
    return { cycle, points, area };
  });

  let maxArea = 0;
  let outerIdx = 0;
  cycleData.forEach((d, i) => {
    if (d.area > maxArea) { maxArea = d.area; outerIdx = i; }
  });

  // Interior faces = rooms
  const interiorCycles = cycleData.filter((_, i) => i !== outerIdx);

  return interiorCycles.map((data, idx) => {
    const { cycle, area } = data;
    const areaM2 = area / (gridSize * gridSize);

    // Skip tiny degenerate faces
    if (areaM2 < 0.01) return null;

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

    // Try to preserve existing room data
    const existing = existingRooms.find(r => {
      const sortedExisting = [...r.wallIds].sort();
      const sortedNew = [...wallIds].sort();
      return sortedExisting.length === sortedNew.length &&
        sortedExisting.every((id, i) => id === sortedNew[i]);
    });

    return {
      id: existing?.id || generateId(),
      name: existing?.name || `Helyiség ${idx + 1}`,
      wallIds,
      ceilingHeight: existing?.ceilingHeight || 2.8,
    };
  }).filter(Boolean) as Room[];
}

/**
 * Trace one face of the planar graph using DCEL-style traversal.
 * At each node, after arriving from prevKey, pick the PREVIOUS neighbor
 * in sorted-angle order (the face to the left of the directed edge).
 */
function traceFace(
  graph: Map<string, GraphNode>,
  startKey: string,
  secondKey: string,
  usedEdges: Set<string>
): string[] | null {
  const path: string[] = [startKey];
  let prevKey = startKey;
  let currentKey = secondKey;
  const maxSteps = 50;

  for (let step = 0; step < maxSteps; step++) {
    const edgeKey = `${prevKey}->${currentKey}`;
    if (usedEdges.has(edgeKey)) return null;
    usedEdges.add(edgeKey);

    if (currentKey === startKey) {
      // Completed the face
      return path;
    }

    path.push(currentKey);

    const node = graph.get(currentKey);
    if (!node || node.neighbors.length < 2) return null;

    // Find prevKey in sorted neighbors
    const reverseIdx = node.neighbors.findIndex(n => n.key === prevKey);
    if (reverseIdx === -1) return null;

    // Take the previous neighbor in sorted order (face to the left)
    const nextIdx = (reverseIdx - 1 + node.neighbors.length) % node.neighbors.length;
    const nextNeighbor = node.neighbors[nextIdx];

    prevKey = currentKey;
    currentKey = nextNeighbor.key;
  }

  return null;
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
