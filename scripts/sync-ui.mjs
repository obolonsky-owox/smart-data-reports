#!/usr/bin/env node
// Refreshes ui/vendor/owox-ui from OWOX/owox-data-marts. Plugins cannot import @owox/ui as a
// package, so we keep a verbatim copy and alias @owox/ui/* to it. Never edit ui/vendor by hand.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [checkout, ref = 'origin/main'] = process.argv.slice(2);
if (!checkout) {
  console.error('Usage: npm run sync:ui -- <owox-data-marts checkout> [ref]');
  process.exit(1);
}

const COMPONENTS = [
  'alert', 'alert-dialog', 'badge', 'button', 'checkbox', 'dialog', 'dropdown-menu', 'empty',
  'collapsible', 'input', 'popover', 'select', 'separator', 'sheet', 'skeleton', 'switch', 'tabs', 'tooltip',
];
const LIB = ['utils.ts', 'dismissable-portals.ts'];
const DEST = 'ui/vendor/owox-ui';

const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' });
const show = (path) => git('show', `${ref}:${path}`);
const write = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};

rmSync(DEST, { recursive: true, force: true });
for (const name of COMPONENTS) {
  write(join(DEST, 'components', `${name}.tsx`), show(`packages/ui/src/components/${name}.tsx`));
}
for (const name of LIB) {
  write(join(DEST, 'lib', name), show(`packages/ui/src/lib/${name}`));
}

// The monorepo's @source globs point at apps/; ours scan the plugin's ui/ tree instead.
const ANCHOR = "@import 'tw-animate-css';";
const css = show('packages/ui/src/styles/globals.css');
if (!css.includes(ANCHOR)) throw new Error(`globals.css no longer contains ${ANCHOR}`);
const rewritten = css
  .split('\n')
  .filter((line) => !line.startsWith('@source '))
  .join('\n')
  .replace(ANCHOR, `${ANCHOR}\n\n@source '../../../**/*.{ts,tsx}';`);
write(join(DEST, 'styles', 'globals.css'), rewritten);

const commit = git('rev-parse', ref).trim();
write(join(DEST, 'VENDORED_FROM'), `OWOX/owox-data-marts@${commit} (${ref})\n`);
console.log(`Vendored ${COMPONENTS.length} components and globals.css from ${commit}`);
