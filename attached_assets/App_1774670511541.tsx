import { StickyCard } from "./components/StickyCard";
import { HeroSection } from "./components/HeroSection";
import { AboutSection } from "./components/AboutSection";
import { FeatureSection } from "./components/FeatureSection";
import { PricingSection } from "./components/PricingSection";

// Import new phone mockup images
import splitPaymentPhone from "figma:asset/692574906569c63ba978c751f6b4cae3f4e7c60d.png";
import receiptPhone from "figma:asset/9373cb025f236b712c8c8b5999cf9f21af73b05a.png";
import sharePaymentPhone from "figma:asset/8c19d881752f3f38a8bd367409613acd6a1c7948.png";
import billSplitPhone from "figma:asset/622124a97979eff7d5d38cf3038593ab7fa75ca3.png";

// Import existing images
import terminalPhone from "figma:asset/31d10014e076fc8c1cf2cde763f72dbc237a7979.png";
import paymentBoard from "figma:asset/8b1264d69e97babf5a458dfba290faf9de3df7a2.png";

export default function App() {
  return (
    <div className="w-full">
      {/* Hero Card - Double Height */}
      <StickyCard index={0} backgroundColor="#0055ff" isDouble>
        <HeroSection />
      </StickyCard>

      {/* About Section */}
      <StickyCard index={1} backgroundColor="#ececec">
        <AboutSection />
      </StickyCard>

      {/* Digital Terminal */}
      <StickyCard index={2} backgroundColor="#00f1d7">
        <FeatureSection
          title="the digital terminal"
          image={terminalPhone}
          description="Transform your smartphone into a powerful payment terminal. The Tapt Pay app provides a complete point-of-sale experience with real-time transaction tracking, analytics, and revenue insights."
          details="View your daily transactions, monitor average transaction values, and track your business growth—all from one beautiful, intuitive interface."
          imagePosition="right"
          titleStyle="split"
          titleColor="#0055ff"
          imageScale="large"
          showButton={true}
          buttonText="more"
          reducedTextSize={true}
        />
      </StickyCard>

      {/* Payment Board */}
      <StickyCard index={3} backgroundColor="#000a36">
        <FeatureSection
          title="the payment board"
          image={paymentBoard}
          description="Display your custom QR code and NFC payment option for customers. Our physical payment boards make it easy for customers to pay using their preferred method."
          details="Perfect for cafes, retail stores, food trucks, and any business that wants to offer a modern, contactless payment experience."
          imagePosition="right"
          titleStyle="split"
          titleColor="#ffffff"
          imageScale="large"
          showButton={true}
          buttonText="more"
          reducedTextSize={true}
          textColor="white"
          smallTextSize="3rem"
        />
      </StickyCard>

      {/* Split Payments */}
      <StickyCard index={4} backgroundColor="#ffffff">
        <FeatureSection
          title="Split Bill Payments"
          image={splitPaymentPhone}
          description="Make splitting bills effortless. Enable split payment functionality and track who has paid their share in real-time."
          details="Perfect for group dining, shared services, or any situation where multiple people need to contribute to a single payment."
          imagePosition="left"
        />
      </StickyCard>

      {/* Share Payment */}
      <StickyCard index={5} backgroundColor="#ffffff">
        <FeatureSection
          title="Share Payment Requests"
          image={sharePaymentPhone}
          description="Send payment requests instantly via Email, SMS, or QR Code. Your customers can pay with a single tap, no app download required."
          details="Copy and share payment links anywhere. Track payment status and get notified when customers complete their payment."
          imagePosition="right"
        />
      </StickyCard>

      {/* Bill Splitting Interface */}
      <StickyCard index={6} backgroundColor="#ffffff">
        <FeatureSection
          title="Smart Bill Splitting"
          image={billSplitPhone}
          description="Divide bills evenly or customize amounts for each person. Track payments in real-time and see exactly who still needs to pay."
          details="Whether it's lunch with colleagues or a group event, make splitting the bill simple and transparent for everyone involved."
          imagePosition="left"
        />
      </StickyCard>

      {/* Transaction Receipts */}
      <StickyCard index={7} backgroundColor="#ffffff">
        <FeatureSection
          title="Professional Receipts"
          image={receiptPhone}
          description="Generate detailed transaction receipts automatically. Every payment includes a professional receipt with full transaction details and cost breakdown."
          details="Download PDFs or share receipts instantly. All receipts include your business name, itemized costs, GST breakdown, and are fully compliant for accounting."
          imagePosition="right"
        />
      </StickyCard>

      {/* Pricing Section */}
      <StickyCard index={8} backgroundColor="#000a36">
        <PricingSection />
      </StickyCard>

      {/* Spacer for final card */}
      <div className="h-screen" style={{ backgroundColor: "#ececec" }} />
    </div>
  );
}