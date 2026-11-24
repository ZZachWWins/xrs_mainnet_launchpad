export const IMAGE_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, dimension: 2048 });
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const imageError = () => new Error('Choose a PNG, JPEG or WebP photo up to 2 MiB and 2,048 pixels per side.');
export function safeImageURL(value) {
  if (typeof value !== 'string' || !value || new TextEncoder().encode(value).length > 512
    || value !== value.trim() || !/^https:\/\//i.test(value) || value.includes('\\') || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('Use a complete public HTTPS image URL.');
  let url; try { url = new URL(value); } catch { throw new Error('Use a complete public HTTPS image URL.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash
    || !host.includes('.') || /^\d+(\.\d+){3}$/.test(host) || host.includes(':')
    || /(^|\.)(localhost|local|internal|invalid|test)$/.test(host) || /\.svgz?$/i.test(url.pathname)) {
    throw new Error('Use a public HTTPS PNG, JPEG or WebP image URL without credentials.');
  }
  if (new TextEncoder().encode(url.href).length > 512) throw new Error('Keep the complete image URL within 512 bytes.');
  return url.href;
}
const ascii = (bytes, at, size) => String.fromCharCode(...bytes.slice(at, at + size));
export function inspectImage(bytes, type) {
  if (!(bytes instanceof Uint8Array) || !TYPES.has(type) || bytes.length < 24 || bytes.length > IMAGE_LIMITS.bytes) throw imageError();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0;
  if (type === 'image/png') {
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
      || bytes.length < 33 || ascii(bytes, 12, 4) !== 'IHDR' || view.getUint32(8) !== 13) throw imageError();
    width = view.getUint32(16); height = view.getUint32(20);
  } else if (type === 'image/jpeg') {
    if (bytes[0] !== 255 || bytes[1] !== 216) throw imageError();
    let at = 2;
    while (at + 4 <= bytes.length) {
      if (bytes[at++] !== 255) throw imageError();
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (at + 2 > bytes.length) throw imageError();
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) throw imageError();
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 8) throw imageError(); height = view.getUint16(at + 3); width = view.getUint16(at + 5); break;
      }
      at += length;
    }
  } else {
    if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length || bytes.length < 30) throw imageError();
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8X') {
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (chunk === 'VP8L' && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    } else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383;
    }
  }
  if (width < 1 || height < 1 || width > IMAGE_LIMITS.dimension || height > IMAGE_LIMITS.dimension) throw imageError();
  return Object.freeze({ width, height });
}
async function browserDecode(file) {
  if (typeof globalThis.createImageBitmap === 'function') return globalThis.createImageBitmap(file);
  const source = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image(), timer = setTimeout(() => { image.src = ''; reject(imageError()); }, 5000);
      image.onload = () => { clearTimeout(timer); resolve({ width: image.naturalWidth, height: image.naturalHeight, close() {} }); };
      image.onerror = () => { clearTimeout(timer); reject(imageError()); }; image.src = source;
    });
  } finally { URL.revokeObjectURL(source); }
}
/** Memory-only photo handle. fork() gives a draft its own independently released URL. */
export async function prepareLocalPhoto(file, { decode = browserDecode, urlAPI = URL } = {}) {
  if (!file || !TYPES.has(file.type) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > IMAGE_LIMITS.bytes
    || typeof file.arrayBuffer !== 'function') throw imageError();
  let dimensions = inspectImage(new Uint8Array(await file.arrayBuffer()), file.type);
  let decoded;
  try {
    decoded = await decode(file);
    if (!((decoded.width === dimensions.width && decoded.height === dimensions.height)
      || (decoded.width === dimensions.height && decoded.height === dimensions.width))) throw imageError();
    dimensions = { width: decoded.width, height: decoded.height };
  } catch { throw imageError(); } finally { decoded?.close?.(); }
  function handle() {
    const url = urlAPI.createObjectURL(file); let released = false;
    return Object.freeze({ url, name: String(file.name || 'Local photo').slice(0, 180), ...dimensions, bytes: file.size,
      fork() { if (released) throw imageError(); return handle(); },
      release() { if (!released) { released = true; urlAPI.revokeObjectURL(url); } } });
  }
  return handle();
}
