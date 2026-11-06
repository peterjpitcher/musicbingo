/**
 * Text sizes for the 1920 by 1080 TV canvas, in canvas pixels.
 *
 * These are the shared kit's TV text sizes (the --text-tv-* tokens in tokens.css)
 * at 1080p. The kit's tokens are viewport clamps (vh), which suit a page that
 * fills the screen; the Music Bingo screens sit inside the kit Stage, which
 * already scales the whole canvas to the TV, so a vh size would scale twice.
 * Canvas pixels scale once, with the Stage.
 *
 * Nothing on a TV screen goes below `xs` (32px): that is the smallest size the
 * back of the room can read. Key information is `base` (44px) or larger.
 */
export const TV_TYPE = {
  xs: 32,
  sm: 38,
  base: 44,
  lg: 56,
  xl: 70,
  "2xl": 86,
  "3xl": 119,
} as const;

export type TvTypeSize = keyof typeof TV_TYPE;
