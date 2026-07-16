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

type Bounds = { leftMin: number; leftMax: number; topMin: number; topMax: number };

// Jumbled pile, kept to the middle of the screen with comfortable breathing
// room from all four edges. Instead of pure randomness (which can clump all
// the photos into one corner), we lay an invisible grid over the centre
// region, shuffle its cells, and drop one photo per cell with a small
// wobble — random-feeling, but always evenly spread and centred.
// The bounds are MEASURED per device (title height, card size, screen size)
// so photos can never start above the title or spill off an edge.
function makeSpots(count: number, bounds: Bounds): Spot[] {
  const { leftMin: LEFT, leftMax: RIGHT, topMin: TOP, topMax: BOTTOM } = bounds;
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
  // Wobble each card a little, but never outside the safe zone — the zone
  // edges are hard walls, so no card can poke above the title or off-screen.
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return cells.slice(0, count).map((cell) => ({
    left: clamp(cell.left + (Math.random() - 0.5) * 5, LEFT, RIGHT),
    top: clamp(cell.top + (Math.random() - 0.5) * 4, TOP, BOTTOM),
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
  const titleRef = useRef<HTMLDivElement>(null);
  // Spots are computed AFTER first paint, from real measurements of this
  // device: where the title actually ends, how big a card actually is.
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [contentTop, setContentTop] = useState(150); // px; refined on mount
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
    // Measure the real layout, then carve out the safe zone for the pile:
    // below the title, above the bottom edge, centred horizontally.
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const titleBottom = titleRef.current
      ? titleRef.current.getBoundingClientRect().bottom
      : vh * 0.22;
    setContentTop(titleBottom + 10);

    const isMobile = vw < 768;
    const cardW = (isMobile ? 112 : 160) + 16; // photo width + polaroid frame
    const cardH = cardW * 1.35 + 26; // tall photos + the caption strip
    const sideInset = isMobile ? 8 : 18; // % kept clear on left/right
    const leftMin = sideInset;
    const leftMax = Math.max(
      leftMin,
      Math.min(100 - sideInset - (cardW / vw) * 100, 64)
    );
    // +26px under the title: covers the wobble and the corners of tilted cards.
    const topMin = ((titleBottom + 26) / vh) * 100;
    const topMax = Math.max(
      topMin,
      Math.min(58, 100 - (cardH / vh) * 100 - 3)
    );
    setSpots(makeSpots(memory.media.length, { leftMin, leftMax, topMin, topMax }));
  }, [memory.media.length]);

  useEffect(() => {
    // Her birthday (July 16, any year) always gets its own special song.
    // Every other date draws randomly from the shared playlist, avoiding
    // whichever song played last.
    let pick: string;
    if (isBirthdayDate) {
      pick = "/audio/birthday.mp3";
    } else {
      if (!songs.length) return;
      // A song may only come around again after 5 OTHER songs have played.
      // We remember the last 5 played and draw from everything else.
      let recent: string[] = [];
      try {
        recent = JSON.parse(sessionStorage.getItem("sunimuni-recent-songs") || "[]");
      } catch {}
      const pool = songs.filter((s) => !recent.includes(s));
      const from = pool.length ? pool : songs; // safety net for tiny playlists
      pick = from[Math.floor(Math.random() * from.length)];
      recent = [...recent, pick].slice(-Math.min(5, songs.length - 1));
      sessionStorage.setItem("sunimuni-recent-songs", JSON.stringify(recent));
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
    const spot = spots?.[i] ?? { left: 0, top: 0, rotate: 0 };
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
        ref={titleRef}
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

      {/* The polaroids: tidy row for a small day, centered pile for a big one.
          Both wait for the measured layout so nothing overlaps the title. */}
      {lined ? (
        <div
          className="absolute inset-x-0 bottom-0 flex flex-wrap content-center items-center justify-center gap-6 px-6 pb-12 md:px-12"
          style={{ top: contentTop }}
        >
          {memory.media.map(renderCard)}
        </div>
      ) : (
        spots && memory.media.map(renderCard)
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
