import { loadAndValidateDataset } from '@echobench/generator';
import type { CliContext } from '../main.js';
import { opt, type ParsedArgs } from '../args.js';
import { join } from 'node:path';

export async function cmdValidate(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const splitArg = opt(args, 'split', 'dev');
  const dataDir = opt(args, 'data-dir', join(ctx.repoRoot, 'datasets'));
  const splits = splitArg === 'all' ? (['dev', 'test'] as const) : ([splitArg] as const);

  let ok = true;
  for (const split of splits) {
    const { validation } = loadAndValidateDataset(dataDir, split as 'dev' | 'test');
    if (validation.errors.length === 0) {
      console.log(`[validate] ${split}: OK (${validation.warnings.length} warnings)`);
    } else {
      ok = false;
      console.error(`[validate] ${split}: ${validation.errors.length} errors`);
      for (const e of validation.errors.slice(0, 40)) console.error(`  - ${e}`);
      if (validation.errors.length > 40) console.error(`  … and ${validation.errors.length - 40} more`);
    }
    for (const w of validation.warnings.slice(0, 10)) console.warn(`  ! ${w}`);
  }
  return ok ? 0 : 1;
}
