// PROJECTS-v1: every Studio tool that can be saved as a project exposes this: its design data and a full-size render for the preview.
export type StudioToolHandle = { getData: () => Record<string, unknown>; makeThumb: () => Promise<Blob> };

// YT-THUMB-v1: small browser helpers shared by Studio creators that export a rendered PNG: JPEG conversion and saving a file.
export async function pngToJpeg(png: Blob, w: number, h: number, quality = 0.95): Promise<Blob> {
  const bmp = await createImageBitmap(png);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
  const j = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", quality));
  if (!j) throw new Error("JPEG export failed");
  return j;
}
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Small JPEG data URL preview (about 360px wide) of a rendered design, for the project list. */
export async function blobToThumb(blob: Blob, maxW = 360, quality = 0.7): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const w = Math.min(maxW, bmp.width), h = Math.max(1, Math.round((bmp.height * w) / bmp.width));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}

/** Re-encodes a big uploaded image so the saved project stays small (max 1600px wide, JPEG). Small images are kept as they are. */
export async function shrinkDataUrl(dataUrl: string, maxChars = 450_000): Promise<string> {
  if (dataUrl.length <= maxChars) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  for (const [maxW, q] of [[1600, 0.85], [1280, 0.75], [960, 0.7]] as const) {
    const w = Math.min(maxW, bmp.width), h = Math.max(1, Math.round((bmp.height * w) / bmp.width));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
    const out = c.toDataURL("image/jpeg", q);
    if (out.length <= maxChars) return out;
  }
  throw new Error("The background image is too large to save. Use a smaller image.");
}
