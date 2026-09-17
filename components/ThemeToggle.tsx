"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("atlas-theme");
    const isLight = saved === "light";
    document.documentElement.classList.toggle("light", isLight);
    setLight(isLight);
  }, []);

  function toggle() {
    const next = !light;
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("atlas-theme", next ? "light" : "dark");
    setLight(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark mode" : "Light mode"}
      className="w-9 h-9 flex items-center justify-center rounded-md border border-line text-text-muted hover:text-text hover:border-text-muted transition-colors"
    >
      {light ? "☾" : "☀"}
    </button>
  );
}
