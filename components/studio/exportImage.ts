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
