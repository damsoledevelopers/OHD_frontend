'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { useSearchParams } from 'next/navigation';
import {
  companyAPI,
  reportAPI,
  responseAPI,
  exportAPI,
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

interface Company {
  _id: string;
  name: string;
}

interface QSection {
  _id: string;
  name: string;
  order?: number;
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
  pendingEmails: string[];
  invitedEmails?: string[];
  departments?: string[];
  departmentBreakdown: Record<string, { responses: number }>;
  totalResponses: number;
}

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#f97316', '#ef4444'];

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const initialCompanyId = searchParams.get('companyId') || '';
  const openedFromCompanyAnalytics = useRef(!!initialCompanyId);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [questionPillars, setQuestionPillars] = useState<QPillar[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [overall, setOverall] = useState<OverallReport | null>(null);
  const [sections, setSections] = useState<SectionStat[]>([]);
  const [selectedPillarId, setSelectedPillarId] = useState<string>('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [validatedUserEmail, setValidatedUserEmail] = useState<string>('');
  const [companySummary, setCompanySummary] = useState<CompanySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [showCompletedList, setShowCompletedList] = useState(false);
  const [showPendingList, setShowPendingList] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);

  const fetchCompanySummary = useCallback(async (companyId: string) => {
    try {
      setLoadingSummary(true);
      const res = await responseAPI.getCompanySummary(companyId);
      setCompanySummary(res.data || null);
    } catch (error: unknown) {
      console.error('Failed to load company summary', error);
      const message =
        error instanceof Error ? error.message : 'Failed to load company response summary';
      toast.error(message);
      setCompanySummary(null);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const fetchReport = useCallback(async () => {
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
      setOverall(res.data.overallStats || null);
      setSections(res.data.sectionStats || []);
    } catch (error: unknown) {
      console.error('Failed to load report', error);
      const message = error instanceof Error ? error.message : 'Failed to load report';
      toast.error(message);
      setOverall(null);
      setSections([]);
    } finally {
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
        if (initialCompanyId) {
          setSelectedCompany(initialCompanyId);
        }
      } catch (error: unknown) {
        console.error('Failed to bootstrap reports', error);
        toast.error(error instanceof Error ? error.message : 'Failed to load data');
      } finally {
        if (!cancelled) setBootstrapDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCompanyId]);

  useEffect(() => {
    if (!bootstrapDone) return;
    if (selectedCompany) {
      void fetchCompanySummary(selectedCompany);
    } else {
      setCompanySummary(null);
    }
  }, [bootstrapDone, selectedCompany, fetchCompanySummary]);

  useEffect(() => {
    if (!bootstrapDone) return;
    void fetchReport();
  }, [bootstrapDone, fetchReport]);

  const handleCompanyChange = (id: string) => {
    setSelectedCompany(id);
    setSelectedDepartment('');
    setSelectedPillarId('');
    setSelectedSectionId('');
    setValidatedUserEmail('');
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
    return (pillar?.sections || []).map((s) => ({
      ...s,
      pillarName: pillar.name,
    }));
  }, [questionPillars, selectedPillarId]);

  useEffect(() => {
    if (!selectedSectionId) return;
    const stillThere = sectionOptions.some((s) => s._id === selectedSectionId);
    if (!stillThere) setSelectedSectionId('');
  }, [sectionOptions, selectedSectionId]);

  const pieData = useMemo(() => {
    if (!overall?.ratingDistribution) return [];
    return [
      { name: 'Strongly Agree', value: overall.ratingDistribution.A },
      { name: 'Agree', value: overall.ratingDistribution.B },
      { name: 'Neutral', value: overall.ratingDistribution.C },
      { name: 'Disagree', value: overall.ratingDistribution.D },
      { name: 'Strongly Disagree', value: overall.ratingDistribution.E },
    ].filter((d) => d.value > 0);
  }, [overall]);

  const sectionBarData = useMemo(() => {
    return sections.map((s) => ({
      name: s.sectionName.length > 22 ? s.sectionName.substring(0, 22) + '…' : s.sectionName,
      Percentage: Number(s.sectionPercentage.toFixed(1)),
    }));
  }, [sections]);

  const pillarChartData = useMemo(() => {
    if (!sections.length) return [];
    const data = sections.map((s) => {
      const label =
        s.sectionName.length > 18 ? s.sectionName.substring(0, 18) + '…' : s.sectionName;
      let a = 0,
        b = 0,
        c = 0,
        d = 0,
        e = 0;
      s.questionStats.forEach((q) => {
        a += q.ratingCount?.A || 0;
        b += q.ratingCount?.B || 0;
        c += q.ratingCount?.C || 0;
        d += q.ratingCount?.D || 0;
        e += q.ratingCount?.E || 0;
      });
      return { name: label, SA: a, A: b, N: c, D: d, SD: e };
    });
    if (data.length > 0) {
      data.push({
        name: 'TOTAL',
        SA: data.reduce((acc, x) => acc + x.SA, 0),
        A: data.reduce((acc, x) => acc + x.A, 0),
        N: data.reduce((acc, x) => acc + x.N, 0),
        D: data.reduce((acc, x) => acc + x.D, 0),
        SD: data.reduce((acc, x) => acc + x.SD, 0),
      });
    }
    return data;
  }, [sections]);

  const departmentChartData = useMemo(() => {
    if (!companySummary?.departmentBreakdown) return [];
    if (selectedDepartment) {
      const n = overall?.totalResponses ?? 0;
      return n > 0 ? [{ name: selectedDepartment, Responses: n }] : [];
    }
    return Object.entries(companySummary.departmentBreakdown).map(([dept, stats]) => ({
      name: dept,
      Responses: stats.responses,
    }));
  }, [companySummary, selectedDepartment, overall?.totalResponses]);

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

  const handleDownloadNumericReport = async () => {
    if (!selectedCompany) {
      toast.error('Please select a company to download its numeric report.');
      return;
    }
    try {
      const res = await exportAPI.exportExcel(selectedCompany);
      const blob = new Blob([res.data], {
        type:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ohd-company-report.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: unknown) {
      console.error('Failed to download report', error);
      const message =
        error instanceof Error ? error.message : 'Failed to download numeric report';
      toast.error(message);
    }
  };

  const showGlobalOption = !openedFromCompanyAnalytics.current;

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
            <button
              type="button"
              onClick={handleDownloadNumericReport}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 disabled:opacity-50"
              disabled={!selectedCompany}
            >
              Download Numeric Report
            </button>
          </div>
        </div>

        {loadingReport && (
          <p className="text-xs text-gray-500">Updating report…</p>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Overall Health Score
            </p>
            <h3 className="text-3xl font-bold text-gray-900">
              {overall && typeof overall.overallPercentage === 'number'
                ? `${overall.overallPercentage.toFixed(1)}%`
                : 'N/A'}
            </h3>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${overall?.overallPercentage || 0}%` }}
              />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Total Responses
            </p>
            <h3 className="text-3xl font-bold text-gray-900">
              {overall?.totalResponses?.toLocaleString() || '0'}
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
              {selectedCompany ? '1' : overall?.totalCompanies || '0'}
            </h3>
            <p className="text-xs text-gray-400 mt-1">Diagnostic entities</p>
          </div>
        </div>

        {selectedCompany && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-emerald-200 rounded-xl p-6 shadow-sm">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">
                Completed Users
              </p>
              <h3 className="text-3xl font-bold text-emerald-700">
                {loadingSummary ? '—' : (companySummary?.completedCount ?? 0)}
              </h3>
              <button
                type="button"
                disabled={!companySummary || (companySummary.completedEmails || []).length === 0}
                onClick={() => setShowCompletedList(true)}
                className="mt-3 text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:text-gray-300"
              >
                View completed email list
              </button>
            </div>
            <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-1">
                Pending Users
              </p>
              <h3 className="text-3xl font-bold text-amber-700">
                {loadingSummary ? '—' : (companySummary?.pendingCount ?? 0)}
              </h3>
              <button
                type="button"
                disabled={!companySummary || (companySummary.pendingEmails || []).length === 0}
                onClick={() => setShowPendingList(true)}
                className="mt-3 text-xs font-semibold text-amber-700 hover:text-amber-900 disabled:text-gray-300"
              >
                View pending email list
              </button>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1">
                Total Invited (via Excel)
              </p>
              <h3 className="text-3xl font-bold text-gray-900">
                {loadingSummary ? '—' : (companySummary?.totalInvited ?? 0)}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Based on parsed email addresses from the uploaded employee file.
              </p>
            </div>
          </div>
        )}

        {selectedCompany && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Report filters
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-bold text-gray-900">Distribution (current filters)</h2>
          </div>

          <div className="h-80 w-full">
            {pillarChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pillarChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#666' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                  <Bar dataKey="SA" name="Strongly Agree" fill="#10b981" />
                  <Bar dataKey="A" name="Agree" fill="#14b8a6" />
                  <Bar dataKey="N" name="Neutral" fill="#94a3b8" />
                  <Bar dataKey="D" name="Disagree" fill="#f59e0b" />
                  <Bar dataKey="SD" name="Strongly Disagree" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                No data for these filters.
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-md font-bold text-gray-900 mb-6">Section performance</h3>
            <div className="h-64 w-full">
              {sectionBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectionBarData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal stroke="#eee" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="Percentage" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={15} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                  No section data.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-md font-bold text-gray-900 mb-6">Response sentiment</h3>
            <div className="h-64 w-full relative">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                  No sentiment data.
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedCompany && companySummary && (
          <div
            className={`grid grid-cols-1 gap-6 ${
              validatedUserEmail ? 'lg:grid-cols-2' : ''
            }`}
          >
            {validatedUserEmail && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <h3 className="text-md font-bold text-gray-900 mb-4">
                  User status (validated email)
                </h3>
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
            )}

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-md font-bold text-gray-900 mb-4">Department responses (summary)</h3>
              <div className="h-64 w-full">
                {departmentChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal stroke="#eee" />
                      <XAxis type="number" />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={100}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="Responses"
                        name="Responses"
                        fill="#10b981"
                        radius={[0, 4, 4, 0]}
                        barSize={18}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 italic text-sm">
                    No department information for this company.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showCompletedList && companySummary && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Completed Email List ({companySummary.completedEmails.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowCompletedList(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Close
                </button>
              </div>
              {companySummary.completedEmails.length === 0 ? (
                <p className="text-sm text-gray-500">No completed emails captured for this company.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                  <ul className="space-y-1">
                    {companySummary.completedEmails.map((email) => (
                      <li key={email}>{email}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {showPendingList && companySummary && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Pending Email List ({companySummary.pendingEmails.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowPendingList(false)}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Close
                </button>
              </div>
              {companySummary.pendingEmails.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No pending emails detected. Either all invited users have completed, or no email
                  list was available.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-800">
                  <ul className="space-y-1">
                    {companySummary.pendingEmails.map((email) => (
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
