import { Suspense } from "react";
import FindStep from "@/components/find/FindStep";
import { getMeta } from "@/lib/backend";
import { readChoice } from "@/lib/findChoice";

type Params = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata = { title: "Where do you want to work | Artist Atlas" };

async function Step({ searchParams }: { searchParams: Params }) {
  const q = await searchParams;
  const meta = getMeta();
  return <FindStep step="place" initial={readChoice(q, meta)} meta={meta} />;
}

export default function Page({ searchParams }: { searchParams: Params }) {
  return (
    <div className="wrap">
      <Suspense fallback={null}>
        <Step searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
