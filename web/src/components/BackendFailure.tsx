import Link from "next/link";
import type { BackendError } from "@/lib/backend";

/** The results service failed or is down: what happened, how to retry, and (in development) how to start it. */
export default function BackendFailure({ title, failure, retryHref }: { title: string; failure: BackendError; retryHref: string }) {
  return (
    <div className="empty stack" role="alert" style={{ marginTop: 24 }}>
      <h2>{title}</h2>
      <p>{failure.message}</p>
      {failure.code === "unreachable" && process.env.NODE_ENV !== "production" && (
        <p className="hint">Dev: start the local results service with <code>npm run backend:local</code> in <code>web/</code>, or set <code>BACKEND_URL</code>.</p>
      )}
      <Link className="btn" href={retryHref}>Try again</Link>
    </div>
  );
}
