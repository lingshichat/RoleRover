import { Link } from '@/i18n/routing';

export default function SharePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">Online sharing is unavailable in desktop mode</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Use export to share PDF, DOCX, HTML, or JSON files.</p>
      <Link href="/dashboard" className="mt-4 text-sm text-pink-500 hover:text-pink-600">
        Back to dashboard
      </Link>
    </div>
  );
}
