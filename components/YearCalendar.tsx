"use client";

import { motion } from "framer-motion";
import MonthGrid from "@/components/MonthGrid";

type Props = {
  year: number;
  years: number[]; // all years that have memories
  memoryDates: Set<string>;
  momentCount: number;
  highlightDate: string | null;
  onYearChange: (year: number) => void;
  onSelectDate: (date: string) => void;
};

export default function YearCalendar({
  year,
  years,
  memoryDates,
  momentCount,
  highlightDate,
  onYearChange,
  onSelectDate,
}: Props) {
  const idx = years.indexOf(year);
  const prevYear = idx > 0 ? years[idx - 1] : null;
  const nextYear = idx >= 0 && idx < years.length - 1 ? years[idx + 1] : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      {/* Year selector */}
      <div className="mb-10 flex items-center justify-center gap-6">
        <button
          onClick={() => prevYear !== null && onYearChange(prevYear)}
          disabled={prevYear === null}
          aria-label="Previous year"
          className="font-sans text-xl text-ink-soft transition-opacity hover:text-ink disabled:opacity-20"
        >
          ←
        </button>
        <h2 className="font-serif text-4xl tracking-wide text-ink">{year}</h2>
        <button
          onClick={() => nextYear !== null && onYearChange(nextYear)}
          disabled={nextYear === null}
          aria-label="Next year"
          className="font-sans text-xl text-ink-soft transition-opacity hover:text-ink disabled:opacity-20"
        >
          →
        </button>
      </div>

      {/* 12 months: single column on mobile, 3 across on tablet, 6 across (two rows) on desktop */}
      <motion.div
        key={year}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
      >
        {Array.from({ length: 12 }, (_, month) => (
          <MonthGrid
            key={month}
            year={year}
            month={month}
            memoryDates={memoryDates}
            highlightDate={highlightDate}
            onSelectDate={onSelectDate}
          />
        ))}
      </motion.div>

      {/* Moment count */}
      <p className="mt-12 text-center font-sans text-sm text-ink-soft">
        {momentCount === 1
          ? `1 moment captured in ${year}`
          : `${momentCount} moments captured in ${year}`}
      </p>
    </div>
  );
}
