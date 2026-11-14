"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

/** Display-only owner check for hiding owner buttons. Fails closed (false) on any error; the server enforces the real rule. */
export function useIsOwner(): boolean {
  const { isLoaded, isSignedIn } = useAuth();
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    fetch("/api/me/owner", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && setOwner(d?.owner === true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);
  return isLoaded && !!isSignedIn && owner;
}
