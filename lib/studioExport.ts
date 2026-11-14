// STUDIO-EXPORT-v2: the ONE export pipeline of the Social Media Studio (Download, Share and Download-all all use it).
// Root cause of the old "Could not create the image": the phones show coin logos from a third-party CDN that sends no CORS
// headers. The browser can DISPLAY such an image but html-to-image has to FETCH it to embed it; that fetch is blocked, the
// library then sets an empty src, the <img> fires `error` and toBlob() rejects with a bare `Event` (which the page hid behind
// a generic message). Fix: logos are read through the owner-only same-origin proxy /api/studio/logo, anything that still
// cannot be read is replaced by a transparent pixel, and the finished PNG is checked (signature + exact size) before it
// is handed to the user. Every failure carries the stage it happened in.
export const TRANSPARENT_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export class StudioExportError extends Error {
  constructor(public stage: string, message: string, public cause?: unknown) {
    super(`${stage}: ${message}`);
    this.name = "StudioExportError";
  }
}

/** A readable message for anything a promise can reject with (html-to-image rejects with a bare Event for image errors). */
export function describeExportError(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as { type?: string; target?: { src?: string; currentSrc?: string } };
    if (e.type === "error" && e.target && (e.target.currentSrc || e.target.src)) return `an image could not be loaded (${String(e.target.currentSrc || e.target.src).slice(0, 120)})`;
    if (typeof e.type === "string") return `browser event "${e.type}"`;
  }
  return "unknown error";
}

/** Width and height from a PNG's header (null when the bytes are not a PNG). */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

const symbolOf = (src: string): string | null => {
  try {
    const u = new URL(src);
    const m = u.hostname === "assets.coincap.io" ? /\/icons\/([a-z0-9]+)@2x\.png$/i.exec(u.pathname) : null;
    return m ? m[1] : null;
  } catch {
    return null;
  }
};

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("could not read image"));
    r.readAsDataURL(blob);
  });

/** Makes every image in `node` readable by the exporter: logos via the proxy, other cross-origin images blanked. */
export async function inlineImages(node: HTMLElement, fetchImpl: typeof fetch = fetch): Promise<{ inlined: number; blanked: string[] }> {
  const imgs = Array.from(node.querySelectorAll("img"));
  let inlined = 0;
  const blanked: string[] = [];
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:") || src.startsWith("blob:")) return;
      let same = false;
      try { same = new URL(src, location.href).origin === location.origin; } catch { same = false; }
      if (same) return;
      const sym = symbolOf(src);
      try {
        if (!sym) throw new Error("not a known logo host");
        const res = await fetchImpl(`/api/studio/logo?s=${encodeURIComponent(sym)}`, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`proxy answered ${res.status}`);
        img.src = await toDataUrl(await res.blob());
        await img.decode().catch(() => undefined);
        inlined++;
      } catch (err) {
        console.warn("studio export: logo replaced by a blank image", src, describeExportError(err));
        img.src = TRANSPARENT_PNG;
        blanked.push(src);
      }
    }),
  );
  return { inlined, blanked };
}

/** Renders `node` (mounted at exactly w x h) to a verified PNG. Throws StudioExportError with the failing stage. */
export async function renderStudioPng(node: HTMLElement | null, w: number, h: number): Promise<Blob> {
  const stage = async <T,>(name: string, fn: () => Promise<T> | T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof StudioExportError) throw err;
      throw new StudioExportError(name, describeExportError(err), err);
    }
  };
  if (!node) throw new StudioExportError("mount", "the export canvas is not mounted");
  const el = node;
  await stage("mount", () => {
    if (el.offsetWidth !== w || el.offsetHeight !== h) throw new Error(`export canvas is ${el.offsetWidth}x${el.offsetHeight}, expected ${w}x${h}`);
  });
  await stage("fonts", async () => {
    const fam = getComputedStyle(el).fontFamily;
    const text = el.textContent || "";
    await document.fonts.ready;
    await Promise.all(["500", "600", "700", "800"].map((wt) => document.fonts.load(`${wt} 40px ${fam}`, text).catch(() => [])));
    await document.fonts.ready;
  });
  await stage("images", async () => {
    await inlineImages(el);
    const until = Date.now() + 4000;
    while (Array.from(el.querySelectorAll("img")).some((i) => !i.complete) && Date.now() < until) await new Promise((r) => setTimeout(r, 80));
  });
  const blob = await stage("render", async () => {
    const { toBlob } = await import("html-to-image");
    const opts = { width: w, height: h, pixelRatio: 1, cacheBust: true, backgroundColor: undefined, imagePlaceholder: TRANSPARENT_PNG };
    await toBlob(el, opts); // first pass warms font/image embedding (Safari); the second is kept
    const b = await toBlob(el, opts);
    if (!b) throw new Error("toBlob returned nothing (canvas too large or blocked)");
    return b;
  });
  await stage("verify", async () => {
    const size = pngSize(new Uint8Array(await blob.arrayBuffer()));
    if (!size) throw new Error("the result is not a PNG");
    if (size.w !== w || size.h !== h) throw new Error(`PNG is ${size.w}x${size.h}, expected ${w}x${h}`);
  });
  return blob;
}
