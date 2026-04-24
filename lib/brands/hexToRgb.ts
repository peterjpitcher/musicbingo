const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/** Convert "#RRGGBB" to "R G B" space-separated string for CSS custom properties. */
export function hexToRgbChannels(hex: string): string {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

/** Convert "#RRGGBB" to { red, green, blue } in 0-1 range for pdf-lib rgb(). */
export function hexToPdfLibRgb(hex: string): { red: number; green: number; blue: number } {
  if (!HEX_PATTERN.test(hex)) {
    throw new Error(`Invalid hex colour: ${hex}`);
  }
  return {
    red: parseInt(hex.slice(1, 3), 16) / 255,
    green: parseInt(hex.slice(3, 5), 16) / 255,
    blue: parseInt(hex.slice(5, 7), 16) / 255,
  };
}
