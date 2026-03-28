import { motion } from "motion/react";

interface FeatureSectionProps {
  title: string;
  image: string;
  description: string;
  details: string;
  imagePosition: "left" | "right";
  titleStyle?: "normal" | "split";
  titleColor?: string;
  imageScale?: "normal" | "large";
  showButton?: boolean;
  buttonText?: string;
  reducedTextSize?: boolean;
  textColor?: "default" | "white";
  smallTextSize?: string;
}

export function FeatureSection({ 
  title, 
  image, 
  description, 
  details, 
  imagePosition,
  titleStyle = "normal",
  titleColor = "#000a36",
  imageScale = "normal",
  showButton = false,
  buttonText = "Learn More",
  reducedTextSize = false,
  textColor = "default",
  smallTextSize = "2.5rem"
}: FeatureSectionProps) {
  // Split title into words if titleStyle is "split"
  const titleWords = titleStyle === "split" ? title.split(" ") : [title];

  return (
    <div className="h-full w-full flex items-center justify-center p-8 md:p-12 lg:p-20">
      <div className="w-full max-w-6xl">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${imagePosition === "right" ? "lg:grid-flow-col-dense" : ""}`}>
          {/* Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className={`flex ${imagePosition === "right" ? "lg:col-start-2 justify-end lg:translate-x-20" : "justify-center"}`}
          >
            <motion.img 
              src={image} 
              alt={title} 
              className={`h-auto object-contain ${imageScale === "large" ? "w-[200%] max-w-none" : "w-full max-w-md"}`}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.3 }}
            />
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            viewport={{ once: true }}
            className={`space-y-6 ${imagePosition === "right" ? "lg:col-start-1 lg:row-start-1" : ""}`}
          >
            <h2 
              className="leading-tight font-medium"
              style={{ color: titleColor }}
            >
              {titleStyle === "split" ? (
                <>
                  {titleWords.map((word, index) => (
                    <span 
                      key={index} 
                      className="block"
                      style={{ 
                        fontSize: index === 0 ? smallTextSize : "7.5rem",
                        lineHeight: index === 0 ? "1.2" : "0.95"
                      }}
                    >
                      {word}
                    </span>
                  ))}
                </>
              ) : (
                <span className="text-4xl md:text-5xl lg:text-6xl">{title}</span>
              )}
            </h2>
            <p className={`${textColor === "white" ? "text-white" : "text-[#000a36]"} leading-relaxed ${reducedTextSize ? "text-base md:text-lg" : "text-xl md:text-2xl"}`}>
              {description}
            </p>
            <p className={`${textColor === "white" ? "text-white/70" : "text-[#000a36]/70"} leading-relaxed ${reducedTextSize ? "text-sm md:text-base" : "text-lg md:text-xl"}`}>
              {details}
            </p>
            
            {showButton && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`mt-8 px-8 py-3 rounded-full text-sm uppercase tracking-[0.2em] font-medium transition-colors duration-300 ${
                    textColor === "white" 
                      ? "bg-[#00f1d7] text-[#000a36] hover:bg-white" 
                      : "bg-[#0055ff] text-white hover:bg-[#000a36]"
                  }`}
              >
                {buttonText}
              </motion.button>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}