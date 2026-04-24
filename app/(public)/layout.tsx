import Footer from '@/components/public/Footer';
import Header from '@/components/public/Header';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-vermont-cream">
      <Header />
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</div>
      <Footer />
    </div>
  );
}
