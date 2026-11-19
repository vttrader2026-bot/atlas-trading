// VIDEO-ALERTS-v1: the parts of Video Alerts that are safe in the browser (no Redis, no web-push). Used by the admin panel
// for its preview and by lib/videoAlerts.ts on the server.
import type { Payload } from "@/lib/push";
import { youtubeWatchUrl } from "@/lib/videos";

export const LIMITS = { title: 120, description: 400, url: 300, thumb: 500 } as const;
export const NOTIFICATION_TITLE = "ATLAS TRADING — New Video Available";

export type AlertStatus = "published" | "unpublished";
export type PushState = "sent" | "nobody" | "not-configured" | "error" | "duplicate";
export type PushResult = { state: PushState; users: number; devices: number; at: number };
export type VideoAlert = {
  id: string; // YouTube video ID
  title: string;
  description: string;
  thumbnail: string | null; // custom https image, or null = the YouTube thumbnail
  status: AlertStatus;
  createdAt: number;
  publishedAt: number;
  push: PushResult | null;
};
export type PublicAlert = { id: string; title: string; description: string; thumbnail: string; url: string; publishedAt: number };

/** The push shown on the phone. Tapping it (or "Watch Now") opens the YouTube video. */
export function alertPayload(a: Pick<VideoAlert, "id" | "title" | "description">): Payload {
  const t = a.title.replace(/[.!?\s]+$/, "");
  let body = a.description ? `${t}. ${a.description}` : t;
  if (body.length > 160) body = body.slice(0, 157).trimEnd() + "...";
  return {
    title: NOTIFICATION_TITLE, body, url: youtubeWatchUrl(a.id), tag: `video-${a.id}`, lang: "en", dir: "ltr",
    actions: [{ action: "watch", title: "Watch Now" }],
  };
}

export const PUSH_MESSAGES: Record<PushState, string> = {
  sent: "Notification sent.",
  nobody: "Published, but nobody has notifications turned on yet, so nothing was sent.",
  "not-configured": "Published, but push is not configured on the server (VAPID keys are missing), so nothing was sent.",
  error: "Published, but sending the notification failed. You can try again with Send notification.",
  duplicate: "A notification for this video was already sent (or is being sent), so no second one was sent.",
};
export function describePush(p: PushResult): string {
  return p.state === "sent" ? `Notification sent to ${p.users} member${p.users === 1 ? "" : "s"} (${p.devices} device${p.devices === 1 ? "" : "s"}).` : PUSH_MESSAGES[p.state];
}
