'use client';

import { UploadCloud } from 'lucide-react';
import { useState, useRef } from 'react';
import { companyAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import DepartmentNameModal from '@/components/DepartmentNameModal';

export default function CompanyDetailsFormPage() {
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [industry, setIndustry] = useState('');
  const [employeeCount, setEmployeeCount] = useState<number | ''>('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [excelFileName, setExcelFileName] = useState<string | null>(null);
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setExcelFileName(e.target.files[0].name);
    } else {
      setExcelFileName(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName) {
      toast.error('Company name is required');
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
      setSubmitted(true);

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
      const message = error instanceof Error ? error.message : 'Failed to submit details';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const addDepartment = () => setDepartmentModalOpen(true);

  const confirmDepartment = (normalized: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(normalized) ? prev : [...prev, normalized],
    );
  };

  const removeDepartment = (dept: string) => {
    setSelectedDepartments((prev) => prev.filter((d) => d !== dept));
  };

  const labelClass = 'mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-600';
  const fieldClass =
    'block w-full rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-900 transition-colors placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-500/40';

  return (
    <>
      <DepartmentNameModal
        open={departmentModalOpen}
        onClose={() => setDepartmentModalOpen(false)}
        onConfirm={confirmDepartment}
        title="Add department"
        label="Enter department name"
      />

      {/* Fixed viewport: centered logo + single-column fields; inner area scrolls only if needed */}
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-100">
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col p-2 sm:p-3 md:p-4"
        >
          <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-md">
            {/* Centered logo, then title — fields stack below in one column */}
            <header className="shrink-0 border-b border-gray-100 px-4 pb-3 pt-4 text-center sm:px-6 sm:pb-4 sm:pt-5">
              <div className="flex justify-center">
                <img
                  src="/ohdlogo.png"
                  alt="OHD"
                  width={96}
                  height={96}
                  className="h-20 w-20 object-contain sm:h-24 sm:w-24"
                />
              </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6 sm:py-4">
                <div className="mx-auto flex w-full max-w-md flex-col gap-3">
                  <div>
                    <label htmlFor="companyName" className={labelClass}>
                      Company name <span className="font-normal text-red-500">*</span>
                    </label>
                    <input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className={fieldClass}
                      placeholder="Company name"
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
                      Contact person
                    </label>
                    <input
                      id="contactPerson"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      className={fieldClass}
                      placeholder="Name of contact person"
                    />
                  </div>

                  <div>
                    <label htmlFor="phone" className={labelClass}>
                      Phone
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={fieldClass}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div>
                    <label htmlFor="industry" className={labelClass}>
                      Industry
                    </label>
                    <input
                      id="industry"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      className={fieldClass}
                      placeholder="e.g. Technology"
                    />
                  </div>

                  <div>
                    <label htmlFor="employeeCount" className={labelClass}>
                      Employees
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
                      placeholder="Number of employees"
                    />
                  </div>

                  <div className="border-t border-gray-100 pt-3">
                    <span className={labelClass}>Allowed departments</span>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {selectedDepartments.map((dept) => (
                        <span
                          key={dept}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-800"
                        >
                          {dept}
                          <button
                            type="button"
                            onClick={() => removeDepartment(dept)}
                            className="text-gray-400 hover:text-gray-700"
                            aria-label={`Remove ${dept}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={addDepartment}
                        className="rounded-md border border-primary-500 bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-100"
                      >
                        + Add department
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-3">
                    <span className={labelClass}>
                      Excel{' '}
                      <span className="font-normal normal-case tracking-normal text-gray-400">
                        (optional)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => excelInputRef.current?.click()}
                      className={`mt-1.5 flex w-full items-center gap-2.5 rounded-lg border border-dashed px-3 py-2.5 text-left transition-colors ${
                        excelFileName
                          ? 'border-primary-400 bg-primary-50/60'
                          : 'border-gray-300 bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      <input
                        ref={excelInputRef}
                        type="file"
                        accept=".xls,.xlsx"
                        onChange={handleExcelChange}
                        className="hidden"
                      />
                      <UploadCloud className="h-5 w-5 shrink-0 text-gray-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-gray-800">
                          {excelFileName || 'Click to choose .xls / .xlsx'}
                        </p>
                        <p className="text-[10px] text-gray-500">Up to 10MB</p>
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white px-4 py-3 sm:px-6">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit details'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
