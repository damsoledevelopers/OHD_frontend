'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { useRouter } from 'next/navigation';
import { companyAPI, mailAPI, publicAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Edit, Eye, Trash2, Plus, X, Mail, BarChart3, Search, Send } from 'lucide-react';
import DepartmentNameModal from '@/components/DepartmentNameModal';

interface Company {
  _id: string;
  name: string;
  email: string;
  industry?: string;
  employeeCount?: number;
  status?: 'active' | 'inactive' | 'new' | 'pending' | 'completed' | 'session_ended';
  createdAt?: string;
  updatedAt?: string;
  excelFileUrl?: string;
  surveyStatus?: 'not_started' | 'in_progress' | 'completed';
  departments?: string[];
}

type ModalType = 'view' | 'edit' | 'email' | 'delete' | 'shareCompanyForm' | null;

type DisplayStatusLabel = 'Active' | 'Inactive' | 'Completed' | 'Session Ended' | 'New';

function normalizeDepartmentList(departments: unknown): string[] {
  if (!Array.isArray(departments)) return [];
  return departments.map((d) => String(d).trim()).filter(Boolean);
}

const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRecipientList(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Participant survey entry is always `/survey/start` on the public app host. */
function buildPublicSurveyStartUrl(publicAppBaseUrl: string, companyId: string): string {
  const trimmed = publicAppBaseUrl.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  try {
    const withProto = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    const url = new URL(withProto);
    url.pathname = '/survey/start';
    url.search = '';
    url.searchParams.set('companyId', companyId);
    return url.toString();
  } catch {
    return `${trimmed}/survey/start?companyId=${encodeURIComponent(companyId)}`;
  }
}

function getDisplayStatusLabel(c: Company): DisplayStatusLabel {
  if (
    !c.status ||
    c.status === 'active' ||
    (c.status === 'pending' && c.surveyStatus === 'in_progress')
  ) {
    return 'Active';
  }
  if (c.status === 'inactive') return 'Inactive';
  if (c.status === 'completed') return 'Completed';
  if (c.status === 'session_ended') return 'Session Ended';
  return 'New';
}

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  // Edit form state (for inline modal)
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editIndustry, setEditIndustry] = useState('');
  const [editEmployeeCount, setEditEmployeeCount] = useState<number | ''>('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editExcelFile, setEditExcelFile] = useState<File | null>(null);
  const [editDepartments, setEditDepartments] = useState<string[]>([]);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);

  // Email modal state
  const [mailSubject, setMailSubject] = useState('');
  const [mailNotes, setMailNotes] = useState('');
  const [mailRecipients, setMailRecipients] = useState<string[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [sendingMail, setSendingMail] = useState(false);

  // Share company registration link (header action — external recipient)
  const [companyLinkSubject, setCompanyLinkSubject] = useState('');
  const [companyLinkNotes, setCompanyLinkNotes] = useState('');
  const [companyLinkRecipient, setCompanyLinkRecipient] = useState('');
  const [sendingCompanyLink, setSendingCompanyLink] = useState(false);

  const [fileViewerUrl, setFileViewerUrl] = useState<string | null>(null);
  const [fileViewerTitle, setFileViewerTitle] = useState<string | null>(null);
  const [fileRawUrl, setFileRawUrl] = useState<string | null>(null);

  const [publicAppBaseUrl, setPublicAppBaseUrl] = useState('');
  const [loadingPublicAppBaseUrl, setLoadingPublicAppBaseUrl] = useState(true);

  // Client-side pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | DisplayStatusLabel>('');
  const [filterIndustry, setFilterIndustry] = useState('');

  const selectedCompany = useMemo(
    () => companies.find((c) => c._id === selectedCompanyId) || null,
    [companies, selectedCompanyId]
  );

  const industryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of companies) {
      const ind = c.industry?.trim();
      if (ind) set.add(ind);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [companies]);

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => {
      if (q) {
        const nameMatch = c.name.toLowerCase().includes(q);
        const industryStr = (c.industry || '').toLowerCase();
        const industryMatch = industryStr.includes(q);
        if (!nameMatch && !industryMatch) return false;
      }
      if (filterStatus && getDisplayStatusLabel(c) !== filterStatus) return false;
      if (filterIndustry) {
        const ind = (c.industry || '').trim().toLowerCase();
        if (ind !== filterIndustry.toLowerCase()) return false;
      }
      return true;
    });
  }, [companies, searchQuery, filterStatus, filterIndustry]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const paginatedCompanies = useMemo(
    () =>
      filteredCompanies.slice(
        (currentPage - 1) * pageSize,
        (currentPage - 1) * pageSize + pageSize
      ),
    [filteredCompanies, currentPage, pageSize]
  );

  const startIndex =
    filteredCompanies.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(filteredCompanies.length, currentPage * pageSize);

  // PUBLIC_APP_BASE_URL = participant Next app origin (company form + /survey/start emails).
  // PUBLIC_SURVEY_BASE_URL is the question-paper URL only (see /api/public/config questionPaperBaseUrl).
  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      try {
        setLoadingPublicAppBaseUrl(true);
        const res = await publicAPI.getConfig();
        const baseUrl =
          res.data?.publicAppBaseUrl ?? res.data?.surveyBaseUrl ?? null;

        if (cancelled) return;
        if (baseUrl) {
          setPublicAppBaseUrl(baseUrl);
          return;
        }

        if (typeof window !== 'undefined') {
          setPublicAppBaseUrl(window.location.origin);
        }
      } catch (e) {
        console.error('Failed to load public app base URL', e);
        if (typeof window !== 'undefined') {
          setPublicAppBaseUrl(window.location.origin);
        }
      } finally {
        if (!cancelled) setLoadingPublicAppBaseUrl(false);
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  // Ensure current page stays in range when filtered list or page size changes
  useEffect(() => {
    const newTotalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
    if (currentPage > newTotalPages) {
      setCurrentPage(newTotalPages);
    }
  }, [filteredCompanies.length, currentPage, pageSize]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterIndustry]);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const res = await companyAPI.getAll();
      setCompanies(res.data.companies || []);
    } catch (error: unknown) {
      console.error('Failed to load companies', error);
      const message = error instanceof Error ? error.message : 'Failed to load companies';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const loadRecipientsForCompany = async (companyId: string) => {
    setLoadingRecipients(true);
    setRecipientsError(null);
    try {
      const res = await companyAPI.getEmails(companyId);
      const list = Array.isArray(res.data.emails) ? res.data.emails : [];
      setMailRecipients(list.map((e: string) => String(e).trim()).filter(Boolean));
    } catch (error: unknown) {
      console.error('Failed to load company recipients', error);
      const message =
        error instanceof Error ? error.message : 'Failed to load recipient emails';
      setRecipientsError(message);
      toast.error(message);
    } finally {
      setLoadingRecipients(false);
    }
  };

  const updateMailRecipient = (index: number, value: string) => {
    setMailRecipients((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const removeMailRecipient = (index: number) => {
    setMailRecipients((prev) => prev.filter((_, i) => i !== index));
  };

  const addMailRecipient = () => {
    setMailRecipients((prev) => [...prev, '']);
  };

  const openModal = (type: ModalType, companyId: string) => {
    setSelectedCompanyId(companyId);
    if (type === 'edit') {
      const company = companies.find((c) => c._id === companyId);
      if (company) {
        setEditName(company.name);
        setEditEmail(company.email);
        setEditIndustry(company.industry || '');
        setEditEmployeeCount(
          typeof company.employeeCount === 'number'
            ? company.employeeCount
            : company.employeeCount || ''
        );
        setEditStatus(company?.status === 'inactive' ? 'inactive' : 'active');
        setEditExcelFile(null);
        setEditDepartments(
          Array.isArray(company.departments) ? [...company.departments] : []
        );
      }
    } else if (type === 'email') {
      setMailSubject('');
      setMailNotes('');
      setMailRecipients([]);
      setRecipientsError(null);
      if (companyId) {
        void loadRecipientsForCompany(companyId);
      }
    }
    setActiveModal(type);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedCompanyId(null);
    setDepartmentModalOpen(false);
    setCompanyLinkSubject('');
    setCompanyLinkNotes('');
    setCompanyLinkRecipient('');
  };

  const openShareCompanyFormModal = () => {
    setCompanyLinkSubject('');
    setCompanyLinkNotes('');
    setCompanyLinkRecipient('');
    setActiveModal('shareCompanyForm');
  };

  const confirmEditDepartment = (normalized: string) => {
    setEditDepartments((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized]
    );
  };

  const removeEditDepartment = (dept: string) => {
    setEditDepartments((prev) => prev.filter((d) => d !== dept));
  };

  const handleCopyFormLink = async () => {
    if (!publicAppBaseUrl) {
      toast.error(
        'Company form URL is not configured. Set `PUBLIC_APP_BASE_URL` in the backend `.env` (participant app origin).'
      );
      return;
    }

    let link: string;
    try {
      link = new URL('/companies', publicAppBaseUrl).toString();
    } catch {
      const trimmed = publicAppBaseUrl.replace(/\/$/, '');
      link = `${trimmed}/companies`;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast.success('Company form URL copied');
    } catch (error) {
      console.error('Failed to copy company form URL', error);
      toast.error('Unable to copy company form URL');
    }
  };

  const handleDelete = async () => {
    if (!selectedCompanyId) return;
    try {
      await companyAPI.delete(selectedCompanyId);
      setCompanies((prev) => prev.filter((c) => c._id !== selectedCompanyId));
      toast.success('Company deleted successfully');
      closeModal();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete company';
      toast.error(message);
    }
  };

  const handleViewAnalytics = (companyId: string) => {
    router.push(`/admin/reports?companyId=${companyId}`);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) return;
    if (!editName || !editEmail) {
      toast.error('Name and email are required');
      return;
    }
    try {
      setSavingEdit(true);
      const hasFile = !!editExcelFile;
      let updatedCompanyFromServer: Company | null = null;

      if (hasFile) {
        const formData = new FormData();
        formData.append('name', editName);
        formData.append('email', editEmail);
        if (editIndustry) formData.append('industry', editIndustry);
        if (editEmployeeCount !== '') {
          formData.append('employeeCount', String(editEmployeeCount));
        }
        formData.append('status', editStatus);
        formData.append('departments', editDepartments.join(','));
        if (editExcelFile) {
          formData.append('excelFile', editExcelFile);
        }
        const res = await companyAPI.updateWithFile(selectedCompanyId, formData);
        updatedCompanyFromServer = res.data.company || res.data;
      } else {
        const res = await companyAPI.update(selectedCompanyId, {
          name: editName,
          email: editEmail,
          industry: editIndustry || undefined,
          employeeCount: editEmployeeCount === '' ? undefined : editEmployeeCount,
          status: editStatus,
          departments: editDepartments,
        });
        updatedCompanyFromServer = res.data.company || res.data;
      }
      setCompanies((prev) =>
        prev.map((c) =>
          c._id === selectedCompanyId && updatedCompanyFromServer
            ? { ...c, ...updatedCompanyFromServer }
            : c
        )
      );
      toast.success('Company updated successfully');
      closeModal();
    } catch (error: unknown) {
      console.error('Failed to update company', error);
      const message = error instanceof Error ? error.message : 'Failed to update company';
      toast.error(message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSendCompanyFormLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const subj = companyLinkSubject.trim();
    if (!subj) {
      toast.error('Subject is required');
      return;
    }
    const to = companyLinkRecipient.trim();
    if (!to) {
      toast.error('Recipient email is required');
      return;
    }
    if (!SIMPLE_EMAIL_RE.test(to)) {
      toast.error('Enter a valid recipient email');
      return;
    }
    try {
      setSendingCompanyLink(true);
      await mailAPI.sendCompanyFormLink({
        subject: subj,
        notes: companyLinkNotes.trim() || undefined,
        recipientEmail: to,
      });
      toast.success('Email sent');
      closeModal();
    } catch (error: unknown) {
      console.error('Failed to send company link email', error);
      const message =
        error instanceof Error ? error.message : 'Failed to send email';
      toast.error(message);
    } finally {
      setSendingCompanyLink(false);
    }
  };

  const handleSendMail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) return;
    if (!publicAppBaseUrl) {
      toast.error(
        'Survey link is not configured. Set `PUBLIC_APP_BASE_URL` in the backend `.env` (participant app origin).'
      );
      return;
    }
    if (!mailSubject.trim()) {
      toast.error('Subject is required');
      return;
    }
    const recipientsToSend = normalizeRecipientList(mailRecipients);
    if (recipientsToSend.length === 0) {
      toast.error('Add at least one recipient email');
      return;
    }

    const invalid = recipientsToSend.filter((e) => !SIMPLE_EMAIL_RE.test(e));
    if (invalid.length > 0) {
      toast.error(`Invalid email address(es): ${invalid.slice(0, 3).join(', ')}${invalid.length > 3 ? '…' : ''}`);
      return;
    }

    const surveyLink = buildPublicSurveyStartUrl(publicAppBaseUrl, selectedCompanyId);

    try {
      setSendingMail(true);
      await mailAPI.sendBulk({
        subject: mailSubject.trim(),
        // Send a direct survey link so participants land on the survey, not the details form
        surveyLink,
        recipients: recipientsToSend,
        companyId: selectedCompanyId,
        notes: mailNotes,
      });

      toast.success('Emails queued for sending');
      // Refresh companies so that surveyStatus and analytics icon reflect the new state
      void fetchCompanies();
      closeModal();
    } catch (error: unknown) {
      console.error('Failed to send email', error);
      const message = error instanceof Error ? error.message : 'Failed to send email';
      toast.error(message);
    } finally {
      setSendingMail(false);
    }
  };

  const openExcelViewer = () => {
    // Excel viewing disabled for now
    return;
  };

  return (
    <AdminLayout>
      <DepartmentNameModal
        open={departmentModalOpen}
        onClose={() => setDepartmentModalOpen(false)}
        onConfirm={confirmEditDepartment}
        title="Add department"
        label="Enter department name"
      />
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Companies</h1>
            <p className="text-sm text-gray-500">
              Clean overview of all registered organizations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/companies/add"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-full hover:bg-primary-700 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Company
            </Link>
            <button
              type="button"
              onClick={openShareCompanyFormModal}
              className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-800 text-sm font-medium rounded-full hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Send className="w-4 h-4 mr-2 text-primary-600" />
              Send email
            </button>
            <button
              type="button"
              onClick={handleCopyFormLink}
              disabled={loadingPublicAppBaseUrl}
              className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-full hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Copy company form URL
            </button>
          </div>
        </div>

        {!loading && companies.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm px-4 py-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by company name or industry…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50/80 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                aria-label="Search companies by name or industry"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="company-filter-status">
                Filter by status
              </label>
              <select
                id="company-filter-status"
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus((e.target.value || '') as '' | DisplayStatusLabel)
                }
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="">All status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Completed">Completed</option>
                <option value="Session Ended">Session Ended</option>
                <option value="New">New</option>
              </select>
              <label className="sr-only" htmlFor="company-filter-industry">
                Filter by industry
              </label>
              <select
                id="company-filter-industry"
                value={filterIndustry}
                onChange={(e) => setFilterIndustry(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 min-w-[160px]"
              >
                <option value="">All industries</option>
                {industryOptions.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-primary-600 text-xs font-semibold">
                {companies.length}
              </span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Company Registry
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Click icons on a row to view, edit, email or delete.
            </p>
          </div>

          <div className="overflow-x-auto">
            {loading && companies.length === 0 ? (
              <div className="p-12 text-center text-gray-500">Loading companies...</div>
            ) : companies.length === 0 ? (
              <div className="p-12 text-center text-gray-500">No companies found.</div>
            ) : filteredCompanies.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No companies match your search or filters.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Industry
                    </th>
                    <th className="px-6 py-3 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {paginatedCompanies.map((c) => (
                    <tr key={c._id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-semibold text-gray-900">{c.name}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700">{c.email}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs text-gray-600 font-medium">
                          {c.industry || 'Not specified'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-semibold ${
                              c.status === 'inactive'
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : c.status === 'completed'
                                ? 'bg-sky-50 text-sky-700 border border-sky-100'
                                : c.status === 'session_ended'
                                ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                : c.status === 'pending' && c.surveyStatus === 'in_progress'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : c.status === 'new' || c.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}
                          >
                          <span className="h-1.5 w-1.5 rounded-full mr-1.5 bg-current" />
                          {!c.status || c.status === 'active' || (c.status === 'pending' && c.surveyStatus === 'in_progress')
                            ? 'Active'
                            : c.status === 'inactive'
                            ? 'Inactive'
                            : c.status === 'completed'
                            ? 'Completed'
                            : c.status === 'session_ended'
                            ? 'Session Ended'
                            : 'New'}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openModal('view', c._id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openModal('edit', c._id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                            title="Edit company"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openModal('email', c._id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Send email"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          {(c.surveyStatus === 'in_progress' ||
                            c.surveyStatus === 'completed' ||
                            c.status === 'session_ended') && (
                            <button
                              type="button"
                              onClick={() => handleViewAnalytics(c._id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                              title="View analytics"
                            >
                              <BarChart3 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openModal('delete', c._id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {companies.length > 0 && filteredCompanies.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500">
              <div>
                Showing{' '}
                <span className="font-medium">
                  {startIndex}-{endIndex}
                </span>{' '}
                of <span className="font-medium">{filteredCompanies.length}</span> companies
                {filteredCompanies.length !== companies.length && (
                  <span className="text-gray-400"> ({companies.length} total)</span>
                )}
              </div>
              <div className="inline-flex items-center justify-center rounded-full border border-gray-200 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-xs font-medium disabled:text-gray-300 disabled:bg-gray-50 hover:bg-gray-50"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 border-l border-r border-gray-200 text-xs">
                  Page <span className="font-semibold">{currentPage}</span> of{' '}
                  <span className="font-semibold">{totalPages}</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((p) => (p < totalPages ? p + 1 : p))
                  }
                  disabled={currentPage === totalPages || filteredCompanies.length === 0}
                  className="px-3 py-1.5 text-xs font-medium disabled:text-gray-300 disabled:bg-gray-50 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VIEW MODAL */}
      {activeModal === 'view' && selectedCompany && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em]">
                  Company overview
                </p>
                <h2 className="mt-1 text-xl font-semibold text-gray-900">
                  {selectedCompany.name}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Email
                  </p>
                  <p className="text-gray-800 break-all">{selectedCompany.email}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Industry
                  </p>
                  <p className="text-gray-800">
                    {selectedCompany.industry || 'Not specified'}
                  </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Allowed departments
                  </p>
                  {((list: string[]) =>
                    list.length === 0 ? (
                      <p className="text-sm text-gray-500">None configured</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {list.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    ))(normalizeDepartmentList(selectedCompany.departments))}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Employees
                  </p>
                  <p className="text-gray-800">
                    {typeof selectedCompany.employeeCount === 'number'
                      ? selectedCompany.employeeCount.toLocaleString()
                      : selectedCompany.employeeCount || 'Not available'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Status
                  </p>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-0.5 text-[11px] font-semibold ${
                      selectedCompany.status === 'inactive'
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : selectedCompany.status === 'completed'
                        ? 'bg-sky-50 text-sky-700 border border-sky-100'
                        : selectedCompany.status === 'session_ended'
                        ? 'bg-rose-50 text-rose-700 border border-rose-100'
                        : selectedCompany.status === 'pending' && selectedCompany.surveyStatus === 'in_progress'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : selectedCompany.status === 'new' || selectedCompany.status === 'pending'
                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full mr-1.5 bg-current" />
                    {!selectedCompany.status ||
                    selectedCompany.status === 'active' ||
                    (selectedCompany.status === 'pending' &&
                      selectedCompany.surveyStatus === 'in_progress')
                      ? 'Active'
                      : selectedCompany.status === 'inactive'
                      ? 'Inactive'
                      : selectedCompany.status === 'completed'
                      ? 'Completed'
                      : selectedCompany.status === 'session_ended'
                      ? 'Session Ended'
                      : 'New'}
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Registered on
                  </p>
                  <p className="text-gray-800">
                    {selectedCompany.createdAt
                      ? new Date(selectedCompany.createdAt).toLocaleDateString()
                      : 'Unknown'}
                  </p>
                </div>

              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-full text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {activeModal === 'edit' && selectedCompany && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
            <form onSubmit={handleSaveEdit} className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em]">
                  Edit company
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  {selectedCompany.name}
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Name
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Industry
                  </label>
                  <input
                    value={editIndustry}
                    onChange={(e) => setEditIndustry(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Employee count
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editEmployeeCount}
                    onChange={(e) =>
                      setEditEmployeeCount(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'active' | 'inactive')}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Allowed departments
                  </label>
                  <p className="text-[11px] text-gray-400">
                    Shown to participants when they start the survey.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {editDepartments.map((dept) => (
                      <span
                        key={dept}
                        className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white"
                      >
                        {dept}
                        <button
                          type="button"
                          onClick={() => removeEditDepartment(dept)}
                          className="text-white/90 hover:text-white"
                          aria-label={`Remove ${dept}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setDepartmentModalOpen(true)}
                    className="inline-flex items-center justify-center rounded-xl border border-primary-500 bg-primary-50 px-4 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                  >
                    + Add department
                  </button>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Excel file (optional)
                  </label>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(e) => setEditExcelFile(e.target.files?.[0] || null)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-full text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                >
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE COMPANY REGISTRATION LINK (header) */}
      {activeModal === 'shareCompanyForm' && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
            <form onSubmit={handleSendCompanyFormLink} className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em]">
                  Share registration link
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  Email company form link
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Send the public company registration URL to another organization or contact. The link
                  opens the same page as &quot;Copy company form URL&quot;.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                  Subject
                </label>
                <input
                  value={companyLinkSubject}
                  onChange={(e) => setCompanyLinkSubject(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="e.g. Your OHD company registration link"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                  Recipient email
                </label>
                <input
                  type="email"
                  value={companyLinkRecipient}
                  onChange={(e) => setCompanyLinkRecipient(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="contact@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                  Additional note
                </label>
                <textarea
                  value={companyLinkNotes}
                  onChange={(e) => setCompanyLinkNotes(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Optional message shown in the email body"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-full text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingCompanyLink}
                  className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                >
                  {sendingCompanyLink ? 'Sending…' : 'Send email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMAIL MODAL */}
      {activeModal === 'email' && selectedCompany && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
            <form onSubmit={handleSendMail} className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-[0.18em]">
                  Send survey email
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">
                  {selectedCompany.name}
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Subject
                  </label>
                  <input
                    value={mailSubject}
                    onChange={(e) => setMailSubject(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Email subject"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Additional notes
                  </label>
                  <textarea
                    value={mailNotes}
                    onChange={(e) => setMailNotes(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    rows={2}
                    placeholder="Optional internal notes for this mailing"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-end sm:justify-between">
                  <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">
                    Recipients
                  </label>
                  <button
                    type="button"
                    onClick={addMailRecipient}
                    disabled={loadingRecipients}
                    className="inline-flex items-center gap-1 self-start rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add email
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                  {loadingRecipients ? (
                    <p className="text-xs text-gray-600">Loading recipients from Excel…</p>
                  ) : (
                    <>
                      {recipientsError ? (
                        <p className="mb-2 text-xs text-red-500">{recipientsError}</p>
                      ) : null}
                      {mailRecipients.length === 0 ? (
                        <p className="text-xs text-gray-600">
                          No addresses loaded. Add emails below, or ensure an Excel file is uploaded for
                          this company.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {mailRecipients.map((email, index) => (
                            <li key={index} className="flex gap-2 items-center">
                              <input
                                type="email"
                                value={email}
                                onChange={(e) => updateMailRecipient(index, e.target.value)}
                                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                placeholder="name@example.com"
                                autoComplete="email"
                              />
                              <button
                                type="button"
                                onClick={() => removeMailRecipient(index)}
                                className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-200 hover:text-red-600"
                                aria-label="Remove recipient"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-400">
                The list is pre-filled from the Excel file on this company when available. You can edit,
                remove, or add addresses; the survey is sent to every valid email in the list above.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-full text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingMail || loadingPublicAppBaseUrl || !publicAppBaseUrl}
                  className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                >
                  {sendingMail ? 'Sending…' : 'Send email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {activeModal === 'delete' && selectedCompany && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-200 p-6 relative">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Delete company</h2>
              <p className="text-sm text-gray-600">
                Are you sure you want to permanently delete{' '}
                <span className="font-semibold">{selectedCompany.name}</span>? This action cannot
                be undone.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-full text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-5 py-2 rounded-full text-xs font-semibold text-white bg-red-600 hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fileViewerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl h-[80vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
            <button
              type="button"
              onClick={() => {
                setFileViewerUrl(null);
                setFileViewerTitle(null);
              }}
              className="absolute right-4 top-4 z-10 text-gray-400 hover:text-gray-600 bg-white/80 rounded-full p-1 shadow"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="px-5 pt-5 pb-2 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                {fileViewerTitle || 'Excel file'}
              </h2>
              {fileRawUrl && (
                <button
                  type="button"
                  onClick={() => window.open(fileRawUrl, '_blank', 'noopener,noreferrer')}
                  className="text-xs font-medium text-primary-600 hover:text-primary-800 underline underline-offset-2"
                >
                  Open in new tab
                </button>
              )}
            </div>
            <iframe
              src={fileViewerUrl ?? undefined}
              className="w-full h-[calc(100%-52px)]"
              style={{ border: 'none' }}
              title={fileViewerTitle || 'Excel file viewer'}
            />
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

