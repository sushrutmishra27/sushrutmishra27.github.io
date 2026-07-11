"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Each month gets its own candy color for the header.
const MONTH_COLORS = [
  "#ec4899", "#a855f7", "#fb923c", "#0ea5e9", "#f43f5e", "#8b5cf6",
  "#f59e0b", "#10b981", "#e11d48", "#6366f1", "#d946ef", "#06b6d4",
];
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// Little somethings that pop above a date when she hovers it.
// Each date always whispers the same one — its own little secret.
const KISSES = [
  "💋", "us 🤍", "this day 💗", "remember?", "our little forever",
  "hi cutie", "that smile 🥹", "golden hour", "take me back",
  "best day", "you + me", "so loved", "magic ✨", "my favourite person",
  "heart full", "again please?", "still butterflies", "home is you",
  "laughing forever", "tiny infinity", "wish granted 🌙", "sweeter than sugar",
];

// Turn a date string into a stable pick from KISSES, so every date keeps
// its own phrase but neighbouring dates get different ones.
function kissFor(date: string): string {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) % 100000;
  return KISSES[h % KISSES.length];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

type Props = {
  year: number;
  month: number; // 0–11
  memoryDates: Set<string>;
  highlightDate: string | null;
  onSelectDate: (date: string) => void;
};

export default function MonthGrid({
  year,
  month,
  memoryDates,
  highlightDate,
  onSelectDate,
}: Props) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;

  // The floating "kiss" above a hovered date. Keyed so each pop re-animates.
  const [kiss, setKiss] = useState<{ date: string; text: string; key: number } | null>(null);
  const kissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showKiss(date: string) {
    setKiss({ date, text: kissFor(date), key: Date.now() });
    if (kissTimer.current) clearTimeout(kissTimer.current);
    kissTimer.current = setTimeout(() => setKiss(null), 1400);
  }

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="rounded-2xl bg-white/55 p-4 shadow-sm">
      <h3
        className="mb-2 text-center font-serif text-sm font-semibold tracking-wide"
        style={{ color: MONTH_COLORS[month] }}
      >
        {MONTH_NAMES[month]}
      </h3>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span
            key={`w${i}`}
            className="pb-1 font-sans text-[10px] text-ink-soft/60"
          >
            {w}
          </span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`e${i}`} />;
          const date = `${year}-${pad2(month + 1)}-${pad2(day)}`;
          const hasMemory = memoryDates.has(date);
          const isHighlight = date === highlightDate;

          if (!hasMemory) {
            return (
              <span
                key={date}
                className="mx-auto flex h-7 w-7 items-center justify-center font-sans text-xs text-ink-soft/45"
              >
                {day}
              </span>
            );
          }
          return (
            <span key={date} className="relative mx-auto">
              <button
                onClick={() => onSelectDate(date)}
                onMouseEnter={() => showKiss(date)}
                aria-label={`Open memory from ${date}`}
                className={`memory-day flex h-7 w-7 items-center justify-center rounded-full font-sans text-xs font-medium text-ink ${
                  isHighlight ? "memory-day-return" : ""
                }`}
              >
                {day}
              </button>
              <AnimatePresence>
                {kiss && kiss.date === date && (
                  <motion.span
                    key={kiss.key}
                    initial={{ opacity: 0, y: 2, scale: 0.7 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -22, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                    className="pointer-events-none absolute -top-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap font-sans text-[11px] text-accent"
                  >
                    {kiss.text}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          );
        })}
      </div>
    </div>
  );
}
