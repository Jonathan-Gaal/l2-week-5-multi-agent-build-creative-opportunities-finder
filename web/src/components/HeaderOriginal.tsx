/** Saved copy of the original top bar (small icon + "Artist Atlas" text; pass a different `icon` for the second version). Not used by the app; swap it in for Header to go back. */
import Image from "next/image";
import Link from "next/link";
import AuthButtons from "./AuthButtons";

export default function HeaderOriginal({ icon = "/brand/logo-mark.png", textSize }: { icon?: string; textSize?: number }) {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Artist Atlas home" style={textSize ? { fontSize: textSize } : undefined}>
          <Image src={icon} alt="" width={34} height={40} style={{ objectFit: "contain" }} priority />
          Artist Atlas
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/find">Find opportunities</Link>
          {process.env.NODE_ENV !== "production" && <Link href="/dev">Dev tools</Link>}
        </nav>
        <AuthButtons />
      </div>
    </header>
  );
}
