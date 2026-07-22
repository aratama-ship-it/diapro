import { cpSync, mkdirSync, rmSync } from 'node:fs';

const output = new URL('../www/', import.meta.url);
const root = new URL('../', import.meta.url);

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const file of ['index.html']) {
  cpSync(new URL(file, root), new URL(file, output));
}

for (const directory of ['css', 'js', 'assets/icons', 'assets/cards/web']) {
  cpSync(new URL(directory, root), new URL(directory, output), { recursive: true });
}

console.log('iOS用Web資産を www/ に同期しました。');
