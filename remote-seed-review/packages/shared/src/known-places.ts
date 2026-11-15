/** OWNER MUST REVIEW FOR SPELLING: advisory suggestions, never an allow-list. */
export const KNOWN_PLACES = [
  { si: 'කොළඹ', en: 'Colombo' },
  { si: 'මහනුවර', en: 'Kandy' },
  { si: 'අම්පාර', en: 'Ampara' },
  { si: 'මඩකලපුව', en: 'Batticaloa' },
  { si: 'ත්රිකුණාමලය', en: 'Trincomalee' },
  { si: 'යාපනය', en: 'Jaffna' },
  { si: 'අක්කරපත්තුව', en: 'Akkaraipattu' },
  { si: 'දෙහිඅත්තකණ්ඩිය', en: 'Dehiattakandiya' },
  { si: 'මිහින්තලේ', en: 'Mihintale' },
  { si: 'මහරගම', en: 'Maharagama' },
  { si: 'කුරුණෑගල', en: 'Kurunegala' },
  { si: 'අනුරාධපුරය', en: 'Anuradhapura' },
  { si: 'බදුල්ල', en: 'Badulla' },
  { si: 'බිබිල', en: 'Bibile' },
  { si: 'කන්තලේ', en: 'Kantale' },
  { si: 'පොළොන්නරුව', en: 'Polonnaruwa' },
  { si: 'මහියංගනය', en: 'Mahiyanganaya' },
  { si: 'කදුරුවෙල', en: 'Kudurewela' },
  { si: 'මොණරාගල', en: 'Monaragala' },
  { si: 'පස්සර', en: 'Passara' },
  { si: 'ගිරාඳුරුකෝට්ටේ', en: 'Girandurukotte' },
  { si: 'හසලක', en: 'Hasalaka' },
] as const;

export function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const old = row[j]!;
      row[j] = Math.min(old + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = old;
    }
  }
  return row[b.length]!;
}

const closestCache = new Map<string, (typeof KNOWN_PLACES)[number]>();
export function findClosestKnownPlace(input: string, language: 'si' | 'en' = 'en') {
  const normalized = input.toLowerCase();
  const key = `${language}:${normalized}`;
  const cached = closestCache.get(key);
  if (cached) return cached;
  let closest: (typeof KNOWN_PLACES)[number] = KNOWN_PLACES[0];
  let distance = Infinity;
  for (const place of KNOWN_PLACES) {
    const candidate = editDistance(normalized, place[language].toLowerCase());
    if (candidate < distance) { closest = place; distance = candidate; }
  }
  if (closestCache.size >= 256) closestCache.clear();
  closestCache.set(key, closest);
  return closest;
}
