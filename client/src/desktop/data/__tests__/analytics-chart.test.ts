import {
  ANALYTICS_MARKER_VISUAL_RADIUS,
  ANALYTICS_PLOT_WIDTH,
  ANALYTICS_POINT_INSET,
  ANALYTICS_STROKE_ALIGNMENT_TOLERANCE,
  ANALYTICS_VIEWBOX_WIDTH,
  analyticsBucketLabel,
  buildAnalyticsAreaChart,
  clampAnalyticsChipCenter,
  mapSvgPointToChart,
  type AnalyticsPeriod,
  type AnalyticsSvgPlacement,
} from "../analytics-chart";

const PLACEMENTS: Record<"retail" | "trades", AnalyticsSvgPlacement> = {
  retail: { left: -51, top: -131, width: 1189, height: 301 },
  trades: { left: -86, top: -47, width: 1214, height: 221 },
};

const PERIOD_BUCKET_COUNTS: Record<AnalyticsPeriod, number> = {
  day: 8,
  week: 7,
  month: 5,
  year: 12,
};

const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);

describe("analytics area chart endpoint geometry", () => {
  for (const [placementName, placement] of Object.entries(PLACEMENTS)) {
    for (const [period, bucketCount] of Object.entries(
      PERIOD_BUCKET_COUNTS,
    ) as [AnalyticsPeriod, number][]) {
      const peakFixtures = [
        ["first", 0],
        ["interior", Math.floor(bucketCount / 2)],
        ["last", bucketCount - 1],
      ] as const;

      for (const [position, peakIndex] of peakFixtures) {
        it(`${placementName} ${period} keeps a ${position}-bucket peak visible and on the stroke`, () => {
          const values = Array.from({ length: bucketCount }, () => 100);
          values[peakIndex] = 10_000;

          const chart = buildAnalyticsAreaChart(values, placement);
          const marker = chart.marker;

          expect(chart.peakIndex).toBe(peakIndex);
          expect(marker).toEqual(chart.points[peakIndex]);

          // The complete CSS dot + halo remains inside the visible plot width.
          expect(marker.x - ANALYTICS_MARKER_VISUAL_RADIUS).toBeGreaterThanOrEqual(0);
          expect(marker.x + ANALYTICS_MARKER_VISUAL_RADIUS).toBeLessThanOrEqual(
            ANALYTICS_PLOT_WIDTH,
          );

          // It also remains inside the SVG's vertical draw surface.
          expect(marker.y - placement.top).toBeGreaterThanOrEqual(
            ANALYTICS_MARKER_VISUAL_RADIUS,
          );
          expect(marker.y - placement.top).toBeLessThanOrEqual(
            placement.height - ANALYTICS_MARKER_VISUAL_RADIUS,
          );

          // The rendered path rounds to tenths. Map that actual rendered anchor
          // through the non-uniform SVG stretch and compare it with the CSS dot.
          const renderedAnchor = mapSvgPointToChart(
            Number(marker.svgX.toFixed(1)),
            Number(marker.svgY.toFixed(1)),
            placement,
          );
          expect(distance(marker, renderedAnchor)).toBeLessThanOrEqual(
            ANALYTICS_STROKE_ALIGNMENT_TOLERANCE,
          );
        });
      }
    }
  }

  it("insets real points while leaving only decorative tails at overscan edges", () => {
    const chart = buildAnalyticsAreaChart([500, 1000, 750], PLACEMENTS.retail);

    expect(chart.points[0].x).toBeCloseTo(ANALYTICS_POINT_INSET);
    expect(chart.points.at(-1)?.x).toBeCloseTo(
      ANALYTICS_PLOT_WIDTH - ANALYTICS_POINT_INSET,
    );
    expect(chart.points[0].svgX).toBeGreaterThan(0);
    expect(chart.points.at(-1)?.svgX).toBeLessThan(ANALYTICS_VIEWBOX_WIDTH);
    expect(chart.lineD).toMatch(/^M0,/);
    expect(chart.lineD).toContain(` L${ANALYTICS_VIEWBOX_WIDTH},`);
  });
});

describe("analytics value chip", () => {
  it("clamps independently using the measured chip width", () => {
    expect(clampAnalyticsChipCenter(ANALYTICS_POINT_INSET, 1076, 82)).toBe(49);
    expect(
      clampAnalyticsChipCenter(1076 - ANALYTICS_POINT_INSET, 1076, 82),
    ).toBe(1027);
    expect(clampAnalyticsChipCenter(538, 1076, 82)).toBe(538);
  });

  it("centres a chip wider than the available chart", () => {
    expect(clampAnalyticsChipCenter(10, 200, 220)).toBe(100);
  });
});

describe("accessible peak bucket labels", () => {
  it("expands ambiguous compact chart labels", () => {
    expect(analyticsBucketLabel("week", 1, "T")).toBe("Tuesday");
    expect(analyticsBucketLabel("month", 2, "W3")).toBe("week 3");
    expect(analyticsBucketLabel("year", 4, "M")).toBe("May");
    expect(analyticsBucketLabel("day", 0, "12a")).toBe(
      "12a three-hour bucket",
    );
  });
});
