

## Helyiség elnevezés javítása

### Probléma
1. Ha egy helyiség nevet kap, az a `recalcRooms` újrafutásakor elveszhet, mert a matching csak wallIds egyezés alapján működik — ha a falak topológiája nem változik, de az `idx` sorrendje igen, az alapértelmezett név (`Helyiség ${idx+1}`) felülírhatja.
2. Két helyiség kaphat azonos nevet, nincs duplikáció-ellenőrzés.

### Megoldás

**1. `src/utils/roomDetection.ts` — Robusztusabb név-megőrzés + egyediség**

A `detectRooms` függvényben:
- Az existing room matching már működik wallIds alapján. Ezt kiegészítjük egy **centroid-alapú közelítő illesztéssel** is, hogy ha a wallIds megváltoztak (pl. fal kettévágás), de a helyiség geometriailag ugyanaz, a neve megmaradjon.
- Az alapértelmezett név generálásnál biztosítjuk az **egyediséget**: ha `Helyiség 1` már foglalt, `Helyiség 2`-t adunk, stb.
- A `name` mezőt csak akkor állítjuk be alapértelmezettre, ha nincs illeszkedő existing room.

**2. `src/components/floorplan/RoomEditorPanel.tsx` — Duplikáció-ellenőrzés a UI-ban**

- A név módosításakor ellenőrizzük, hogy a megadott név nem egyezik-e egy másik helyiség nevével.
- Ha igen, hibaüzenetet jelenítünk meg és nem engedjük menteni.

### Érintett fájlok

| Fájl | Változás |
|------|----------|
| `src/utils/roomDetection.ts` | Egyedi alapértelmezett név generálás + centroid matching fallback |
| `src/components/floorplan/RoomEditorPanel.tsx` | Duplikáció-ellenőrzés az Input mezőnél |
| `src/pages/Index.tsx` | `rooms` prop átadása a `RoomEditorPanel`-nek a duplikáció-ellenőrzéshez |

### Technikai részletek

**roomDetection.ts — egyedi név generálás:**
```typescript
// Collect used names from matched existing rooms first
const usedNames = new Set<string>();

// After mapping, generate unique default names for new rooms
function uniqueDefaultName(usedNames: Set<string>): string {
  let i = 1;
  while (usedNames.has(`Helyiség ${i}`)) i++;
  const name = `Helyiség ${i}`;
  usedNames.add(name);
  return name;
}
```

**RoomEditorPanel — duplikáció-ellenőrzés:**
```typescript
// Props-ban megkapja az összes room-ot
const isDuplicate = allRooms.some(r => r.id !== room.id && r.name === room.name);
// Ha duplikált, piros border + hibaüzenet
```

