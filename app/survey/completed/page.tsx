import { Suspense } from 'react';
import SurveyCompletedContent from './SurveyCompletedContent';

export default function SurveyCompletedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <SurveyCompletedContent />
    </Suspense>
  );
}
