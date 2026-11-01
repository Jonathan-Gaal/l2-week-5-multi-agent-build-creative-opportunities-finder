"use client";

import { useLayoutEffect } from "react";
import { applyFinalFour, clearFinalFour } from "@/lib/finalFour";

/** Puts the "Final 4" look on the home page while it is showing, and takes it off again when you leave. */
export default function LandingDesign() {
  useLayoutEffect(() => {
    applyFinalFour();
    return clearFinalFour;
  }, []);
  return null;
}
