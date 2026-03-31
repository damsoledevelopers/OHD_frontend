import { Suspense } from 'react';
import SurveyQuestionPaper from './SurveyQuestionPaper';

export default function SurveyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#f1f3f7] text-sm text-gray-500">
          Loading…
        </div>
      }
    >
      <SurveyQuestionPaper />
    </Suspense>
  );
}
