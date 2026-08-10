import { join } from 'node:path';
import { loadAndValidateDataset } from '@echobench/generator';
import type { CliContext } from '../main.js';
import { opt, optNumber, type ParsedArgs } from '../args.js';
import { startEchoWeb } from '../serveHelper.js';

export async function cmdServe(args: ParsedArgs, ctx: CliContext): Promise<number> {
  const split = opt(args, 'split', 'dev');
  const dataDir = opt(args, 'data-dir', join(ctx.repoRoot, 'datasets'));
  const port = optNumber(args, 'port', 4577);

  const { dataset, validation } = loadAndValidateDataset(dataDir, split as 'dev' | 'test');
  if (validation.errors.length > 0) {
    console.error(`[serve] dataset has ${validation.errors.length} validation errors; refusing to serve. Run 'echobench validate' for details.`);
    return 1;
  }
  const worlds = [...dataset.worlds.values()];
  const { baseUrl, close } = await startEchoWeb(worlds, port);
  console.log(`[serve] echoweb listening at ${baseUrl} (${worlds.length} worlds, split=${split}). Press Ctrl+C to stop.`);

  const shutdown = async () => {
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  await new Promise(() => {});
  return 0;
}
