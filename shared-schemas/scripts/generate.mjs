import { readFile, writeFile } from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';

const schema = JSON.parse(await readFile(new URL('../api.schema.json', import.meta.url), 'utf8'));
// Include REST-only definitions as well as those reachable from WebSocket messages.
const generationSchema = { ...schema, oneOf: Object.keys(schema.$defs).map((name) => ({ $ref: `#/$defs/${name}` })) };
const output = await compile(generationSchema, 'ApiContract', {
  bannerComment: '/* Generated from shared-schemas/api.schema.json. Run npm run schemas:generate. */',
  unreachableDefinitions: true,
  additionalProperties: false,
});
const destination = new URL('../generated/api.d.ts', import.meta.url);
if (process.argv.includes('--check')) {
  const current = await readFile(destination, 'utf8').catch(() => '');
  if (current !== output) {
    console.error('Generated API types are stale. Run npm run schemas:generate.');
    process.exitCode = 1;
  }
} else {
  await writeFile(destination, output);
}
