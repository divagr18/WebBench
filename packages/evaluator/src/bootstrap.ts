export interface BootstrapOptions {
  resamples: number;
  seedRng: () => number;
}

/** Percentile bootstrap clustered by cluster key. statistic receives the resampled item list. */
export function clusteredBootstrap<T>(
  items: T[],
  clusterOf: (item: T) => string,
  statistic: (sample: T[]) => number | null,
  opts: BootstrapOptions,
): { estimate: number | null; ci95: [number, number] | null; samples: number } {
  const estimate = statistic(items);
  if (items.length === 0 || estimate === null) {
    return { estimate, ci95: null, samples: 0 };
  }
  const clusters = new Map<string, T[]>();
  for (const it of items) {
    const key = clusterOf(it);
    const list = clusters.get(key) ?? [];
    list.push(it);
    clusters.set(key, list);
  }
  const keys = [...clusters.keys()].sort();
  const values: number[] = [];
  for (let i = 0; i < opts.resamples; i++) {
    const sample: T[] = [];
    for (let k = 0; k < keys.length; k++) {
      const pick = keys[Math.floor(opts.seedRng() * keys.length)];
      if (!pick) continue;
      const bucket = clusters.get(pick);
      if (bucket) sample.push(...bucket);
    }
    const v = statistic(sample);
    if (v !== null) values.push(v);
  }
  if (values.length === 0) return { estimate, ci95: null, samples: 0 };
  values.sort((a, b) => a - b);
  const lo = values[Math.floor(0.025 * values.length)] ?? values[0]!;
  const hi = values[Math.min(values.length - 1, Math.floor(0.975 * values.length))] ?? values[values.length - 1]!;
  return { estimate, ci95: [lo, hi], samples: values.length };
}
