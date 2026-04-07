import { motion } from 'motion/react';
import { CheckCircle, Smartphone, CreditCard } from 'lucide-react';
import paymentStonesImage from "@assets/pay stone_1762915255862.png";
import customerPhoneImage from "@assets/pay_1762915045325.png";

export function CustomerExperienceSection() {
  return (
    <motion.section 
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6 }}
      className="bg-white text-[#0055FF]"
    >
      {/* Mobile Layout */}
      <div className="lg:hidden" style={{ padding: 'clamp(3rem, 6vh, 5rem) clamp(1.5rem, 4vw, 2rem)' }}>
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
          style={{ marginBottom: 'clamp(2rem, 4vh, 3rem)' }}
        >
          <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', marginBottom: 'clamp(0.75rem, 1.5vh, 1rem)' }}>
            seamless for your customers
          </h2>
          <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1rem)' }}>
            Give your customers multiple ways to pay with a beautiful, intuitive interface
          </p>
        </motion.div>

        {/* Payment Stones Image */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{ marginBottom: 'clamp(2rem, 4vh, 3rem)' }}
        >
          <img
            src={paymentStonesImage}
            alt="taptpay payment stones - scan or tap to pay"
            loading="lazy"
            style={{ 
              width: '100%', 
              height: 'auto',
              borderRadius: '1rem',
              display: 'block' 
            }}
          />
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1.25rem, 2.5vh, 1.75rem)', marginBottom: 'clamp(2rem, 4vh, 3rem)' }}
        >
          <div className="flex items-start gap-3">
            <div className="bg-[#00E5CC] rounded-full flex items-center justify-center flex-shrink-0" 
                 style={{ width: '2.5rem', height: '2.5rem' }}>
              <Smartphone className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 'clamp(1rem, 2vw, 1.125rem)', marginBottom: '0.25rem' }}>
                Scan Or Tap the QR or NFC Tag
              </h3>
              <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 0.9375rem)' }}>
                Customers can scan the QR code or tap the NFC tag on your payment stone
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-[#00E5CC] rounded-full flex items-center justify-center flex-shrink-0" 
                 style={{ width: '2.5rem', height: '2.5rem' }}>
              <CreditCard className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 'clamp(1rem, 2vw, 1.125rem)', marginBottom: '0.25rem' }}>
                Digital Wallet to Pay
              </h3>
              <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 0.9375rem)' }}>
                Customer is taken to the payment web page and pays with their Apple or Google Pay
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="bg-[#00E5CC] rounded-full flex items-center justify-center flex-shrink-0" 
                 style={{ width: '2.5rem', height: '2.5rem' }}>
              <CheckCircle className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 'clamp(1rem, 2vw, 1.125rem)', marginBottom: '0.25rem' }}>
                Done in Seconds
              </h3>
              <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.875rem, 1.5vw, 0.9375rem)' }}>
                Payment processed instantly with confirmation
              </p>
            </div>
          </div>
        </motion.div>

        {/* Customer Phone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex justify-center"
        >
          <div
            style={{ 
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            className="hover:scale-105"
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'drop-shadow(0 0 30px rgba(0, 229, 204, 0.6))';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'none';
            }}
          >
            <img
              src={customerPhoneImage}
              alt="taptpay customer payment page"
              loading="lazy"
              style={{ width: '100%', height: 'auto', display: 'block', maxWidth: '140px' }}
            />
          </div>
        </motion.div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:grid grid-cols-2">
        {/* Payment Stones - Full Left Side */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          style={{ 
            width: '100%',
            height: '100%',
          }}
        >
          <img
            src={paymentStonesImage}
            alt="taptpay payment stones - scan or tap to pay"
            loading="lazy"
            style={{ 
              width: '100%', 
              height: '100%', 
              objectFit: 'cover',
              display: 'block' 
            }}
          />
        </motion.div>

        {/* Right Side - All Content */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex flex-col"
          style={{ 
            padding: 'clamp(3rem, 6vh, 5rem) clamp(2rem, 4vw, 4rem)',
            gap: 'clamp(2rem, 4vh, 3rem)'
          }}
        >
          {/* Title Section - Full Width */}
          <div>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', marginBottom: 'clamp(0.75rem, 1.5vh, 1rem)' }}>
              seamless for your customers
            </h2>
            <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1rem)' }}>
              Give your customers multiple ways to pay with a beautiful, intuitive interface
            </p>
          </div>

          {/* Two Column Layout - Features and Phone */}
          <div className="grid grid-cols-2 gap-8 items-stretch">
            {/* Left Content - Features */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1.25rem, 2.5vh, 1.75rem)' }}>
              <div className="flex items-start gap-3">
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center flex-shrink-0" 
                     style={{ width: '2.5rem', height: '2.5rem' }}>
                  <Smartphone className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1.125rem)', marginBottom: '0.25rem' }}>
                    Scan Or Tap the QR or NFC Tag
                  </h3>
                  <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>
                    Customers can scan the QR code or tap the NFC tag on your payment stone
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center flex-shrink-0" 
                     style={{ width: '2.5rem', height: '2.5rem' }}>
                  <CreditCard className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1.125rem)', marginBottom: '0.25rem' }}>
                    Digital Wallet to Pay
                  </h3>
                  <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>
                    Customer is taken to the payment web page and pays with their Apple or Google Pay
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-[#00E5CC] rounded-full flex items-center justify-center flex-shrink-0" 
                     style={{ width: '2.5rem', height: '2.5rem' }}>
                  <CheckCircle className="text-[#0055FF]" style={{ width: '50%', height: '50%' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'clamp(0.875rem, 1.75vw, 1.125rem)', marginBottom: '0.25rem' }}>
                    Done in Seconds
                  </h3>
                  <p className="text-[#0055FF]/70" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>
                    Payment processed instantly with confirmation
                  </p>
                </div>
              </div>
            </div>

            {/* Right Content - Phone Mockup */}
            <div className="flex justify-center items-stretch">
              <div 
                style={{ 
                  maxWidth: '50%', 
                  display: 'flex', 
                  alignItems: 'center',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                className="hover:scale-105"
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'drop-shadow(0 0 30px rgba(0, 229, 204, 0.6))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'none';
                }}
              >
                <img
                  src={customerPhoneImage}
                  alt="taptpay customer payment page"
                  loading="lazy"
                  style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
