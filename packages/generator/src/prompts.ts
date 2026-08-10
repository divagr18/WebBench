import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha256Hex } from './hash.js';

export interface PromptBundle {
  texts: Record<PromptName, string>;
  hashes: Record<PromptName, string>;
}

const PROMPT_FILES = [
  'render_threadit',
  'render_news',
  'render_official',
  'extract_assertion',
  'prior_elicit',
  'research_system',
  'final_judgment',
] as const;

export type PromptName = (typeof PROMPT_FILES)[number];

export function loadPrompts(repoRoot: string, version = 'v1'): PromptBundle {
  const texts = {} as Record<PromptName, string>;
  const hashes = {} as Record<PromptName, string>;
  for (const name of PROMPT_FILES) {
    const text = readFileSync(join(repoRoot, 'prompts', version, `${name}.md`), 'utf8');
    texts[name] = text;
    hashes[name] = sha256Hex(text);
  }
  return { texts, hashes };
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(val);
  }
  return out;
}
