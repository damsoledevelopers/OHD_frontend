'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function SurveyCompletedPage() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId') || '';
  const employeeEmail = searchParams.get('employeeEmail') || '';

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <header className="flex h-[74px] items-center border-b border-gray-200 bg-white px-5 sm:px-8">
        <Image
          src="/ohdlogo.png"
          alt="OHD"
          width={170}
          height={56}
          className="h-12 w-auto object-contain"
          priority
        />
        <div className="ml-auto text-xs text-gray-500">
          {companyId ? `Company: ${companyId}` : null}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Submitted
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            Thank you for completing the diagnostic.
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            Your response has been recorded{employeeEmail ? ` for ${employeeEmail}` : ''}.
          </p>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Go to home
            </Link>
            <Link
              href={
                companyId
                  ? `/admin/reports?companyId=${encodeURIComponent(companyId)}`
                  : '/admin/reports'
              }
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              View analytics (admin)
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

