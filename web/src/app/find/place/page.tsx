import FindStep from "@/components/find/FindStep";
import { getMeta } from "@/lib/backend";
import { readChoice } from "@/lib/findChoice";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata = { title: "Where do you want to work | Artist Atlas" };

export default async function Page({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const meta = getMeta();
  return (
    <div className="wrap">
      <FindStep step="place" initial={readChoice(q, meta)} meta={meta} />
    </div>
  );
}
