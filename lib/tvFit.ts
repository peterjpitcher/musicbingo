import { layoutFits } from "@anchor-nights/kit/tv";

/**
 * A `fits` callback for the kit's useFitStep that works inside the kit Stage.
 *
 * The kit's measureLayout mixes getBoundingClientRect (which includes the
 * Stage's scale transform) with clientHeight (which does not), so at any scale
 * other than 1 it misjudges the fit: on a 4K TV everything looks too tall, on
 * a laptop preview too short. This measures the same things in canvas pixels
 * by dividing the on-screen rectangles by the element's own scale.
 *
 * The element should fill the space the text may use (for a centred column,
 * `alignSelf: stretch` with `justifyContent: center`). Content spilling past
 * either edge counts as not fitting.
 */
export function fitsInCanvas(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  const height = element.clientHeight;
  if (height <= 0 || box.height <= 0) return true;
  const scale = box.height / element.offsetHeight || 1;

  let contentTop = 0;
  let contentBottom = 0;
  for (const child of Array.from(element.querySelectorAll<HTMLElement>("*"))) {
    const rect = child.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    contentTop = Math.min(contentTop, (rect.top - box.top) / scale);
    contentBottom = Math.max(contentBottom, (rect.bottom - box.top) / scale);
  }
  if (contentTop < -1) return false;

  const paddingBottom = Number.parseFloat(getComputedStyle(element).paddingBottom) || 0;
  return layoutFits({ containerHeight: height, paddingBottom, contentBottom });
}
