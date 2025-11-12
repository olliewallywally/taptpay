import { UserPlus, Settings, Smartphone, CheckCircle } from "lucide-react";

interface HowItWorksSectionProps {
  className?: string;
}

export function HowItWorksSection({ className }: HowItWorksSectionProps) {
  const steps = [
    {
      number: "1",
      title: "Sign Up & Connect",
      description: "Create your free account and connect your merchant API - no setup fees, ready in minutes.",
      icon: UserPlus,
      iconBg: "#FF6B9D",
      badgeBg: "#FF6B9D",
    },
    {
      number: "2",
      title: "Customize Your Setup",
      description: "Activate payment stones, add products to inventory, and personalize your dashboard to fit your business.",
      icon: Settings,
      iconBg: "#FFB800",
      badgeBg: "#FFB800",
    },
    {
      number: "3",
      title: "Connect & Prepare",
      description: "Use an NFC-capable device, connect to WiFi, and enable notifications for instant updates.",
      icon: Smartphone,
      iconBg: "#00E5CC",
      badgeBg: "#00E5CC",
    },
    {
      number: "4",
      title: "Start Accepting Payments!",
      description: "You're all set! Begin processing payments and managing your business with taptpay.",
      icon: CheckCircle,
      iconBg: "#00FF9D",
      badgeBg: "#00FF9D",
    },
  ];

  return (
    <div className={className}>
      <div className="hidden md:grid grid-cols-4 gap-6">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.number}
              className="relative bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold mb-4 absolute -top-5 left-6"
                style={{ backgroundColor: step.iconBg }}
              >
                {step.number}
              </div>
              <div className="pt-6">
                <Icon className="w-8 h-8 text-white mb-4" />
                <h3 className="text-lg font-semibold mb-3 text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {step.title}
                </h3>
                <p className="text-white/80 text-sm" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="md:hidden space-y-0">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          return (
            <div key={step.number} className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: step.iconBg }}
                >
                  <Icon className="w-8 h-8 text-white" />
                </div>
                {!isLast && (
                  <div className="w-0.5 h-24 bg-white/30 my-2" />
                )}
              </div>
              <div className="flex-1 pb-8">
                <div
                  className="inline-block px-3 py-1 rounded-full text-white text-xs font-medium mb-2"
                  style={{ backgroundColor: step.badgeBg }}
                >
                  Step {step.number}
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {step.title}
                </h3>
                <p className="text-white/80" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
