'use client';

import { useCallback, useEffect, useState } from 'react';
import { publicAPI } from '@/lib/apiClient';
import { DEPARTMENTS_UPDATED_EVENT } from '@/lib/departmentsStorage';

const BC_NAME = 'ohd_departments';

/** Department names from the API (MongoDB), same list as the Admin Dashboard. */
export function useDashboardDepartments() {
  const [departments, setDepartments] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await publicAPI.getDepartments();
      setDepartments(res.data.departments || []);
    } catch {
      setDepartments([]);
    }
  }, []);

  useEffect(() => {
    void refresh();

    const onEvent = () => void refresh();
    window.addEventListener(DEPARTMENTS_UPDATED_EVENT, onEvent);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(BC_NAME);
      bc.onmessage = () => void refresh();
    } catch {
      /* unsupported */
    }

    return () => {
      window.removeEventListener(DEPARTMENTS_UPDATED_EVENT, onEvent);
      bc?.close();
    };
  }, [refresh]);

  return { departments, refresh };
}
