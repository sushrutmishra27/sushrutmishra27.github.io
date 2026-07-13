"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Memory } from "@/lib/memories";
import { formatDate } from "@/lib/memories";
import MemoryLightbox from "@/components/MemoryLightbox";
import BirthdayFloats from "@/components/BirthdayFloats";
import songs from "@/data/songs.json";

type Props = {
  date: string;
  memory: Memory;
  onClose: () => void;
};

type Spot = {
  left: number; // % of screen width
  top: number; // % of screen height
  rotate: number; // degrees
};

// Fewer photos than this -> a tidy centered row instead of a jumbled pile.
const LINE_LIMIT = 6;

// "/media/d/img1.jpg" -> "/media/d/img1-sm.jpg" (the small fast-loading copy)
function smallSrc(src: string): string {
  return src.replace(/(\.[a-z0-9]+)$/i, "-sm.jpg");
}

// Jumbled pile, kept to the middle of the screen with comfortable breathing
// room from all four edges. Instead of pure randomness (which can clump all
// the photos into one corner), we lay an invisible grid over the centre
// region, shuffle its cells, and drop one photo per cell with a small
// wobble — random-feeling, but always evenly spread and centred.
function makeSpots(count: number): Spot[] {
  const LEFT = 18, RIGHT = 62, TOP = 26, BOTTOM = 54; // % of screen (card top-left corner)
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const cells: { left: number; top: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        left: cols === 1 ? (LEFT + RIGHT) / 2 : LEFT + ((RIGHT - LEFT) * c) / (cols - 1),
        top: rows === 1 ? (TOP + BOTTOM) / 2 : TOP + ((BOTTOM - TOP) * r) / (rows - 1),
      });
    }
  }
  // Shuffle so photo order doesn't read left-to-right like a boring grid.
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count).map((cell) => ({
    left: cell.left + (Math.random() - 0.5) * 5,
    top: cell.top + (Math.random() - 0.5) * 4,
    rotate: (Math.random() - 0.5) * 24,
  }));
}

/**
 * Photos from one date laid out like polaroids on a table.
 * A small day (under 6 photos) lines them up neatly; a big day scatters
 * them in a centered pile. Drag to shuffle; a clean tap opens the photo big.
 */
export default function MemoryScatter({ date, memory, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [spots] = useState(() => makeSpots(memory.media.length));
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  // Whichever polaroid was touched last rises to the top of the pile.
  const [zOrder, setZOrder] = useState<number[]>(() =>
    memory.media.map((_, i) => i)
  );
  // Photos whose files fail to load are removed from view entirely —
  // no broken frames, no empty white cards, and the zoom skips them too.
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const visibleMedia = memory.media.filter((it) => !broken.has(it.src));

  function markBroken(src: string) {
    setBroken((prev) => {
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }
  // Where the current press started — lets us tell a tap from a drag.
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  // A random song from the shared playlist plays each time a date opens,
  // looping for as long as she stays. Opening again = a different song
  // (we remember the last one played and skip it).
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [songState, setSongState] = useState<"none" | "playing" | "paused">(
    "none"
  );

  const lined = visibleMedia.length < LINE_LIMIT;
  const isBirthdayDate = date.endsWith("-07-16");
  const zoomOpen = zoomIndex !== null;

  useEffect(() => {
    // Her birthday (July 16, any year) always gets its own special song.
    // Every other date draws randomly from the shared playlist, avoiding
    // whichever song played last.
    let pick: string;
    if (isBirthdayDate) {
      pick = "/audio/birthday.mp3";
    } else {
      if (!songs.length) return;
      const last = sessionStorage.getItem("sunimuni-last-song");
      const pool = songs.length > 1 ? songs.filter((s) => s !== last) : songs;
      pick = pool[Math.floor(Math.random() * pool.length)];
      sessionStorage.setItem("sunimuni-last-song", pick);
    }

    const audio = new Audio(pick);
    audio.loop = true; // short clips keep repeating for as long as she stays
    audio.volume = 0.55;
    audioRef.current = audio;
    audio
      .play()
      .then(() => setSongState("playing"))
      .catch(() => setSongState("none"));
    audio.addEventListener("error", () => setSongState("none"));
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, [date]);

  function toggleSong() {
    const audio = audioRef.current;
    if (!audio) return;
    if (songState === "playing") {
      audio.pause();
      setSongState("paused");
    } else {
      audio.play().then(() => setSongState("playing")).catch(() => {});
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // When the zoom is open, Esc belongs to the zoom view.
      if (e.key === "Escape" && !zoomOpen) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, zoomOpen]);

  function bringToFront(i: number) {
    setZOrder((prev) => [...prev.filter((x) => x !== i), i]);
  }

  function renderCard(item: Memory["media"][number], i: number) {
    if (broken.has(item.src)) return null; // failed to load -> not shown at all
    const isVideo = item.type === "video";
    const thumb = isVideo ? item.poster : smallSrc(item.src);
    const spot = spots[i];
    return (
      <motion.div
        key={item.src}
        drag
        dragConstraints={containerRef}
        dragElastic={0.12}
        dragMomentum={false}
        onDragStart={() => bringToFront(i)}
        onTapStart={(_, info) => {
          pressStart.current = { x: info.point.x, y: info.point.y };
        }}
        onTap={(_, info) => {
          // Only a clean tap opens the photo — if the pointer travelled,
          // it was a drag, so leave the photo where she dropped it.
          const s = pressStart.current;
          const moved = s
            ? Math.hypot(info.point.x - s.x, info.point.y - s.y)
            : 0;
          if (moved > 6) return;
          bringToFront(i);
          setZoomIndex(visibleMedia.findIndex((x) => x.src === item.src));
        }}
        initial={{ opacity: 0, scale: 0.5, rotate: 0 }}
        animate={{ opacity: 1, scale: 1, rotate: lined ? 0 : spot.rotate }}
        transition={{
          delay: Math.min(i * 0.045, 1.4),
          duration: 0.5,
          ease: "easeOut",
        }}
        whileDrag={{ scale: 1.06, rotate: 0 }}
        whileHover={{ scale: 1.04 }}
        className={`polaroid ${lined ? "relative" : "absolute"}`}
        style={{
          ...(lined
            ? {}
            : { left: `${spot.left}%`, top: `${spot.top}%` }),
          zIndex: 100 + zOrder.indexOf(i),
        }}
      >
        <img
          src={thumb || item.src}
          alt=""
          draggable={false}
          className="h-auto w-28 rounded-[2px] md:w-40"
          onError={(e) => {
            // Photo: if the small copy is missing, quietly try the original;
            // if that fails too (or a video's poster fails), the file is
            // truly broken — remove the card from view entirely.
            const el = e.currentTarget;
            if (!isVideo && !el.src.endsWith(item.src)) {
              el.src = item.src;
            } else {
              markBroken(item.src);
            }
          }}
        />
        {isVideo && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center pb-4 text-3xl drop-shadow">
            ▶️
          </span>
        )}
      </motion.div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] overflow-hidden"
      style={{
        background:
          "linear-gradient(150deg, rgba(255,214,232,0.97), rgba(233,213,255,0.97), rgba(255,224,200,0.97))",
      }}
    >
      {/* On her birthday date, the wishes float here too */}
      {isBirthdayDate && <BirthdayFloats force zIndexClass="z-[260]" />}

      {/* Title — the one romantic line for this day */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="pointer-events-none absolute inset-x-0 top-0 z-[300] px-14 pt-6 text-center"
      >
        <h2 className="wordmark font-serif text-2xl md:text-3xl">
          {memory.title || formatDate(date)}
        </h2>
        {memory.title && (
          <p className="mt-1 font-sans text-xs text-ink-soft">
            {formatDate(date)}
          </p>
        )}
        {memory.caption && (
          <p className="mx-auto mt-2 max-w-xl font-sans text-sm text-ink">
            {memory.caption}
          </p>
        )}
        <p className="mt-2 font-sans text-[11px] text-ink-soft/80">
          drag the photos around · tap one to see it big
        </p>
      </motion.div>

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Back to calendar"
        className="absolute right-4 top-4 z-[400] flex h-10 w-10 items-center justify-center rounded-full bg-white/80 font-sans text-lg text-ink shadow-md transition-transform hover:scale-110"
      >
        ✕
      </button>

      {/* Music toggle — only appears when this date has a song */}
      {songState !== "none" && (
        <button
          onClick={toggleSong}
          aria-label={songState === "playing" ? "Pause the song" : "Play the song"}
          className="absolute left-4 top-4 z-[400] flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg shadow-md transition-transform hover:scale-110"
        >
          {songState === "playing" ? "🎵" : "🔇"}
        </button>
      )}

      {/* The polaroids: tidy row for a small day, centered pile for a big one */}
      {lined ? (
        <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-6 px-12 pb-12 pt-32">
          {memory.media.map(renderCard)}
        </div>
      ) : (
        memory.media.map(renderCard)
      )}

      {/* Tap a polaroid -> full-size view (with swipe through the rest) */}
      {zoomOpen && (
        <MemoryLightbox
          date={date}
          memory={{ ...memory, media: visibleMedia }}
          index={zoomIndex}
          onClose={() => setZoomIndex(null)}
        />
      )}
    </div>
  );
}
