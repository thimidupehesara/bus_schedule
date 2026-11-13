// QR Model 2, version 5-L, byte mode, mask 0. A single RS block keeps the
// encoder small. The URL stays visible when it exceeds the 106-byte capacity.
const SIZE = 37;
const DATA_BYTES = 108;
const ECC_BYTES = 26;

function multiply(a: number, b: number): number {
  let result = 0;
  while (b > 0) {
    if (b & 1) result ^= a;
    a <<= 1;
    if (a & 256) a ^= 0x11d;
    b >>>= 1;
  }
  return result;
}

function withCorrection(data: number[]): number[] {
  let polynomial = [1];
  let root = 1;
  for (let i = 0; i < ECC_BYTES; i++) {
    const next = [...polynomial, 0];
    for (let j = 0; j < polynomial.length; j++)
      next[j + 1] = next[j + 1]! ^ multiply(polynomial[j]!, root);
    polynomial = next;
    root = multiply(root, 2);
  }
  const remainder = [...data, ...Array<number>(ECC_BYTES).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const factor = remainder[i]!;
    for (let j = 0; j < polynomial.length; j++)
      remainder[i + j] = remainder[i + j]! ^ multiply(polynomial[j]!, factor);
  }
  return [...data, ...remainder.slice(data.length)];
}

export function qrPath(url: string): string | null {
  // URL serialisation makes the payload ASCII even when input contains Unicode.
  const bytes = new TextEncoder().encode(new URL(url).href);
  if (bytes.length > 106) return null;
  const data = [0x40 | (bytes.length >>> 4)];
  let carry = (bytes.length & 15) << 4;
  for (const byte of bytes) {
    data.push(carry | (byte >>> 4));
    carry = (byte & 15) << 4;
  }
  data.push(carry); // four-bit terminator
  for (let pad = 0; data.length < DATA_BYTES; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);
  const codewords = withCorrection(data);
  const matrix = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(-1));
  const set = (x: number, y: number, value: boolean) => {
    if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) matrix[y]![x] = Number(value);
  };

  for (let i = 0; i < SIZE; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [SIZE - 4, 3],
    [3, SIZE - 4],
  ] as const) {
    for (let y = -4; y <= 4; y++)
      for (let x = -4; x <= 4; x++) {
        const distance = Math.max(Math.abs(x), Math.abs(y));
        set(cx + x, cy + y, distance !== 2 && distance !== 4);
      }
  }
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) {
      set(30 + x, 30 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
    }
  const formatBit = (bit: number) => ((0x77c4 >>> bit) & 1) !== 0; // L, mask 0
  for (let i = 0; i <= 5; i++) set(8, i, formatBit(i));
  set(8, 7, formatBit(6));
  set(8, 8, formatBit(7));
  set(7, 8, formatBit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, formatBit(i));
  for (let i = 0; i < 8; i++) set(SIZE - 1 - i, 8, formatBit(i));
  for (let i = 8; i < 15; i++) set(8, SIZE - 15 + i, formatBit(i));
  set(8, SIZE - 8, true);

  let bit = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let i = 0; i < SIZE; i++) {
      const y = upward ? SIZE - 1 - i : i;
      for (let x = right; x >= right - 1; x--) {
        if (matrix[y]![x] !== -1) continue;
        const value = (((codewords[bit >>> 3] ?? 0) >>> (7 - (bit & 7))) & 1) !== 0;
        set(x, y, value !== ((x + y) % 2 === 0));
        bit++;
      }
    }
    upward = !upward;
  }
  return matrix
    .flatMap((row, y) => row.map((value, x) => (value === 1 ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
}
