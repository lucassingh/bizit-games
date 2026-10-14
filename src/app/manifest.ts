import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bizit Game Center",
    short_name: "Bizit Games",
    description: "Juegos de Bizit Global y BGenAI para la expo.",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "es-AR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
