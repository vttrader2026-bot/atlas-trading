"use client";

// Layout state for the workspace: whether we're on a desktop-width screen
// (>= 1024px), and the right side panel (open/closed, active tab). On desktop
// the panel starts open beside the chart; on smaller screens it starts closed
// and opens as a bottom sheet. Nothing here touches chart data.

import { useCallback, useEffect, useState } from "react";

export type SidebarTab = "watchlist" | "market" | "trade" | "data";

export function useChartLayout() {
  const [desktop, setDesktop] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<SidebarTab>("watchlist");

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    /* eslint-disable react-hooks/set-state-in-effect -- viewport size is only known after mount */
    setDesktop(mq.matches);
    setSidebarOpen(mq.matches);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onChange = (e: MediaQueryListEvent) => {
      setDesktop(e.matches);
      setSidebarOpen(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  return { desktop, sidebarOpen, toggleSidebar, closeSidebar, tab, setTab };
}
