import type { Metadata, Viewport } from "next";
import "@fontsource/archivo/400.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/900.css";
import "@fontsource/archivo-black/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Bizit Game Center",
  description: "Juegos de Bizit Global y BGenAI para la expo: jugá con BGen y descubrí qué puede hacer la IA por tu empresa.",
  applicationName: "Bizit Game Center",
  appleWebApp: { capable: true, title: "Bizit Games", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
