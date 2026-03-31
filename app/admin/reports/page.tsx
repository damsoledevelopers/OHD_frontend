'use client';

import { Suspense, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { useSearchParams } from 'next/navigation';
import {
  companyAPI,
  reportAPI,
  responseAPI,
  questionPaperAPI,
} from '@/lib/apiClient';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { toPng } from 'html-to-image';

interface Company {
  _id: string;
  name: string;
}

interface QSection {
  _id: string;
  name: string;
  order?: number;
  questions?: Array<{
    _id: string;
    text: string;
    order?: number;
  }>;
}

interface QPillar {
  _id: string;
  name: string;
  order?: number;
  sections: QSection[];
}

interface OverallReport {
  overallPercentage: number;
  totalResponses: number;
  totalCompanies: number;
  bestSection?: {
    sectionName: string;
    percentage: number;
  } | null;
  summaryInsights?: string[];
  ratingDistributionPercentage?: { A: number; B: number; C: number; D: number; E: number };
  ratingDistribution?: { A: number; B: number; C: number; D: number; E: number };
  benchmark?: {
    band: string;
    healthStatus: string;
    colorCode: string;
    colorHex: string;
    minScore: number;
  };
}

interface QuestionStat {
  questionId: string;
  questionText: string;
  ratingCount: { A: number; B: number; C: number; D: number; E: number };
  ratingPercentage: { A: number; B: number; C: number; D: number; E: number };
  totalResponses: number;
}

interface SectionStat {
  sectionId: string;
  sectionName: string;
  questionStats: QuestionStat[];
  sectionPercentage: number;
  totalResponses: number;
}

interface CompanySummary {
  companyId: string;
  totalInvited: number;
  completedCount: number;
  pendingCount: number;
  completedEmails: string[];
  completedUsers?: string[];
  pendingEmails: string[];
  invitedEmails?: string[];
  departments?: string[];
  departmentBreakdown: Record<string, { responses: number }>;
  totalResponses: number;
}

interface EmployeeResponseLite {
  employeeEmail?: string;
  employeeName?: string;
}

function isValidEmail(raw: string | undefined | null): boolean {
  const s = String(raw ?? '').trim().toLowerCase();
  // UI-level guard: show only values that look like real emails.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

const PIE_COLORS = ['#059669', '#4338CA', '#FBBF24', '#F97316', '#DC2626'];

/** Matches manual Excel report: columns SD, D, N, A, SA (storage uses E,D,C,B,A). */
function ratingCountToLikert(rc: QuestionStat['ratingCount']) {
  return {
    SD: rc.E,
    D: rc.D,
    N: rc.C,
    A: rc.B,
    SA: rc.A,
  };
}

const LIKERT_CHART_COLORS = {
  SD: '#93c5fd',
  D: '#f97316',
  N: '#94a3b8',
  A: '#eab308',
  SA: '#1e40af',
} as const;

type OhiBand = {
  min: number;
  max: number;
  label: string;
  color: string;
  healthStatus: string;
};

const OHI_BANDS: OhiBand[] = [
  {
    min: 90,
    max: 100,
    label: '90% - 100%',
    healthStatus: 'Operationally Secure & Governance Mature',
    color: '#059669',
  },
  {
    min: 80,
    max: 89.9,
    label: '80% - 89.9%',
    healthStatus: 'Stable - Continuous Monitoring Required',
    color: '#4338CA',
  },
  {
    min: 70,
    max: 79.9,
    label: '70% - 79.9%',
    healthStatus: 'Structural Stability Weakening - Corrective Action Required',
    color: '#FBBF24',
  },
  {
    min: 60,
    max: 69.9,
    label: '60% - 69.9%',
    healthStatus: 'High Risk Operational Zone - War Room Activation Required',
    color: '#F97316',
  },
  {
    min: 0,
    max: 59.9,
    label: 'Below 60%',
    healthStatus: 'SOS - Critical Organizational Distress',
    color: '#DC2626',
  },
];

function getOriColorByPercentage(value: number): string {
  if (value >= 90) return '#059669'; // Green
  if (value >= 80) return '#4338CA'; // Blue
  if (value >= 70) return '#FBBF24'; // Yellow
  if (value >= 60) return '#F97316'; // Orange
  return '#DC2626'; // Red
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '').trim();
  const fullHex =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;

  const num = parseInt(fullHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


function ReportsPageContent() {
  const searchParams = useSearchParams();
  const initialCompanyId = searchParams.get('companyId') || '';
  const openedFromCompanyAnalytics = useRef(!!initialCompanyId);
  const summaryRequestSeq = useRef(0);
  const reportRequestSeq = useRef(0);
  const reportImageRef = useRef<HTMLDivElement | null>(null);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [questionPillars, setQuestionPillars] = useState<QPillar[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>(() => initialCompanyId);
  const [overall, setOverall] = useState<OverallReport | null>(null);
  const [sections, setSections] = useState<SectionStat[]>([]);
  const [selectedPillarId, setSelectedPillarId] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [validatedUserEmail, setValidatedUserEmail] = useState<string>('');
  const [companySummary, setCompanySummary] = useState<CompanySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [activeUserList, setActiveUserList] = useState<'completed' | 'pending' | 'invited' | null>(null);
  const [completedFallbackUsers, setCompletedFallbackUsers] = useState<string[]>([]);
  const [loadingCompletedFallback, setLoadingCompletedFallback] = useState(false);

  const fetchCompanySummary = useCallback(async (companyId: string): Promise<CompanySummary | null> => {
    const requestId = ++summaryRequestSeq.current;
    try {
      setLoadingSummary(true);
      const res = await responseAPI.getCompanySummary(companyId);
      if (requestId !== summaryRequestSeq.current) return null;
      const summary = res.data || null;
      setCompanySummary(summary);
      return summary;
    } catch (error: unknown) {
      if (requestId !== summaryRequestSeq.current) return null;
      console.error('Failed to load company summary', error);
      const message =
        error instanceof Error ? error.message : 'Failed to load company response summary';
      toast.error(message);
      setCompanySummary(null);
      return null;
    } finally {
      if (requestId === summaryRequestSeq.current) setLoadingSummary(false);
    }
  }, []);

  const fetchReport = useCallback(async () => {
    const requestId = ++reportRequestSeq.current;
    setLoadingReport(true);
    try {
      if (!selectedCompany) {
        const globalParams: {
          department?: string;
          employeeEmail?: string;
          sectionId?: string;
          pillarId?: string;
        } = {};
        if (selectedDepartment.trim()) globalParams.department = selectedDepartment.trim();
        if (validatedUserEmail.trim()) globalParams.employeeEmail = validatedUserEmail.trim();
        if (selectedSectionId) globalParams.sectionId = selectedSectionId;
        else if (selectedPillarId) globalParams.pillarId = selectedPillarId;

        const res = await reportAPI.getOverallReport(globalParams);
        if (requestId !== reportRequestSeq.current) return;
        setOverall(res.data.overallStats || null);
        setSections(res.data.sectionStats || []);
        return;
      }
      const params: {
        companyId: string;
        department?: string;
        employeeEmail?: string;
        sectionId?: string;
        pillarId?: string;
      } = { companyId: selectedCompany };
      if (selectedDepartment.trim()) params.department = selectedDepartment.trim();
      if (validatedUserEmail.trim()) params.employeeEmail = validatedUserEmail.trim();
      if (selectedSectionId) params.sectionId = selectedSectionId;
      else if (selectedPillarId) params.pillarId = selectedPillarId;

      const res = await reportAPI.getOverallReport(params);
      if (requestId !== reportRequestSeq.current) return;
      setOverall(res.data.overallStats || null);
      setSections(res.data.sectionStats || []);
    } catch (error: unknown) {
      if (requestId !== reportRequestSeq.current) return;
      console.error('Failed to load report', error);
      const message = error instanceof Error ? error.message : 'Failed to load report';
      toast.error(message);
      setOverall(null);
      setSections([]);
    } finally {
      if (requestId !== reportRequestSeq.current) return;
      setLoadingReport(false);
    }
  }, [
    selectedCompany,
    selectedDepartment,
    selectedPillarId,
    selectedSectionId,
    validatedUserEmail,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [compRes, qpRes] = await Promise.all([
          companyAPI.getAll(),
          questionPaperAPI.getPublished().catch(() => ({ data: { pillars: [] as QPillar[] } })),
        ]);
        if (cancelled) return;
        const allCompanies = compRes.data.companies || [];
        // List every company so admins can open reports from here without
        // matching the companies-table “analytics” gate (surveys not started
        // yet still show empty/zero metrics instead of disappearing from the list).
        setCompanies(allCompanies);
        const pillars = (qpRes.data?.pillars as QPillar[]) || [];
        setQuestionPillars(pillars);
      } catch (error: unknown) {
        console.error('Failed to bootstrap reports', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If the URL query params become available after first render, ensure the selection matches.
  useEffect(() => {
    if (initialCompanyId && !selectedCompany) setSelectedCompany(initialCompanyId);
  }, [initialCompanyId, selectedCompany]);

  useEffect(() => {
    if (selectedCompany) {
      void fetchCompanySummary(selectedCompany);
    } else {
      setCompanySummary(null);
    }
  }, [selectedCompany, fetchCompanySummary]);

  useEffect(() => {
    let cancelled = false;
    const hasValidCompletedEmails =
      (companySummary?.completedEmails ?? []).some(isValidEmail);
    const hasAnyCompletedUsers = (companySummary?.completedUsers ?? []).some((u) => String(u ?? '').trim().length > 0);
    const shouldFetchCompletedFallback =
      !!selectedCompany &&
      activeUserList === 'completed' &&
      !!companySummary &&
      (companySummary.completedCount ?? 0) > 0 &&
      !hasValidCompletedEmails &&
      !hasAnyCompletedUsers;

    if (!shouldFetchCompletedFallback) {
      setCompletedFallbackUsers([]);
      setLoadingCompletedFallback(false);
      return;
    }

    (async () => {
      try {
        setLoadingCompletedFallback(true);
        const res = await responseAPI.getByCompany(selectedCompany);
        if (cancelled) return;
        const responses = ((res.data?.responses as EmployeeResponseLite[]) || []);
        const unique = new Set<string>();
        responses.forEach((r) => {
          const email = (r.employeeEmail || '').trim().toLowerCase();
          if (isValidEmail(email)) unique.add(email);
        });
        setCompletedFallbackUsers(Array.from(unique));
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to fetch completed fallback users', error);
        setCompletedFallbackUsers([]);
      } finally {
        if (cancelled) return;
        setLoadingCompletedFallback(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeUserList, companySummary, selectedCompany]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  const handleCompanyChange = (id: string) => {
    setSelectedCompany(id);
    setSelectedDepartment('');
    setSelectedPillarId('');
    setSelectedSectionId('');
    setSelectedQuestionId('');
    setValidatedUserEmail('');
    setActiveUserList(null);
  };

  const sectionOptions = useMemo(() => {
    if (!questionPillars.length) return [];
    if (!selectedPillarId) {
      return questionPillars.flatMap((p) =>
        (p.sections || []).map((s) => ({
          ...s,
          pillarName: p.name,
        }))
      );
    }
    const pillar = questionPillars.find((p) => p._id === selectedPillarId);
    if (!pillar) return [];
    return (pillar.sections || []).map((s) => ({
      ...s,
      pillarName: pillar.name,
    }));
  }, [questionPillars, selectedPillarId]);

  useEffect(() => {
    if (!selectedSectionId) return;
    const stillThere = sectionOptions.some((s) => s._id === selectedSectionId);
    if (!stillThere) setSelectedSectionId('');
  }, [sectionOptions, selectedSectionId]);

  const questionOptions = useMemo(() => {
    const options: Array<{
      questionId: string;
      questionText: string;
      sectionId: string;
      sectionName: string;
      pillarName: string;
    }> = [];
    const seen = new Set<string>();

    questionPillars.forEach((pillar) => {
      if (selectedPillarId && pillar._id !== selectedPillarId) return;
      (pillar.sections || []).forEach((section) => {
        if (selectedSectionId && section._id !== selectedSectionId) return;
        (section.questions || []).forEach((q) => {
          if (!q?._id || seen.has(q._id)) return;
          seen.add(q._id);
          options.push({
            questionId: q._id,
            questionText: q.text || 'Untitled question',
            sectionId: section._id,
            sectionName: section.name || 'Section',
            pillarName: pillar.name || 'Pillar',
          });
        });
      });
    });

    if (options.length === 0) {
      sections.forEach((sec) => {
        sec.questionStats.forEach((q) => {
          if (!q.questionId || seen.has(q.questionId)) return;
          seen.add(q.questionId);
          options.push({
            questionId: q.questionId,
            questionText: q.questionText || 'Untitled question',
            sectionId: sec.sectionId,
            sectionName: sec.sectionName || 'Section',
            pillarName: '',
          });
        });
      });
    }

    return options.sort((a, b) => a.questionText.localeCompare(b.questionText));
  }, [questionPillars, sections, selectedPillarId, selectedSectionId]);

  useEffect(() => {
    if (!selectedQuestionId) return;
    const stillThere = questionOptions.some((q) => q.questionId === selectedQuestionId);
    if (!stillThere) setSelectedQuestionId('');
  }, [questionOptions, selectedQuestionId]);

  const scopedSections = useMemo(() => {
    if (!selectedQuestionId) return sections;
    return sections
      .map((sec) => {
        const matched = sec.questionStats.filter((q) => q.questionId === selectedQuestionId);
        if (matched.length === 0) return null;
        const only = matched[0];
        const weightedScore =
          only.ratingCount.A * 5 +
          only.ratingCount.B * 4 +
          only.ratingCount.C * 3 +
          only.ratingCount.D * 2 +
          only.ratingCount.E * 1;
        const sectionPercentage =
          only.totalResponses > 0 ? (weightedScore / (only.totalResponses * 5)) * 100 : 0;
        return {
          ...sec,
          questionStats: matched,
          sectionPercentage,
          totalResponses: only.totalResponses,
        };
      })
      .filter((sec): sec is SectionStat => sec !== null);
  }, [sections, selectedQuestionId]);

  const displayedOverall = useMemo(() => {
    if (!selectedQuestionId) return overall;
    if (scopedSections.length === 0) {
      return {
        overallPercentage: 0,
        totalResponses: 0,
        totalCompanies: selectedCompany ? 1 : (overall?.totalCompanies || 0),
        summaryInsights: [],
      } as OverallReport;
    }

    let A = 0;
    let B = 0;
    let C = 0;
    let D = 0;
    let E = 0;
    let totalResponses = 0;

    scopedSections.forEach((sec) => {
      sec.questionStats.forEach((q) => {
        A += q.ratingCount.A;
        B += q.ratingCount.B;
        C += q.ratingCount.C;
        D += q.ratingCount.D;
        E += q.ratingCount.E;
        totalResponses += q.totalResponses;
      });
    });

    const totalRatings = A + B + C + D + E;
    const overallPercentage =
      totalRatings > 0 ? ((A * 5 + B * 4 + C * 3 + D * 2 + E * 1) / (totalRatings * 5)) * 100 : 0;

    return {
      overallPercentage,
      totalResponses,
      totalCompanies: selectedCompany ? 1 : (overall?.totalCompanies || 0),
      ratingDistribution: { A, B, C, D, E },
      ratingDistributionPercentage:
        totalRatings > 0
          ? {
              A: (A / totalRatings) * 100,
              B: (B / totalRatings) * 100,
              C: (C / totalRatings) * 100,
              D: (D / totalRatings) * 100,
              E: (E / totalRatings) * 100,
            }
          : { A: 0, B: 0, C: 0, D: 0, E: 0 },
      summaryInsights: ['Filtered by question'],
    };
  }, [selectedCompany, selectedQuestionId, overall, scopedSections]);

  const sectionManualLabel = useCallback(
    (sectionId: string, fallbackIndex: number) => {
      for (let pi = 0; pi < questionPillars.length; pi++) {
        const list = questionPillars[pi].sections || [];
        const sorted = [...list].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0)
        );
        const idx = sorted.findIndex((s) => s._id === sectionId);
        if (idx >= 0) return `P${pi + 1} ${idx + 1}`;
      }
      return `P1 ${fallbackIndex + 1}`;
    },
    [questionPillars]
  );

  /** Pillar-level weighted percentages across all questions in each pillar. */
  const pillarLikertPillarSummary = useMemo(() => {

    const sectionToPillar = new Map<string, { pillarNo: number; pillarName: string }>();
    questionPillars.forEach((p, pIdx) => {
      const sortedSections = [...(p.sections || [])].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      sortedSections.forEach((s) => {
        sectionToPillar.set(s._id, {
          pillarNo: pIdx + 1,
          pillarName: (p.name || '').trim() || `P${pIdx + 1}`,
        });
      });
    });

    const countsByPillar = new Map<
      string,
      {
        pillarCode: string;
        pillarName: string;
        SD: number;
        D: number;
        N: number;
        A: number;
        SA: number;
        total: number;
      }
    >();

    // Initialize every pillar so the chart always renders the full pillar set,
    // even if a pillar has no section-level data in the current scope.
    questionPillars.forEach((p, pIdx) => {
      const pillarCode = `P${pIdx + 1}`;
      if (countsByPillar.has(pillarCode)) return;
      countsByPillar.set(pillarCode, {
        pillarCode,
        pillarName: (p.name || '').trim() || pillarCode,
        SD: 0,
        D: 0,
        N: 0,
        A: 0,
        SA: 0,
        total: 0,
      });
    });

    scopedSections.forEach((sec, secIdx) => {
      const pillarMeta = sectionToPillar.get(sec.sectionId);
      const fallbackMatch = /^P(\d+)\s+/.exec(sectionManualLabel(sec.sectionId, secIdx));
      const fallbackPillarNo = Number(fallbackMatch?.[1] || 1);
      const pillarNo = pillarMeta?.pillarNo ?? fallbackPillarNo;
      const pillarCode = `P${pillarNo}`;
      const pillarName = pillarMeta?.pillarName ?? pillarCode;
      if (!countsByPillar.has(pillarCode)) {
        countsByPillar.set(pillarCode, {
          pillarCode,
          pillarName,
          SD: 0,
          D: 0,
          N: 0,
          A: 0,
          SA: 0,
          total: 0,
        });
      }

      const cur = countsByPillar.get(pillarCode)!;

      sec.questionStats.forEach((q) => {
        const L = ratingCountToLikert(q.ratingCount);
        cur.SD += L.SD;
        cur.D += L.D;
        cur.N += L.N;
        cur.A += L.A;
        cur.SA += L.SA;
        cur.total += L.SD + L.D + L.N + L.A + L.SA;
      });
    });

    return Array.from(countsByPillar.values())
      .sort((a, b) => a.pillarCode.localeCompare(b.pillarCode, undefined, { numeric: true }))
      .map((pillar) => {
        const pct = (v: number) => (pillar.total > 0 ? (v / pillar.total) * 100 : 0);
        // OHI score is the weighted score where Strongly Agree is best.
        // Mapping: SD=1, D=2, N=3, A=4, SA=5.
        const weightedScore = pillar.SA * 5 + pillar.A * 4 + pillar.N * 3 + pillar.D * 2 + pillar.SD * 1;
        const ohiScore = pillar.total > 0 ? (weightedScore / (pillar.total * 5)) * 100 : 0;
        return {
          pillarCode: pillar.pillarCode,
          pillarName: pillar.pillarName,
          SD: Number(pct(pillar.SD).toFixed(1)),
          D: Number(pct(pillar.D).toFixed(1)),
          N: Number(pct(pillar.N).toFixed(1)),
          A: Number(pct(pillar.A).toFixed(1)),
          SA: Number(pct(pillar.SA).toFixed(1)),
          ohiScore: Number(ohiScore.toFixed(1)),
        };
      });
  }, [questionPillars, scopedSections, sectionManualLabel]);

  const userStatusChartData = useMemo(() => {
    if (!validatedUserEmail || !companySummary) return [];
    const email = validatedUserEmail;
    const completed = companySummary.completedEmails?.some((e) => e.toLowerCase() === email);
    const pending = companySummary.pendingEmails?.some((e) => e.toLowerCase() === email);
    if (!completed && !pending) return [];
    return [
      { name: 'Completed', value: completed ? 1 : 0 },
      { name: 'Pending', value: pending ? 1 : 0 },
    ].filter((d) => d.value > 0);
  }, [validatedUserEmail, companySummary]);

  const departmentList = companySummary?.departments?.length
    ? companySummary.departments
    : Object.keys(companySummary?.departmentBreakdown || {});

  const emailFilterOptions = useMemo(() => {
    if (!companySummary) return [];
    const invited = companySummary.invitedEmails ?? [];
    const completed = companySummary.completedEmails ?? [];
    const pending = companySummary.pendingEmails ?? [];
    const all = [...invited, ...completed, ...pending]
      .filter(Boolean)
      .map((e) => e.toLowerCase());
    return Array.from(new Set(all)).sort();
  }, [companySummary]);

  const activeListMeta = useMemo(() => {
    if (!companySummary || !activeUserList) return null;
    if (activeUserList === 'completed') {
      const completedEmailsOnly = (companySummary.completedEmails ?? []).filter(isValidEmail);
      const completedUsersOnly = (companySummary.completedUsers ?? [])
        .map((u) => String(u ?? '').trim())
        .filter(Boolean);
      const emails =
        completedEmailsOnly.length > 0
          ? completedEmailsOnly
          : completedUsersOnly.length > 0
            ? completedUsersOnly
            : completedFallbackUsers;
      return {
        title: 'Completed User List',
        emptyMessage: 'No completed users captured for this company.',
        emails,
      };
    }
    if (activeUserList === 'pending') {
      return {
        title: 'Pending Email List',
        emptyMessage:
          'No pending emails detected. Either all invited users have completed, or no email list was available.',
        emails: companySummary.pendingEmails ?? [],
      };
    }
    return {
      title: 'Invited Email List',
      emptyMessage: 'No invited emails were parsed from the uploaded employee file.',
      emails: companySummary.invitedEmails ?? [],
    };
  }, [activeUserList, companySummary, completedFallbackUsers]);

  const handleDownloadReportImage = useCallback(async () => {
    if (!reportImageRef.current) {
      toast.error('Report image is not ready yet.');
      return;
    }
    try {
      const dataUrl = await toPng(reportImageRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return !node.dataset.exportHide;
        },
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'report-image.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error: unknown) {
      console.error('Failed to download report image', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download report image');
    }
  }, []);

  const showGlobalOption = !openedFromCompanyAnalytics.current;
  const currentOverall = displayedOverall?.overallPercentage ?? null;
  const activeBandIndex =
    currentOverall === null
      ? -1
      : OHI_BANDS.findIndex((band) => currentOverall >= band.min && currentOverall <= band.max);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
            <p className="text-sm text-gray-500">
              {selectedCompany
                ? 'Company report (filters apply below).'
                : 'Global and company-specific diagnostic insights.'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select
              value={selectedCompany}
              onChange={(e) => handleCompanyChange(e.target.value)}
              className="w-full md:w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              {showGlobalOption && <option value="">All Companies (Global)</option>}
              {companies.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingReport && (
          <p className="text-xs text-gray-500">Updating report…</p>
        )}

        {/* Metric Cards
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Overall Health Score
            </p>
            <h3 className="text-3xl font-bold text-gray-900">
              {displayedOverall && typeof displayedOverall.overallPercentage === 'number'
                ? `${displayedOverall.overallPercentage.toFixed(1)}%`
                : 'N/A'}
            </h3>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                aria-label="ORI benchmark bar"
                title={
                  selectedQuestionId
                    ? 'Question-wise filtered view'
                    : displayedOverall?.benchmark
                      ? `${displayedOverall.benchmark.colorCode} - ${displayedOverall.benchmark.healthStatus}`
                      : 'No benchmark'
                }
                style={{
                  backgroundColor: activeBenchmarkColor,
                  width: `${displayedOverall?.overallPercentage || 0}%`,
                }}
              />
            </div>
            <p className="text-xs mt-2 font-medium" style={{ color: activeBenchmarkColor }}>
              {activeBenchmarkStatus}
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Total Responses
            </p>
            <h3 className="text-3xl font-bold text-gray-900">
              {displayedOverall?.totalResponses?.toLocaleString() || '0'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {selectedCompany ? 'For current filters' : 'Across all surveys'}
            </p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Active Companies
            </p>
            <h3 className="text-3xl font-bold text-gray-900">
              {selectedCompany ? '1' : displayedOverall?.totalCompanies || '0'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">Diagnostic entities</p>
          </div>
        </div> */}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-gray-900">OHI Color Criteria</h3>
            {currentOverall !== null && (
              <p className="text-xs text-gray-500">
                Current score: <span className="font-semibold text-gray-900">{currentOverall.toFixed(1)}%</span>
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {OHI_BANDS.map((band, index) => {
              const isActive = index === activeBandIndex;
              return (
                <div
                  key={band.label}
                    className="rounded-lg border p-3 transition-colors"
                    style={{
                      borderColor: isActive ? band.color : '#E5E7EB', // gray-200
                      backgroundColor: hexToRgba(band.color, isActive ? 0.12 : 0.06),
                      boxShadow: isActive ? `0 0 0 2px ${hexToRgba(band.color, 0.28)}` : 'none',
                    }}
                >
                  <div className="h-2.5 rounded-full mb-2" style={{ backgroundColor: band.color }} />
                    <p className="text-xs font-semibold" style={{ color: band.color }}>
                      {band.label}
                    </p>
                </div>
              );
            })}
          </div>
        </div>

        {selectedCompany && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <button
              type="button"
              disabled={!companySummary || loadingSummary || (companySummary.completedCount ?? 0) === 0}
              onClick={async () => {
                if (!selectedCompany) return;
                const summary = await fetchCompanySummary(selectedCompany);
                if (summary && (summary.completedCount ?? 0) > 0) setActiveUserList('completed');
              }}
              className="bg-white border border-emerald-200 rounded-xl p-6 shadow-sm text-left disabled:opacity-70 disabled:cursor-not-allowed hover:border-emerald-300 transition-colors"
            >
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">
                Completed Users
              </p>
              <h3 className="text-3xl font-bold text-emerald-700">
                {loadingSummary ? '—' : (companySummary?.completedCount ?? 0)}
              </h3>
              <p className="mt-3 text-xs font-semibold text-emerald-700">
                View completed user list
              </p>
            </button>
            <button
              type="button"
              disabled={!selectedCompany || loadingSummary}
              onClick={async () => {
                if (!selectedCompany) return;
                const summary = await fetchCompanySummary(selectedCompany);
                if (summary) setActiveUserList('pending');
              }}
              className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm text-left disabled:opacity-70 disabled:cursor-not-allowed hover:border-amber-300 transition-colors"
            >
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">
                Pending Users
              </p>
              <h3 className="text-3xl font-bold text-amber-700">
                {loadingSummary ? '—' : (companySummary?.pendingCount ?? 0)}
              </h3>
              <p className="mt-3 text-xs font-semibold text-amber-700">
                View pending email list
              </p>
            </button>
            <button
              type="button"
              disabled={!companySummary || loadingSummary || (companySummary.totalInvited ?? 0) === 0}
              onClick={async () => {
                if (!selectedCompany) return;
                const summary = await fetchCompanySummary(selectedCompany);
                if (summary && (summary.totalInvited ?? 0) > 0) setActiveUserList('invited');
              }}
              className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm text-left disabled:opacity-70 disabled:cursor-not-allowed hover:border-gray-300 transition-colors"
            >
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                Total Invited (via Excel)
              </p>
              <h3 className="text-3xl font-bold text-gray-900">
                {loadingSummary ? '—' : (companySummary?.totalInvited ?? 0)}
              </h3>
              <p className="mt-3 text-xs font-semibold text-gray-700">
                View invited email list
              </p>
            </button>
          </div>
        )}

        {selectedCompany && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Report filters
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Department
                </p>
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All departments</option>
                  {departmentList.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Pillar (question paper)
                </p>
                <select
                  value={selectedPillarId}
                  onChange={(e) => {
                    setSelectedPillarId(e.target.value);
                    setSelectedSectionId('');
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All pillars</option>
                  {questionPillars.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name || `Pillar ${(p.order ?? 0) + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Section (question paper)
                </p>
                <select
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All sections in scope</option>
                  {sectionOptions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.pillarName ? `${s.pillarName} — ${s.name}` : s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  Question
                </p>
                <select
                  value={selectedQuestionId}
                  onChange={(e) => setSelectedQuestionId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All questions in scope</option>
                  {questionOptions.map((q) => (
                    <option key={q.questionId} value={q.questionId}>
                      {q.questionText}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                  User email (must be in Excel list)
                </p>
                <select
                  value={validatedUserEmail}
                  onChange={(e) => setValidatedUserEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  <option value="">All users</option>
                  {emailFilterOptions.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
                {validatedUserEmail && (
                  <p className="text-[10px] text-emerald-600 mt-1">
                    Filter applied for {validatedUserEmail}
                  </p>
                )}
                {!validatedUserEmail && (companySummary?.invitedEmails ?? []).length === 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    No invited emails found for this company.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm" ref={reportImageRef}>
          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3 className="text-md font-bold text-gray-900">Pillar analytics</h3>
              <button
                type="button"
                onClick={() => void handleDownloadReportImage()}
                data-export-hide="true"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Download report image
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-6">
              X-axis: pillars (P1..P5). Y-axis: percentage. Bars grouped by
              Strongly Disagree (SD), Disagree (D), Neutral (N), Agree (A), Strongly Agree (SA).
            </p>

            {pillarLikertPillarSummary.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-gray-400 italic text-sm rounded-xl border border-gray-100 bg-slate-50/50">
                Not enough section-level data to chart.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pillarLikertPillarSummary}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="pillarCode" tick={{ fontSize: 10 }} />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`}
                      labelFormatter={(value) => `${String(value)}`}
                    />
                    <Legend
                      content={() => {
                        const len = pillarLikertPillarSummary.length || 1;
                        const avg = (key: 'SD' | 'D' | 'N' | 'A' | 'SA') =>
                          pillarLikertPillarSummary.reduce(
                            (sum, row) => sum + row[key],
                            0,
                          ) / len;

                        const items: Array<{ label: string; value: number }> = [
                          { label: 'Strongly Disagree', value: avg('SD') },
                          { label: 'Disagree', value: avg('D') },
                          { label: 'Neutral', value: avg('N') },
                          { label: 'Agree', value: avg('A') },
                          { label: 'Strongly Agree', value: avg('SA') },
                        ];

                        return (
                          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-2">
                            {items.map((it) => (
                              <div key={it.label} className="flex items-center gap-2">
                                <span
                                  aria-hidden="true"
                                  className="inline-block h-3 w-3 rounded-sm"
                                  style={{ backgroundColor: getOriColorByPercentage(it.value) }}
                                />
                                <p className="text-[10px] font-semibold text-gray-700">
                                  {it.label} ({it.value.toFixed(1)}%)
                                </p>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="SD" name="Strongly Disagree" fill={LIKERT_CHART_COLORS.SD}>
                      {pillarLikertPillarSummary.map((entry, idx) => (
                        <Cell key={`sd-${entry.pillarCode}-${idx}`} fill={getOriColorByPercentage(entry.SD)} />
                      ))}
                    </Bar>
                    <Bar dataKey="D" name="Disagree" fill={LIKERT_CHART_COLORS.D}>
                      {pillarLikertPillarSummary.map((entry, idx) => (
                        <Cell key={`d-${entry.pillarCode}-${idx}`} fill={getOriColorByPercentage(entry.D)} />
                      ))}
                    </Bar>
                    <Bar dataKey="N" name="Neutral" fill={LIKERT_CHART_COLORS.N}>
                      {pillarLikertPillarSummary.map((entry, idx) => (
                        <Cell key={`n-${entry.pillarCode}-${idx}`} fill={getOriColorByPercentage(entry.N)} />
                      ))}
                    </Bar>
                    <Bar dataKey="A" name="Agree" fill={LIKERT_CHART_COLORS.A}>
                      {pillarLikertPillarSummary.map((entry, idx) => (
                        <Cell key={`a-${entry.pillarCode}-${idx}`} fill={getOriColorByPercentage(entry.A)} />
                      ))}
                    </Bar>
                    <Bar dataKey="SA" name="Strongly Agree" fill={LIKERT_CHART_COLORS.SA}>
                      {pillarLikertPillarSummary.map((entry, idx) => (
                        <Cell key={`sa-${entry.pillarCode}-${idx}`} fill={getOriColorByPercentage(entry.SA)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {selectedCompany && companySummary && validatedUserEmail && (
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-md font-bold text-gray-900">
                  User status (validated email)
                </h3>
              </div>
              <div className="h-64 w-full">
                {userStatusChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={userStatusChartData}
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {userStatusChartData.map((entry, index) => (
                          <Cell
                            key={`user-cell-${index}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                    This email is not on the invited list for this company.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeListMeta && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {activeListMeta.title} ({activeListMeta.emails.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setActiveUserList(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Close
                </button>
              </div>
              {loadingCompletedFallback && activeUserList === 'completed' ? (
                <p className="text-sm text-gray-500">Loading completed users...</p>
              ) : activeListMeta.emails.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {activeListMeta.emptyMessage} Count data exists, but individual user rows were not returned.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                  <ul className="space-y-1">
                    {activeListMeta.emails.map((email) => (
                      <li key={email}>{email}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <AdminLayout>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Loading reports…</p>
          </div>
        </AdminLayout>
      }
    >
      <ReportsPageContent />
    </Suspense>
  );
}
