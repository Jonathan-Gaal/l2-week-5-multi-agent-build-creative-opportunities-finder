import { notFound } from "next/navigation";
import DevTools from "@/components/DevTools";

export const metadata = { title: "Dev tools | Artist Atlas" };

/** Developer-only: hidden in production builds. */
export default function Dev() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevTools />;
}
