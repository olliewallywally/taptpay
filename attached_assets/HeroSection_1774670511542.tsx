import { motion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import logo from "figma:asset/2964b92c9c5249eb1d0aa15d448cdee9da44a794.png";

export function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      {/* Navigation Bar */}
      <nav className="absolute top-0 left-0 right-0 flex justify-center pt-8 z-20">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-[#000a36] rounded-full px-8 py-3 flex gap-8"
        >
          <button className="text-white hover:text-[#00f1d7] transition-colors text-sm uppercase tracking-wider">services</button>
          <button className="text-white hover:text-[#00f1d7] transition-colors text-sm uppercase tracking-wider">about</button>
          <button className="text-white hover:text-[#00f1d7] transition-colors text-sm uppercase tracking-wider">login</button>
          <button className="text-white hover:text-[#00f1d7] transition-colors text-sm uppercase tracking-wider">more</button>
        </motion.div>
      </nav>

      {/* Main Content */}
      <motion.div
        style={{ opacity, scale }}
        className="absolute inset-0 flex flex-col items-center justify-center space-y-8 px-6"
      >
        <motion.img 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          src={logo} 
          alt="Tapt Pay" 
          className="w-80 md:w-[500px] lg:w-[650px] h-auto"
        />
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-xl md:text-2xl lg:text-3xl text-white text-center font-light tracking-[0.2em] uppercase"
        >
          100% digital pos & eftpos solution
        </motion.h1>
      </motion.div>
    </div>
  );
}
