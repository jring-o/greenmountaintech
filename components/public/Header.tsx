import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-vermont-forest/10 bg-vermont-cream/95 backdrop-blur-sm">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-vermont-forest"
        >
          Vermont Events
        </Link>

        <ul className="flex items-center gap-6 text-sm font-medium text-vermont-slate">
          <li>
            <Link href="/" className="transition-colors hover:text-vermont-forest">
              Calendar
            </Link>
          </li>
          <li>
            <Link href="/submit" className="transition-colors hover:text-vermont-forest">
              Submit
            </Link>
          </li>
          <li>
            <Link href="/about" className="transition-colors hover:text-vermont-forest">
              About
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
