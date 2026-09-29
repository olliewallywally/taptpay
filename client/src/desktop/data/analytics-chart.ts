export type AnalyticsPeriod = "day" | "week" | "month" | "year";

export interface AnalyticsSvgPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnalyticsChartPoint {
  /** Point in the SVG's 1076 x 240 viewBox. */
  svgX: number;
  svgY: number;
  /** The same point in logical CSS pixels inside the chart container. */
  x: number;
  y: number;
}

export interface AnalyticsAreaChart {
  lineD: string;
  areaD: string;
  points: AnalyticsChartPoint[];
  peakIndex: number;
  marker: AnalyticsChartPoint;
}

export const ANALYTICS_VIEWBOX_WIDTH = 1076;
export const ANALYTICS_VIEWBOX_HEIGHT = 240;
export const ANALYTICS_PLOT_WIDTH = 1076;

/**
 * The marker is a 14px CSS circle with a 4px outer halo. Keeping real bucket
 * centres farther in than that full 11px extent prevents endpoint clipping.
 */
export const ANALYTICS_MARKER_VISUAL_RADIUS = 11;
export const ANALYTICS_POINT_INSET = 18;
export const ANALYTICS_CHIP_GUTTER = 8;

/** Unit/browser assertions use this tolerance for marker-to-stroke alignment. */
export const ANALYTICS_STROKE_ALIGNMENT_TOLERANCE = 0.25;

const CURVE_TOP = 16;
const CURVE_BOTTOM = 24;

const pathNumber = (value: number) => value.toFixed(1);

export function mapSvgPointToChart(
  svgX: number,
  svgY: number,
  placement: AnalyticsSvgPlacement,
): Pick<AnalyticsChartPoint, "x" | "y"> {
  return {
    x: placement.left + (svgX / ANALYTICS_VIEWBOX_WIDTH) * placement.width,
    y: placement.top + (svgY / ANALYTICS_VIEWBOX_HEIGHT) * placement.height,
  };
}

function mapChartXToSvg(x: number, placement: AnalyticsSvgPlacement): number {
  return ((x - placement.left) / placement.width) * ANALYTICS_VIEWBOX_WIDTH;
}

/**
 * Builds the shared retail/trades curve. Real bucket points occupy an inset
 * chart domain; only the horizontal decorative tails and area fill reach the
 * overscanned SVG edges. The CSS marker is mapped from the selected curve point
 * as a pair, so its x can never be clamped independently from its y.
 */
export function buildAnalyticsAreaChart(
  values: readonly number[],
  placement: AnalyticsSvgPlacement,
  options: { plotWidth?: number; pointInset?: number } = {},
): AnalyticsAreaChart {
  const plotWidth = options.plotWidth ?? ANALYTICS_PLOT_WIDTH;
  const pointInset = options.pointInset ?? ANALYTICS_POINT_INSET;
  const finiteValues = (values.length > 0 ? values : [0]).map((value) =>
    Number.isFinite(value) ? Math.max(0, value) : 0,
  );
  const plottedValues =
    finiteValues.length < 2 ? [finiteValues[0], finiteValues[0]] : finiteValues;
  const max = Math.max(...plottedValues, 1);
  const span = Math.max(0, plotWidth - pointInset * 2);

  const points = plottedValues.map((value, index): AnalyticsChartPoint => {
    const x =
      pointInset +
      (plottedValues.length === 1 ? span / 2 : (index / (plottedValues.length - 1)) * span);
    const svgX = mapChartXToSvg(x, placement);
    const svgY =
      ANALYTICS_VIEWBOX_HEIGHT -
      CURVE_BOTTOM -
      (value / max) *
        (ANALYTICS_VIEWBOX_HEIGHT - CURVE_TOP - CURVE_BOTTOM);
    const mapped = mapSvgPointToChart(svgX, svgY, placement);
    return { svgX, svgY, ...mapped };
  });

  const first = points[0];
  let lineD = `M0,${pathNumber(first.svgY)} L${pathNumber(first.svgX)},${pathNumber(first.svgY)}`;
  for (let index = 1; index < points.length; index++) {
    const p0 = points[index - 1];
    const p1 = points[index];
    const previous = points[index - 2] ?? p0;
    const next = points[index + 1] ?? p1;
    const c1x = p0.svgX + (p1.svgX - previous.svgX) / 6;
    const c1y = p0.svgY + (p1.svgY - previous.svgY) / 6;
    const c2x = p1.svgX - (next.svgX - p0.svgX) / 6;
    const c2y = p1.svgY - (next.svgY - p0.svgY) / 6;
    lineD += ` C${pathNumber(c1x)},${pathNumber(c1y)} ${pathNumber(c2x)},${pathNumber(c2y)} ${pathNumber(p1.svgX)},${pathNumber(p1.svgY)}`;
  }
  const last = points[points.length - 1];
  lineD += ` L${ANALYTICS_VIEWBOX_WIDTH},${pathNumber(last.svgY)}`;

  let peakIndex = 0;
  finiteValues.forEach((value, index) => {
    if (value > finiteValues[peakIndex]) peakIndex = index;
  });

  return {
    lineD,
    areaD: `${lineD} L${ANALYTICS_VIEWBOX_WIDTH},${ANALYTICS_VIEWBOX_HEIGHT} L0,${ANALYTICS_VIEWBOX_HEIGHT} Z`,
    points,
    peakIndex,
    marker: points[Math.min(peakIndex, points.length - 1)],
  };
}

/** Clamp only the decorative value chip, using its measured rendered width. */
export function clampAnalyticsChipCenter(
  desiredCenter: number,
  containerWidth: number,
  measuredChipWidth: number,
  gutter = ANALYTICS_CHIP_GUTTER,
): number {
  if (
    !Number.isFinite(desiredCenter) ||
    !Number.isFinite(containerWidth) ||
    !Number.isFinite(measuredChipWidth) ||
    containerWidth <= 0
  ) {
    return desiredCenter;
  }
  const availableWidth = Math.max(0, containerWidth - gutter * 2);
  if (measuredChipWidth >= availableWidth) return containerWidth / 2;
  const half = measuredChipWidth / 2;
  return Math.min(
    containerWidth - gutter - half,
    Math.max(gutter + half, desiredCenter),
  );
}

export function analyticsBucketLabel(
  period: AnalyticsPeriod,
  index: number,
  fallback: string,
): string {
  if (period === "week") {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index] ?? fallback;
  }
  if (period === "month") return `week ${index + 1}`;
  if (period === "year") {
    return [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][index] ?? fallback;
  }
  return `${fallback} three-hour bucket`;
}
