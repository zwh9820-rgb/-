"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";
import { StoreProvider } from "@/lib/store";
import type { ThemeMode } from "@/lib/types";

export default function Home() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("cbh-theme") as ThemeMode | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("cbh-theme", theme);
  }, [theme, mounted]);

  return (
    <StoreProvider>
      <AppShell theme={theme} setTheme={setTheme} />
    </StoreProvider>
  );
}
