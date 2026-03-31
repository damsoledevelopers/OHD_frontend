import { Suspense } from 'react';
import SurveyStartRedirect from './SurveyStartRedirect';

export default function SurveyStartPage() {
  return (
    <Suspense fallback={null}>
      <SurveyStartRedirect />
    </Suspense>
  );
}
