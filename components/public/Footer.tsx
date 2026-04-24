import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="border-t border-vermont-forest/10 bg-vermont-cream">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <p className="text-sm text-vermont-slate">A community project for Vermont.</p>
          <nav>
            <ul className="flex gap-6 text-sm text-vermont-slate">
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
        </div>
      </div>
    </footer>
  );
}
