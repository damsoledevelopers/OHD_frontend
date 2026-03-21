import api from './api';

// Public (no auth) — app config from backend .env
export const publicAPI = {
  getConfig: () =>
    api.get<{
      publicAppBaseUrl: string | null;
      questionPaperBaseUrl: string | null;
      /** @deprecated same as publicAppBaseUrl */
      surveyBaseUrl: string | null;
    }>('/public/config'),
};

// Auth APIs
export const authAPI = {
  signup: (data: { email: string; password: string }) =>
    api.post('/auth/signup', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
};

// Company APIs
export const companyAPI = {
  getAll: () => api.get('/companies'),
  getWithSurvey: () => api.get('/companies/with-survey'),
  getById: (id: string) => api.get(`/companies/${id}`),
  // Public read-only endpoint for survey participants; does not require admin auth.
  getPublicById: (id: string) => api.get(`/companies/public/${id}`),
  getEmails: (id: string) => api.get(`/companies/${id}/emails`),
  create: (data: Record<string, unknown>) => api.post('/companies', data),
  // Do not set Content-Type: axios adds multipart/form-data with the correct boundary for FormData.
  createWithFile: (formData: FormData) => api.post('/companies', formData),
  update: (id: string, data: Record<string, unknown>) => api.put(`/companies/${id}`, data),
  updateWithFile: (id: string, formData: FormData) =>
    api.put(`/companies/${id}`, formData),
  delete: (id: string) => api.delete(`/companies/${id}`),
  submitFromCompany: (formData: FormData) =>
    api.post('/companies/public', formData),
};

// Response APIs
export const responseAPI = {
  getByCompany: (companyId: string) => api.get(`/responses/companies/${companyId}`),
  submit: (data: Record<string, unknown>) => api.post('/responses', data),
  getCompanySummary: (companyId: string) => api.get(`/responses/companies/${companyId}/summary`),
};

// Report APIs
export const reportAPI = {
  getCompanyReport: (companyId: string) => api.get(`/reports/companies/${companyId}`),
  getSectionReport: (sectionId: string, companyId?: string) => {
    const params = companyId ? { companyId } : {};
    return api.get(`/reports/sections/${sectionId}`, { params });
  },
  getOverallReport: (params?: {
    companyId?: string;
    department?: string;
    employeeEmail?: string;
    sectionId?: string;
    pillarId?: string;
  }) => {
    const p: Record<string, string> = {};
    if (params?.companyId) p.companyId = params.companyId;
    if (params?.department) p.department = params.department;
    if (params?.employeeEmail) p.employeeEmail = params.employeeEmail;
    if (params?.sectionId) p.sectionId = params.sectionId;
    if (params?.pillarId) p.pillarId = params.pillarId;
    return api.get('/reports/overall', { params: p });
  },
};

// Question paper APIs (pillars/sections/questions structure)
// Admin draft endpoints live under `/api/question-paper/draft` on the backend.
// Published structure is exposed at `/api/question-paper/published`.
export const questionPaperAPI = {
  getDraft: () => api.get('/question-paper/draft'),
  saveDraft: (data: { pillars: any[] }) => api.put('/question-paper/draft', data),
  publish: () => api.post('/question-paper/publish', {}),
  getPublished: () => api.get('/question-paper/published'),
};

// Export APIs
export const exportAPI = {
  exportPDF: (companyId: string) => api.get(`/export/companies/${companyId}/pdf`, { responseType: 'blob' }),
  exportExcel: (companyId: string) => api.get(`/export/companies/${companyId}/excel`, { responseType: 'blob' }),
};

// Mail APIs
export const mailAPI = {
  sendBulk: (data: any) => api.post('/mail/bulk', data),
  sendCompanyFormLink: (data: {
    subject: string;
    notes?: string;
    recipientEmail: string;
  }) => api.post('/companies/share-registration-link', data),
  getLogs: (params?: any) => api.get('/mail/logs', { params }),
};

