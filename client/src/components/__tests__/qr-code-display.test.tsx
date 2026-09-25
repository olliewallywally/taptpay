import { render, screen } from "@testing-library/react";
import { QRCodeDisplay } from "@/components/qr-code-display";

/**
 * Owner decision 2026-09-25 (server/no-board-address.ts): the business-wide no-board QR
 * (/api/merchants/:id/qr) is retired. This component shows a sale's own QR or a board's, and
 * otherwise a placeholder — never the business-wide one.
 */
describe("QRCodeDisplay", () => {
  it("shows a sale's own QR code", () => {
    render(<QRCodeDisplay paymentUrl="https://pay.example/pay/t/abc" qrCodeUrl="https://pay.example/api/pay/t/abc/qr" />);
    expect(screen.getByAltText("Payment QR Code")).toHaveAttribute("src", "https://pay.example/api/pay/t/abc/qr");
  });

  it("shows a board's QR code", () => {
    render(<QRCodeDisplay merchantId={1} stoneId={3} />);
    expect(screen.getByAltText("Payment QR Code")).toHaveAttribute("src", "/api/merchants/1/stone/3/qr");
  });

  it("never falls back to the retired business-wide QR code", () => {
    const { container } = render(<QRCodeDisplay merchantId={1} />);
    expect(screen.queryByAltText("Payment QR Code")).toBeNull();
    expect(container.innerHTML).not.toContain("/api/merchants/1/qr");
  });
});
