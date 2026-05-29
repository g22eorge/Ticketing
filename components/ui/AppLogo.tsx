/**
 * AppLogo — renders the correct Duuka Pro Max logo for the current theme.
 *
 * AppLogo      → switches between logo-light.png (light mode) and logo-dark.png (dark mode)
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
      {/* Light mode */}
      <Image
        src="/logo-light.png"
        alt="Duuka Pro Max"
        width={w}
        height={height}
        className={`block dark:hidden ${className}`}
        style={{ width: w, height }}
        priority={priority}
      />
      {/* Dark mode */}
      <Image
        src="/logo-dark.png"
        alt="Duuka Pro Max"
        width={w}
        height={height}
        className={`hidden dark:block ${className}`}
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
