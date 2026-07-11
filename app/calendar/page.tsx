"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { memories, yearsWithMemories, countInYear } from "@/lib/memories";
import YearCalendar from "@/components/YearCalendar";
import MemoryScatter from "@/components/MemoryScatter";
import FloatingHearts from "@/components/FloatingHearts";
import BirthdayFloats from "@/components/BirthdayFloats";

const memoryDates = new Set(Object.keys(memories));
const years = yearsWithMemories();

export default function CalendarPage() {
  const router = useRouter();
  // null = still checking auth; avoids a flash of content before redirect.
  const [ready, setReady] = useState(false);

  // Default to the current year if it has memories, else the latest year that does.
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(() =>
    years.includes(currentYear) ? currentYear : years[years.length - 1] ?? currentYear
  );

  const [openDate, setOpenDate] = useState<string | null>(null);
  const [highlightDate, setHighlightDate] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthed()) {
      router.replace("/");
    } else {
      setReady(true);
    }
  }, [router]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  if (!ready) return null;

  function closeScatter() {
    // Briefly re-highlight the date she just viewed, then let it fade back.
    if (openDate) {
      setHighlightDate(openDate);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightDate(null), 1800);
    }
    setOpenDate(null);
  }

  return (
    <main className="relative min-h-screen">
      <FloatingHearts />
      <BirthdayFloats />

      <div className="relative z-10">
        <header className="pt-10 text-center">
          <h1 className="wordmark font-serif text-3xl tracking-wide">
            sunimuni
          </h1>
        </header>

        <YearCalendar
          year={year}
          years={years}
          memoryDates={memoryDates}
          momentCount={countInYear(year)}
          highlightDate={highlightDate}
          onYearChange={setYear}
          onSelectDate={setOpenDate}
        />
      </div>

      {openDate && memories[openDate] && (
        <MemoryScatter
          date={openDate}
          memory={memories[openDate]}
          onClose={closeScatter}
        />
      )}
    </main>
  );
}
