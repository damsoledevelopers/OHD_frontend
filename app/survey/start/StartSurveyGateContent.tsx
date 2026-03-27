'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { companyAPI } from '@/lib/apiClient';
import toast from 'react-hot-toast';

type GateState =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | {
      kind: 'ready';
      active: boolean;
      companyName: string;
      reason?: string;
      /** When set and active, we re-check time so the button can turn off without refresh */
      startClosesAtMs?: number | null;
    };

export default function StartSurveyGateContent() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId') || '';
  const employeeEmail = searchParams.get('employeeEmail') || '';

  const [gate, setGate] = useState<GateState>({ kind: 'loading' });

  const surveyHref = useMemo(() => {
    if (!companyId) return '/survey';
    const params = new URLSearchParams();
    params.set('companyId', companyId);
    if (employeeEmail) params.set('employeeEmail', employeeEmail);
    return `/survey?${params.toString()}`;
  }, [companyId, employeeEmail]);

  useEffect(() => {
    if (!companyId) {
      setGate({ kind: 'invalid' });
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        const res = await companyAPI.getPublicById(companyId);
        const company = (res.data?.company || res.data) as {
          name?: string;
          surveyDispatchedAt?: string | null;
          surveyClosesAt?: string | null;
          surveyStatus?: string;
          surveyStartClosesAt?: string | null;
        };

        if (cancelled) return;

        const name = company?.name || 'Your organization';
        const now = Date.now();

        if (company.surveyStatus === 'completed') {
          setGate({
            kind: 'ready',
            active: false,
            companyName: name,
            reason: 'This survey has already been completed.',
          });
          return;
        }

        if (company.surveyClosesAt) {
          const closes = new Date(company.surveyClosesAt).getTime();
          if (!Number.isNaN(closes) && now > closes) {
            setGate({
              kind: 'ready',
              active: false,
              companyName: name,
              reason: 'The survey window has closed.',
            });
            return;
          }
        }

        if (!company.surveyDispatchedAt) {
          setGate({
            kind: 'ready',
            active: false,
            companyName: name,
            reason: 'The survey has not been opened yet. Please try again later.',
          });
          return;
        }

        const startClosesAt = company.surveyStartClosesAt
          ? new Date(company.surveyStartClosesAt).getTime()
          : null;

        if (startClosesAt !== null && !Number.isNaN(startClosesAt) && now > startClosesAt) {
          setGate({
            kind: 'ready',
            active: false,
            companyName: name,
            reason: 'The time to start this exam has ended.',
          });
          return;
        }

        setGate({
          kind: 'ready',
          active: true,
          companyName: name,
          startClosesAtMs: startClosesAt,
        });
      } catch (e: unknown) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : 'Failed to load survey';
        toast.error(message);
        setGate({ kind: 'invalid' });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const startClosesAtMsForTick = gate.kind === 'ready' ? gate.startClosesAtMs : undefined;
  const gateActive = gate.kind === 'ready' && gate.active;

  // If user keeps this page open, disable the button when the start window passes.
  useEffect(() => {
    if (!gateActive || startClosesAtMsForTick == null) return;

    const tick = () => {
      if (Date.now() > startClosesAtMsForTick) {
        setGate((prev) =>
          prev.kind === 'ready' && prev.active
            ? {
                kind: 'ready',
                active: false,
                companyName: prev.companyName,
                reason: 'The time to start this exam has ended.',
                startClosesAtMs: null,
              }
            : prev,
        );
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [gateActive, startClosesAtMsForTick]);

  if (gate.kind === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (gate.kind === 'invalid' || !companyId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid link</h1>
          <p className="text-gray-600">Please use the link from your invitation email.</p>
        </div>
      </div>
    );
  }

  const { active, companyName, reason } = gate;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
        <Image src="/ohdlogo.png" alt="OHD" width={80} height={80} className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Organization Health Diagnostic</h1>
        <p className="text-gray-600 mb-8">{companyName}</p>

        <p className="text-sm text-gray-700 mb-4">
          {active
            ? 'When you are ready, use the button below to open the exam.'
            : reason || 'You can no longer start the exam from this link.'}
        </p>

        <div className="flex justify-center">
          {active ? (
            <Link
              href={surveyHref}
              className="inline-block px-8 py-3 rounded-full font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm"
            >
              Start exam
            </Link>
          ) : (
            <span
              className="inline-block px-8 py-3 rounded-full font-semibold text-sm text-white bg-gray-400 cursor-not-allowed select-none"
              aria-disabled="true"
            >
              Start exam
            </span>
          )}
        </div>

        {active ? (
          <p className="mt-6 text-xs text-gray-500 break-all">
            If the button does not work, open:{' '}
            <span className="text-blue-700">{typeof window !== 'undefined' ? window.location.origin : ''}{surveyHref}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
