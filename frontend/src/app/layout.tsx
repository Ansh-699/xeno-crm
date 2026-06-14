import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const instrumentSerif = Instrument_Serif({ 
  subsets: ["latin"], 
  weight: "400",
  variable: "--font-serif" 
});

export const metadata: Metadata = {
  metadataBase: new URL("https://xeno.ansht.tech"),
  title: "Xeno CRM",
  description: "AI-native Mini CRM",
  // Favicon set is auto-linked by Next.js from src/app/{favicon.ico,icon.png,apple-icon.png}.
  // No manual `icons` block needed.
  openGraph: {
    title: "Xeno CRM",
    description: "AI-native Mini CRM",
    url: "https://xeno.ansht.tech",
    siteName: "Xeno CRM",
    images: [{ url: "/banner.png", width: 1672, height: 941, alt: "Xeno CRM" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Xeno CRM",
    description: "AI-native Mini CRM",
    images: ["/banner.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the persisted theme before paint to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.variable} ${instrumentSerif.variable} font-sans antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
