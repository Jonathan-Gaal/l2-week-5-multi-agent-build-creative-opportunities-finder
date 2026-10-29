import type { Metadata } from "next";
import MadLibsHero from "@/components/MadLibsHero";

export const metadata: Metadata = {
  title: "Design test: sentence home | Artist Atlas",
  description: "Open calls, grants, residencies, events and jobs for artists, with the source and check date on every result.",
  robots: { index: false, follow: false },
};

/** Design test: canvas artboard 1 as a live, animated home page. Not linked from the app. */
export default function DesignTest() {
  return <MadLibsHero />;
}
