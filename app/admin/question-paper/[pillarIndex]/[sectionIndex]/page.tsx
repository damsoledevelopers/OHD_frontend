'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminLayout from '@/components/AdminLayout';
import toast from 'react-hot-toast';
import { questionPaperAPI } from '@/lib/apiClient';
import { ChevronDown } from 'lucide-react';

interface Question {
  id: number;
  text: string;
}

interface Section {
  id: number;
  name: string;
  questions: Question[];
}

interface Pillar {
  id: number;
  name: string;
  sections: Section[];
}

interface RemoteQuestion {
  text: string;
  order?: number;
}

interface RemoteSection {
  name: string;
  order?: number;
  questions?: RemoteQuestion[];
}

interface RemotePillar {
  name: string;
  order?: number;
  sections?: RemoteSection[];
}

export default function SectionQuestionsPage() {
  const params = useParams<{ pillarIndex: string; sectionIndex: string }>();
  const router = useRouter();

  const pillarIndex = Number(params.pillarIndex);
  const sectionIndex = Number(params.sectionIndex);

  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [openPillars, setOpenPillars] = useState<Record<number, boolean>>({});
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);

  const currentPillar = pillars[pillarIndex] ?? null;
  const currentSection = currentPillar?.sections[sectionIndex] ?? null;
  const questions = useMemo(
    () => currentSection?.questions ?? [],
    [currentSection],
  );

  const answeredCount = useMemo(
    () => questions.filter((q) => typeof answers[q.id] === 'number').length,
    [answers, questions],
  );

  const sectionProgressText = `${answeredCount} / ${questions.length || 0}`;

  useEffect(() => {
    if (Number.isNaN(pillarIndex) || Number.isNaN(sectionIndex)) {
      router.push('/admin/question-paper');
      return;
    }
  }, [pillarIndex, sectionIndex, router]);

  // Load draft structure from backend
  useEffect(() => {
    const loadDraft = async () => {
      try {
        setLoading(true);
        const res = await questionPaperAPI.getDraft();
        const remotePillars: RemotePillar[] = res.data?.pillars || [];

        let idCounter = 1;
        const mappedPillars: Pillar[] = remotePillars.map((p) => ({
          id: idCounter++,
          name: p.name,
          sections: (p.sections || []).map((s) => ({
            id: idCounter++,
            name: s.name,
            questions: (s.questions || []).map((q) => ({
              id: idCounter++,
              text: q.text,
            })),
          })),
        }));

        setPillars(mappedPillars);
        setOpenPillars(
          mappedPillars.reduce<Record<number, boolean>>((acc, _, idx) => {
            acc[idx] = idx === pillarIndex;
            return acc;
          }, {}),
        );
      } catch (error: unknown) {
        console.error('Failed to load question paper draft', error);
        const message =
          error instanceof Error ? error.message : 'Failed to load question paper';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    loadDraft();
  }, [pillarIndex]);

  const ratingLabels = [
    'Strongly Disagree',
    'Disagree',
    'Neutral',
    'Agree',
    'Strongly Agree',
  ];

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-semibold text-gray-900">Question Paper</h1>
            <div className="flex items-center gap-2 text-xs">
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                Solved {answeredCount}
              </div>
              <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                Pending {Math.max(questions.length - answeredCount, 0)}
              </div>
              <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">
                Progress {questions.length ? Math.round((answeredCount / questions.length) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
            Loading questions...
          </div>
        )}

        {!loading && (!currentPillar || !currentSection) && (
          <div className="rounded-xl border border-red-100 bg-white p-6 text-sm text-red-600">
            Section not found. Please go back to question paper and choose a valid section.
          </div>
        )}

        {!loading && currentPillar && currentSection && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_240px]">
            <aside className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <p className="mb-3 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Question Paper
              </p>
              <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                {pillars.map((pillar, pIndex) => {
                  const isOpen = openPillars[pIndex];
                  return (
                    <div key={pillar.id} className="rounded-lg border border-gray-200">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenPillars((prev) => ({ ...prev, [pIndex]: !prev[pIndex] }))
                        }
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                          {pillar.name}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 text-gray-500 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="space-y-1 border-t border-gray-100 p-2">
                          {pillar.sections.map((section, sIndex) => {
                            const isActive = pIndex === pillarIndex && sIndex === sectionIndex;
                            return (
                              <button
                                key={section.id}
                                type="button"
                                onClick={() => router.push(`/admin/question-paper/${pIndex}/${sIndex}`)}
                                className={`w-full rounded-md px-2 py-2 text-left text-xs transition ${
                                  isActive
                                    ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200'
                                    : 'text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                <p className="font-medium">{section.name}</p>
                                <p className="mt-0.5 text-[10px] text-gray-400">
                                  {section.questions.length} questions
                                </p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">
                Pillar {pillarIndex + 1} (P{pillarIndex + 1}) : {currentPillar.name}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-gray-900">
                  Parameter {sectionIndex + 1} (PA {sectionIndex + 1}) : {currentSection.name}
                </h2>
                <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">
                  Section progress: {sectionProgressText}
                </span>
              </div>
              <p className="mt-3 text-sm text-gray-500">
                Tap a question to activate the rating scale on the right. Only one question is active at a time.
              </p>

              <div className="mt-4 space-y-3">
                {questions.map((q, index) => {
                  const isActive = activeQuestionId === q.id;
                  const value = answers[q.id];
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setActiveQuestionId(q.id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-primary-300 bg-primary-50/60 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-xs font-semibold text-gray-700">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{q.text}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {typeof value === 'number'
                              ? `Selected: ${ratingLabels[value - 1]}`
                              : 'Not answered yet'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {questions.length === 0 && (
                  <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    No questions found in this section.
                  </div>
                )}
              </div>
            </section>

            <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <p className="mb-2 rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Your response
              </p>
              <p className="mb-3 text-xs text-gray-500">
                {activeQuestionId ? 'Select a rating' : 'Select a question'}
              </p>
              <div className="space-y-2">
                {ratingLabels.map((label, idx) => {
                  const value = idx + 1;
                  const isSelected =
                    activeQuestionId !== null && answers[activeQuestionId] === value;
                  return (
                    <button
                      key={label}
                      type="button"
                      disabled={activeQuestionId === null}
                      onClick={() => {
                        if (activeQuestionId === null) return;
                        setAnswers((prev) => ({ ...prev, [activeQuestionId]: value }));
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                        isSelected
                          ? 'border-primary-300 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60'
                      }`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-[11px] font-semibold">
                        {value}
                      </span>
                      <span className="font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

