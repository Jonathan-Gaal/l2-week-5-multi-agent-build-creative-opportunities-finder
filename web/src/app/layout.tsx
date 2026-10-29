import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Providers from "@/components/Providers";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"] });
const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Artist Atlas | Find your next opportunity in NYC",
  description:
    "Open calls, grants, residencies, events and jobs for NYC and tri-state artists, ranked for you, with the source and check date on every result.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <Providers>
          <Header />
          <main>{children}</main>
          <footer className="site-footer">
            <div className="wrap">
              Artist Atlas · a class project by Mara and Jon. Listings come from public sources and can change; always confirm on the
              original page before you apply.
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
