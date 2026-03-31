'use client';

import Image from 'next/image';
import { UploadCloud } from 'lucide-react';
import { useState, useRef } from 'react';
import { companyAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import DepartmentPickerModal from '@/components/DepartmentPickerModal';
import { useDashboardDepartments } from '@/lib/useDashboardDepartments';

export default function CompanyDetailsFormPage() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState('');
  const [employeeCount, setEmployeeCount] = useState<number | ''>('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [departmentPickerOpen, setDepartmentPickerOpen] = useState(false);
  const { departments: departmentsFromDashboard } = useDashboardDepartments();
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setExcelFileName(e.target.files[0].name);
    } else {
      setExcelFileName(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName || !email || !contactPerson || !phone || !industry || !employeeCount || selectedDepartments.length === 0 || !excelInputRef.current?.files?.[0]) {
      toast.error('Please fill in all fields and upload an excel file');
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append('name', companyName);
      if (email) formData.append('email', email);
      if (contactPerson) formData.append('contactPerson', contactPerson);
      if (phone) formData.append('phone', phone);
      if (industry) formData.append('industry', industry);
      if (employeeCount !== '') formData.append('employeeCount', String(employeeCount));
      if (selectedDepartments.length > 0) {
        formData.append('departments', selectedDepartments.join(','));
      }

      if (excelInputRef.current?.files && excelInputRef.current.files[0]) {
        formData.append('excelFile', excelInputRef.current.files[0]);
      }

      await companyAPI.submitFromCompany(formData);

      toast.success('Company details submitted successfully');

      setCompanyName('');
      setEmail('');
      setContactPerson('');
      setPhone('');
      setIndustry('');
      setEmployeeCount('');
      setSelectedDepartments([]);
      setExcelFileName(null);
      if (excelInputRef.current) {
        excelInputRef.current.value = '';
      }
    } catch (error: unknown) {
      console.error('Failed to submit company details', error);
      let apiMessage = 'Failed to submit details';
      if (error && typeof error === 'object' && 'response' in error) {
        const ax = error as {
          response?: { data?: { error?: string; message?: string } };
          message?: string;
        };
        apiMessage =
          ax.response?.data?.error ||
          ax.response?.data?.message ||
          ax.message ||
          apiMessage;
      } else if (error instanceof Error) {
        apiMessage = error.message;
      }
      toast.error(apiMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const togglePickerDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.some((d) => d.toLowerCase() === dept.toLowerCase())
        ? prev.filter((d) => d.toLowerCase() !== dept.toLowerCase())
        : [...prev, dept],
    );
  };

  const removeDepartment = (dept: string) => {
    setSelectedDepartments((prev) => prev.filter((d) => d !== dept));
  };

  const labelClass =
    'mb-1 block text-[12px] font-bold uppercase tracking-[0.08em] text-slate-600';
  const fieldClass =
    'block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-[13px] text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20';

  return (
    <>
      <DepartmentPickerModal
        open={departmentPickerOpen}
        onClose={() => setDepartmentPickerOpen(false)}
        departments={departmentsFromDashboard}
        selected={selectedDepartments}
        onToggle={togglePickerDepartment}
        title="Allowed departments"
      />

      <div className="fixed inset-0 z-0 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-slate-100 to-slate-200/90">
        {/* Navbar — logo only, larger mark */}
        <header className="flex h-[4.25rem] shrink-0 items-center border-b border-slate-200/90 bg-white/95 px-4 shadow-sm backdrop-blur-md sm:h-[4.5rem] sm:px-8">
          <Image
            src="/ohdlogo.png"
            alt="OHD"
            width={200}
            height={80}
            className="h-[3.25rem] w-auto max-w-[min(100%,14rem)] object-contain object-left sm:h-[3.75rem] sm:max-w-[16rem]"
            priority
          />
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain p-3 sm:p-5"
        >
          {/* Card height follows content — vertically centered so no empty white block inside */}
          <div className="my-auto mx-auto flex w-full max-w-5xl flex-col rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-300/40">
            <div className="px-4 py-4 sm:px-7 sm:py-5">
              <div className="grid grid-cols-1 gap-x-10 gap-y-3.5 md:grid-cols-2 md:gap-y-3">
                <div>
                  <label htmlFor="companyName" className={labelClass}>
                    Company name <span className="font-normal text-red-500">*</span>
                  </label>
                  <input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className={fieldClass}
                    placeholder="Registered company name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="adminEmail" className={labelClass}>
                    Admin email <span className="font-normal text-red-500">*</span>
                  </label>
                  <input
                    id="adminEmail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={fieldClass}
                    placeholder="admin@company.com"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="contactPerson" className={labelClass}>
                    Contact person <span className="font-normal text-red-500">*</span>
                  </label>
                  <input
                    id="contactPerson"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className={fieldClass}
                    placeholder="Primary contact name"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="phone" className={labelClass}>
                    Phone <span className="font-normal text-red-500">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={fieldClass}
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="industry" className={labelClass}>
                    Industry <span className="font-normal text-red-500">*</span>
                  </label>
                  <input
                    id="industry"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className={fieldClass}
                    placeholder="e.g. Technology"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="employeeCount" className={labelClass}>
                    Employees <span className="font-normal text-red-500">*</span>
                  </label>
                  <input
                    id="employeeCount"
                    type="number"
                    min={0}
                    value={employeeCount}
                    onChange={(e) =>
                      setEmployeeCount(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className={fieldClass}
                    placeholder="Approx. headcount"
                    required
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 md:col-span-2">
                  <span className={labelClass}>Allowed departments <span className="font-normal text-red-500">*</span></span>
                  <p className="mb-1.5 text-[10px] leading-snug text-slate-400">
                    Choose departments from your organization list (managed in the admin dashboard).
                  </p>
                  <div className="flex min-h-[2rem] flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDepartmentPickerOpen(true)}
                      className="rounded-md border border-primary-600 bg-primary-50 px-3 py-2 text-[12px] font-semibold text-primary-700 transition hover:bg-primary-100"
                    >
                      Allowed departments
                      {selectedDepartments.length > 0 ? (
                        <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[0.7rem] leading-none text-white">
                          {selectedDepartments.length}
                        </span>
                      ) : null}
                    </button>
                  </div>
                  <div className="mt-1.5 flex min-h-[1.5rem] flex-wrap items-center gap-1.5">
                    {selectedDepartments.map((dept) => (
                      <span
                        key={dept}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-medium text-slate-800"
                      >
                        {dept}
                        <button
                          type="button"
                          onClick={() => removeDepartment(dept)}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                          aria-label={`Remove ${dept}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-2">
                  <span className={labelClass}>
                    Excel <span className="font-normal text-red-500">*</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => excelInputRef.current?.click()}
                    className={`mt-1 flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-left transition-colors ${
                      excelFileName
                        ? 'border-primary-400 bg-primary-50/50'
                        : 'border-slate-300 bg-slate-50/80 hover:border-slate-400'
                    }`}
                  >
                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xls,.xlsx"
                      onChange={handleExcelChange}
                      className="hidden"
                      required
                    />
                    <UploadCloud className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {excelFileName || 'Attach .xls / .xlsx'}
                      </p>
                      <p className="text-[12px] text-slate-500">Max 10MB</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-slate-50/90 px-4 py-3.5 sm:px-7">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-primary-600 py-2.5 text-[14px] font-semibold text-white shadow-md shadow-primary-600/20 transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit details'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
