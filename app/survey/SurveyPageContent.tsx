'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { companyAPI, responseAPI, questionPaperAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';

type NumericRating = 1 | 2 | 3 | 4 | 5;

interface Section {
  id: string;
  name: string;
  pillarName: string;
}

interface Question {
  id: string;
  text: string;
  sectionId: string;
}

interface PillarNavGroup {
  name: string;
  sections: { section: Section; questions: Question[] }[];
}

// Types for the question paper response payload (untyped from backend).
interface RawQuestion {
  _id: unknown;
  text: string;
}
interface RawSection {
  _id: unknown;
  name: string;
  questions?: RawQuestion[];
}
interface RawPillar {
  name: string;
  sections?: RawSection[];
}

interface Company {
  _id: string;
  name: string;
  departments?: string[];
}

const TOTAL_TIME_SECONDS = 30 * 60; // 30 minutes

const numericToLetterRating = (value: NumericRating): 'A' | 'B' | 'C' | 'D' | 'E' => {
  // Keep internal scoring consistent where A is highest (5) and E is lowest (1)
  const map: Record<NumericRating, 'A' | 'B' | 'C' | 'D' | 'E'> = {
    5: 'A',
    4: 'B',
    3: 'C',
    2: 'D',
    1: 'E',
  };
  return map[value];
};

const RATING_LABELS: Record<NumericRating, string> = {
  1: 'Strongly Disagree',
  2: 'Disagree',
  3: 'Neutral',
  4: 'Agree',
  5: 'Strongly Agree',
};

export default function SurveyPageContent() {
  const searchParams = useSearchParams();
  const initialCompanyId = searchParams.get('companyId') || '';
  const initialEmployeeEmail = (searchParams.get('employeeEmail') || '').trim().toLowerCase();
  const validatedEmployeeEmail =
    initialEmployeeEmail && initialEmployeeEmail.includes('@') && initialEmployeeEmail.includes('.')
      ? initialEmployeeEmail
      : '';
  const sessionStorageKey = useMemo(() => {
    if (!initialCompanyId) return null;
    return `ohd_exam_session:${initialCompanyId}`;
  }, [initialCompanyId]);

  const [company, setCompany] = useState<Company | null>(null);
  const [respondentEmail, setRespondentEmail] = useState<string>(validatedEmployeeEmail);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  /** One question at a time may be selected for scoring via the right-hand scale. */
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<string, NumericRating>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [timeOver, setTimeOver] = useState(false);
  const [submissionReason, setSubmissionReason] = useState<'manual' | 'timeout' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const [department, setDepartment] = useState<string | null>(null);
  const [departmentChoice, setDepartmentChoice] = useState('');
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [examNavOpen, setExamNavOpen] = useState(false);
  /** Accordion: which pillar groups are expanded in the question paper nav */
  const [expandedPillarNames, setExpandedPillarNames] = useState<Set<string>>(() => new Set());
  const requiresEmailInput = !validatedEmployeeEmail;

  const availableDepartments = useMemo(
    () => (company?.departments || []).map((d) => d.trim()).filter(Boolean),
    [company?.departments],
  );

  const timeoutHandledRef = useRef(false);
  const submitHandledRef = useRef(false);
  const startedRef = useRef(started);
  const sessionStartedAtRef = useRef<number | null>(null);
  const handleSubmitRef = useRef<((reason: 'manual' | 'timeout') => Promise<void>) | null>(null);
  /** After questions load, apply section index from persisted session once. */
  const pendingNavRestoreRef = useRef<{ sectionIndex: number } | null>(null);

  const persistSessionUpdate = useCallback(
    (patch: Record<string, unknown>) => {
      if (!sessionStorageKey) return;
      if (typeof window === 'undefined') return;
      try {
        const raw = window.localStorage.getItem(sessionStorageKey);
        const base = raw ? JSON.parse(raw) : {};
        window.localStorage.setItem(sessionStorageKey, JSON.stringify({ ...base, ...patch }));
      } catch {
        // ignore localStorage failures
      }
    },
    [sessionStorageKey],
  );

  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  const currentSection = sections[currentSectionIndex];
  const currentSectionQuestions = useMemo(
    () => questions.filter((q) => q.sectionId === currentSection?.id),
    [questions, currentSection],
  );

  /** Pillar → sections → questions, preserving API order. */
  const pillarNav = useMemo((): PillarNavGroup[] => {
    const byPillar = new Map<string, { section: Section; questions: Question[] }[]>();
    const pillarOrder: string[] = [];
    for (const section of sections) {
      if (!byPillar.has(section.pillarName)) {
        byPillar.set(section.pillarName, []);
        pillarOrder.push(section.pillarName);
      }
      const qs = questions.filter((q) => q.sectionId === section.id);
      byPillar.get(section.pillarName)!.push({ section, questions: qs });
    }
    return pillarOrder.map((name) => ({ name, sections: byPillar.get(name)! }));
  }, [sections, questions]);

  const isLastSectionInPillar = useMemo(() => {
    if (!currentSection || sections.length === 0) return false;
    const next = sections[currentSectionIndex + 1];
    return !next || next.pillarName !== currentSection.pillarName;
  }, [currentSection, currentSectionIndex, sections]);

  const isLastSectionOverall = currentSectionIndex >= sections.length - 1;

  const globalNumByQuestionId = useMemo(() => {
    const m = new Map<string, number>();
    let n = 1;
    for (const s of sections) {
      for (const q of questions.filter((x) => x.sectionId === s.id)) {
        m.set(q.id, n++);
      }
    }
    return m;
  }, [sections, questions]);

  const navigateToSection = (sectionIndex: number) => {
    if (sectionIndex < 0 || sectionIndex >= sections.length) return;
    setCurrentSectionIndex(sectionIndex);
    setSelectedQuestionId(null);
    setExamNavOpen(false);
  };

  const togglePillarExpanded = (pillarName: string) => {
    setExpandedPillarNames((prev) => {
      const next = new Set(prev);
      if (next.has(pillarName)) next.delete(pillarName);
      else next.add(pillarName);
      return next;
    });
  };

  useEffect(() => {
    if (sections.length === 0) return;
    const sec = sections[currentSectionIndex];
    if (!sec?.pillarName) return;
    setExpandedPillarNames((prev) => {
      const next = new Set(prev);
      next.add(sec.pillarName);
      return next;
    });
  }, [currentSectionIndex, sections]);

  // Load company
  useEffect(() => {
    if (!initialCompanyId) {
      setLoadingMeta(false);
      return;
    }
    const loadMeta = async () => {
      try {
        // Use public, unauthenticated endpoint so survey
        // participants are not forced to the admin login page.
        const companyRes = await companyAPI.getPublicById(initialCompanyId);
        setCompany(companyRes.data.company || companyRes.data);
      } catch (error: unknown) {
        console.error('Failed to load metadata', error);
        const message = error instanceof Error ? error.message : 'Failed to load metadata';
        toast.error(message);
      } finally {
        setLoadingMeta(false);
      }
    };
    loadMeta();
  }, [initialCompanyId]);

  // Load published question set
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        setLoadingQuestions(true);
        const res = await questionPaperAPI.getPublished();
        const pillars = (res.data?.pillars || []) as RawPillar[];

        const newSections: Section[] = [];
        const newQuestions: Question[] = [];

        pillars.forEach((pillar) => {
          (pillar.sections || []).forEach((section) => {
            const sectionId = String(section._id);
            newSections.push({
              id: sectionId,
              name: section.name,
              pillarName: pillar.name,
            });
            (section.questions || []).forEach((q) => {
              newQuestions.push({
                id: String(q._id),
                text: q.text,
                sectionId,
              });
            });
          });
        });

        setSections(newSections);
        setQuestions(newQuestions);
      } catch (error: unknown) {
        console.error('Failed to load questions', error);
        const message =
          error instanceof Error ? error.message : 'Failed to load questions';
        toast.error(message);
      } finally {
        setLoadingQuestions(false);
      }
    };

    loadQuestions();
  }, []);

  // Timer
  useEffect(() => {
    if (!sessionStorageKey) return;
    if (typeof window === 'undefined') return;
    if (sessionStartedAt !== null) return; // initialize once

    const persistedRaw = window.localStorage.getItem(sessionStorageKey);
    if (!persistedRaw) return;

    try {
      const payload = JSON.parse(persistedRaw) as {
        startedAt?: number;
        startedByUser?: boolean;
        submittedAt?: number;
        submissionReason?: 'manual' | 'timeout';
        department?: string;
        ratings?: Record<string, NumericRating>;
        currentSectionIndex?: number;
        currentQuestionIndex?: number;
      };

      if (payload.submittedAt) {
        setIsSubmitted(true);
        const reason = payload.submissionReason || 'manual';
        setSubmissionReason(reason);
        if (reason === 'timeout') setTimeOver(true);
        // No timer needed once submitted.
        setTimeLeft(0);
        return;
      }

      if (payload.startedByUser === true) {
        setStarted(true);
        startedRef.current = true;

        if (typeof payload.department === 'string' && payload.department.trim()) {
          setDepartment(payload.department);
        }
        if (payload.ratings && typeof payload.ratings === 'object') {
          setRatings(payload.ratings);
        }
        pendingNavRestoreRef.current = {
          sectionIndex:
            typeof payload.currentSectionIndex === 'number' ? payload.currentSectionIndex : 0,
        };

        // 30-minute exam clock starts only once `startedAt` exists (set after questions load).
        if (typeof payload.startedAt === 'number') {
          const startedAt = payload.startedAt;
          setSessionStartedAt(startedAt);
          sessionStartedAtRef.current = startedAt;

          const now = Date.now();
          const elapsedSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
          const remaining = TOTAL_TIME_SECONDS - elapsedSeconds;
          setTimeLeft(Math.max(0, remaining));

          if (remaining <= 0) {
            setTimeOver(true);
          }
        }
      } else {
        if (typeof payload.startedAt === 'number') {
          // Backward compatibility: older localStorage entries might not mark that
          // the user actually clicked "Start exam". Ignore/reset them.
          window.localStorage.removeItem(sessionStorageKey);
        } else if (typeof payload.department === 'string' && payload.department.trim()) {
          setDepartment(payload.department);
        }
      }
    } catch {
      // If storage is corrupted, reset it.
      window.localStorage.removeItem(sessionStorageKey);
    }
  }, [sessionStorageKey, sessionStartedAt]);

  // Begin the 30-minute exam window only after the question paper is ready (not during fetch).
  useEffect(() => {
    if (!started) return;
    if (loadingQuestions) return;
    if (questions.length === 0) return;
    if (sessionStartedAt !== null) return;
    if (isSubmitted || timeOver) return;
    if (!sessionStorageKey) return;

    const now = Date.now();
    timeoutHandledRef.current = false;
    submitHandledRef.current = false;
    sessionStartedAtRef.current = now;
    setSessionStartedAt(now);
    setTimeOver(false);
    setTimeLeft(TOTAL_TIME_SECONDS);

    persistSessionUpdate({
      startedAt: now,
      startedByUser: true,
      department: department ?? undefined,
      ratings,
      currentSectionIndex,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot initial session; omit ratings/currentSectionIndex
  }, [
    started,
    loadingQuestions,
    questions.length,
    sessionStartedAt,
    isSubmitted,
    timeOver,
    sessionStorageKey,
    department,
    persistSessionUpdate,
  ]);

  // Apply persisted question position once the paper is loaded (back/refresh safe).
  useEffect(() => {
    const pending = pendingNavRestoreRef.current;
    if (!pending || sections.length === 0 || questions.length === 0) return;
    pendingNavRestoreRef.current = null;

    const safeSi = Math.max(0, Math.min(pending.sectionIndex, sections.length - 1));
    setCurrentSectionIndex(safeSi);
    setSelectedQuestionId(null);
  }, [sections, questions]);

  // Short "start window" after dispatch is enforced only on `/survey/start` (email link gate), not here.

  useEffect(() => {
    if (!sessionStartedAt) return;
    if (isSubmitted || timeOver) return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.max(0, Math.floor((now - sessionStartedAt) / 1000));
      const remaining = TOTAL_TIME_SECONDS - elapsedSeconds;
      const nextTimeLeft = Math.max(0, remaining);
      setTimeLeft(nextTimeLeft);

      if (nextTimeLeft <= 0 && !timeoutHandledRef.current) {
        timeoutHandledRef.current = true;
        setTimeOver(true);

        // Only auto-submit if the user already started answering.
        if (startedRef.current) {
          void handleSubmitRef.current?.('timeout');
        }
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [sessionStartedAt, isSubmitted, timeOver]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRating = (questionId: string, rating: NumericRating) => {
    setRatings((prev) => ({ ...prev, [questionId]: rating }));
  };

  const handleScalePick = (rating: NumericRating) => {
    if (!selectedQuestionId) return;
    handleRating(selectedQuestionId, rating);
  };

  const handlePreviousSection = () => {
    if (currentSectionIndex > 0) {
      setCurrentSectionIndex((prev) => prev - 1);
      setSelectedQuestionId(null);
    }
  };

  // Persist answers and place in exam so leaving the page does not lose progress or shrink the 30 min window.
  useEffect(() => {
    if (!sessionStorageKey || !started || isSubmitted || timeOver) return;
    persistSessionUpdate({
      ratings,
      currentSectionIndex,
      ...(department ? { department } : {}),
    });
  }, [
    ratings,
    currentSectionIndex,
    department,
    sessionStorageKey,
    started,
    isSubmitted,
    timeOver,
    persistSessionUpdate,
  ]);

  const handleSubmit = async (reason: 'manual' | 'timeout' = 'manual') => {
    if (!company) return;
    if (submitHandledRef.current) return;
    submitHandledRef.current = true;
    setSubmitting(true);
    try {
      const answers = Object.entries(ratings).map(([questionId, rating]) => ({
        questionId,
        rating: numericToLetterRating(rating),
      }));
      await responseAPI.submit({
        companyId: company._id,
        employeeEmail: respondentEmail || undefined,
        answers,
        department: department || undefined,
        service: 'Organizational Health Diagnostic',
        startedAt: sessionStartedAt ?? Date.now(),
      });

      setIsSubmitted(true);
      setSubmissionReason(reason);

      persistSessionUpdate({
        submittedAt: Date.now(),
        submissionReason: reason,
      });

      if (reason === 'manual') {
        toast.success('Survey submitted successfully!');
      }
    } catch (error: unknown) {
      console.error('Failed to submit survey', error);
      const message = error instanceof Error ? error.message : 'Failed to submit survey';
      toast.error(message);
      // Allow retry if the submit failed (e.g. network error).
      submitHandledRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  // Keep an up-to-date reference for the interval callback without re-registering effects.
  handleSubmitRef.current = handleSubmit;

  const progress = useMemo(() => {
    const totalQuestions = questions.length;
    if (totalQuestions === 0) return 0;
    const answeredQuestions = Object.keys(ratings).length;
    return (answeredQuestions / totalQuestions) * 100;
  }, [ratings, questions]);

  const { solvedCount, pendingCount } = useMemo(() => {
    const total = questions.length;
    const solved = Object.keys(ratings).length;
    return { solvedCount: solved, pendingCount: Math.max(0, total - solved) };
  }, [ratings, questions]);

  const sectionAnsweredCount = useMemo(
    () => currentSectionQuestions.filter((q) => !!ratings[q.id]).length,
    [currentSectionQuestions, ratings],
  );

  const allQuestionsAnsweredGlobally = useMemo(
    () => questions.length > 0 && questions.every((q) => ratings[q.id]),
    [questions, ratings],
  );

  if (loadingMeta) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading survey...</p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invalid Survey Link</h1>
          <p className="text-gray-600">Please check your survey link and try again.</p>
        </div>
      </div>
    );
  }

  if (timeOver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Time Over</h1>
          <p className="text-gray-600 mb-6">
            {started ? 'Your 30-minute time limit has ended.' : 'Your time to start has ended.'}
            {started && submissionReason === 'timeout'
              ? ' Your responses were submitted automatically.'
              : ''}
          </p>
          <div className="text-sm text-gray-500">
            <p>Company: {company.name}</p>
            <p>Questions answered: {Object.keys(ratings).length}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Thank You!</h1>
          <p className="text-gray-600 mb-6">Your survey responses have been submitted successfully.</p>
          <div className="text-sm text-gray-500">
            <p>Company: {company.name}</p>
            <p>Questions answered: {Object.keys(ratings).length}</p>
          </div>
        </div>
      </div>
    );
  }

  // Step 1: Choose department (only before the exam has started; after Start, back/refresh skips this)
  if (company && department === null && !started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <p className="text-sm text-gray-600">
              The 30-minute exam timer starts after you click &quot;Start exam&quot; and your questions have
              finished loading.
            </p>
          </div>
          <div className="text-center mb-6">
            <Image src="/ohdlogo.png" alt="OHD Logo" width={80} height={80} className="mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Organizational Health Diagnostic</h1>
            <p className="text-gray-600">{company.name}</p>
          </div>
          {requiresEmailInput && (
            <>
              <p className="text-sm font-medium text-gray-700 mb-3">Enter your email</p>
              <input
                type="email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-6"
                value={respondentEmail}
                onChange={(e) => setRespondentEmail(e.target.value.trim().toLowerCase())}
                placeholder="name@example.com"
                autoComplete="email"
              />
            </>
          )}
          <p className="text-sm font-medium text-gray-700 mb-3">Choose your department</p>
          {availableDepartments.length > 0 ? (
            <select
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-6"
              onChange={(e) => setDepartmentChoice(e.target.value)}
              value={departmentChoice}
            >
              <option value="">Select department...</option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-6"
              value={departmentChoice}
              onChange={(e) => setDepartmentChoice(e.target.value)}
              placeholder="Enter your department"
            />
          )}
          <button
            onClick={() => {
              if (requiresEmailInput) {
                const email = respondentEmail.trim().toLowerCase();
                const ok = email.includes('@') && email.includes('.');
                if (!ok) {
                  toast.error('Please enter a valid email');
                  return;
                }
              }
              const value = departmentChoice.trim();
              if (value) {
                setDepartment(value);
                persistSessionUpdate({ department: value });
              } else {
                toast.error('Please select your department');
              }
            }}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Continue to exam
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <Image src="/ohdlogo.png" alt="Logo" width={80} height={80} className="mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Organizational Health Diagnostic</h1>
            <p className="text-gray-600">{company.name}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Survey Instructions</h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• This survey takes approximately 30 minutes</li>
              <li>• Please answer all questions honestly</li>
              <li>• Your responses are confidential</li>
              <li>• Timer starts when questions are ready (after you click Start exam)</li>
            </ul>
          </div>

          <button
            onClick={() => {
              timeoutHandledRef.current = false;
              submitHandledRef.current = false;
              startedRef.current = true;
              setStarted(true);
              setTimeOver(false);

              // Exam clock (`startedAt`) is set in an effect once questions are loaded — not during loading.
              persistSessionUpdate({
                startedByUser: true,
                department: department ?? undefined,
                ratings,
                currentSectionIndex,
              });
            }}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Start exam
          </button>
        </div>
      </div>
    );
  }

  const examNavBody = (
    <nav className="flex flex-col" aria-label="Pillars and sections">
      {pillarNav.map((pillar) => {
        const isOpen = expandedPillarNames.has(pillar.name);
        return (
          <div key={pillar.name} className="border-b border-slate-200/90 last:border-b-0">
            <button
              type="button"
              onClick={() => togglePillarExpanded(pillar.name)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-slate-800 transition-colors hover:bg-slate-50"
              aria-expanded={isOpen}
            >
              <span className="shrink-0 text-slate-500" aria-hidden>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </span>
              <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug tracking-wide">
                {pillar.name}
              </span>
              <svg
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-out ${
                  isOpen ? 'rotate-90' : ''
                }`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {isOpen ? (
              <ul className="relative mx-2 mb-2 ml-3 space-y-0.5 border-l border-indigo-300/90 pl-3">
                {pillar.sections.map(({ section, questions: secQs }) => {
                  const sIdx = sections.findIndex((s) => s.id === section.id);
                  if (sIdx < 0) return null;
                  const nAnswered = secQs.filter((q) => ratings[q.id]).length;
                  const isActive = sIdx === currentSectionIndex;
                  const complete = secQs.length > 0 && nAnswered === secQs.length;
                  return (
                    <li key={section.id}>
                      <button
                        type="button"
                        onClick={() => navigateToSection(sIdx)}
                        className={`w-full rounded-md py-2 pl-1 pr-2 text-left transition-colors ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200/80'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <span className="block text-[12px] font-medium leading-snug line-clamp-3">
                          {section.name}
                        </span>
                        <span className="mt-1 flex items-center gap-1.5 text-[10px] tabular-nums text-slate-400">
                          {complete ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                          ) : null}
                          {nAnswered}/{secQs.length} answered
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  const handlePrimarySectionAction = () => {
    const unansweredInSection = currentSectionQuestions.filter((q) => !ratings[q.id]);
    if (unansweredInSection.length > 0) {
      toast.error(
        `Please answer all questions in this section (${unansweredInSection.length} remaining)`,
      );
      return;
    }
    if (isLastSectionOverall) {
      const missing = questions.filter((q) => !ratings[q.id]);
      if (missing.length > 0) {
        toast.error(
          `Answer every question in the exam before submitting (${missing.length} still open in other sections).`,
        );
        return;
      }
      void handleSubmit('manual');
      return;
    }
    setCurrentSectionIndex((prev) => prev + 1);
    setSelectedQuestionId(null);
  };

  const primaryButtonLabel = isLastSectionOverall
    ? submitting
      ? 'Submitting...'
      : 'Submit exam'
    : isLastSectionInPillar
      ? 'Next pillar'
      : 'Next section';

  const selectedGlobalNum = selectedQuestionId
    ? globalNumByQuestionId.get(selectedQuestionId)
    : undefined;

  const ratingScaleButtons = (layout: 'vertical' | 'horizontal') => {
    const row = ([1, 2, 3, 4, 5] as const).map((rating) => {
      const active = !!selectedQuestionId && ratings[selectedQuestionId] === rating;
      const disabled = !selectedQuestionId;
      if (layout === 'vertical') {
        return (
          <button
            key={rating}
            type="button"
            disabled={disabled}
            onClick={() => handleScalePick(rating)}
            title={RATING_LABELS[rating]}
            className={`group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-all ${
              disabled
                ? 'cursor-not-allowed opacity-40'
                : active
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors ${
                disabled
                  ? 'border border-slate-200 bg-slate-100 text-slate-400'
                  : active
                    ? 'bg-white text-slate-900'
                    : 'border border-slate-300 bg-white text-slate-800 group-hover:border-slate-400'
              }`}
            >
              {rating}
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">
              {RATING_LABELS[rating]}
            </span>
          </button>
        );
      }
      return (
        <button
          key={rating}
          type="button"
          disabled={disabled}
          onClick={() => handleScalePick(rating)}
          aria-label={RATING_LABELS[rating]}
          title={RATING_LABELS[rating]}
          className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 transition-all ${
            disabled
              ? 'cursor-not-allowed opacity-35'
              : active
                ? 'bg-slate-900 text-white shadow-md'
                : 'bg-slate-50 text-slate-700 ring-1 ring-slate-200/80 hover:bg-slate-100'
          }`}
        >
          <span className="text-sm font-bold tabular-nums">{rating}</span>
          <span className="max-w-[3.25rem] text-center text-[8px] font-medium uppercase leading-tight tracking-wide text-current opacity-80">
            {rating === 1
              ? 'Str. disagree'
              : rating === 2
                ? 'Disagree'
                : rating === 3
                  ? 'Neutral'
                  : rating === 4
                    ? 'Agree'
                    : 'Str. agree'}
          </span>
        </button>
      );
    });

    if (layout === 'vertical') {
      return (
        <div className="flex flex-col gap-1 rounded-xl bg-slate-50/90 p-1.5 ring-1 ring-slate-200/60">
          {row}
        </div>
      );
    }
    return <div className="grid grid-cols-5 gap-1.5">{row}</div>;
  };

  const examClockActive = sessionStartedAt !== null;
  const displayExamSeconds = examClockActive ? timeLeft : TOTAL_TIME_SECONDS;
  const timerClass =
    !examClockActive
      ? 'text-slate-400'
      : timeLeft < 300
        ? 'text-red-600'
        : 'text-slate-700';

  const headerControls = (
    <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-2.5 shrink-0">
      <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <div className="text-center min-w-[3.25rem]">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Solved</p>
          <p className="text-base font-bold tabular-nums text-emerald-700 leading-none">{solvedCount}</p>
        </div>
        <div className="h-7 w-px bg-slate-200" />
        <div className="text-center min-w-[3.25rem]">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Pending</p>
          <p className="text-base font-bold tabular-nums text-amber-700 leading-none">{pendingCount}</p>
        </div>
      </div>

      <div
        className={`flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-xs sm:text-sm font-semibold tabular-nums ${timerClass}`}
        title={examClockActive ? undefined : 'Timer starts when questions finish loading'}
      >
        <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {formatTime(displayExamSeconds)}
      </div>

      <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-600">
        <span className="text-slate-400">Progress</span>
        <span className="font-semibold tabular-nums">{Math.round(progress)}%</span>
      </div>

      <button
        type="button"
        onClick={() => setExamNavOpen(true)}
        className="lg:hidden rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
      >
        Sections
      </button>
    </div>
  );

  const headerProgressRow = (className = '') => (
    <div className={`flex items-center gap-2 sm:gap-3 ${className}`}>
      <div className="flex-1 h-1 sm:h-1.5 rounded-full bg-slate-200 overflow-hidden min-w-0">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <span
        className={`sm:hidden text-[10px] font-mono w-10 text-right tabular-nums shrink-0 ${timerClass}`}
        title={examClockActive ? undefined : 'Timer starts when questions finish loading'}
      >
        {formatTime(displayExamSeconds)}
      </span>
    </div>
  );

  return (
    <div className="flex flex-col min-h-dvh lg:h-dvh lg:max-h-dvh lg:overflow-hidden bg-[#f0f2f7]">
      <header className="sticky top-0 z-40 shrink-0 flex flex-col border-b border-slate-200 bg-white shadow-sm">
        {/* Mobile / tablet: logo + company + controls (no sidebar column) */}
        <div className="flex flex-col gap-0 lg:hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 min-h-[3.25rem]">
            <div className="flex items-center gap-2.5 min-w-0">
              <Image
                src="/ohdlogo.png"
                alt="OHD"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 object-contain"
              />
              <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">{company.name}</h1>
            </div>
            {headerControls}
          </div>
          {headerProgressRow('px-3 pb-2')}
          <div className="flex sm:hidden justify-center gap-4 text-[10px] pb-2 -mt-0.5">
            <span className="tabular-nums">
              <span className="text-slate-500">Solved </span>
              <span className="font-bold text-emerald-700">{solvedCount}</span>
            </span>
            <span className="tabular-nums">
              <span className="text-slate-500">Pending </span>
              <span className="font-bold text-amber-700">{pendingCount}</span>
            </span>
          </div>
        </div>

        {/* Desktop: OHD logo (no extra frame) spans full header height; no divider lines under logo */}
        <div className="hidden lg:grid lg:min-h-0 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:grid-rows-[auto_auto]">
          <div className="row-span-2 flex items-center justify-center border-r border-slate-200 bg-white px-4 py-4">
            <Image
              src="/ohdlogo.png"
              alt="OHD"
              width={48}
              height={48}
              className="h-12 w-auto max-w-[10rem] object-contain"
            />
          </div>
          <div className="flex min-w-0 items-center justify-between gap-4 px-5 py-3">
            <h1 className="text-lg font-semibold text-slate-900 truncate tracking-tight min-w-0">
              {company.name}
            </h1>
            {headerControls}
          </div>
          <div className="min-w-0 px-5 pb-3 pt-0">{headerProgressRow('')}</div>
        </div>
      </header>

      {examNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close sections"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setExamNavOpen(false)}
          />
          <div className="absolute right-0 top-0 bottom-0 flex w-[min(100%,22rem)] flex-col bg-white shadow-xl border-l border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
              <span className="text-sm font-semibold tracking-wide text-slate-800">Pillars &amp; sections</span>
              <button
                type="button"
                onClick={() => setExamNavOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none py-2">{examNavBody}</div>
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col min-h-0 lg:overflow-hidden">
        {loadingQuestions ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent mx-auto mb-4" />
              <p className="text-slate-600 font-medium">Loading your question paper…</p>
            </div>
          </div>
        ) : currentSectionQuestions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="text-center py-12 px-6 rounded-xl border border-slate-200 bg-white shadow-sm max-w-md">
              <p className="text-slate-600">No questions in this section.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col min-h-0 lg:flex-row lg:overflow-hidden">
            <aside className="hidden lg:flex w-[17.5rem] shrink-0 flex-col min-h-0 border-r border-slate-200 bg-white text-slate-800">
              <div className="shrink-0 border-b border-slate-200 px-3 py-2.5">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Question paper
                </h2>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none px-0.5">{examNavBody}</div>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5 sm:py-4 pb-32 lg:pb-4">
              <article className="rounded-xl border border-slate-200/90 bg-white shadow-md overflow-hidden">
                <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50/40 via-white to-slate-50/30 px-4 py-4 sm:px-6 sm:py-5">
                  <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-[0.12em]">
                    {currentSection?.pillarName}
                  </p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
                      {currentSection?.name || 'Survey'}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                      <span className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 font-medium text-slate-600 tabular-nums shadow-sm">
                        Section progress: {sectionAnsweredCount} / {currentSectionQuestions.length}
                      </span>
                      <span className="rounded-lg bg-slate-900 text-white px-2.5 py-1 font-semibold tabular-nums shadow-sm">
                        {questions.length} questions total
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6">
                  <p className="text-sm text-slate-500 mb-4">
                    Tap a question to activate the rating scale on the right. Only one question is active
                    at a time.
                  </p>

                  <ul className="space-y-3">
                    {currentSectionQuestions.map((q) => {
                      const gNum = globalNumByQuestionId.get(q.id) ?? 0;
                      const isSelected = selectedQuestionId === q.id;
                      const answered = !!ratings[q.id];
                      return (
                        <li key={q.id}>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedQuestionId((prev) => (prev === q.id ? null : q.id))
                            }
                            className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-all ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-2 ring-indigo-200/60'
                                : answered
                                  ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300'
                                  : 'border-slate-200 bg-slate-50/40 hover:border-slate-300 hover:bg-white'
                            }`}
                          >
                            <div className="flex gap-3">
                              <span
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold tabular-nums ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white'
                                    : answered
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-700'
                                }`}
                              >
                                {gNum}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[15px] sm:text-base font-medium text-slate-900 leading-snug">
                                  {q.text}
                                </p>
                                {answered ? (
                                  <p className="mt-2 text-xs font-medium text-emerald-700">
                                    Answered: {ratings[q.id]} — {RATING_LABELS[ratings[q.id]]}
                                  </p>
                                ) : (
                                  <p className="mt-2 text-xs text-slate-400">Not answered yet</p>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between sm:items-center pt-6 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handlePreviousSection}
                      disabled={currentSectionIndex === 0}
                      className="px-5 py-2.5 border border-slate-300 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
                    >
                      Previous section
                    </button>
                    <button
                      type="button"
                      onClick={handlePrimarySectionAction}
                      disabled={
                        submitting ||
                        (isLastSectionOverall && !allQuestionsAnsweredGlobally) ||
                        (!isLastSectionOverall &&
                          currentSectionQuestions.some((q) => !ratings[q.id]))
                      }
                      className={`px-6 py-2.5 rounded-xl font-semibold shadow-sm transition-colors ${
                        isLastSectionOverall
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {primaryButtonLabel}
                    </button>
                  </div>
                </div>
              </article>
              </div>

            <aside className="flex shrink-0 flex-col lg:w-[13.5rem] lg:min-h-0 lg:border-l lg:border-slate-200/90 lg:bg-slate-50/50">
              <div className="hidden lg:flex lg:flex-1 lg:flex-col lg:min-h-0 lg:overflow-y-auto lg:p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Your response
                </p>
                <p className="mt-1 text-base font-semibold text-slate-900 tabular-nums min-h-[1.5rem]">
                  {selectedQuestionId ? (
                    <>Question {selectedGlobalNum}</>
                  ) : (
                    <span className="text-sm font-normal text-slate-400">Select a question</span>
                  )}
                </p>
                <div className="mt-4">{ratingScaleButtons('vertical')}</div>
              </div>

              <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200/90 bg-white px-3 pt-2.5 pb-3 shadow-[0_-4px_24px_rgba(15,23,42,0.06)]">
                <div className="w-full max-w-lg mx-auto">
                  <p className="text-center text-[11px] text-slate-500 mb-2">
                    {selectedQuestionId ? (
                      <>
                        <span className="font-medium text-slate-700">Q {selectedGlobalNum}</span>
                        <span className="text-slate-400"> · choose a rating</span>
                      </>
                    ) : (
                      <span className="text-slate-400">Select a question to rate</span>
                    )}
                  </p>
                  {ratingScaleButtons('horizontal')}
                </div>
              </div>
            </aside>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
