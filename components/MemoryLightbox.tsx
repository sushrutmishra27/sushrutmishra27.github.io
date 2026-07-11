"use client";

import Lightbox from "yet-another-react-lightbox";
import Video from "yet-another-react-lightbox/plugins/video";
import "yet-another-react-lightbox/styles.css";
import { motion } from "framer-motion";
import type { Memory } from "@/lib/memories";
import { formatDate } from "@/lib/memories";

type Props = {
  date: string;
  memory: Memory;
  onClose: () => void;
  /** Which photo to open on (defaults to the first). */
  index?: number;
};

export default function MemoryLightbox({ date, memory, onClose, index = 0 }: Props) {
  const slides = memory.media.map((item) =>
    item.type === "video"
      ? {
          type: "video" as const,
          poster: item.poster,
          autoPlay: true,
          muted: true,
          controls: true,
          playsInline: true,
          sources: [{ src: item.src, type: "video/mp4" }],
        }
      : { src: item.src }
  );

  return (
    <>
      <Lightbox
        open
        close={onClose}
        index={index}
        slides={slides}
        plugins={[Video]}
        // Warm ivory-on-black feel: dim the backdrop, slow the fade.
        animation={{ fade: 500 }}
        styles={{
          container: { backgroundColor: "rgba(20, 16, 14, 0.94)" },
        }}
        // Hide prev/next arrows when there's only one item.
        carousel={{ finite: true }}
        render={
          slides.length === 1
            ? { buttonPrev: () => null, buttonNext: () => null }
            : undefined
        }
      />
      {/* Title + caption, floated above the lightbox (its z-index is 9999). */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
        className="pointer-events-none fixed inset-x-0 top-0 z-[10000] px-14 pb-6 pt-5 text-center"
      >
        <h2 className="font-serif text-xl text-ivory md:text-2xl">
          {memory.title || formatDate(date)}
        </h2>
        {memory.title && (
          <p className="mt-1 font-sans text-xs text-ivory/60">
            {formatDate(date)}
          </p>
        )}
        {memory.caption && (
          <p className="mx-auto mt-2 max-w-xl font-sans text-sm text-ivory/80">
            {memory.caption}
          </p>
        )}
      </motion.div>
    </>
  );
}
