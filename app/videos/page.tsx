import VideoLibrary from "@/components/videos/VideoLibrary";
import { loadPublished } from "@/lib/videoStore";

// The library is managed at /admin/videos and read from Redis on each request, so a published video shows up immediately
// and a draft never does. Metadata is static English (the site's language isn't known server-side), like the Academy.
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Videos — Atlas Trading",
  description: "Crypto trading tutorials, market analysis and Atlas Trading updates, streamed from our YouTube channel.",
};

export default async function VideosPage() {
  return <VideoLibrary videos={await loadPublished()} />;
}
