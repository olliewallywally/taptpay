import { generateQuotePdf } from "../server/trades-quote-pdf";

const quote = {
  token: "abcdef1234567890",
  createdAt: new Date(),
  validUntil: new Date(),
  lineItems: [
    {
      description: "Labour",
      qty: 8,
      unitPriceCents: 9000,
      lineTotalCents: 72000,
    },
    {
      description: "Materials",
      qty: 1,
      unitPriceCents: 25000,
      lineTotalCents: 25000,
    },
  ],
  subtotalCents: 84348,
  gstCents: 12652,
  totalCents: 97000,
  gstMode: "inclusive",
  depositEnabled: true,
  depositCents: 19400,
  notes: "Thanks for the opportunity.",
};

const client = {
  firstName: "Jane",
  lastName: "Doe",
  siteAddress: "12 Queen St, Auckland",
};

const merchant = {
  businessName: "Ace Plumbing",
  email: "ace@example.co.nz",
  phone: "021 555 0000",
  gstRegistered: true,
  gstNumber: "123-456-789",
};

const buf = generateQuotePdf(
  quote as any,
  client as any,
  merchant as any,
  "https://taptpay.co.nz",
);
const ok = buf.subarray(0, 4).toString() === "%PDF" && buf.length > 800;
console.log(ok ? `PDF OK (${buf.length} bytes)` : "PDF FAIL");
process.exit(ok ? 0 : 1);
