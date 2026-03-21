'use client';

import { Suspense } from 'react';
import StartSurveyGateContent from './StartSurveyGateContent';

export default function StartSurveyGatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <p className="text-gray-600">Loading…</p>
        </div>
      }
    >
      <StartSurveyGateContent />
    </Suspense>
  );
}
