interface HowItWorksSectionProps {
  className?: string;
}

export function HowItWorksSection({ className }: HowItWorksSectionProps) {
  const steps = [
    {
      number: "1",
      title: "Create Your Account",
      description: "Sign up and set up your payment terminal in minutes. No lengthy paperwork or complicated setup process.",
    },
    {
      number: "2",
      title: "Share Payment Link",
      description: "Generate a unique QR code or payment link for your customers. They can pay instantly from their phone.",
    },
    {
      number: "3",
      title: "Get Paid",
      description: "Receive payments securely and see real-time updates. Funds are deposited directly to your account.",
    },
  ];

  return (
    <div className={className}>
      <div className="hidden md:flex justify-between items-start gap-8">
        {steps.map((step) => (
          <div key={step.number} className="flex-1">
            <div className="w-12 h-12 rounded-full bg-[#0055FF] text-white flex items-center justify-center text-xl font-semibold mb-4">
              {step.number}
            </div>
            <h3 className="text-xl font-semibold mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {step.title}
            </h3>
            <p className="text-gray-600" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {step.description}
            </p>
          </div>
        ))}
      </div>

      <div className="md:hidden space-y-6">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-[#0055FF] text-white flex items-center justify-center text-lg font-semibold flex-shrink-0">
              {step.number}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {step.title}
              </h3>
              <p className="text-gray-600 text-sm" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
