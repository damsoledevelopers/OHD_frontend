'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { companyAPI, questionPaperAPI, responseAPI } from '@/lib/apiClient';

type Rating = 'A' | 'B' | 'C' | 'D' | 'E';

interface Question {
  _id: string;
  text: string;
  order?: number;
}

interface Section {
  _id: string;
  name: string;
  order?: number;
  questions?: Question[];
}

interface Pillar {
  _id: string;
  name: string;
  order?: number;
  sections?: Section[];
}

const SCALE = [
  { value: 1, label: 'Strongly Disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly Agree' },
];
const EXAM_DURATION_MINUTES = Number(process.env.NEXT_PUBLIC_SURVEY_EXAM_DURATION_MINUTES || 30);

const numberToRating = (value: number): Rating => {
  if (value === 5) return 'A';
  if (value === 4) return 'B';
  if (value === 3) return 'C';
  if (value === 2) return 'D';
  return 'E';
};

export default function SurveyQuestionPaper() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const companyId = (searchParams.get('companyId') || '').trim();
  const rawEmployeeEmail = (searchParams.get('employeeEmail') || '').trim();
  const employeeEmail = rawEmployeeEmail.toLowerCase();
  const department = (searchParams.get('department') || '').trim();
  const startedAtFromQuery = (searchParams.get('startedAt') || '').trim();

  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [openPillars, setOpenPillars] = useState<Record<string, boolean>>({});
  const [activePillarIndex, setActivePillarIndex] = useState(0);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [startedAt, setStartedAt] = useState<string>(startedAtFromQuery);
  const [starting, setStarting] = useState(false);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const didStartExamRef = useRef(false);

  useEffect(() => {
    const EMAIL_TOKEN = '__RECIPIENT_EMAIL__';

    // Never redirect to admin/login. Show a public error instead.
    if (!companyId) {
      setSessionError('Invalid exam link: company id is missing.');
      setLoading(false);
      return;
    }

    if (!employeeEmail || employeeEmail === EMAIL_TOKEN || employeeEmail === EMAIL_TOKEN.toLowerCase()) {
      setSessionError('Invalid exam link: employee email is missing. Please use your personalized email link.');
      setLoading(false);
      return;
    }

    // If startedAt already exists in the URL, we can proceed.
    if (startedAtFromQuery) {
      setSessionError(null);
      setStartedAt(startedAtFromQuery);
      return;
    }

    if (didStartExamRef.current) return;
    didStartExamRef.current = true;

    (async () => {
      try {
        setSessionError(null);
        setStarting(true);

        // Auto-pick a department (no start page). Use query if provided,
        // otherwise pick the first configured department for the company.
        let resolvedDepartment = department;
        if (!resolvedDepartment) {
          const companyRes = await companyAPI
            .getPublicById(companyId, employeeEmail)
            .catch(() => null);
          const deps: unknown = companyRes?.data?.company?.departments;
          if (Array.isArray(deps) && deps.length > 0) {
            resolvedDepartment = String(deps[0] || '').trim();
          }
        }

        const res = await responseAPI.startExam({
          companyId,
          employeeEmail,
          department: resolvedDepartment || undefined,
        });

        const iso = res.data?.startedAt
          ? new Date(res.data.startedAt).toISOString()
          : new Date().toISOString();

        setStartedAt(iso);

        // Persist in URL so refresh/back-button doesn't break submission.
        const qs = new URLSearchParams({
          companyId,
          employeeEmail,
          startedAt: iso,
        });
        if (resolvedDepartment) qs.set('department', resolvedDepartment);
        router.replace(`/survey?${qs.toString()}`);
      } catch (error: unknown) {
        console.error('Failed to start exam', error);
        const message =
          error instanceof Error ? error.message : 'Failed to start exam';

        const lower = message.toLowerCase();

        // If the same email already started, we can still proceed with the exam UI.
        // Use "now" as startedAt (backend only validates it is not in the future).
        if (
          lower.includes('already started') ||
          lower.includes('exam already started') ||
          lower.includes('survey has not been dispatched yet')
        ) {
          const iso = new Date().toISOString();
          setStartedAt(iso);
          setSessionError(null);

          const qs = new URLSearchParams({
            companyId,
            employeeEmail,
            startedAt: iso,
          });
          if (department) qs.set('department', department);
          router.replace(`/survey?${qs.toString()}`);
          return;
        }

        // If the response already exists, show completed screen.
        if (lower.includes('already submitted') || lower.includes('response already submitted')) {
          router.replace(
            `/survey/completed?companyId=${encodeURIComponent(companyId)}&employeeEmail=${encodeURIComponent(employeeEmail)}`,
          );
          return;
        }

        setSessionError(message);
        toast.error(message);
      } finally {
        setStarting(false);
      }
    })();
  }, [companyId, department, employeeEmail, rawEmployeeEmail, router, startedAtFromQuery]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadPaper = async () => {
      try {
        setLoading(true);
        const res = await questionPaperAPI.getPublished();
        const loadedPillars: Pillar[] = (res.data?.pillars || []) as Pillar[];
        const sortedPillars = [...loadedPillars].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        sortedPillars.forEach((pillar) => {
          pillar.sections = [...(pillar.sections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          pillar.sections.forEach((section) => {
            section.questions = [...(section.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          });
        });
        setPillars(sortedPillars);
        setOpenPillars(
          sortedPillars.reduce<Record<string, boolean>>((acc, p, i) => {
            acc[p._id] = i === 0;
            return acc;
          }, {}),
        );
      } catch (error: unknown) {
        console.error('Failed to load question paper', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load question paper');
      } finally {
        setLoading(false);
      }
    };

    void loadPaper();
  }, []);

  const currentPillar = pillars[activePillarIndex];
  const currentSection = currentPillar?.sections?.[activeSectionIndex];
  const currentQuestions = useMemo(
    () => currentSection?.questions || [],
    [currentSection],
  );

  const answeredCount = useMemo(
    () => currentQuestions.filter((q) => typeof answers[q._id] === 'number').length,
    [answers, currentQuestions],
  );

  const totalQuestions = useMemo(
    () =>
      pillars.reduce(
        (total, pillar) =>
          total +
          (pillar.sections || []).reduce(
            (sectionTotal, section) => sectionTotal + (section.questions || []).length,
            0,
          ),
        0,
      ),
    [pillars],
  );

  const totalAnswered = useMemo(() => Object.keys(answers).length, [answers]);
  const completionPct = useMemo(
    () => (totalQuestions > 0 ? Math.round((totalAnswered / totalQuestions) * 100) : 0),
    [totalAnswered, totalQuestions],
  );
  const timeLeft = useMemo(() => {
    if (!startedAt) return `${String(EXAM_DURATION_MINUTES).padStart(2, '0')}:00`;
    const startMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startMs)) return `${String(EXAM_DURATION_MINUTES).padStart(2, '0')}:00`;
    const totalMs = EXAM_DURATION_MINUTES * 60 * 1000;
    const remaining = Math.max(totalMs - (nowTs - startMs), 0);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [nowTs, startedAt]);

  const handleSubmit = async () => {
    if (!companyId || !employeeEmail || !startedAt) {
      toast.error('Invalid survey session. Please start again.');
      return;
    }
    if (Object.keys(answers).length === 0) {
      toast.error('Please answer at least one question');
      return;
    }

    const payloadAnswers = Object.entries(answers).map(([questionId, ratingNum]) => ({
      questionId,
      rating: numberToRating(ratingNum),
    }));

    try {
      setSubmitting(true);
      await responseAPI.submit({
        companyId,
        employeeEmail,
        department: department || undefined,
        answers: payloadAnswers,
        startedAt,
      });
      toast.success('Response submitted successfully');
      router.push(
        `/survey/completed?companyId=${encodeURIComponent(companyId)}&employeeEmail=${encodeURIComponent(employeeEmail)}`,
      );
    } catch (error: unknown) {
      console.error('Failed to submit response', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f3f7]">
      <header className="flex h-[72px] items-center justify-between border-b border-[#dce2ec] bg-white px-6 shadow-[0_1px_0_rgba(16,24,40,0.04)] sm:px-10">
        <div className="flex items-center gap-4">
          <Image src="/ohdlogo.png" alt="OHD" width={150} height={44} className="h-10 w-auto object-contain" priority />
          <div className="hidden h-7 w-px bg-[#e3e8ef] md:block" />
          <p className="hidden text-base font-semibold text-[#1f2937] md:block">Chalo On Tour</p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="rounded-md border border-[#d9eede] bg-[#f2fbf4] px-2.5 py-1 font-semibold text-[#1a8b4a]">
            SOLVED <span className="ml-1 text-sm">{totalAnswered}</span>
          </div>
          <div className="rounded-md border border-[#f4e0b5] bg-[#fff8ea] px-2.5 py-1 font-semibold text-[#b76d00]">
            PENDING <span className="ml-1 text-sm">{Math.max(totalQuestions - totalAnswered, 0)}</span>
          </div>
          <div className="rounded-md border border-[#dce2ec] bg-[#f8fafc] px-2.5 py-1 font-semibold text-[#4b5563]">
            {timeLeft}
          </div>
          <div className="rounded-md border border-[#dce2ec] bg-[#f8fafc] px-2.5 py-1 font-semibold text-[#64748b]">
            Progress {completionPct}%
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1560px] px-4 pb-4 pt-6 sm:px-5 sm:pt-7">
        {sessionError ? (
          <div className="rounded-xl border border-red-200 bg-white p-6 text-sm text-red-700">
            {sessionError}
          </div>
        ) : loading || starting || !startedAt ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
            Loading exam...
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[250px_minmax(0,1fr)_228px]">
            <aside className="rounded-xl border border-[#dce2ec] bg-[#f4f6fb] p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <p className="mb-2 rounded bg-[#fff5db] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#b07b1f]">
                Question paper
              </p>
              <div className="max-h-[74vh] space-y-2 overflow-y-auto pr-1">
                {pillars.map((pillar, pIndex) => {
                  const isOpen = openPillars[pillar._id];
                  return (
                    <div key={pillar._id} className="rounded-md border border-[#dce2ec] bg-white">
                      <button
                        type="button"
                        onClick={() => setOpenPillars((prev) => ({ ...prev, [pillar._id]: !prev[pillar._id] }))}
                        className="flex w-full items-center justify-between px-2.5 py-2 text-left"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#3b4758]">
                          {pillar.name}
                        </span>
                        <span
                          aria-hidden="true"
                          className={`inline-block h-4 w-4 text-center leading-4 text-[#64748b] transition-transform ${
                            isOpen ? 'rotate-180' : 'rotate-0'
                          }`}
                        >
                          ▾
                        </span>
                      </button>
                      {isOpen && (
                        <div className="space-y-1 border-t border-[#edf1f7] p-1.5">
                          {(pillar.sections || []).map((section, sIndex) => {
                            const active = pIndex === activePillarIndex && sIndex === activeSectionIndex;
                            return (
                              <button
                                key={section._id}
                                type="button"
                                onClick={() => {
                                  setActivePillarIndex(pIndex);
                                  setActiveSectionIndex(sIndex);
                                  setActiveQuestionId(null);
                                }}
                                className={`w-full rounded px-2 py-1.5 text-left text-[11px] ${
                                  active
                                    ? 'bg-[#eef3ff] text-[#3b5ab5] ring-1 ring-[#d4def7]'
                                    : 'text-[#546174] hover:bg-[#f7f9fd]'
                                }`}
                              >
                                <p className="font-semibold">{section.name}</p>
                                <p className="mt-0.5 text-[10px] text-[#94a3b8]">
                                  {(section.questions || []).length} questions
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

            <section className="rounded-xl border border-[#dce2ec] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5d67d3]">
                Pillar {activePillarIndex + 1} (P{activePillarIndex + 1}) : {currentPillar?.name || '—'}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[38px] font-semibold leading-tight text-[#1f2937]">
                  Parameter {activeSectionIndex + 1} (PA {activeSectionIndex + 1}) : {currentSection?.name || '—'}
                </h2>
                <span className="rounded-md border border-[#dce2ec] bg-[#f8fafc] px-3 py-1 text-xs font-medium text-[#556274]">
                  Section progress: {answeredCount} / {currentQuestions.length || 0}
                </span>
              </div>
              <p className="mt-3 text-[13px] text-[#77859a]">
                Tap a question to activate the rating scale on the right. Only one question is active at a time.
              </p>

              <div className="mt-4 space-y-3">
                {currentQuestions.map((q, idx) => {
                  const isActive = activeQuestionId === q._id;
                  const value = answers[q._id];
                  return (
                    <button
                      key={q._id}
                      type="button"
                      onClick={() => setActiveQuestionId(q._id)}
                      className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                        isActive
                          ? 'border-[#cdd8ef] bg-[#f8fbff] shadow-sm'
                          : 'border-[#e0e6ef] bg-white hover:border-[#cad3e2]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#dce2ec] bg-white text-xs font-semibold text-[#49576b]">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-[14px] font-semibold leading-snug text-[#253246]">{q.text}</p>
                          <p className="mt-1 text-xs text-[#8c99ac]">
                            {typeof value === 'number'
                              ? `Selected: ${SCALE[value - 1]?.label || ''}`
                              : 'Not answered yet'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="h-fit rounded-xl border border-[#dce2ec] bg-[#f7f9fd] p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <p className="mb-2 rounded bg-[#fff5db] px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-[#b07b1f]">
                Your response
              </p>
              <p className="mb-3 text-xs text-[#8b98aa]">{activeQuestionId ? 'Select a rating' : 'Select a question'}</p>
              <div className="space-y-2">
                {SCALE.map((item) => {
                  const isSelected = !!activeQuestionId && answers[activeQuestionId] === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={!activeQuestionId}
                      onClick={() => {
                        if (!activeQuestionId) return;
                        setAnswers((prev) => ({ ...prev, [activeQuestionId]: item.value }));
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        isSelected
                          ? 'border-[#bdccef] bg-[#eef3ff] text-[#3451a7]'
                          : 'border-[#e0e6ef] bg-white text-[#607086] hover:bg-[#f7f9fd] disabled:cursor-not-allowed disabled:opacity-60'
                      }`}
                    >
                      <span className="flex h-6 w-6 items-center justify-center rounded-md border border-[#dce2ec] bg-white text-[11px] font-semibold">
                        {item.value}
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="mt-4 w-full rounded-lg bg-[#2b58da] px-3 py-2 text-sm font-semibold text-white hover:bg-[#214bc2] disabled:opacity-60"
              >
                {submitting ? 'Submitting...' : 'Submit response'}
              </button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
