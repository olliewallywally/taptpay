import { motion } from "motion/react";

export function AboutSection() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 md:p-12 lg:p-16">
      <div className="max-w-5xl space-y-12">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center space-y-6"
        >
          <p className="text-xs md:text-sm uppercase tracking-[0.3em] text-[#00f1d7] font-medium">
            What is Tapt Pay
          </p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl text-[#000a36] leading-tight">
            The fastest, most <span className="font-bold">premium</span> path to <span className="font-bold">payment freedom</span>
          </h2>
          <p className="text-lg md:text-xl text-[#000a36]/70 max-w-3xl mx-auto leading-relaxed">
            Transform how you accept payments with New Zealand's first truly digital POS and EFTPOS solution. No hardware. No hassle. Just seamless payments.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-16"
        >
          <div className="space-y-5 pt-8 border-t-2 border-[#00f1d7]">
            <div className="w-12 h-12 rounded-full bg-[#00f1d7] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#000a36]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-2xl md:text-3xl text-[#000a36] font-medium">
              Get started in 5 minutes
            </h3>
            <p className="text-base md:text-lg text-[#000a36]/70 leading-relaxed">
              No hardware required. Download the app, create your account, and start accepting payments immediately. No credit checks, no minimum deposits.
            </p>
          </div>

          <div className="space-y-5 pt-8 border-t-2 border-[#0055ff]">
            <div className="w-12 h-12 rounded-full bg-[#0055ff] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-2xl md:text-3xl text-[#000a36] font-medium">
              Build your business
            </h3>
            <p className="text-base md:text-lg text-[#000a36]/70 leading-relaxed">
              Track every transaction, analyze revenue trends, and grow your business with powerful analytics. Get paid fast with settlements in 2 business days.
            </p>
          </div>

          <div className="space-y-5 pt-8 border-t-2 border-[#00f1d7]">
            <div className="w-12 h-12 rounded-full bg-[#00f1d7] flex items-center justify-center">
              <svg className="w-6 h-6 text-[#000a36]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-2xl md:text-3xl text-[#000a36] font-medium">
              Bank-grade security
            </h3>
            <p className="text-base md:text-lg text-[#000a36]/70 leading-relaxed">
              PCI DSS compliant and powered by Windcave, New Zealand's most trusted payment provider. Every transaction is encrypted and secure.
            </p>
          </div>

          <div className="space-y-5 pt-8 border-t-2 border-[#0055ff]">
            <div className="w-12 h-12 rounded-full bg-[#0055ff] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-2xl md:text-3xl text-[#000a36] font-medium">
              24/7 support
            </h3>
            <p className="text-base md:text-lg text-[#000a36]/70 leading-relaxed">
              Get help when you need it with our dedicated support team. In-app chat, email, and phone support available around the clock.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
