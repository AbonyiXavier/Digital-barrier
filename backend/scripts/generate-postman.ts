/**
 * Turns the running API's OpenAPI document into a Postman v2.1.0 collection.
 *
 * Generated rather than hand-written so it cannot drift from the API: re-run it
 * after any endpoint change. Schema version matches the collections already in
 * ~/Documents so the import behaves the same way.
 *
 *   npx tsx scripts/generate-postman.ts [http://localhost:3000]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = join(__dirname, '..', 'postman', 'aegis.postman_collection.json');

type Json = Record<string, any>;

interface PostmanRequest {
  name: string;
  request: Json;
  response: unknown[];
  event?: Json[];
}
interface PostmanFolder {
  name: string;
  description?: string;
  item: (PostmanRequest | PostmanFolder)[];
}

/** First path segment, so /protection/pin lands under "protection". */
function groupOf(path: string): string {
  const segment = path.split('/').filter((part) => part !== '')[0] ?? 'root';
  return segment.startsWith('{') ? 'root' : segment;
}

function exampleFor(schema: Json | undefined, spec: Json, depth = 0): unknown {
  if (!schema || depth > 6) return null;
  if (schema.$ref) {
    const name = String(schema.$ref).split('/').pop() as string;
    return exampleFor(spec.components?.schemas?.[name], spec, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case 'object': {
      const out: Json = {};
      for (const [key, value] of Object.entries(schema.properties ?? {})) {
        out[key] = exampleFor(value as Json, spec, depth + 1);
      }
      return out;
    }
    case 'array':
      return [exampleFor(schema.items, spec, depth + 1)].filter((v) => v !== null);
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return true;
    default:
      return schema.format === 'date-time' ? new Date().toISOString() : 'string';
  }
}

/** {id} -> :id, and collect the names so we can add path variables. */
function toPostmanPath(path: string): { segments: string[]; variables: string[] } {
  const variables: string[] = [];
  const segments = path
    .split('/')
    .filter((part) => part !== '')
    .map((part) => {
      const match = /^\{(.+)\}$/.exec(part);
      if (!match?.[1]) return part;
      variables.push(match[1]);
      return `:${match[1]}`;
    });
  return { segments, variables };
}

async function main(): Promise<void> {
  const response = await fetch(`${BASE}/docs/json`);
  if (!response.ok) {
    throw new Error(
      `could not read ${BASE}/docs/json (HTTP ${response.status}). Start the API first: npm run start:dev`,
    );
  }
  const spec = (await response.json()) as Json;

  const folders = new Map<string, PostmanFolder>();

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(methods as Json)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const operation = op as Json;

      const group = groupOf(path);
      if (!folders.has(group)) folders.set(group, { name: group, item: [] });

      const { segments, variables } = toPostmanPath(path);
      const body = operation.requestBody?.content?.['application/json']?.schema;

      const request: Json = {
        method: method.toUpperCase(),
        header: [
          { key: 'Content-Type', value: 'application/json' },
          // Lets the API compute `isCurrent` for the calling device.
          { key: 'x-install-id', value: '{{installId}}', disabled: true },
        ],
        url: {
          raw: `{{baseUrl}}/${segments.join('/')}`,
          host: ['{{baseUrl}}'],
          path: segments,
          ...(variables.length > 0
            ? {
                variable: variables.map((key) => ({
                  key,
                  value: '',
                  description: `${key} of the resource`,
                })),
              }
            : {}),
          ...(Array.isArray(operation.parameters)
            ? {
                query: operation.parameters
                  .filter((p: Json) => p.in === 'query')
                  .map((p: Json) => ({
                    key: p.name,
                    value: '',
                    description: p.description ?? '',
                    disabled: p.required !== true,
                  })),
              }
            : {}),
        },
        description: operation.summary ?? operation.description ?? '',
      };

      if (body) {
        request.body = {
          mode: 'raw',
          raw: JSON.stringify(exampleFor(body, spec), null, 2),
          options: { raw: { language: 'json' } },
        };
      }

      folders.get(group)!.item.push({
        name: operation.summary || `${method.toUpperCase()} /${segments.join('/')}`,
        request,
        response: [],
      });
    }
  }

  // A sign-in request that captures the session cookie for everything after it.
  const auth: PostmanFolder = {
    name: '00 · auth',
    description:
      'Run "sign in" first. Its test script stores the session cookie, which the ' +
      'rest of the collection then sends automatically.',
    item: [
      {
        name: 'sign up',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          url: { raw: '{{baseUrl}}/api/auth/sign-up/email', host: ['{{baseUrl}}'], path: ['api', 'auth', 'sign-up', 'email'] },
          body: {
            mode: 'raw',
            raw: JSON.stringify({ name: 'Francis Abonyi', email: '{{email}}', password: '{{password}}' }, null, 2),
            options: { raw: { language: 'json' } },
          },
          description: 'Creates an account. The seeded account already exists — use "sign in" for that one.',
        },
        response: [],
      },
      {
        name: 'sign in',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          url: { raw: '{{baseUrl}}/api/auth/sign-in/email', host: ['{{baseUrl}}'], path: ['api', 'auth', 'sign-in', 'email'] },
          body: {
            mode: 'raw',
            raw: JSON.stringify({ email: '{{email}}', password: '{{password}}' }, null, 2),
            options: { raw: { language: 'json' } },
          },
        },
        response: [],
        event: [
          {
            listen: 'test',
            script: {
              type: 'text/javascript',
              exec: [
                'const cookie = pm.cookies.get("better-auth.session_token");',
                'if (cookie) { pm.collectionVariables.set("sessionToken", cookie); }',
                'pm.test("signed in", () => pm.response.to.have.status(200));',
              ],
            },
          },
        ],
      },
      {
        name: 'sign out',
        request: {
          method: 'POST',
          header: [{ key: 'Content-Type', value: 'application/json' }],
          url: { raw: '{{baseUrl}}/api/auth/sign-out', host: ['{{baseUrl}}'], path: ['api', 'auth', 'sign-out'] },
        },
        response: [],
      },
    ],
  };

  const ordered = [...folders.values()].sort((a, b) => a.name.localeCompare(b.name));

  const collection = {
    info: {
      name: 'Aegis API',
      description:
        `${spec.info?.description ?? ''}\n\nGenerated from ${BASE}/docs/json — ` +
        're-run scripts/generate-postman.ts after changing any endpoint.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [auth, ...ordered],
    variable: [
      { key: 'baseUrl', value: BASE },
      { key: 'email', value: 'francis@example.com' },
      { key: 'password', value: 'aegis-dev-password' },
      { key: 'sessionToken', value: '' },
      { key: 'installId', value: 'postman-install-id' },
    ],
  };

  writeFileSync(OUT, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
  const count = ordered.reduce((sum, folder) => sum + folder.item.length, 0);
  console.log(`wrote ${OUT}`);
  console.log(`  ${ordered.length + 1} folders, ${count + auth.item.length} requests`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
