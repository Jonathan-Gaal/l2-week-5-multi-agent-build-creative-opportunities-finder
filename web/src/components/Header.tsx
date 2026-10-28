import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Artist Atlas home">
          <Image src="/brand/logo-mark.png" alt="" width={34} height={40} priority />
          Artist Atlas
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/find">Find opportunities</Link>
          {process.env.NODE_ENV !== "production" && <Link href="/dev">Dev tools</Link>}
        </nav>
      </div>
    </header>
  );
}
