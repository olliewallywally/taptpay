import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  type Timeframe,
  buildBuckets,
  collectedCents,
  currentBucketIdx,
  fmtCompact,
  growthPct,
  periodWindow,
} from "@/lib/property-dashboard-data";
import "./retail-dashboard-view.css";

const BLUE = "#0055FF";
const TEAL = "#00E5CC";
const BAR = "#00E5CC";
const SELECTED_BAR = "#FFFFFF";
const SHEET = "#F4F4F4";

const TIMEFRAMES: Timeframe[] = ["day", "week", "month", "year"];
const MAX_SLOTS = 12;

const fmtWhole = (cents: number) =>
  "$" + Math.round(cents / 100).toLocaleString("en-NZ");

export type RetailDashboardMerchant = {
  status?: string | null;
};

export type RetailDashboardTransaction = {
  status?: string | null;
  createdAt?: string | Date | null;
  price?: string | number | null;
};

export type RetailDashboardViewProps = {
  merchant?: RetailDashboardMerchant | null;
  transactions: RetailDashboardTransaction[];
  transactionLoading: boolean;
  transactionError: boolean;
  reportsControl?: ReactNode;
  now?: Date;
  onRetryTransactions: () => void;
  onNavigate: (path: string) => void;
};

const IcoPlus = () => (
  <svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill="none"
    stroke={BLUE}
    strokeWidth="2.2"
    strokeLinecap="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IcoBox = () => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke={BLUE}
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
    <path d="M3 8l9 5 9-5" />
    <path d="M12 13v8" />
  </svg>
);

const IcoList = () => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke={BLUE}
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M8 16.5V11" />
    <path d="M12 16.5V7.5" />
    <path d="M16 16.5v-3.5" />
  </svg>
);

const IcoTag = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill={BLUE}>
    <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2c.5 0 1 .2 1.4.6zM7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
  </svg>
);

const IcoWarn = () => (
  <svg
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke={TEAL}
    strokeWidth="1.8"
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5" />
    <circle cx="12" cy="15.8" r=".9" fill={TEAL} stroke="none" />
  </svg>
);

function pulse(event: ReactPointerEvent<HTMLElement>) {
  const element = event.currentTarget;
  element.classList.remove("rd-pulse");
  void element.offsetWidth;
  element.classList.add("rd-pulse");
}

function TimeframeBar({
  timeframe,
  onPick,
  onIndicator,
}: {
  timeframe: Timeframe;
  onPick: (timeframe: Timeframe) => void;
  onIndicator?: (centerX: number, animate: boolean) => void;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mounted = useRef(false);
  const [indicator, setIndicator] = useState({ x: 0, width: 0, visible: false });
  const [animate, setAnimate] = useState(false);
  const activeIndex = TIMEFRAMES.indexOf(timeframe);

  useEffect(() => {
    const measure = (shouldAnimate: boolean) => {
      const element = buttonRefs.current[activeIndex];
      if (!element) return;
      setIndicator({
        x: element.offsetLeft,
        width: element.offsetWidth,
        visible: true,
      });
      const rect = element.getBoundingClientRect();
      onIndicator?.(rect.left + rect.width / 2, shouldAnimate);
    };
    const remeasure = () => measure(false);
    window.addEventListener("resize", remeasure);
    if (!mounted.current) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          measure(false);
          mounted.current = true;
        }),
      );
      return () => window.removeEventListener("resize", remeasure);
    }
    setAnimate(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => measure(true))),
    );
    const timer = setTimeout(() => setAnimate(false), 520);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", remeasure);
    };
  }, [activeIndex]);

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          width: "min(300px, 100%)",
          background: BLUE,
          borderRadius: 999,
          padding: 3,
          boxShadow: "0 6px 18px rgba(0,85,255,0.22)",
        }}
      >
        <div
          className={"rd-tf-ind" + (animate ? " animate" : "")}
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: indicator.x,
            width: indicator.width,
            borderRadius: 999,
            background: TEAL,
            opacity: indicator.visible ? 1 : 0,
          }}
        />
        {TIMEFRAMES.map((option, index) => (
          <button
            key={option}
            type="button"
            ref={(element) => {
              buttonRefs.current[index] = element;
            }}
            className="rd-tap"
            data-demo-id={"retail-dashboard-timeframe-" + option}
            onPointerDown={pulse}
            onClick={() => onPick(option)}
            style={{
              position: "relative",
              zIndex: 1,
              flex: 1,
              padding: "7px 0",
              borderRadius: 999,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: "Outfit, system-ui",
              fontWeight: timeframe === option ? 700 : 600,
              fontSize: 12,
              textTransform: "capitalize",
              color: timeframe === option ? BLUE : "rgba(0,229,204,0.55)",
              transition: "color 0.25s ease",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function SalesBarChart({
  buckets,
  selectedIndex,
  onSelectBar,
  animationKey,
}: {
  buckets: { label: string; valueCents: number }[];
  selectedIndex: number;
  onSelectBar: (index: number) => void;
  animationKey: string;
}) {
  const width = 375;
  const chartHeight = 190;
  const labelHeight = 30;
  const height = chartHeight + labelHeight;
  const horizontalPadding = 16;
  const baseline = chartHeight;
  const count = buckets.length;
  const gap = count > 8 ? 10 : 24;
  const barWidth =
    (width - horizontalPadding * 2 - gap * (count - 1)) / count;
  const x = (index: number) =>
    horizontalPadding + index * (barWidth + gap);

  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 60);
    return () => clearTimeout(timer);
  }, []);

  const dotSize = 7;
  const maxValue = Math.max(...buckets.map((bucket) => bucket.valueCents), 1);
  const heightFor = (value: number) =>
    value <= 0 ? dotSize : 12 + (value / maxValue) * (chartHeight - 40);

  const selected = buckets[selectedIndex];
  const selectedX =
    x(Math.min(selectedIndex, count - 1)) + barWidth / 2;
  const selectedTop =
    baseline - heightFor(selected?.valueCents ?? 0);

  return (
    <div style={{ position: "relative", margin: "22px -6px 0" }}>
      <svg
        viewBox={"0 0 " + width + " " + height}
        width="100%"
        style={{ display: "block", height: "auto", overflow: "visible" }}
      >
        {Array.from({ length: MAX_SLOTS }, (_, index) => {
          const active = index < count;
          const zero = active && buckets[index].valueCents <= 0;
          const barHeight =
            active && revealed ? heightFor(buckets[index].valueCents) : 0;
          const renderedWidth = zero ? dotSize : Math.max(barWidth, 1);
          const renderedX = active
            ? x(index) + (zero ? (barWidth - dotSize) / 2 : 0)
            : width - horizontalPadding - barWidth;
          return (
            <rect
              key={index}
              className="rd-bar"
              data-demo-id={active ? "retail-dashboard-bar-" + index : undefined}
              x={renderedX}
              width={renderedWidth}
              y={baseline - barHeight}
              height={barHeight}
              rx={renderedWidth / 2}
              fill={index === selectedIndex ? SELECTED_BAR : BAR}
              opacity={zero ? 0.45 : 1}
              style={{
                cursor: active ? "pointer" : "default",
                pointerEvents: active ? "auto" : "none",
              }}
              onClick={() => active && onSelectBar(index)}
            />
          );
        })}
        {buckets.map((bucket, index) => (
          <text
            key={animationKey + "-" + index}
            className="rd-bar-label"
            x={x(index) + barWidth / 2}
            y={chartHeight + 22}
            textAnchor="middle"
            fontFamily="Outfit, system-ui"
            fontWeight="600"
            fontSize={count > 8 ? 11 : 13}
            fill={TEAL}
          >
            {bucket.label}
          </text>
        ))}
      </svg>
      {selected && (
        <div
          key={animationKey + "-" + selectedIndex}
          className="rd-bar-pill"
          data-demo-id="retail-dashboard-selected-value"
          style={{
            position: "absolute",
            left: ((selectedX / width) * 100) + "%",
            top: ((selectedTop / height) * 100) + "%",
            transform: "translate(-50%, calc(-100% - 8px))",
            background: SELECTED_BAR,
            color: BLUE,
            padding: "5px 14px",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 13,
            whiteSpace: "nowrap",
            boxShadow: "0 6px 16px rgba(255,255,255,0.3)",
            pointerEvents: "none",
          }}
        >
          {fmtCompact(selected.valueCents)}
        </div>
      )}
    </div>
  );
}

export function RetailDashboardView({
  merchant,
  transactions,
  transactionLoading,
  transactionError,
  reportsControl,
  now,
  onRetryTransactions,
  onNavigate,
}: RetailDashboardViewProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("week");
  const [selectedBar, setSelectedBar] = useState(-1);
  const columnRef = useRef<HTMLDivElement>(null);
  const [notch, setNotch] = useState<{ x: number; animate: boolean } | null>(
    null,
  );

  const handleIndicator = (centerX: number, animate: boolean) => {
    const column = columnRef.current?.getBoundingClientRect();
    if (column) setNotch({ x: centerX - column.left, animate });
  };

  const sales = transactions.map((transaction) => ({
    status: transaction.status === "completed" ? "paid" : transaction.status,
    createdAt: transaction.createdAt,
    paidAt: transaction.createdAt,
    amountCents: Math.round(
      Number.parseFloat(String(transaction.price ?? "0")) * 100,
    ),
  }));

  const referenceDate = now ?? new Date();
  const period = periodWindow(timeframe, referenceDate);
  const collected = collectedCents(sales, period.start, period.end);
  const previousCollected = collectedCents(
    sales,
    period.prevStart,
    period.prevEnd,
  );
  const growth = growthPct(collected, previousCollected);
  const buckets = buildBuckets(sales, timeframe, referenceDate);
  const selectedIndex =
    selectedBar >= 0 && selectedBar < buckets.length
      ? selectedBar
      : Math.min(
          currentBucketIdx(timeframe, referenceDate),
          buckets.length - 1,
        );

  const salesCount = sales.filter((sale) => {
    const paidAt = new Date(sale.paidAt ?? 0);
    return (
      sale.status === "paid" &&
      paidAt >= period.start &&
      paidAt < period.end
    );
  }).length;
  const activeCount = transactions.filter(
    (transaction) =>
      transaction.status === "pending" || transaction.status === "processing",
  ).length;

  const pickTimeframe = (next: Timeframe) => {
    setTimeframe(next);
    setSelectedBar(-1);
  };

  const shortcuts = [
    {
      label: (
        <>
          new
          <br />
          sale
        </>
      ),
      Icon: IcoPlus,
      path: "/terminal",
      ariaLabel: "new sale",
      demoId: "retail-dashboard-new-sale",
    },
    {
      label: (
        <>
          manage
          <br />
          stock
        </>
      ),
      Icon: IcoBox,
      path: "/stock",
      ariaLabel: "manage stock",
      demoId: "retail-dashboard-manage-stock",
    },
    {
      label: (
        <>
          view
          <br />
          sales
        </>
      ),
      Icon: IcoList,
      path: "/transactions",
      ariaLabel: "view sales",
      demoId: "retail-dashboard-view-sales",
    },
  ];

  return (
    <div
      className="retail-dashboard-view"
      data-demo-id="retail-dashboard"
      style={{
        background: "#FFFFFF",
        minHeight: "100svh",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        ref={columnRef}
        style={{
          width: "100%",
          maxWidth: 430,
          minHeight: "100svh",
          background: SHEET,
          paddingBottom: 130,
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "relative",
            background: BLUE,
            borderRadius: "0 0 28px 28px",
            padding: "54px 22px 30px",
          }}
        >
          <div
            data-demo-id="retail-dashboard-reports"
            style={{ display: "flex", justifyContent: "flex-end" }}
          >
            {reportsControl}
          </div>

          {transactionError && (
            <div
              style={{
                margin: "14px 0 0",
                padding: "12px 16px",
                borderRadius: 14,
                background: "rgba(255,59,78,0.14)",
                border: "1px solid rgba(255,59,78,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span
                style={{ color: "#FF8A94", fontSize: 13, fontWeight: 500 }}
              >
                {transactionLoading ? "loading…" : "couldn't load your data"}
              </span>
              <button
                type="button"
                data-demo-id="retail-dashboard-retry"
                onClick={onRetryTransactions}
                style={{
                  background: TEAL,
                  color: BLUE,
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                retry
              </button>
            </div>
          )}

          <div
            style={{
              marginTop: 18,
              display: "flex",
              alignItems: "center",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            {transactionLoading ? (
              <div
                className="rd-skel"
                style={{
                  width: 190,
                  height: 54,
                  borderRadius: 14,
                  background: "rgba(0,229,204,0.25)",
                }}
              />
            ) : (
              <div
                data-demo-id="retail-dashboard-revenue"
                style={{
                  fontWeight: 800,
                  fontSize: 54,
                  color: TEAL,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtWhole(collected)}
              </div>
            )}
            {!transactionLoading && growth !== null && (
              <div
                data-demo-id="retail-dashboard-growth"
                style={{
                  padding: "5px 12px",
                  borderRadius: 999,
                  border: "1.5px solid " + TEAL,
                  color: TEAL,
                  fontWeight: 600,
                  fontSize: 12.5,
                }}
              >
                {growth > 0 ? "+" + growth + "%" : growth + "%"}
              </div>
            )}
          </div>
          <div
            style={{
              marginTop: 10,
              color: TEAL,
              fontWeight: 500,
              fontSize: 15,
            }}
          >
            sales revenue
          </div>
          {transactionLoading ? (
            <div
              className="rd-skel"
              style={{
                marginTop: 6,
                width: 118,
                height: 13,
                borderRadius: 7,
                background: "rgba(0,229,204,0.2)",
              }}
            />
          ) : (
            <div
              data-demo-id="retail-dashboard-completed-sales"
              style={{
                marginTop: 4,
                color: "rgba(0,229,204,0.6)",
                fontWeight: 400,
                fontSize: 13,
              }}
            >
              {salesCount} completed sale{salesCount !== 1 ? "s" : ""}
            </div>
          )}

          <SalesBarChart
            buckets={buckets}
            selectedIndex={selectedIndex}
            onSelectBar={setSelectedBar}
            animationKey={timeframe}
          />

          <svg
            width="84"
            height="14"
            viewBox="0 0 84 14"
            className={
              notch?.animate ? "rd-notch animate" : "rd-notch"
            }
            style={{
              position: "absolute",
              left: notch ? notch.x : "50%",
              bottom: -13,
              transform: "translateX(-50%)",
            }}
          >
            <path
              d="M0 0 C 20 0 26 13 42 13 C 58 13 64 0 84 0 Z"
              fill={BLUE}
            />
          </svg>
        </div>

        <div style={{ padding: "15px 22px 0" }}>
          <TimeframeBar
            timeframe={timeframe}
            onPick={pickTimeframe}
            onIndicator={handleIndicator}
          />
        </div>

        {merchant && merchant.status !== "active" && (
          <div
            data-demo-id="retail-dashboard-pending"
            style={{
              margin: "18px 22px 0",
              padding: "12px 16px",
              borderRadius: 16,
              background: "#FFFBEB",
              border: "1px solid #FCD34D",
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: "18px" }}>⏳</span>
            <div>
              <div
                style={{ fontWeight: 600, fontSize: 13, color: "#92400E" }}
              >
                Account pending activation
              </div>
              <div
                style={{
                  fontWeight: 400,
                  fontSize: 11.5,
                  color: "#B45309",
                  marginTop: 2,
                  lineHeight: 1.4,
                }}
              >
                Your account is being reviewed and connected to our payment
                network. You can set up your business details in Settings while
                you wait. We'll notify you once you're live.
              </div>
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.15fr",
            gap: 14,
            padding: "26px 22px 0",
          }}
        >
          <button
            type="button"
            className="rd-card rd-tap"
            data-demo-id="retail-dashboard-sales"
            onPointerDown={pulse}
            onClick={() => onNavigate("/transactions")}
            style={{
              background: "#FFFFFF",
              borderRadius: 22,
              padding: "16px 18px",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "Outfit, system-ui",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color: BLUE,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                sales
              </div>
              <IcoTag />
            </div>
            {transactionLoading ? (
              <div
                className="rd-skel"
                style={{
                  marginTop: 10,
                  width: 54,
                  height: 42,
                  borderRadius: 10,
                  background: "rgba(0,85,255,0.12)",
                }}
              />
            ) : (
              <div
                style={{
                  marginTop: 10,
                  fontWeight: 800,
                  fontSize: 42,
                  color: BLUE,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {salesCount}
              </div>
            )}
          </button>
          <button
            type="button"
            className="rd-card rd-tap"
            data-demo-id="retail-dashboard-active"
            onPointerDown={pulse}
            onClick={() => onNavigate("/transactions")}
            style={{
              background: BLUE,
              borderRadius: 22,
              padding: "16px 18px",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "Outfit, system-ui",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  color: TEAL,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                active
              </div>
              <IcoWarn />
            </div>
            {transactionLoading ? (
              <div
                className="rd-skel"
                style={{
                  marginTop: 10,
                  width: 54,
                  height: 42,
                  borderRadius: 10,
                  background: "rgba(0,229,204,0.22)",
                }}
              />
            ) : (
              <div
                style={{
                  marginTop: 10,
                  fontWeight: 800,
                  fontSize: 42,
                  color: TEAL,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {activeCount}
              </div>
            )}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 1fr 1fr",
            gap: 12,
            padding: "18px 22px 0",
          }}
        >
          {shortcuts.map(
            ({ label, Icon, path, ariaLabel, demoId }) => (
              <button
                key={ariaLabel}
                type="button"
                className="rd-card rd-tap"
                aria-label={ariaLabel}
                data-demo-id={demoId}
                onPointerDown={pulse}
                onClick={() => onNavigate(path)}
                style={{
                  background: "#FFFFFF",
                  borderRadius: 18,
                  padding: "14px 14px 12px",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "Outfit, system-ui",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  minHeight: 88,
                }}
              >
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Icon />
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 12,
                    color: BLUE,
                    lineHeight: 1.3,
                  }}
                >
                  {label}
                </div>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

export default RetailDashboardView;
