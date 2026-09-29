#!/usr/bin/env node
/**
 * Renames the app.
 *
 *   node scripts/rename-app.mjs "Product Name" com.you.productname
 *   node scripts/rename-app.mjs "Product Name" com.you.productname --dry-run
 *
 * There are five names and they are easy to get out of step: the home-screen
 * label, the name the UI prints, the Android package id, the deep-link scheme and
 * the slug. Renaming by hand tends to update two of them, which produces an app
 * called one thing on the home screen and another on its own welcome page.
 *
 * `android/` and `ios/` are gitignored and regenerated, so only `app.json` and
 * `src/lib/app.ts` are edited here — the generated projects follow from prebuild.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const APP_JSON = 'app.json';
const APP_TS = 'src/lib/app.ts';

// Reserved words cannot appear as a package segment: each segment becomes a Java
// package name, and `com.new.app` fails to compile with an error that points at
// generated source rather than at app.json.
const JAVA_RESERVED = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
  'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final',
  'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int',
  'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public',
  'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', '_',
]);

const die = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

/** A URL-safe slug, which is also the deep-link scheme. */
const slugify = (name) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function validatePackage(pkg) {
  const segments = pkg.split('.');
  if (segments.length < 2) die(`package must have at least two segments, got "${pkg}"`);
  for (const segment of segments) {
    if (!/^[a-z][a-z0-9_]*$/.test(segment)) {
      die(
        `package segment "${segment}" is invalid — lowercase letter first, then ` +
          `letters, digits or underscore. No hyphens.`,
      );
    }
    if (JAVA_RESERVED.has(segment)) die(`package segment "${segment}" is a Java reserved word`);
  }
}

const [displayName, pkg, ...rest] = process.argv.slice(2);
const dryRun = rest.includes('--dry-run');

if (!displayName || !pkg) {
  console.error('usage: node scripts/rename-app.mjs "Product Name" com.you.productname [--dry-run]');
  process.exit(1);
}
validatePackage(pkg);

const slug = slugify(displayName);
if (slug === '') die(`"${displayName}" produces an empty slug — it needs letters or digits`);

// --- app.json ---------------------------------------------------------------
const appJson = JSON.parse(readFileSync(APP_JSON, 'utf8'));
const expo = appJson.expo;
const before = {
  name: expo.name,
  slug: expo.slug,
  scheme: expo.scheme,
  package: expo.android?.package,
  appName: null,
};

expo.name = displayName;
expo.slug = slug;
// The scheme is what `aegis://` links use. Keeping it equal to the slug means one
// fewer name to reason about, and it is already that way.
expo.scheme = slug;
expo.android = { ...expo.android, package: pkg };

// --- src/lib/app.ts --------------------------------------------------------
const appTs = readFileSync(APP_TS, 'utf8');
const nameMatch = appTs.match(/export const APP_NAME = '([^']*)';/);
if (!nameMatch) die(`could not find APP_NAME in ${APP_TS} — rename it by hand`);
before.appName = nameMatch[1];

// JSON.stringify so an apostrophe in the name cannot break out of the literal.
const nextAppTs = appTs.replace(
  /export const APP_NAME = '[^']*';/,
  `export const APP_NAME = ${JSON.stringify(displayName)};`,
);

// --- report ----------------------------------------------------------------
const rows = [
  ['app.json      expo.name', before.name, displayName],
  ['app.json      expo.slug', before.slug, slug],
  ['app.json      expo.scheme', before.scheme, slug],
  ['app.json      android.package', before.package, pkg],
  ['src/lib/app.ts APP_NAME', before.appName, displayName],
];
const width = Math.max(...rows.map(([label]) => label.length));
for (const [label, from, to] of rows) {
  const marker = from === to ? ' ' : '*';
  console.log(`${marker} ${label.padEnd(width)}  ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
}

if (dryRun) {
  console.log('\ndry run — nothing written');
  process.exit(0);
}

writeFileSync(APP_JSON, `${JSON.stringify(appJson, null, 2)}\n`);
writeFileSync(APP_TS, nextAppTs);

const changedPackage = before.package !== pkg;
console.log('\nwritten. next:');
console.log('  npx expo prebuild --clean');
if (changedPackage) {
  console.log(`  adb uninstall ${before.package}   # Android treats the new id as a different app`);
}
console.log('  npx expo run:android');
if (/aegis/i.test(readFileSync(APP_TS, 'utf8'))) {
  console.log(`\nnote: ${APP_TS} still mentions "aegis" (SUPPORT_EMAIL) — a judgement call, left alone.`);
}
