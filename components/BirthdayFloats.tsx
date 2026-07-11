"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// Her birthday: 16 July (month is 0-based, so July = 6).
const BIRTHDAY_MONTH = 6;
const BIRTHDAY_DAY = 16;

const MESSAGES = [
  "happy birthday, my love 🎂",
  "it's YOUR day 🎈",
  "another year of you 💗",
  "make a wish ✨",
  "🥳🎉",
  "the world got you today 🌍💛",
];

type Banner = {
  text: string;
  top: number; // vh
  duration: number;
  delay: number;
};

type Props = {
  /** Show regardless of today's date (used when she opens a July 16 memory). */
  force?: boolean;
  /** Stacking override so the wishes sit correctly inside overlays. */
  zIndexClass?: string;
};

/**
 * Drifting "happy birthday" wishes. On her actual birthday (any year) they
 * fill the calendar; with `force` they show inside a July 16 memory too.
 */
export default function BirthdayFloats({ force = false, zIndexClass = "z-40" }: Props) {
  const [banners, setBanners] = useState<Banner[] | null>(null);

  useEffect(() => {
    const now = new Date();
    const isBirthday =
      now.getMonth() === BIRTHDAY_MONTH && now.getDate() === BIRTHDAY_DAY;
    if (!force && !isBirthday) return;
    setBanners(
      Array.from({ length: 7 }, (_, i) => ({
        text: MESSAGES[i % MESSAGES.length],
        top: 8 + Math.random() * 78,
        duration: 16 + Math.random() * 12,
        delay: i * 2.5,
      }))
    );
  }, [force]);

  if (!banners) return null;

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 overflow-hidden ${zIndexClass}`}
    >
      {banners.map((b, i) => (
        <motion.span
          key={i}
          initial={{ x: "-30vw", opacity: 0 }}
          animate={{ x: "115vw", opacity: [0, 0.85, 0.85, 0] }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            repeat: Infinity,
            ease: "linear",
          }}
          className="wordmark absolute whitespace-nowrap font-serif text-2xl italic md:text-3xl"
          style={{ top: `${b.top}vh` }}
        >
          {b.text}
        </motion.span>
      ))}
    </div>
  );
}
