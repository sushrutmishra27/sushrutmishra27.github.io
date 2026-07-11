"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimationControls } from "framer-motion";
import { checkPassword, setAuthed } from "@/lib/auth";

const CONFETTI_COLORS = [
  "#ec4899", "#a855f7", "#fb923c", "#f59e0b", "#34d399", "#60a5fa", "#f43f5e",
];

type Piece = {
  left: number; // starting x, in vw
  drift: number; // sideways sway, in px
  rotate: number;
  duration: number;
  delay: number;
  color: string;
  shape: "rect" | "heart";
};

function makeConfetti(count: number): Piece[] {
  return Array.from({ length: count }, () => ({
    left: Math.random() * 100,
    drift: (Math.random() - 0.5) * 160,
    rotate: (Math.random() - 0.5) * 720,
    duration: 1.4 + Math.random() * 1.2,
    delay: Math.random() * 0.3,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    shape: Math.random() < 0.25 ? "heart" : "rect",
  }));
}

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [confetti, setConfetti] = useState<Piece[] | null>(null);
  const controls = useAnimationControls();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confetti) return; // already celebrating & navigating
    if (checkPassword(password)) {
      setAuthed();
      setConfetti(makeConfetti(70));
      // Let the confetti fall for a beat before sliding into the calendar.
      setTimeout(() => router.push("/calendar/"), 1200);
    } else {
      setError(true);
      await controls.start({
        x: [0, -8, 8, -6, 6, -3, 3, 0],
        transition: { duration: 0.45 },
      });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-sm text-center"
      >
        <h1 className="wordmark font-serif text-5xl tracking-wide">
          sunimuni
        </h1>
        <p className="mt-3 font-sans text-sm text-ink-soft">
          a little world of us 🌙
        </p>

        <form onSubmit={onSubmit} className="mt-10">
          <motion.input
            animate={controls}
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            placeholder="password"
            aria-label="Password"
            className="w-full rounded-2xl border-2 border-accent-soft bg-white/70 px-4 py-3 text-center font-sans text-ink shadow-sm outline-none transition-colors focus:border-accent"
          />
          <div className="mt-3 h-5">
            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-sans text-sm text-accent"
              >
                that&apos;s not it, love 💔 try again
              </motion.p>
            )}
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-2xl bg-gradient-to-r from-accent via-lavender to-peach px-4 py-3 font-sans text-sm font-medium text-white shadow-md transition-transform hover:scale-[1.02]"
          >
            come in 💌
          </button>
        </form>
      </motion.div>

      {/* Confetti burst on a correct password */}
      {confetti && (
        <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
          {confetti.map((p, i) => (
            <motion.span
              key={i}
              initial={{ y: "-6vh", x: 0, rotate: 0, opacity: 1 }}
              animate={{ y: "110vh", x: p.drift, rotate: p.rotate, opacity: [1, 1, 0.8] }}
              transition={{ duration: p.duration, delay: p.delay, ease: "easeIn" }}
              className="absolute top-0"
              style={{ left: `${p.left}vw` }}
            >
              {p.shape === "heart" ? (
                <span style={{ color: p.color }} className="text-lg">
                  ♥
                </span>
              ) : (
                <span
                  className="block h-3 w-2 rounded-[2px]"
                  style={{ backgroundColor: p.color }}
                />
              )}
            </motion.span>
          ))}
        </div>
      )}
    </main>
  );
}
