import { notFound } from "next/navigation";
import DevTools2 from "@/components/DevTools2";
import { getMeta } from "@/lib/backend";

export const metadata = { title: "Dev tools 2 | Artist Atlas" };

/** Developer-only: hidden in production builds. */
export default async function Dev2() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevTools2 meta={getMeta()} />;
}
