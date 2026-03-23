import { useState, useEffect, useRef, useCallback } from "react";

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&";

export function useScrambleText(text: string) {
  const [displayText, setDisplayText] = useState(text);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scramble = useCallback(() => {
    if (frameRef.current) clearInterval(frameRef.current);
    let iteration = 0;
    frameRef.current = setInterval(() => {
      setDisplayText(
        text
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < iteration) return text[i];
            return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
          })
          .join("")
      );
      iteration += 0.4;
      if (iteration > text.length) {
        if (frameRef.current) clearInterval(frameRef.current);
        setDisplayText(text);
      }
    }, 35);
  }, [text]);

  useEffect(() => () => { if (frameRef.current) clearInterval(frameRef.current); }, []);

  return { displayText, scramble };
}
