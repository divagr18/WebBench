/** Deterministic PRNG splitmix64 -> xorshift-based streams. No Math.random. */
export class SeededRng {
  private state: bigint;

  constructor(seed: string) {
    let h = 0x9e3779b97f4a7c15n;
    for (let i = 0; i < seed.length; i++) {
      h ^= BigInt(seed.charCodeAt(i));
      h = (h * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
      h ^= h >> 31n;
    }
    this.state = (h ^ (h >> 27n)) & 0xffffffffffffffffn;
    if (this.state === 0n) this.state = 0x853c49e6748fea9bn;
  }

  nextUint64(): bigint {
    let z = (this.state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
    this.state = z;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
    return (z ^ (z >> 31n)) & 0xffffffffffffffffn;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return Number(this.nextUint64() >> 11n) / 2 ** 53;
  }

  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.float() * (maxExclusive - minInclusive));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[this.int(0, arr.length)];
  }

  bool(pTrue = 0.5): boolean {
    return this.float() < pTrue;
  }

  /** Sample k distinct items without replacement (order shuffled). */
  sample<T>(arr: readonly T[], k: number): T[] {
    const copy = [...arr];
    const out: T[] = [];
    const n = Math.min(k, copy.length);
    for (let i = 0; i < n; i++) {
      const j = this.int(i, copy.length);
      [copy[i], copy[j]] = [copy[j], copy[i]];
      out.push(copy[i]);
    }
    return out;
  }

  /** Standard-deviation-scaled jitter around a base value. */
  jitter(base: number, spread: number): number {
    return base + (this.float() * 2 - 1) * spread;
  }
}
