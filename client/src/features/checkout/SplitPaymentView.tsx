import { useState, type CSSProperties } from 'react';
import { CheckCircle, Loader2, Minus, Plus } from 'lucide-react';
import {
  CHECKOUT_THEME as CT,
  FONT_WORDMARK,
  amountStyle,
  cardStyle,
  chipStyle,
  footerLinkStyle,
  labelStyle,
  outlineBtnStyle,
  pageStyle,
} from '@/lib/checkout-theme';

export type SplitPaymentViewModel = {
  customLogoUrl?: string | null;
  itemName?: string | null;
  totalAmount: number;
  splitSetup: boolean;
  completedSplits: number;
  totalSplits?: number;
  subsequentShare?: string;
  remainingAmount?: number;
  allDone?: boolean;
  closed?: boolean;
  processing?: boolean;
  paymentInProgress?: boolean;
  allowCustomAmount?: boolean;
  truncateEqualShares?: boolean;
  error?: string | null;
  loading?: boolean;
  notFound?: boolean;
};

export type SplitPaymentSelection = {
  amount: number;
  splitCount: number;
};

export type SplitPaymentViewProps = {
  model: SplitPaymentViewModel;
  onPay: (selection: SplitPaymentSelection) => void;
  onPayFull?: () => void;
  onDone: () => void;
};

function equalShareFor(
  totalAmount: number,
  splitCount: number,
  truncate: boolean
): string {
  if (truncate) {
    return (
      Math.floor(Math.round(totalAmount * 100) / splitCount) / 100
    ).toFixed(2);
  }
  return (totalAmount / splitCount).toFixed(2);
}

function SplitWordmark({
  customLogoUrl,
  size = 34,
}: {
  customLogoUrl?: string | null;
  size?: number;
}) {
  if (customLogoUrl) {
    return (
      <img
        src={customLogoUrl}
        alt="Merchant logo"
        style={{ height: size + 8, maxWidth: 180, objectFit: 'contain' }}
      />
    );
  }
  return (
    <span
      aria-label="taptpay"
      style={{
        fontFamily: FONT_WORDMARK,
        fontWeight: 900,
        fontSize: size,
        color: CT.SKY,
        lineHeight: 1,
        letterSpacing: '-0.5px',
        userSelect: 'none',
      }}
    >
      tapt<span style={{ fontStyle: 'italic' }}>pay</span>
    </span>
  );
}

export function SplitPaymentView({
  model,
  onPay,
  onPayFull,
  onDone,
}: SplitPaymentViewProps) {
  const [splitCount, setSplitCount] = useState(2);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [confirmedCustom, setConfirmedCustom] = useState<string | null>(null);
  const [subEditMode, setSubEditMode] = useState(false);
  const [subEditValue, setSubEditValue] = useState('');
  const [subConfirmed, setSubConfirmed] = useState<string | null>(null);

  if (model.loading) {
    return (
      <div
        className="split-payment-view"
        data-demo-id="split-loading"
        style={{ ...pageStyle, alignItems: 'center' }}
      >
        <Loader2
          size={40}
          color={CT.INK}
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <style>{spinKeyframes}</style>
      </div>
    );
  }

  if (model.notFound) {
    return (
      <div
        className="split-payment-view"
        data-demo-id="split-not-found"
        style={pageStyle}
      >
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div
            style={{ ...cardStyle, minHeight: 420, justifyContent: 'center' }}
          >
            <div
              style={{
                position: 'absolute',
                top: 44,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <SplitWordmark customLogoUrl={model.customLogoUrl} />
            </div>
            <p style={{ color: CT.SKY, fontSize: 18, fontWeight: 700 }}>
              Transaction not found
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalSplits = model.totalSplits || splitCount;
  const equalShare = equalShareFor(
    model.totalAmount,
    model.splitSetup ? totalSplits : splitCount,
    model.truncateEqualShares === true
  );
  const remaining = model.remainingAmount ?? model.totalAmount;
  const subsequentShare = model.subsequentShare ?? equalShare;
  const displayAmount = model.splitSetup
    ? subsequentShare
    : (confirmedCustom ?? equalShare);
  const subDisplay = subConfirmed ?? subsequentShare;
  const parsedEdit = parseFloat(editValue) || 0;
  const parsedSubEdit = parseFloat(subEditValue) || 0;
  const isEditValid = parsedEdit > 0 && parsedEdit <= model.totalAmount + 0.01;
  const isSubEditValid = parsedSubEdit > 0 && parsedSubEdit <= remaining + 0.01;

  const progressBars = (count: number, done: number) => (
    <div
      data-demo-id="split-progress"
      style={{ display: 'flex', gap: 6, width: '100%', marginTop: 20 }}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          style={{
            flex: 1,
            height: 6,
            borderRadius: 999,
            background: index < done ? CT.SKY : 'rgba(88,171,255,0.25)',
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      className="split-payment-view"
      data-demo-id="split-payment-view"
      style={pageStyle}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div
          style={{ ...cardStyle, minHeight: 560, justifyContent: 'flex-start' }}
        >
          <SplitWordmark customLogoUrl={model.customLogoUrl} />

          {model.closed && (
            <>
              <div style={{ flex: 1 }} />
              <p style={{ color: CT.SKY, fontSize: 20, fontWeight: 700 }}>
                Payment closed
              </p>
              <p style={{ color: CT.SKY_DIM, fontSize: 13, marginTop: 8 }}>
                This payment can no longer be completed.
              </p>
              <div style={{ flex: 1 }} />
            </>
          )}

          {model.allDone && !model.closed && (
            <>
              <div style={{ flex: 1 }} />
              <div
                style={{ textAlign: 'center' }}
                data-demo-id="split-complete"
              >
                <CheckCircle
                  size={64}
                  color={CT.SKY}
                  style={{ margin: '0 auto 16px' }}
                />
                <p
                  style={{
                    color: CT.SKY,
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  All done!
                </p>
                <p style={{ color: CT.SKY_DIM, fontSize: 14 }}>
                  All {totalSplits} payments complete
                </p>
                <p
                  style={{ ...amountStyle, fontSize: 44, margin: '16px 0 2px' }}
                >
                  ${model.totalAmount.toFixed(2)}
                </p>
                <p style={{ color: CT.SKY_DIM, fontSize: 13 }}>total paid</p>
              </div>
              <div style={{ flex: 1 }} />
              <button
                data-demo-id="split-done"
                style={{ ...outlineBtnStyle, marginTop: 8 }}
                onClick={onDone}
              >
                done
              </button>
            </>
          )}

          {!model.allDone &&
            !model.closed &&
            (model.processing || model.paymentInProgress) && (
              <>
                <div style={{ flex: 1 }} />
                <Loader2
                  size={32}
                  color={CT.SKY}
                  style={{ animation: 'spin 1s linear infinite' }}
                />
                <p
                  style={{
                    color: CT.SKY,
                    fontSize: 15,
                    fontWeight: 600,
                    marginTop: 14,
                  }}
                >
                  {model.paymentInProgress
                    ? 'Payment in progress…'
                    : 'Taking you to payment…'}
                </p>
                <div style={{ flex: 1 }} />
              </>
            )}

          {!model.allDone &&
            !model.closed &&
            !model.processing &&
            !model.paymentInProgress &&
            !model.splitSetup && (
              <>
                <div style={{ flex: 1, minHeight: 12 }} />
                <div style={{ ...chipStyle, marginBottom: 14 }}>
                  Person 1 of {splitCount}
                </div>
                <p style={labelStyle}>{model.itemName}</p>
                <p style={{ ...amountStyle, fontSize: 56 }}>
                  ${model.totalAmount.toFixed(2)}
                </p>

                <div
                  data-demo-id="split-count"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 22,
                    marginTop: 6,
                  }}
                >
                  <button
                    data-demo-id="split-fewer"
                    onClick={() => {
                      setSplitCount(count => Math.max(2, count - 1));
                      setConfirmedCustom(null);
                    }}
                    disabled={splitCount <= 2}
                    style={stepperStyle(splitCount <= 2)}
                    aria-label="Fewer people"
                  >
                    <Minus size={20} />
                  </button>
                  <span
                    style={{
                      color: CT.SKY_DIM,
                      fontSize: 14,
                      width: 80,
                      textAlign: 'center',
                    }}
                  >
                    {splitCount} people
                  </span>
                  <button
                    data-demo-id="split-more"
                    onClick={() => {
                      setSplitCount(count => Math.min(10, count + 1));
                      setConfirmedCustom(null);
                    }}
                    disabled={splitCount >= 10}
                    style={stepperStyle(splitCount >= 10)}
                    aria-label="More people"
                  >
                    <Plus size={20} />
                  </button>
                </div>

                {!editMode && (
                  <>
                    <p
                      style={{ color: CT.SKY_DIM, fontSize: 14, marginTop: 12 }}
                    >
                      {confirmedCustom ? (
                        <>
                          your amount:{' '}
                          <span style={{ color: CT.SKY, fontWeight: 700 }}>
                            ${confirmedCustom}
                          </span>
                        </>
                      ) : (
                        <>
                          each pays{' '}
                          <span style={{ color: CT.SKY, fontWeight: 700 }}>
                            ${equalShare}
                          </span>
                        </>
                      )}
                    </p>
                    {model.allowCustomAmount && (
                      <button
                        data-demo-id="split-edit-first"
                        onClick={() => {
                          setEditValue(
                            confirmedCustom ?? model.totalAmount.toFixed(2)
                          );
                          setEditMode(true);
                        }}
                        style={footerLinkStyle}
                      >
                        {confirmedCustom
                          ? 'change amount'
                          : 'enter different amount'}
                      </button>
                    )}
                  </>
                )}

                {editMode && (
                  <div
                    style={{
                      marginTop: 10,
                      width: '100%',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      data-demo-id="split-custom-amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      value={editValue}
                      onChange={event => setEditValue(event.target.value)}
                      autoFocus
                      style={amountInputStyle}
                      aria-label="Your payment amount"
                    />
                    {editValue && !isEditValid && (
                      <p style={{ color: CT.RED, fontSize: 12, marginTop: 6 }}>
                        Enter an amount between $0.01 and $
                        {model.totalAmount.toFixed(2)}
                      </p>
                    )}
                    <button
                      data-demo-id="split-use-equal"
                      onClick={() => {
                        setConfirmedCustom(null);
                        setEditMode(false);
                      }}
                      style={footerLinkStyle}
                    >
                      use equal split
                    </button>
                  </div>
                )}

                {progressBars(splitCount, 0)}
                <p style={{ color: CT.SKY_DIM, fontSize: 12, marginTop: 8 }}>
                  0 of {splitCount} paid
                </p>

                <div style={{ flex: 1, minHeight: 16 }} />
                {model.error && (
                  <p
                    role="alert"
                    style={{
                      color: CT.RED,
                      fontSize: 13,
                      marginBottom: 10,
                      textAlign: 'center',
                    }}
                  >
                    {model.error}
                  </p>
                )}
                {editMode ? (
                  <button
                    data-demo-id="split-confirm-first"
                    style={{
                      ...outlineBtnStyle,
                      opacity: isEditValid ? 1 : 0.5,
                    }}
                    disabled={!isEditValid}
                    onClick={() => {
                      if (isEditValid) {
                        setConfirmedCustom(parsedEdit.toFixed(2));
                        setEditMode(false);
                      }
                    }}
                  >
                    confirm
                  </button>
                ) : (
                  <button
                    data-demo-id="split-pay"
                    data-testid="button-pay-split"
                    style={outlineBtnStyle}
                    onClick={() =>
                      onPay({ amount: parseFloat(displayAmount), splitCount })
                    }
                  >
                    pay ${displayAmount}
                  </button>
                )}

                {!editMode && onPayFull && (
                  <button
                    data-demo-id="split-pay-full"
                    onClick={onPayFull}
                    style={footerLinkStyle}
                  >
                    pay full amount instead
                  </button>
                )}
              </>
            )}

          {!model.allDone &&
            !model.closed &&
            !model.processing &&
            !model.paymentInProgress &&
            model.splitSetup && (
              <>
                <div style={{ flex: 1, minHeight: 12 }} />
                <div style={{ ...chipStyle, marginBottom: 14 }}>
                  Person {model.completedSplits + 1} of {totalSplits}
                </div>
                <p style={labelStyle}>{model.itemName}</p>

                {!subEditMode && (
                  <>
                    <p style={{ ...amountStyle, fontSize: 56 }}>
                      ${subDisplay}
                    </p>
                    {model.allowCustomAmount && (
                      <button
                        data-demo-id="split-edit-subsequent"
                        onClick={() => {
                          setSubEditValue(subConfirmed ?? remaining.toFixed(2));
                          setSubEditMode(true);
                        }}
                        style={footerLinkStyle}
                      >
                        {subConfirmed
                          ? 'change amount'
                          : 'enter different amount'}
                      </button>
                    )}
                  </>
                )}

                {subEditMode && (
                  <div
                    style={{
                      marginTop: 10,
                      width: '100%',
                      textAlign: 'center',
                    }}
                  >
                    <input
                      data-demo-id="split-custom-amount"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0.01"
                      max={remaining}
                      value={subEditValue}
                      onChange={event => setSubEditValue(event.target.value)}
                      autoFocus
                      style={amountInputStyle}
                      aria-label="Your payment amount"
                    />
                    {subEditValue && !isSubEditValid && (
                      <p style={{ color: CT.RED, fontSize: 12, marginTop: 6 }}>
                        Enter an amount between $0.01 and $
                        {remaining.toFixed(2)}
                      </p>
                    )}
                    <button
                      data-demo-id="split-use-equal"
                      onClick={() => {
                        setSubConfirmed(null);
                        setSubEditMode(false);
                      }}
                      style={footerLinkStyle}
                    >
                      use equal split
                    </button>
                  </div>
                )}

                {progressBars(totalSplits, model.completedSplits)}
                <p style={{ color: CT.SKY_DIM, fontSize: 12, marginTop: 8 }}>
                  {model.completedSplits} of {totalSplits} paid
                </p>

                <div style={{ flex: 1, minHeight: 16 }} />
                {model.error && (
                  <p
                    role="alert"
                    style={{
                      color: CT.RED,
                      fontSize: 13,
                      marginBottom: 10,
                      textAlign: 'center',
                    }}
                  >
                    {model.error}
                  </p>
                )}
                {subEditMode ? (
                  <button
                    data-demo-id="split-confirm-subsequent"
                    style={{
                      ...outlineBtnStyle,
                      opacity: isSubEditValid ? 1 : 0.5,
                    }}
                    disabled={!isSubEditValid}
                    onClick={() => {
                      if (isSubEditValid) {
                        setSubConfirmed(parsedSubEdit.toFixed(2));
                        setSubEditMode(false);
                      }
                    }}
                  >
                    confirm
                  </button>
                ) : (
                  <button
                    data-demo-id="split-pay"
                    data-testid="button-pay-split"
                    style={outlineBtnStyle}
                    onClick={() =>
                      onPay({
                        amount: parseFloat(subDisplay),
                        splitCount: totalSplits,
                      })
                    }
                  >
                    pay ${subDisplay}
                  </button>
                )}
              </>
            )}
        </div>

        <p
          style={{
            marginTop: 14,
            textAlign: 'center',
            fontSize: 11,
            color: '#9aa0b5',
            letterSpacing: '0.03em',
          }}
        >
          Secured by{' '}
          <strong style={{ color: CT.INK, fontWeight: 600 }}>Windcave</strong> ·
          PCI DSS Compliant
        </p>
      </div>
      <style>{spinKeyframes}</style>
    </div>
  );
}

const spinKeyframes = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;

const stepperStyle = (disabled: boolean): CSSProperties => ({
  width: 48,
  height: 48,
  borderRadius: 999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1.5px solid ${CT.SKY}`,
  background: 'transparent',
  color: CT.SKY,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.35 : 1,
});

const amountInputStyle: CSSProperties = {
  width: 170,
  textAlign: 'center',
  fontSize: 32,
  fontWeight: 700,
  background: '#FFFFFF',
  border: '1.5px solid rgba(4,13,109,0.18)',
  borderRadius: 14,
  padding: '10px 12px',
  color: CT.INK,
  outline: 'none',
};

export default SplitPaymentView;
