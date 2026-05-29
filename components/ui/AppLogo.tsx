"use client";
/**
 * AppLogo — renders the correct Duuka Pro Max logo for the current theme.
 * Client component so it responds to live theme changes and only ever mounts
 * ONE <img> at a time (no CSS hide/show tricks that can be clobbered by
 * framework styles).
 *
 * AppLogo      → switches between logo-light.png and logo-dark.png
 * AppLogoDark  → always shows logo-dark.png (auth pages, always-dark panels)
 *
 * The logo is 2 : 1 (width : height). Pass `height` in px; width is computed.
 */
import Image from "next/image";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/layout/ThemeProvider";

type Props = {
  height?: number;
  className?: string;
  priority?: boolean;
};

export function AppLogo({ height = 40, className = "", priority = false }: Props) {
  const { theme } = useTheme();
  const w = height * 2;

  // Initialise from the cookie-derived theme so SSR and first paint match
  // (no flash for users who have explicitly picked dark or light).
  const [isDark, setIsDark] = useState(theme === "dark");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const calc = () =>
      setIsDark(theme === "dark" || (theme === "system" && mq.matches));
    calc();
    mq.addEventListener("change", calc);
    return () => mq.removeEventListener("change", calc);
  }, [theme]);

  return (
    <Image
      src={isDark ? "/logo-dark.png" : "/logo-light.png"}
      alt="Duuka Pro Max"
      width={w}
      height={height}
      className={className}
      style={{ width: w, height }}
      priority={priority}
    />
  );
}

/** For surfaces that are always dark (auth pages, dark hero panels). */
export function AppLogoDark({ height = 40, className = "", priority = false }: Props) {
  const w = height * 2;
  return (
    <Image
      src="/logo-dark.png"
      alt="Duuka Pro Max"
      width={w}
      height={height}
      className={className}
      style={{ width: w, height }}
      priority={priority}
    />
  );
}
