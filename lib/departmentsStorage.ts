/**
 * Cross-component / cross-tab notification when the department list changes on the server.
 * (Replaces the old localStorage-based list.)
 */
export const DEPARTMENTS_UPDATED_EVENT = 'ohd:departments-updated';

const BC_NAME = 'ohd_departments';

/** Call after any successful department API mutation so pickers refetch without a full reload. */
export function notifyDepartmentsUpdated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(DEPARTMENTS_UPDATED_EVENT));
  try {
    const bc = new BroadcastChannel(BC_NAME);
    bc.postMessage({ type: 'updated' });
    bc.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}
