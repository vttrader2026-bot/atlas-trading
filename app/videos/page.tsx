import VideoLibrary from "@/components/videos/VideoLibrary";
import { getVideos } from "@/lib/videos";

// VIDEOS-v1. Metadata is static English (the site's language isn't known server-side), like the Academy.
export const metadata = {
  title: "Videos — Atlas Trading",
  description: "Crypto trading tutorials, market analysis and Atlas Trading updates, streamed from our YouTube channel.",
};

export default function VideosPage() {
  return <VideoLibrary videos={getVideos()} />;
}
