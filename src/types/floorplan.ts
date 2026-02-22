export interface Point {
  x: number;
  y: number;
}

export interface Photo {
  id: string;
  data: string; // base64
  date: string;
  label: string;
}

export type WallType = 'external' | 'internal' | 'unheated';

export type ConstraintType = 'perpendicular' | 'parallel' | 'horizontal' | 'vertical' | 'fixedLength';

export interface WallConstraint {
  type: ConstraintType;
  /** For perpendicular/parallel: the reference wall id */
  refWallId?: string;
  /** For fixedLength: the locked length in meters */
  fixedLengthM?: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  height: number; // meters
  wallType: WallType | null;
  structureType: string;
  uValue: number | null;
  photos: Photo[];
  constraints: WallConstraint[];
}

export type OpeningType = 'window' | 'door';

export interface Opening {
  id: string;
  type: OpeningType;
  wallId: string;
  width: number; // m
  height: number; // m
  sillHeight: number; // m, for windows
  uValue: number | null;
  position: number; // 0-1, relative position along wall
  photos: Photo[];
}

export interface Room {
  id: string;
  name: string;
  wallIds: string[];
  ceilingHeight: number; // m
}

export type ToolMode = 'select' | 'draw' | 'pan';

export interface FloorplanState {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedRoomId: string | null;
  toolMode: ToolMode;
  globalWallHeight: number;
  northAngle: number; // degrees
  gridSize: number; // pixels per meter
}
