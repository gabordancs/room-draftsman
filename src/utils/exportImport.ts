import { FloorplanState, Wall, Opening, Room } from '@/types/floorplan';
import { wallLength, wallOrientation } from './geometry';
import { getRoomPolygonPoints } from './roomDetection';
import { distance } from './geometry';

export interface ValidationError {
  type: 'error' | 'warning';
  message: string;
  entityType?: 'wall' | 'opening' | 'room' | 'global';
  entityId?: string;
}

export function validateFloorplan(state: FloorplanState): ValidationError[] {
  const errors: ValidationError[] = [];
  const { walls, openings, rooms, northAngle, gridSize } = state;

  // Global checks
  if (walls.length === 0) {
    errors.push({ type: 'error', message: 'Nincs fal a rajzon.', entityType: 'global' });
  }

  // Wall checks
  for (const wall of walls) {
    const lenM = wallLength(wall) / gridSize;
    if (lenM < 0.01) {
      errors.push({ type: 'error', message: `Fal hossza 0 (${wall.id.slice(0, 5)}).`, entityType: 'wall', entityId: wall.id });
    }
    if (!wall.wallType) {
      errors.push({ type: 'warning', message: `Fal típusa nincs megadva (${wall.id.slice(0, 5)}).`, entityType: 'wall', entityId: wall.id });
    }
  }

  // Opening checks
  for (const opening of openings) {
    const wall = walls.find(w => w.id === opening.wallId);
    if (!wall) {
      errors.push({ type: 'error', message: `Nyílászáró nincs falhoz rendelve (${opening.id.slice(0, 5)}).`, entityType: 'opening', entityId: opening.id });
      continue;
    }
    const wallLenM = wallLength(wall) / gridSize;
    const halfRatio = (opening.width / wallLenM) / 2;
    if (opening.position - halfRatio < -0.01 || opening.position + halfRatio > 1.01) {
      errors.push({ type: 'error', message: `Nyílászáró túllóg a falon (${opening.id.slice(0, 5)}).`, entityType: 'opening', entityId: opening.id });
    }
  }

  // Room checks
  for (const room of rooms) {
    const pts = getRoomPolygonPoints(room, walls);
    if (!pts || pts.length < 3) {
      errors.push({ type: 'warning', message: `Helyiség nem zárt: ${room.name}.`, entityType: 'room', entityId: room.id });
    }
  }

  return errors;
}

// ─── JSON export/import ─────────────────────────

export function exportJSON(state: FloorplanState): string {
  return JSON.stringify(state, null, 2);
}

export function downloadJSON(state: FloorplanState) {
  const json = exportJSON(state);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `alaprajz_${timestamp()}.json`);
}

export function importJSON(jsonStr: string): FloorplanState | null {
  try {
    const data = JSON.parse(jsonStr) as FloorplanState;
    // Basic validation
    if (!Array.isArray(data.walls) || !Array.isArray(data.openings)) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── XLSX export ────────────────────────────────

export async function exportXLSX(state: FloorplanState) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const { walls, openings, rooms, gridSize, northAngle } = state;

  // ── Walls sheet ──
  const wallRows = walls.map((w, i) => {
    const lenM = wallLength(w) / gridSize;
    const orient = wallOrientation(w, northAngle);
    return {
      'Sorszám': i + 1,
      'Fal ID': w.id,
      'Típus': wallTypeLabel(w.wallType),
      'Hossz (m)': round2(lenM),
      'Magasság (m)': round2(w.height),
      'Felület (m²)': round2(lenM * w.height),
      'Tájolás (°)': orient.degrees,
      'Égtáj': orient.compass,
      'Szerkezet': w.structureType || '',
      'U-érték (W/m²K)': w.uValue ?? '',
    };
  });
  const wsWalls = XLSX.utils.json_to_sheet(wallRows);
  XLSX.utils.book_append_sheet(wb, wsWalls, 'Falak');

  // ── Openings sheet ──
  const openingRows = openings.map((o, i) => {
    const wall = walls.find(w => w.id === o.wallId);
    const wallLenM = wall ? wallLength(wall) / gridSize : 0;
    return {
      'Sorszám': i + 1,
      'Nyílászáró ID': o.id,
      'Típus': o.type === 'window' ? 'Ablak' : 'Ajtó',
      'Fal ID': o.wallId,
      'Szélesség (m)': round2(o.width),
      'Magasság (m)': round2(o.height),
      'Felület (m²)': round2(o.width * o.height),
      'Parapetmagasság (m)': o.type === 'window' ? round2(o.sillHeight) : '',
      'U-érték (W/m²K)': o.uValue ?? '',
      'Pozíció (%)': Math.round(o.position * 100),
    };
  });
  const wsOpenings = XLSX.utils.json_to_sheet(openingRows);
  XLSX.utils.book_append_sheet(wb, wsOpenings, 'Nyílászárók');

  // ── Rooms sheet ──
  const roomRows = rooms.map((r, i) => {
    const pts = getRoomPolygonPoints(r, walls);
    const areaM2 = pts ? calcArea(pts) / (gridSize * gridSize) : 0;
    return {
      'Sorszám': i + 1,
      'Helyiség ID': r.id,
      'Név': r.name,
      'Alapterület (m²)': round2(areaM2),
      'Belmagasság (m)': round2(r.ceilingHeight),
      'Légtérfogat (m³)': round2(areaM2 * r.ceilingHeight),
      'Falak száma': r.wallIds.length,
    };
  });
  const wsRooms = XLSX.utils.json_to_sheet(roomRows);
  XLSX.utils.book_append_sheet(wb, wsRooms, 'Helyiségek');

  // ── Summary sheet ──
  const summary = [
    { 'Adat': 'Összes fal', 'Érték': walls.length },
    { 'Adat': 'Összes nyílászáró', 'Érték': openings.length },
    { 'Adat': 'Összes helyiség', 'Érték': rooms.length },
    { 'Adat': 'Északi irány (°)', 'Érték': northAngle },
    { 'Adat': 'Exportálva', 'Érték': new Date().toLocaleString('hu-HU') },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summary);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Összefoglaló');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `alaprajz_${timestamp()}.xlsx`);
}

// ─── Helpers ────────────────────────────────────

function calcArea(points: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function wallTypeLabel(type: string | null): string {
  switch (type) {
    case 'external': return 'Külső fal';
    case 'internal': return 'Belső fal';
    case 'unheated': return 'Fűtetlen tér felé';
    default: return '—';
  }
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
