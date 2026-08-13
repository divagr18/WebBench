import { configFromEnv, DeepSeekClient, openaiConfigFromEnv, OpenAIClient, PRICING, estimateCostUsd } from '@echobench/llm';
import { findRepoRoot, loadDotEnv } from './env.js';
import { parseArgs } from './args.js';
import { cmdGenerate } from './commands/generate.js';
import { cmdValidate } from './commands/validate.js';
import { cmdServe } from './commands/serve.js';
import { cmdRun } from './commands/run.js';
import { cmdScore } from './commands/score.js';
import { cmdReport } from './commands/report.js';

export interface CliContext {
  repoRoot: string;
  env: Record<string, string>;
}

export interface EvalClient {
  defaultModel: string;
  chat: DeepSeekClient['chat'];
}

const VALID_PROVIDERS = ['deepseek', 'openai'];

export function isValidProvider(provider: string): provider is 'deepseek' | 'openai' {
  return VALID_PROVIDERS.includes(provider);
}

export function makeEvalClient(ctx: CliContext, provider: string, model?: string): EvalClient {
  const merged = { ...process.env, ...ctx.env } as NodeJS.ProcessEnv;
  if (provider === 'openai') {
    const config = openaiConfigFromEnv(merged);
    if (!config) {
      throw new Error('OPENAI_API_KEY is not set. Set it in .env at the repo root.');
    }
    return new OpenAIClient(model ? { ...config, model } : config);
  }
  const config = configFromEnv(merged);
  if (!config) {
    throw new Error('DEEPSEEK_API_KEY is not set. Set it in .env at the repo root.');
  }
  return new DeepSeekClient(model ? { ...config, model } : config);
}

export function makeDeepSeekClient(ctx: CliContext): DeepSeekClient {
  const merged = { ...process.env, ...ctx.env } as NodeJS.ProcessEnv;
  const config = configFromEnv(merged);
  if (!config) {
    throw new Error('DEEPSEEK_API_KEY is not set. Set it in .env at the repo root.');
  }
  return new DeepSeekClient(config);
}

const USAGE = `echobench <command> [options]

commands:
  generate   build + freeze a dataset split (claims, worlds, prose)
  validate   structurally validate a frozen dataset split
  serve      run the isolated synthetic web service
  run        execute DeepSeek evaluation runs against the synthetic web
  score      score completed traces into metrics
  report     produce report artifacts (tables + figures)

global options:
  --data-dir <path>     dataset directory (default <repo>/datasets)
  --traces-dir <path>   traces directory (default <repo>/traces)
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const repoRoot = findRepoRoot(process.cwd());
  const ctx: CliContext = { repoRoot, env: loadDotEnv(repoRoot) };

  switch (args.command) {
    case 'generate':
      process.exitCode = await cmdGenerate(args, ctx);
      break;
    case 'validate':
      process.exitCode = await cmdValidate(args, ctx);
      break;
    case 'serve':
      process.exitCode = await cmdServe(args, ctx);
      break;
    case 'run':
      process.exitCode = await cmdRun(args, ctx);
      break;
    case 'score':
      process.exitCode = await cmdScore(args, ctx);
      break;
    case 'report':
      process.exitCode = await cmdReport(args, ctx);
      break;
    case 'help':
    case '--help':
    case '':
      console.log(USAGE);
      break;
    default:
      console.error(`unknown command: ${args.command}\n\n${USAGE}`);
      process.exitCode = 2;
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  if (/402|insufficient|balance/i.test(message)) {
    console.error(`[echobench] DeepSeek credits appear to be exhausted. Stopping.\n${message}`);
  } else {
    console.error(`[echobench] fatal: ${message}`);
  }
  process.exitCode = 1;
});
