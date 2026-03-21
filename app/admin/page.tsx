'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { companyAPI, reportAPI } from '@/lib/apiClient';
import { AUTH_TOKEN_STORAGE_KEY } from '@/lib/api';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface OverallStats {
  overallPercentage: number;
  ratingDistribution: { A: number; B: number; C: number; D: number; E: number };
  ratingDistributionPercentage: { A: number; B: number; C: number; D: number; E: number };
  totalResponses: number;
  totalCompanies: number;
  bestSection?: {
    sectionId: string;
    sectionName: string;
    percentage: number;
  } | null;
  summaryInsights?: string[];
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [companiesCount, setCompaniesCount] = useState(0);
  const [sectionPerformanceData, setSectionPerformanceData] = useState<
    { name: string; percentage: number }[]
  >([]);

  useEffect(() => {
    const hasSession =
      typeof window !== 'undefined' &&
      (localStorage.getItem('user') || localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
    if (!hasSession) {
      window.location.href = '/admin/login';
      return;
    }
    
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [reportRes, companiesRes] = await Promise.all([
        reportAPI.getOverallReport(),
        companyAPI.getAll(),
      ]);

      const reportData = reportRes.data;
      setOverallStats(reportData.overallStats || null);

      // Prepare section performance data (top 10 sections by percentage)
      const sectionStats =
        (reportData.sectionStats as
          | { sectionName: string; sectionPercentage: number }[]
          | undefined) || [];

      const performanceData = sectionStats
        .slice()
        .sort((a, b) => (b.sectionPercentage || 0) - (a.sectionPercentage || 0))
        .slice(0, 10)
        .map((s) => ({
          name:
            s.sectionName.length > 30
              ? `${s.sectionName.substring(0, 30)}...`
              : s.sectionName,
          percentage:
            typeof s.sectionPercentage === 'number'
              ? Number(s.sectionPercentage.toFixed(1))
              : 0,
        }));

      setSectionPerformanceData(performanceData);

      setCompaniesCount(companiesRes.data.companies?.length || 0);
    } catch (error: unknown) {
      console.error('Failed to load dashboard data', error);
      const message = error instanceof Error ? error.message : 'Failed to load dashboard data';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // Prepare rating distribution data for charts
  const ratingData = overallStats
    ? [
        { name: 'A (Excellent)', value: overallStats.ratingDistribution.A, percentage: overallStats.ratingDistributionPercentage.A, color: '#10b981' },
        { name: 'B (Good)', value: overallStats.ratingDistribution.B, percentage: overallStats.ratingDistributionPercentage.B, color: '#3b82f6' },
        { name: 'C (Average)', value: overallStats.ratingDistribution.C, percentage: overallStats.ratingDistributionPercentage.C, color: '#f59e0b' },
        { name: 'D (Poor)', value: overallStats.ratingDistribution.D, percentage: overallStats.ratingDistributionPercentage.D, color: '#ef4444' },
        { name: 'E (Very Poor)', value: overallStats.ratingDistribution.E, percentage: overallStats.ratingDistributionPercentage.E, color: '#dc2626' },
      ]
    : [];

  // Get health status color
  const getHealthColor = (percentage: number) => {
    if (percentage >= 80) return 'text-emerald-600';
    if (percentage >= 60) return 'text-blue-600';
    if (percentage >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthBgColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-emerald-50 border-emerald-200';
    if (percentage >= 60) return 'bg-blue-50 border-blue-200';
    if (percentage >= 40) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="mt-2 text-slate-500 font-medium tracking-wide">
              Overview of organization health metrics and key performance indicators
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button 
              onClick={fetchDashboardData}
              className="bg-white border border-slate-200 text-slate-700 px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all flex items-center"
            >
              <svg className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Overall Health Card */}
          <div className={`relative overflow-hidden group bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border p-8 transition-all hover:scale-[1.02] duration-300 ${overallStats ? getHealthBgColor(overallStats.overallPercentage) : 'border-slate-100'}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                  Overall Health
                </p>
                <h3 className={`mt-3 text-5xl font-black ${overallStats ? getHealthColor(overallStats.overallPercentage) : 'text-slate-900'}`}>
                  {overallStats && typeof overallStats.overallPercentage === 'number'
                    ? `${overallStats.overallPercentage.toFixed(1)}%`
                    : '--'}
                </h3>
              </div>
              <div className="p-4 bg-primary-100/50 rounded-2xl text-primary-600 group-hover:scale-110 transition-transform duration-300">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
            <div className="mt-8 flex items-center space-x-2">
              <div className="flex-1 bg-slate-200/50 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    overallStats && overallStats.overallPercentage >= 80
                      ? 'bg-emerald-500'
                      : overallStats && overallStats.overallPercentage >= 60
                      ? 'bg-primary-500'
                      : overallStats && overallStats.overallPercentage >= 40
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{
                    width: overallStats && typeof overallStats.overallPercentage === 'number'
                      ? `${overallStats.overallPercentage}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </div>

            {[
            { label: 'Companies', value: companiesCount, sub: 'Registered orgs', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a 2 2 0 00-2-2H7a 2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a 1 1 0 011-1h2a 1 1 0 011 1v5m-4 0h4" />, color: 'primary' },
            { label: 'Responses', value: overallStats ? overallStats.totalResponses : 0, sub: 'Survey submissions', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a 2 2 0 01-2-2V5a 2 2 0 012-2h5.586a 1 1 0 01.707.293l5.414 5.414a 1 1 0 01.293.707V19a 2 2 0 01-2 2z" />, color: 'emerald' },
          ].map((stat, i) => (
            <div key={i} className="group bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-8 transition-all hover:scale-[1.02] duration-300">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">{stat.label}</p>
                  <h3 className="mt-3 text-5xl font-black text-slate-900">{stat.value}</h3>
                  <p className="mt-3 text-[13px] text-slate-400 font-medium">{stat.sub}</p>
                </div>
                <div className={`p-4 bg-${stat.color === 'primary' ? 'primary' : stat.color}-50 rounded-2xl text-${stat.color === 'primary' ? 'primary' : stat.color}-600 group-hover:scale-110 transition-transform duration-300`}>
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">{stat.icon}</svg>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Rating Distribution - Pie Chart */}
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-slate-900">Rating Distribution</h2>
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              </div>
            </div>
            {ratingData.length > 0 ? (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={ratingData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {ratingData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                      formatter={(val: unknown, name: unknown, entry: unknown) => {
                        const value = typeof val === 'number' ? val : 0;
                        const entryObj = entry as { payload?: { percentage?: number } };
                        const percentage = entryObj?.payload?.percentage || 0;
                        return [`${value} votes (${percentage.toFixed(1)}%)`, typeof name === 'string' ? name : ''];
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[350px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                <p className="font-medium">No rating data available yet</p>
              </div>
            )}
          </div>

          {/* Rating Summary - Bar Chart */}
          <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-8">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-xl font-bold text-slate-900">Health Breakdown</h2>
              <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </div>
            </div>
            {ratingData.length > 0 ? (
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      padding={{ left: 10, right: 10 }}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                    <Tooltip 
                      cursor={{ fill: '#F8FAFC', radius: 12 }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={40}>
                      {ratingData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[350px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <svg className="w-12 h-12 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16" /></svg>
                <p className="font-medium">Analysis pending responses</p>
              </div>
            )}
          </div>
        </div>

        {/* Section Performance */}
        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Parameter Performance</h2>
              <p className="text-slate-500 text-sm mt-1">Ranking of the top 10 diagnostic sections by score</p>
            </div>
            <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center text-primary-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
          </div>
          {sectionPerformanceData.length > 0 ? (
            <div className="h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectionPerformanceData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                  <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={180} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#1E293B', fontWeight: 600, fontSize: 13 }}
                  />
                  <Tooltip 
                    cursor={{ fill: '#F8FAFC', radius: 12 }}
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 50px rgba(0,0,0,0.1)' }}
                    formatter={(val: unknown) => {
                      const value = typeof val === 'number' ? val : 0;
                      return [`${value}%`, 'Score'];
                    }}
                  />
                  <Bar dataKey="percentage" fill="url(#colorBar)" radius={[0, 8, 8, 0]} maxBarSize={30}>
                    <defs>
                      <linearGradient id="colorBar" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#818CF8" />
                        <stop offset="100%" stopColor="#3b66f5" />
                      </linearGradient>
                    </defs>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
               <p className="font-semibold text-lg">Detailed metrics will appear here</p>
               <p className="text-sm mt-1">Collect responses to see section-wise analytics</p>
            </div>
          )}
        </div>

        {/* Insights Section */}
        {overallStats && (overallStats.bestSection || (overallStats.summaryInsights && overallStats.summaryInsights.length > 0)) && (
          <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/20 rounded-full blur-[100px]" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[100px]" />
            
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-1 border-b lg:border-b-0 lg:border-r border-slate-700 pb-8 lg:pb-0 lg:pr-12">
                <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest mb-6 border border-emerald-500/20">
                   Intelligence Insight
                </div>
                <h2 className="text-4xl font-extrabold tracking-tight mb-4">Diagnostic <span className="text-primary-400 text-glow">Clarity</span></h2>
                <p className="text-slate-400 text-lg leading-relaxed">AI-driven summary of your organizational pulse based on latest collective sentiment.</p>
              </div>

              <div className="lg:col-span-2 space-y-8">
                {overallStats.bestSection && (
                  <div className="group rounded-3xl bg-slate-800/50 p-6 border border-slate-700 hover:border-emerald-500/50 transition-all duration-300">
                    <div className="flex items-center mb-4">
                       <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 mr-4">
                          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                       </div>
                       <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Growth Champion</p>
                    </div>
                    <h4 className="text-2xl font-bold flex items-baseline">
                      {overallStats.bestSection.sectionName}
                      <span className="ml-4 text-emerald-400 text-sm font-black border-l border-slate-700 pl-4">
                        {typeof overallStats.bestSection.percentage === 'number'
                          ? overallStats.bestSection.percentage.toFixed(1)
                          : '0.0'}% Positive
                      </span>
                    </h4>
                    <p className="text-slate-400 mt-2 text-sm">This parameter shows the highest level of organizational maturity and employee confidence.</p>
                  </div>
                )}
                
                {overallStats.summaryInsights && overallStats.summaryInsights.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {overallStats.summaryInsights.map((insight, idx) => (
                      <div key={idx} className="flex items-start p-5 bg-slate-800/30 rounded-2xl border border-slate-700/50 hover:bg-slate-800 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-primary-500 mt-1.5 mr-4 ring-4 ring-primary-500/20" />
                        <p className="text-sm text-slate-300 leading-relaxed font-medium">{insight}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
