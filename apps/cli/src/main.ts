import { configFromEnv, DeepSeekClient, geminiConfigFromEnv, GeminiClient, grokConfigFromEnv, GrokClient, modelscopeConfigFromEnv, ModelScopeClient, museConfigFromEnv, MuseClient, openaiConfigFromEnv, OpenAIClient, OpenAIResponsesClient, openrouterConfigFromEnv, OpenRouterClient, sarvamConfigFromEnv, SarvamClient } from '@echobench/llm';
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

const VALID_PROVIDERS = ['deepseek', 'openai', 'modelscope', 'openrouter', 'gemini', 'muse', 'grok', 'sarvam'];

export function isValidProvider(provider: string): provider is 'deepseek' | 'openai' | 'modelscope' | 'openrouter' | 'gemini' | 'muse' | 'grok' | 'sarvam' {
  return VALID_PROVIDERS.includes(provider);
}

export function makeEvalClient(ctx: CliContext, provider: string, model?: string): EvalClient {
  const merged = { ...process.env, ...ctx.env } as NodeJS.ProcessEnv;
  if (provider === 'openai') {
    const config = openaiConfigFromEnv(merged);
    if (!config) {
      throw new Error('OPENAI_API_KEY is not set. Set it in .env at the repo root.');
    }
    const resolved = model ? { ...config, model } : config;
    if (config.reasoningEffort !== 'none') {
      return new OpenAIResponsesClient(resolved);
    }
    return new OpenAIClient(resolved);  }
  if (provider === 'modelscope') {
    const config = modelscopeConfigFromEnv(merged);
    if (!config) {
      throw new Error('MODELSCOPE_API_KEY or DASHSCOPE_API_KEY is not set. Set the key for the selected Qwen route in .env at the repo root.');
    }
    return new ModelScopeClient(model ? { ...config, model } : config);
  }
  if (provider === 'openrouter') {
    const config = openrouterConfigFromEnv(merged);
    if (!config) {
      throw new Error('OPENROUTER_API_KEY is not set. Set it in .env at the repo root.');
    }
    return new OpenRouterClient(model ? { ...config, model } : config);
  }
  if (provider === 'gemini') {
    const config = geminiConfigFromEnv(merged);
    if (!config) {
      throw new Error('GEMINI_API_KEY is not set. Set it in .env at the repo root.');
    }
    return new GeminiClient(model ? { ...config, model } : config);
  }
  if (provider === 'muse') {
    const config = museConfigFromEnv(merged);
    if (!config) {
      throw new Error('MUSE_API_KEY is not set. Set it in .env at the repo root.');
    }
    return new MuseClient(model ? { ...config, model } : config);
  }
  if (provider === 'grok') {
    const config = grokConfigFromEnv(merged);
    if (!config) {
      throw new Error('GROK_API_KEY is not set. Set it in .env at the repo root.');
    }
    return new GrokClient(model ? { ...config, model } : config);
  }
  if (provider === 'sarvam') {
    const config = sarvamConfigFromEnv(merged);
    if (!config) {
      throw new Error('SARVAM_API_KEY (or sarvam_api_key) is not set. Set it in .env at the repo root.');
    }
    return new SarvamClient(model ? { ...config, model } : config);
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
