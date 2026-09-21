"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { startJournalSync } from "@/lib/journalSync";

// Renders nothing. Keeps the journal in sync while a user is signed in.
export default function JournalSync() {
  const { isLoaded, isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    return startJournalSync(userId);
  }, [isLoaded, isSignedIn, userId]);

  return null;
}