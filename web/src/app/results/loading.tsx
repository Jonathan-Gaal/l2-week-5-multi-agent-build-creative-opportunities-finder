export default function Loading() {
  return (
    <div className="wrap">
      <h1 style={{ fontSize: "clamp(30px, 5vw, 44px)" }}>Finding your opportunities…</h1>
      <p className="muted-dk" style={{ marginTop: 8 }} role="status">
        Checking the listings, dropping anything expired, and putting the best fits first.
      </p>
    </div>
  );
}
