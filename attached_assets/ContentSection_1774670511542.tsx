import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

interface ContentSectionProps {
  title: string;
  image: string;
  description: string | string[];
  imagePosition?: "left" | "right";
}

export function ContentSection({ title, image, description, imagePosition = "left" }: ContentSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start center", "end center"],
  });

  const imageOpacity = useTransform(scrollYProgress, [0, 0.3], [0, 1]);
  const imageY = useTransform(scrollYProgress, [0, 0.3], [30, 0]);

  const textOpacity = useTransform(scrollYProgress, [0.2, 0.5], [0, 1]);
  const textY = useTransform(scrollYProgress, [0.2, 0.5], [30, 0]);

  const isArray = Array.isArray(description);

  return (
    <div ref={ref} className="h-full w-full flex flex-col items-center justify-center p-8 md:p-12 lg:p-16 overflow-y-auto">
      {/* Title */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#000a36] mb-8 md:mb-12 text-center"
      >
        {title}
      </motion.h2>

      {/* Content Grid */}
      <div className={`w-full max-w-5xl grid grid-cols-1 ${imagePosition === "left" ? "lg:grid-cols-2" : "lg:grid-cols-2"} gap-8 md:gap-12 items-center`}>
        {/* Image */}
        <motion.div
          style={{ opacity: imageOpacity, y: imageY }}
          className={`flex justify-center ${imagePosition === "right" ? "lg:order-2" : ""}`}
        >
          <img 
            src={image} 
            alt={title} 
            className="w-full max-w-md h-auto object-contain drop-shadow-2xl"
          />
        </motion.div>

        {/* Description */}
        <motion.div
          style={{ opacity: textOpacity, y: textY }}
          className={`space-y-4 ${imagePosition === "right" ? "lg:order-1" : ""}`}
        >
          {isArray ? (
            description.map((paragraph, index) => (
              <p key={index} className="text-base md:text-lg lg:text-xl text-[#000a36] leading-relaxed">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-base md:text-lg lg:text-xl text-[#000a36] leading-relaxed">
              {description}
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
