import memoriesJson from "@/data/memories.json";

export type MediaItem = {
  type: "image" | "video";
  src: string;
  poster?: string;
};

export type Memory = {
  title: string;
  caption?: string;
  media: MediaItem[];
};

// memories.json is bundled into the site at build time (static export has no
// server to fetch from). Adding photos = commit + redeploy, per the spec.
export const memories = memoriesJson as Record<string, Memory>;

/** All years that have at least one memory, oldest first. */
export function yearsWithMemories(): number[] {
  const years = new Set<number>();
  for (const date of Object.keys(memories)) {
    years.add(Number(date.slice(0, 4)));
  }
  return [...years].sort((a, b) => a - b);
}

/** Memory count for a given year. */
export function countInYear(year: number): number {
  return Object.keys(memories).filter((d) => d.startsWith(`${year}-`)).length;
}

/** "2024-03-14" -> "14 March 2024" for display. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  // Construct via components (not `new Date(string)`) to avoid timezone
  // shifting the day.
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
