import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { prepareLegacy } from './tools/prepare-legacy.mjs';
async function copyChanged(source, destination) {
  const bytes = await readFile(source);
  try { if (bytes.equals(await readFile(destination))) return; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await copyFile(source, destination);
}
const output = new URL('./dist/', import.meta.url);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'launchpad.css', 'model.mjs', 'api.mjs', 'app.mjs', 'startup.mjs', 'images.mjs', 'profiles.mjs', 'network.mjs', 'network.css']) {
  await copyChanged(new URL('./src/' + name, import.meta.url), new URL(name, output));
}
await prepareLegacy(new URL('./', import.meta.url), output);
await mkdir(new URL('./assets/licenses/', output), { recursive: true });
for (const name of ['xeris.png', 'inter.woff2', 'jakarta.woff2', 'licenses/Inter-OFL.txt', 'licenses/Plus-Jakarta-Sans-OFL.txt']) {
  await copyChanged(new URL('./public/assets/' + name, import.meta.url), new URL('./assets/' + name, output));
}
console.log('Built static launchpad foundation into dist/. No keys, signing or network calls.');
