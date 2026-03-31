'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { companyAPI, questionPaperAPI, responseAPI } from '@/lib/apiClient';
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';

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
  { value: 1, label: 'Strongly Disagree', colorText: 'text-red-500', selectedClass: 'border-red-300 bg-red-50 text-red-700', hoverClass: 'hover:bg-red-50 hover:border-red-200' },
  { value: 2, label: 'Disagree', colorText: 'text-orange-500', selectedClass: 'border-orange-300 bg-orange-50 text-orange-700', hoverClass: 'hover:bg-orange-50 hover:border-orange-200' },
  { value: 3, label: 'Neutral', colorText: 'text-amber-500', selectedClass: 'border-amber-300 bg-amber-50 text-amber-700', hoverClass: 'hover:bg-amber-50 hover:border-amber-200' },
  { value: 4, label: 'Agree', colorText: 'text-emerald-500', selectedClass: 'border-emerald-300 bg-emerald-50 text-emerald-700', hoverClass: 'hover:bg-emerald-50 hover:border-emerald-200' },
  { value: 5, label: 'Strongly Agree', colorText: 'text-green-600', selectedClass: 'border-green-300 bg-green-50 text-green-800', hoverClass: 'hover:bg-green-50 hover:border-green-200' },
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
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [showSolvedModal, setShowSolvedModal] = useState(false);
  const [showSidebarModal, setShowSidebarModal] = useState(false);
  const [startedAt, setStartedAt] = useState<string>(startedAtFromQuery);
  const [starting, setStarting] = useState(false);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const didStartExamRef = useRef(false);
  const autoSubmitTriggeredRef = useRef(false);

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
          (error as any)?.response?.data?.error ||
          (error instanceof Error ? error.message : 'Failed to start exam');

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
        const message = (error as any)?.response?.data?.error || (error instanceof Error ? error.message : 'Failed to load question paper');
        toast.error(message);
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

  const flatQuestions = useMemo(() => {
    const list: { pIndex: number; sIndex: number; qIndex: number; qId: string; text: string; pillarName: string; sectionName: string; }[] = [];
    pillars.forEach((p, pIndex) => {
      (p.sections || []).forEach((s, sIndex) => {
        (s.questions || []).forEach((q, qIndex) => {
          list.push({ pIndex, sIndex, qIndex, qId: q._id, text: q.text, pillarName: p.name, sectionName: s.name });
        });
      });
    });
    return list;
  }, [pillars]);

  const pendingQuestionsList = useMemo(() => {
    return flatQuestions.filter((fq) => typeof answers[fq.qId] !== 'number');
  }, [flatQuestions, answers]);

  const solvedQuestionsList = useMemo(() => {
    return flatQuestions.filter((fq) => typeof answers[fq.qId] === 'number');
  }, [flatQuestions, answers]);

  const currentFlatIndex = useMemo(() => {
    if (activeQuestionId) {
      return flatQuestions.findIndex(fq => fq.qId === activeQuestionId);
    }
    return flatQuestions.findIndex(fq => fq.pIndex === activePillarIndex && fq.sIndex === activeSectionIndex);
  }, [flatQuestions, activeQuestionId, activePillarIndex, activeSectionIndex]);

  const nextButtonLabel = useMemo(() => {
    const nextQ = flatQuestions[currentFlatIndex + 1];
    if (!nextQ) return 'Next Question';
    if (nextQ.pIndex !== activePillarIndex) return 'Next Pillar';
    if (nextQ.sIndex !== activeSectionIndex) return 'Next Session';
    return 'Next Question';
  }, [flatQuestions, currentFlatIndex, activePillarIndex, activeSectionIndex]);

  const handleNextQuestion = () => {
    const nextQ = flatQuestions[currentFlatIndex + 1];
    if (nextQ) {
      setActivePillarIndex(nextQ.pIndex);
      setActiveSectionIndex(nextQ.sIndex);
      setActiveQuestionId(nextQ.qId);
      setOpenPillars(prev => ({ ...prev, [pillars[nextQ.pIndex]._id]: true }));
    }
  };

  const handlePrevQuestion = () => {
    const prevQ = flatQuestions[currentFlatIndex - 1];
    if (prevQ) {
      setActivePillarIndex(prevQ.pIndex);
      setActiveSectionIndex(prevQ.sIndex);
      setActiveQuestionId(prevQ.qId);
      setOpenPillars(prev => ({ ...prev, [pillars[prevQ.pIndex]._id]: true }));
    }
  };

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

  const handleSubmit = useCallback(async (isAutoSubmit = false) => {
    if (!companyId || !employeeEmail || !startedAt) {
      if (!isAutoSubmit) toast.error('Invalid survey session. Please start again.');
      return;
    }
    if (Object.keys(answers).length === 0) {
      if (isAutoSubmit) {
        toast.error('Time is up! No responses were recorded.');
        router.push(`/survey/completed?companyId=${encodeURIComponent(companyId)}&employeeEmail=${encodeURIComponent(employeeEmail)}`);
      } else {
        toast.error('Please answer at least one question');
      }
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
      toast.success(isAutoSubmit ? 'Time is up! Response auto-submitted successfully.' : 'Response submitted successfully');
      router.push(
        `/survey/completed?companyId=${encodeURIComponent(companyId)}&employeeEmail=${encodeURIComponent(employeeEmail)}`,
      );
    } catch (error: unknown) {
      console.error('Failed to submit response', error);
      const message = (error as any)?.response?.data?.error || (error instanceof Error ? error.message : 'Failed to submit response');
      if (isAutoSubmit) {
        toast.error('Auto-submit failed. Redirecting...');
        router.push(`/survey/completed?companyId=${encodeURIComponent(companyId)}&employeeEmail=${encodeURIComponent(employeeEmail)}`);
      } else {
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [answers, companyId, department, employeeEmail, router, startedAt]);

  useEffect(() => {
    if (!startedAt || autoSubmitTriggeredRef.current || submitting || starting || loading) return;
    const startMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startMs)) return;
    const totalMs = EXAM_DURATION_MINUTES * 60 * 1000;
    const remaining = Math.max(totalMs - (nowTs - startMs), 0);

    if (remaining === 0) {
      autoSubmitTriggeredRef.current = true;
      toast('Time is up! Auto-submitting...', { icon: '⏳', duration: 4000 });
      void handleSubmit(true);
    }
  }, [nowTs, startedAt, submitting, starting, loading, handleSubmit]);

  return (
    <div className="min-h-screen bg-[#f1f3f7]">
      <header className="border-b border-[#dce2ec] bg-white shadow-[0_1px_0_rgba(16,24,40,0.04)]">
        <div className="mx-auto flex h-[72px] max-w-[1560px] items-center px-4 sm:px-5">
          <div className="grid w-full grid-cols-2 items-center lg:grid-cols-[250px_minmax(0,1fr)_228px] lg:gap-4">
            {/* Column 1: Logo */}
            <div className="flex items-center justify-start lg:justify-center">
              <Image src="/ohdlogo.png" alt="OHD" width={110} height={32} className="h-8 w-auto object-contain lg:h-10" priority />
            </div>

            {/* Column 2: Aligned Title - Hidden on small mobile */}
            <div className="hidden items-center lg:flex">
              <div className="h-7 w-px bg-[#e3e8ef] lg:mr-4" />
              <p className="text-base font-semibold text-[#1f2937]">Chalo On Tour</p>
            </div>

            {/* Column 3: Stats/Badges */}
            <div className="col-span-1 flex items-center justify-end gap-1.5 lg:col-span-1 lg:gap-2 text-[10px] lg:text-[11px]">
              <button type="button" onClick={() => setShowSidebarModal(true)} className="flex items-center gap-1 rounded-md border border-[#dce2ec] bg-[#f8fafc] px-1.5 py-1 font-semibold text-[#4b5563] lg:hidden">
                 QUESTIONS
              </button>
              <button type="button" onClick={() => setShowSolvedModal(true)} className="rounded-md border border-[#d9eede] bg-[#f2fbf4] px-1.5 py-1 lg:px-2.5 font-semibold text-[#1a8b4a] hover:bg-[#e6f7eb]">
                <span className="hidden sm:inline">SOLVED</span> <span>{totalAnswered}</span>
              </button>
              <button type="button" onClick={() => setShowPendingModal(true)} className="rounded-md border border-[#f4e0b5] bg-[#fff8ea] px-1.5 py-1 lg:px-2.5 font-semibold text-[#b76d00] hover:bg-[#fff0d4]">
                <span className="hidden sm:inline">PENDING</span> <span>{Math.max(totalQuestions - totalAnswered, 0)}</span>
              </button>
              <div className="rounded-md border border-[#dce2ec] bg-[#f8fafc] px-1.5 py-1 lg:px-2.5 font-semibold text-[#4b5563]">
                {timeLeft}
              </div>
              <div className="hidden rounded-md border border-[#dce2ec] bg-[#f8fafc] px-2.5 py-1 font-semibold text-[#64748b] sm:block">
                {completionPct}%
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-[1560px] px-4 pt-6 sm:px-5 sm:pt-7 lg:pb-12 ${activeQuestionId ? 'pb-36' : 'pb-8'}`}>
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
            <aside className="hidden rounded-xl border border-[#dce2ec] bg-[#f4f6fb] p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:block">
              <p className="mb-2 text-center text-[13px] font-bold uppercase tracking-wide text-black">
                QUESTIONS
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
                            const sectionQuestions = section.questions || [];
                            const isCompleted = sectionQuestions.length > 0 && sectionQuestions.every(q => typeof answers[q._id] === 'number');
                            
                            return (
                              <button
                                key={section._id}
                                type="button"
                                onClick={() => {
                                  setActivePillarIndex(pIndex);
                                  setActiveSectionIndex(sIndex);
                                  setActiveQuestionId(null);
                                }}
                                className={`w-full rounded px-2 py-1.5 text-left text-[11px] flex justify-between items-start gap-2 ${
                                  active
                                    ? 'bg-[#eef3ff] text-[#3b5ab5] ring-1 ring-[#d4def7]'
                                    : 'text-[#546174] hover:bg-[#f7f9fd]'
                                }`}
                              >
                                <div>
                                  <p className="font-semibold">{section.name}</p>
                                  <p className="mt-0.5 text-[10px] text-[#94a3b8]">
                                    {sectionQuestions.length} questions
                                  </p>
                                </div>
                                {isCompleted && (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                )}
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
                <h2 className="text-2xl font-semibold leading-tight text-[#1f2937]">
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

              <div className="mt-8 flex items-center justify-between border-t border-[#edf1f7] pt-5">
                <button
                  type="button"
                  onClick={handlePrevQuestion}
                  disabled={currentFlatIndex <= 0}
                  className="flex items-center gap-2 rounded-xl border border-[#dce2ec] bg-white px-5 py-2.5 text-xs font-bold text-[#49576b] hover:bg-[#f8fafc] hover:border-[#cad3e2] disabled:cursor-not-allowed disabled:opacity-40 transition-all shadow-sm active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous Question
                </button>
                {currentFlatIndex >= flatQuestions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => handleSubmit(false)}
                    disabled={submitting}
                    className="flex items-center gap-2 rounded-xl bg-[#2b58da] px-6 py-2.5 text-xs font-bold text-white hover:bg-[#214bc2] disabled:cursor-not-allowed disabled:opacity-60 transition-all shadow-[0_2px_4px_rgba(43,88,218,0.2)] active:scale-95"
                  >
                    {submitting ? 'Submitting...' : 'Submit response'}
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    disabled={currentFlatIndex === -1}
                    className="flex items-center gap-2 rounded-xl border border-transparent bg-[#eef3ff] px-6 py-2.5 text-xs font-bold text-[#3b5ab5] hover:bg-[#e0e8ff] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 transition-all active:scale-95"
                  >
                    {nextButtonLabel}
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </section>

            <aside className="hidden h-fit rounded-xl border border-[#dce2ec] bg-[#f7f9fd] p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)] lg:block">
              <p className="mb-2 text-center text-[13px] font-bold uppercase tracking-wide text-black">
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
                          ? item.selectedClass
                          : `border-[#e0e6ef] bg-white text-[#607086] disabled:cursor-not-allowed disabled:opacity-60 ${!activeQuestionId ? '' : item.hoverClass}`
                      }`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-semibold ${isSelected ? 'border-current bg-white/60' : `border-[#dce2ec] bg-white ${item.colorText}`}`}>
                        {item.value}
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </main>

      {/* Floating Bottom Scale for Mobile */}
      {activeQuestionId && (
        <div className="fixed bottom-0 left-0 right-0 z-40 block border-t border-[#dce2ec] bg-white p-4 shadow-[0_-4px_12px_rgba(16,24,40,0.08)] lg:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-2 overflow-x-auto pb-1">
            {SCALE.map((item) => {
              const isSelected = answers[activeQuestionId] === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, [activeQuestionId]: item.value }))}
                  className={`flex flex-col items-center gap-1.5 shrink-0 px-2 py-1 transition-all ${isSelected ? 'scale-110' : 'opacity-60'}`}
                >
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold shadow-sm ${isSelected ? 'border-[#3b5ab5] bg-[#3b5ab5] text-white' : `border-[#dce2ec] bg-white ${item.colorText}`}`}>
                    {item.value}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-tight ${isSelected ? 'text-[#3b5ab5]' : 'text-gray-400'}`}>
                    {item.label.split(' ')[item.label.split(' ').length - 1]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/50 p-4 transition-opacity backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-[#f4f6fb] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#dce2ec] bg-white px-6 py-4 rounded-t-xl">
              <h2 className="text-lg font-bold text-[#1f2937]">Pending Questions ({pendingQuestionsList.length})</h2>
              <button type="button" onClick={() => setShowPendingModal(false)} className="text-[#64748b] hover:text-[#1f2937] text-2xl leading-none">
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {pendingQuestionsList.map((pq) => (
                <button
                  key={pq.qId}
                  type="button"
                  onClick={() => {
                    setActivePillarIndex(pq.pIndex);
                    setActiveSectionIndex(pq.sIndex);
                    setActiveQuestionId(pq.qId);
                    setOpenPillars(prev => ({ ...prev, [pillars[pq.pIndex]._id]: true }));
                    setShowPendingModal(false);
                  }}
                  className="w-full rounded-xl border border-[#e0e6ef] bg-white px-4 py-3 text-left transition-colors hover:border-[#cad3e2] shadow-sm flex flex-col gap-2 group focus:outline-none focus:ring-2 focus:ring-[#cdd8ef]"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#5d67d3]">
                    {pq.pillarName} - {pq.sectionName}
                  </p>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#dce2ec] bg-white text-xs font-semibold text-[#49576b] group-hover:border-[#cad3e2] transition-colors">
                      {pq.qIndex + 1}
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold leading-snug text-[#253246] group-hover:text-[#3b5ab5] transition-colors">{pq.text}</p>
                      <p className="mt-1 text-xs text-[#8c99ac]">Not answered yet</p>
                    </div>
                  </div>
                </button>
              ))}
              {pendingQuestionsList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-[#64748b]">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-4" />
                  <p className="text-lg font-medium text-[#1f2937]">All caught up!</p>
                  <p className="text-sm">You have answered all available questions.</p>
                </div>
              )}
            </div>
            <div className="border-t border-[#dce2ec] bg-white p-4 rounded-b-xl flex justify-end">
              <button 
                type="button"
                onClick={() => setShowPendingModal(false)}
                className="rounded-lg border border-[#dce2ec] bg-white px-5 py-2 text-sm font-semibold text-[#49576b] hover:bg-[#f8fafc] transition-colors"
              >
                Close list
              </button>
            </div>
          </div>
        </div>
      )}

      {showSolvedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/50 p-4 transition-opacity backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-[#f4f6fb] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#dce2ec] bg-white px-6 py-4 rounded-t-xl">
              <h2 className="text-lg font-bold text-[#1f2937]">Solved Questions ({solvedQuestionsList.length})</h2>
              <button type="button" onClick={() => setShowSolvedModal(false)} className="text-[#64748b] hover:text-[#1f2937] text-2xl leading-none">
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {solvedQuestionsList.map((sq) => {
                const value = answers[sq.qId];
                return (
                  <button
                    key={sq.qId}
                    type="button"
                    onClick={() => {
                      setActivePillarIndex(sq.pIndex);
                      setActiveSectionIndex(sq.sIndex);
                      setActiveQuestionId(sq.qId);
                      setOpenPillars(prev => ({ ...prev, [pillars[sq.pIndex]._id]: true }));
                      setShowSolvedModal(false);
                    }}
                    className="w-full rounded-xl border border-[#e0e6ef] bg-white px-4 py-3 text-left transition-colors hover:border-[#cad3e2] shadow-sm flex flex-col gap-2 group focus:outline-none focus:ring-2 focus:ring-[#cdd8ef]"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-[#1a8b4a]">
                      {sq.pillarName} - {sq.sectionName}
                    </p>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#dce2ec] bg-[#f2fbf4] text-xs font-semibold text-[#1a8b4a] group-hover:border-[#d9eede] transition-colors">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-semibold leading-snug text-[#253246] group-hover:text-[#3b5ab5] transition-colors">{sq.text}</p>
                        <p className="mt-1 text-xs text-[#1a8b4a] font-medium">
                          Answered: {SCALE[value - 1]?.label || ''}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
              {solvedQuestionsList.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-[#64748b]">
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <p className="text-3xl">📝</p>
                  </div>
                  <p className="text-lg font-medium text-[#1f2937]">No questions solved yet</p>
                  <p className="text-sm">Answer a question to see it here!</p>
                </div>
              )}
            </div>
            <div className="border-t border-[#dce2ec] bg-white p-4 rounded-b-xl flex justify-end">
              <button 
                type="button"
                onClick={() => setShowSolvedModal(false)}
                className="rounded-lg border border-[#dce2ec] bg-white px-5 py-2 text-sm font-semibold text-[#49576b] hover:bg-[#f8fafc] transition-colors"
              >
                Close list
              </button>
            </div>
          </div>
        </div>
      )}

      {showSidebarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#101828]/50 p-4 transition-opacity backdrop-blur-sm lg:hidden">
          <div className="flex max-h-[90vh] w-full max-w-sm flex-col rounded-xl bg-[#f4f6fb] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#dce2ec] bg-white px-6 py-4 rounded-t-xl">
              <h2 className="text-lg font-bold text-[#1f2937]">QUESTIONS</h2>
              <button type="button" onClick={() => setShowSidebarModal(false)} className="text-[#64748b] hover:text-[#1f2937] text-2xl leading-none">
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
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
                      <span className={`h-4 w-4 text-center leading-4 text-[#64748b] transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="space-y-1 border-t border-[#edf1f7] p-1.5">
                        {(pillar.sections || []).map((section, sIndex) => {
                          const active = pIndex === activePillarIndex && sIndex === activeSectionIndex;
                          const sectionQuestions = section.questions || [];
                          const isCompleted = sectionQuestions.length > 0 && sectionQuestions.every(q => typeof answers[q._id] === 'number');
                          return (
                            <button
                              key={section._id}
                              type="button"
                              onClick={() => {
                                setActivePillarIndex(pIndex);
                                setActiveSectionIndex(sIndex);
                                setActiveQuestionId(null);
                                setShowSidebarModal(false);
                              }}
                              className={`w-full rounded px-2 py-1.5 text-left text-[11px] flex justify-between items-start gap-2 ${active ? 'bg-[#eef3ff] text-[#3b5ab5] ring-1 ring-[#d4def7]' : 'text-[#546174]'}`}
                            >
                              <p className="font-semibold">{section.name}</p>
                              {isCompleted && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
