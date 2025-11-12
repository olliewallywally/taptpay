import { motion } from 'motion/react';
import { UserPlus, Sparkles, Smartphone, Check } from 'lucide-react';

export function HowItWorksSection() {
  const steps = [
    { 
      number: 1,
      icon: UserPlus, 
      title: 'Sign Up & Connect', 
      description: 'Create your free account and connect your merchant API - no setup fees, ready in minutes.',
      color: '#FF6B9D',
    },
    { 
      number: 2,
      icon: Sparkles, 
      title: 'Customize Your Setup', 
      description: 'Activate payment stones, add products to inventory, and personalize your dashboard to fit your business.',
      color: '#FFB84D',
    },
    { 
      number: 3,
      icon: Smartphone, 
      title: 'Connect & Prepare', 
      description: 'Use an NFC-capable device, connect to WiFi, and enable notifications for instant updates.',
      color: '#4DFFDF',
    },
    { 
      number: 4,
      icon: Check, 
      title: 'Start Accepting Payments!', 
      description: 'You\'re all set! Begin processing payments and managing your business with taptpay.',
      color: '#00E5CC',
    },
  ];

  return (
    <section
      className="relative"
      style={{ 
        backgroundColor: '#0055FF',
        padding: 'clamp(3rem, 8vh, 6rem) clamp(1.5rem, 4vw, 3rem)',
      }}
    >
      <div className="max-w-[1400px] mx-auto">
        {/* Section Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
          style={{ marginBottom: 'clamp(2.5rem, 6vh, 5rem)' }}
        >
          <h2 
            style={{
              color: '#00E5CC',
              fontSize: 'clamp(1.75rem, 4.5vw, 3rem)',
              marginBottom: 'clamp(0.75rem, 1.5vh, 1rem)',
            }}
          >
            how it works
          </h2>
          <p 
            style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 'clamp(0.875rem, 1.75vw, 1.125rem)',
              maxWidth: '600px',
              margin: '0 auto',
              padding: '0 1rem',
            }}
          >
            Get started with taptpay in 4 simple steps
          </p>
        </motion.div>

        {/* Mobile Layout - Vertical Timeline */}
        <div className="lg:hidden">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isLast = index === steps.length - 1;
            
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ 
                  duration: 0.6, 
                  delay: index * 0.15,
                }}
                className="relative"
                style={{ marginBottom: isLast ? '0' : 'clamp(2rem, 4vh, 3rem)' }}
              >
                {/* Timeline connector */}
                {!isLast && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '1.75rem',
                      top: '4.5rem',
                      width: '2px',
                      height: 'calc(100% + clamp(2rem, 4vh, 3rem) - 4.5rem)',
                      background: `linear-gradient(to bottom, ${step.color}, ${steps[index + 1].color})`,
                      opacity: 0.3,
                      zIndex: 0,
                    }}
                  />
                )}

                <div className="flex gap-4 relative z-10">
                  {/* Icon Circle */}
                  <div
                    className="flex-shrink-0"
                    style={{
                      width: '3.5rem',
                      height: '3.5rem',
                      borderRadius: '50%',
                      backgroundColor: step.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 4px 20px ${step.color}40`,
                    }}
                  >
                    <Icon 
                      style={{ 
                        width: '1.75rem', 
                        height: '1.75rem',
                        color: '#0055FF',
                        strokeWidth: 2.5,
                      }} 
                    />
                  </div>

                  {/* Content Card */}
                  <div
                    className="flex-1"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '1rem',
                      padding: 'clamp(1.25rem, 3vw, 1.5rem)',
                      border: `2px solid ${step.color}40`,
                    }}
                  >
                    {/* Step Number Badge */}
                    <div
                      style={{
                        display: 'inline-block',
                        backgroundColor: step.color,
                        color: '#0055FF',
                        fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)',
                        fontWeight: 700,
                        padding: '0.25rem 0.75rem',
                        borderRadius: '1rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      Step {step.number}
                    </div>

                    <h3
                      style={{
                        color: '#FFFFFF',
                        fontSize: 'clamp(1.125rem, 2.25vw, 1.375rem)',
                        fontWeight: 600,
                        marginBottom: '0.5rem',
                        lineHeight: 1.3,
                      }}
                    >
                      {step.title}
                    </h3>

                    <p
                      style={{
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: 'clamp(0.875rem, 1.75vw, 1rem)',
                        lineHeight: 1.6,
                      }}
                    >
                      {step.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Desktop Layout - Grid */}
        <div className="hidden lg:grid grid-cols-4 gap-6">
          {steps.map((step, index) => {
            const Icon = step.icon;
            
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ 
                  duration: 0.5, 
                  delay: index * 0.1,
                }}
                className="relative group"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '1.25rem',
                  padding: '2rem 1.5rem',
                  border: `2px solid ${step.color}40`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.borderColor = step.color;
                  e.currentTarget.style.transform = 'translateY(-8px)';
                  e.currentTarget.style.boxShadow = `0 12px 40px ${step.color}30`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = `${step.color}40`;
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Step Number Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '1.5rem',
                    right: '1.5rem',
                    backgroundColor: step.color,
                    color: '#0055FF',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    padding: '0.25rem 0.75rem',
                    borderRadius: '1rem',
                  }}
                >
                  {step.number}
                </div>

                {/* Icon */}
                <div
                  style={{
                    marginBottom: '1.5rem',
                    width: '3.5rem',
                    height: '3.5rem',
                    borderRadius: '50%',
                    backgroundColor: `${step.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon 
                    style={{ 
                      width: '1.75rem', 
                      height: '1.75rem',
                      color: step.color,
                      strokeWidth: 2,
                    }} 
                  />
                </div>

                {/* Title */}
                <h3
                  style={{
                    color: '#FFFFFF',
                    fontSize: '1.125rem',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    lineHeight: 1.3,
                  }}
                >
                  {step.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '0.9375rem',
                    lineHeight: 1.6,
                  }}
                >
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
