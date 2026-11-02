import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import HeaderVersions from "@/components/HeaderVersions";
import Providers from "@/components/Providers";
import { finalFourScript } from "@/lib/finalFour";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Artist Atlas | Find your next opportunity in NYC",
  description:
    "Open calls, grants, residencies, events and jobs for NYC and tri-state artists, ranked for you, with the source and verification date on every result.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the script below puts the landing look on <html> before React starts, on the home page only
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: finalFourScript }} />
      </head>
      <body>
        <Providers>
          <HeaderVersions />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
