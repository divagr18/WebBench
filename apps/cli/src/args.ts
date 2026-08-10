export interface ParsedArgs {
  command: string;
  positionals: string[];
  options: Record<string, string>;
  flags: Set<string>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? '';
  const positionals: string[] = [];
  const options: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      const eq = name.indexOf('=');
      if (eq >= 0) {
        options[name.slice(0, eq)] = name.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1]?.startsWith('--')) {
        options[name] = argv[i + 1] ?? '';
        i++;
      } else {
        flags.add(name);
      }
    } else {
      positionals.push(arg);
    }
  }
  return { command, positionals, options, flags };
}

export function opt(parsed: ParsedArgs, name: string, fallback: string): string {
  return parsed.options[name] ?? fallback;
}

export function optNumber(parsed: ParsedArgs, name: string, fallback: number): number {
  const raw = parsed.options[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`option --${name} must be a number, got ${raw}`);
  return n;
}
