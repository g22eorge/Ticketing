/**
 * AppLogo — renders the correct Duuka Pro Max logo for the current theme.
 *
 * AppLogo      → switches between logo-light.png (light mode) and logo-dark.png (dark mode)
 *               Uses .app-logo-light / .app-logo-dark CSS classes defined in globals.css
 *               so it works with the app's custom .theme-blackgold / .light theme system
 *               as well as the @media prefers-color-scheme fallback.
 *
 * AppLogoDark  → always shows logo-dark.png (white mark, for surfaces that are always dark)
 *
 * The logo is 2 : 1 (width : height). Pass `height` in px; width is computed automatically.
 */
import Image from "next/image";

type Props = {
  height?:   number;
  className?: string;
  priority?:  boolean;
};

export function AppLogo({ height = 40, className = "", priority = false }: Props) {
  const w = height * 2;
  return (
    <>
      {/* Shown in light mode, hidden in dark — controlled by globals.css */}
      <Image
        src="/logo-light.png"
        alt="Duuka Pro Max"
        width={w}
        height={height}
        className={`app-logo-light ${className}`}
        style={{ width: w, height }}
        priority={priority}
      />
      {/* Hidden in light mode, shown in dark — controlled by globals.css */}
      <Image
        src="/logo-dark.png"
        alt="Duuka Pro Max"
        width={w}
        height={height}
        className={`app-logo-dark ${className}`}
        style={{ width: w, height }}
        priority={priority}
      />
    </>
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
