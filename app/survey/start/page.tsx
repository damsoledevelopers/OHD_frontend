'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Backward-compat redirect:
 * Some links still point to `/survey/start`.
 * Redirect to `/survey` while preserving full query string.
 */
export default function SurveyStartRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(`/survey${qs ? `?${qs}` : ''}`);
  }, [router, searchParams]);

  return null;
}

