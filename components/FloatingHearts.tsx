"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const SYMBOLS = ["💗", "🩷", "💜", "✨", "🌸", "🫧", "💛"];

type Floater = {
  symbol: string;
  left: number; // vw
  size: number; // rem
  duration: number;
  delay: number;
  sway: number; // px
};

/**
 * Gentle hearts/sparkles drifting up the calendar background.
 * Generated after mount (never during page pre-render) so the static HTML
 * and the browser never disagree.
 */
export default function FloatingHearts({ count = 14 }: { count?: number }) {
  const [floaters, setFloaters] = useState<Floater[] | null>(null);

  useEffect(() => {
    setFloaters(
      Array.from({ length: count }, () => ({
        symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
        left: Math.random() * 96,
        size: 0.8 + Math.random() * 1.1,
        duration: 14 + Math.random() * 14,
        delay: Math.random() * 12,
        sway: (Math.random() - 0.5) * 90,
      }))
    );
  }, [count]);

  if (!floaters) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {floaters.map((f, i) => (
        <motion.span
          key={i}
          initial={{ y: "105vh", x: 0, opacity: 0 }}
          animate={{ y: "-8vh", x: f.sway, opacity: [0, 0.35, 0.35, 0] }}
          transition={{
            duration: f.duration,
            delay: f.delay,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute"
          style={{ left: `${f.left}vw`, fontSize: `${f.size}rem` }}
        >
          {f.symbol}
        </motion.span>
      ))}
    </div>
  );
}
