/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build the whole site into plain static files (the `out/` folder).
  // This is what lets us host on Cloudflare Pages for free with no server.
  output: 'export',

  // Next's built-in image optimizer needs a running server, which a static
  // export doesn't have. Turning it off means <Image> just serves the file
  // as-is. Our ingestion script already compresses media, so this is fine.
  images: { unoptimized: true },

  // Serve /calendar as /calendar/ (a folder with index.html). This is the
  // most reliable way for static hosts like Cloudflare Pages to find pages.
  trailingSlash: true,
};

module.exports = nextConfig;
