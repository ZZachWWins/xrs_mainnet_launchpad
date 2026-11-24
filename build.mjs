import { copyFile, mkdir } from 'node:fs/promises';
const output = new URL('./dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'launchpad.css', 'model.mjs', 'api.mjs', 'app.mjs', 'startup.mjs']) {
  await copyFile(new URL('./src/' + name, import.meta.url), new URL(name, output));
}
await mkdir(new URL('./assets/licenses/', output), { recursive: true });
for (const name of ['xeris.png', 'inter.woff2', 'jakarta.woff2', 'licenses/Inter-OFL.txt', 'licenses/Plus-Jakarta-Sans-OFL.txt']) {
  await copyFile(new URL('./public/assets/' + name, import.meta.url), new URL('./assets/' + name, output));
}
console.log('Built static launchpad foundation into dist/. No keys, signing or network calls.');
