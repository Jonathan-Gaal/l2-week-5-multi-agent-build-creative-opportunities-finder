import { redirect } from "next/navigation";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

/** The find flow is one page per step. This address (and every older /find?... link) starts it, keeping the choices. */
export default async function Find({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const keep = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (typeof v === "string") keep.set(k, v);
  const query = keep.toString();
  redirect(query ? `/find/discipline?${query}` : "/find/discipline");
}
