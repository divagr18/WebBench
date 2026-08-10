#!/usr/bin/env node
import { register } from 'node:module';
register('tsx/esm', import.meta.url);
await import('../src/main.ts');
