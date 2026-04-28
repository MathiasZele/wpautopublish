import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <Link href="/" className="block text-center mb-8">
          <h1 className="text-3xl font-bold text-brand-600">WP AutoPublish</h1>
        </Link>
        <div className="bg-white p-8 rounded-xl shadow-sm border">{children}</div>
      </div>
    </div>
  );
}
