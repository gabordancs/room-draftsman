

# 2D Alaprajz-rajzoló Modul – Fejlesztési Terv

## Összefoglaló
Mérnöki pontosságú, böngészőalapú 2D alaprajz-rajzoló alkalmazás, amely falak rajzolását, nyílászárók elhelyezését és WinWatt-kompatibilis exportot biztosít. Az adatok session-alapúak, mentés exporton keresztül (JSON/XLSX), fotók base64-ként beágyazva.

---

## 1. fázis: Rajzvászon és falrajzolás

### Vászon (Canvas)
- HTML Canvas alapú vektor-rajzfelület, zoom/pan támogatással
- Rács (grid) háttér konfigurálható léptékkel
- Apple Pencil / stylus / egér támogatás (pointer events API)

### Falrajzolás
- Szabadkézi vonalhúzás → automatikus egyenesítés fal objektummá
- Rajzolás közben valós idejű hossz-kijelzés (m, 2 tizedessel)
- Snap rendszer: sarokpontokra + 0°/90°/180° irányokra ragadás
- Okos rajzolás: közel vízszintes/függőleges vonalak automatikus igazítása

### Fal szerkesztőpanel
- Fal kiválasztásakor megjelenő oldalsó panel:
  - Hossz (m, numerikusan felülírható)
  - Magasság (m, globális alapérték + egyedi módosítás)
  - Fal típusa: külső / belső / fűtetlen tér felé
  - Szerkezeti típus (opcionális szöveges)
  - U-érték (opcionális, W/m²K)

---

## 2. fázis: Geometriai kényszerek (Constraint rendszer)

- Falanként bekapcsolható kényszerek:
  - Derékszög (⊥), párhuzamosság (∥)
  - Vízszintes / függőleges rögzítés
  - Hossz rögzítés (parametrikus)
- Kényszerek vizuális megjelenítése ikonokkal a falakon
- Kényszer-prioritás: derékszög > párhuzamos > hossz
- Kényszerek feloldhatók egyenként
- Csatlakozó falak mozgatásakor a kényszerek megmaradnak

---

## 3. fázis: Tájolás – Kompasz

- Forgatható „Észak" kompasz vízjel a vászon sarkában
- 0–360° forgatás, a rajzot nem mozgatja
- Falak tájolása automatikusan számítva:
  - Fokban (0–360°)
  - Égtáj szerint (É, ÉK, K, DK, D, DNy, Ny, ÉNy)

---

## 4. fázis: Nyílászárók (ablak, ajtó)

### Elhelyezés
- Drag-and-drop paletta ablak/ajtó ikonokkal
- Nyílászáró csak falra helyezhető (ütközés- és peremellenőrzés)
- Fal mozgatásakor a nyílászáró együtt mozog

### Nyílászáró paraméterek
- Típus (ablak / ajtó)
- Szélesség, magasság (m)
- Parapetmagasság (ablaknál)
- Felület (m², automatikusan számított)
- U-érték
- Beépítési pozíció (relatív % a fal mentén)

### Fotócsatolás
- Nyílászáróhoz és falhoz 1 vagy több fotó csatolható
- Fotók base64-ként tárolódnak
- Metaadatok: dátum, megjegyzés/címke
- Exportban a fotók base64 adatként jelennek meg

---

## 5. fázis: Helyiségfelismerés

- Zárt falpoligonból automatikus helyiség-detektálás
- Helyiségadatok:
  - Név (szerkeszthető)
  - Alapterület (m², automatikus)
  - Belmagasság (m)
  - Légtérfogat (m³, számított)

---

## 6. fázis: Export (WinWatt-kompatibilis)

### Validáció export előtt
- Export tiltása, ha: falhossz = 0, hiányzó faltípus, nincs északi irány, nyílászáró nincs falhoz rendelve, nyílászáró túllóg, helyiség nem zárt

### Export formátumok
- **JSON** – teljes adatmodell automatizált feldolgozáshoz
- **XLSX** – WinWatt-barát oszlopnevekkel, falak/nyílászárók/helyiségek külön lapokon
- **Projekt import** – JSON visszatöltés a munkamenet folytatásához

---

## Technikai megközelítés
- HTML Canvas + pointer events (stylus/egér/touch)
- Saját geometriai modell: fal, nyílászáró, helyiség entitások
- Constraint-solver egyszerű kényszerekhezz
- 0,01 m pontosság
- Reszponzív: desktop + iPad támogatás
- Nincs backend – minden lokálisan, session-ben tárolva
- Exportálás kliens-oldalon (xlsx generálás böngészőben)

