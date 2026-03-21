'use client';

import { Suspense } from 'react';
import SurveyPageContent from './SurveyPageContent';

export default function SurveyPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SurveyPageContent />
    </Suspense>
  );
}


