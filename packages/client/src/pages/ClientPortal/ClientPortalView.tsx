import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { usePortalEstimate, usePortalAction } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { formatCurrency } from '../../lib/estimateCalc';
import type { Estimate, EstimateSection, EstimateLineItem } from '@openestimate/shared';

interface EstimateTotalsLocal {
  subtotal: number;
  overheadAmt: number;
  profitAmt: number;
  taxAmt: number;
  bondAmt: number;
  grandTotal: number;
}

interface PortalEstimate extends Estimate {
  projectName: string;
  companyName: string;
  logoUrl: string | null;
  totals: EstimateTotalsLocal;
}

interface PortalData {
  estimate: PortalEstimate;
  isExpired: boolean;
  isApproved: boolean;
  isRejected: boolean;
}

function LineItemRow({ item }: { item: EstimateLineItem }) {
  const total = (item.totalCost ?? (item.quantity * (item.unitMaterialCost + item.unitLaborCost)));
  return (
    <tr className="border-b border-gray-100 dark:border-zinc-800 last:border-0">
      <td className="py-2.5 pr-4 text-gray-800 dark:text-zinc-200">{item.description}</td>
      <td className="py-2.5 pr-4 text-right text-gray-600 dark:text-zinc-400 tabular-nums">
        {item.quantity} {item.unit}
      </td>
      <td className="py-2.5 pr-4 text-right text-gray-600 dark:text-zinc-400 tabular-nums">
        {formatCurrency(item.unitMaterialCost + item.unitLaborCost)}
      </td>
      <td className="py-2.5 text-right font-medium text-gray-900 dark:text-zinc-100 tabular-nums">
        {formatCurrency(total)}
      </td>
    </tr>
  );
}

export default function ClientPortalView() {
  const { token } = useParams<{ token: string }>();
  const [actionModalOpen, setActionModalOpen] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [actionDone, setActionDone] = useState(false);

  const { data: portalData, isLoading, error } = usePortalEstimate(token ?? '');
  const portalAction = usePortalAction();

  const data = portalData as PortalData | undefined;

  const handleAction = async () => {
    if (!actionModalOpen || !token) return;
    try {
      await portalAction.mutateAsync({ token, action: actionModalOpen, comment });
      setActionDone(true);
      setActionModalOpen(null);
    } catch {
      // handle error
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-950">
        <div className="text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-gray-900 dark:text-zinc-100">
            Link Not Found or Expired
          </h1>
          <p className="text-gray-500 dark:text-zinc-400 mt-2 max-w-sm">
            This estimate link may have expired or been revoked. Please contact your estimator for a new link.
          </p>
        </div>
      </div>
    );
  }

  const { estimate, isExpired, isApproved, isRejected } = data;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-8 mb-6">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              {data.estimate.logoUrl && (
                <img
                  src={data.estimate.logoUrl}
                  alt="Company logo"
                  className="h-10 mb-3 object-contain"
                />
              )}
              <h1 className="text-xl font-bold text-gray-900 dark:text-zinc-100">
                {data.estimate.companyName}
              </h1>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 dark:text-zinc-600 uppercase tracking-wider mb-1">
                Estimate
              </p>
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                #{estimate.id} · v{estimate.version}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 dark:text-zinc-600 uppercase tracking-wider mb-1">
                Project
              </p>
              <p className="font-medium text-gray-900 dark:text-zinc-100">
                {estimate.projectName}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 dark:text-zinc-600 uppercase tracking-wider mb-1">
                Estimate Name
              </p>
              <p className="font-medium text-gray-900 dark:text-zinc-100">{estimate.name}</p>
            </div>
          </div>
        </div>

        {/* Status banner */}
        {(isApproved || isRejected || actionDone || isExpired) && (
          <div
            className={[
              'rounded-xl border p-4 mb-6 flex items-center gap-3',
              isApproved || actionDone === true
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900'
                : isRejected
                ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900',
            ].join(' ')}
          >
            {isApproved ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
            ) : (
              <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">
              {isExpired
                ? 'This estimate link has expired.'
                : isApproved
                ? 'You have approved this estimate.'
                : isRejected
                ? 'You have rejected this estimate.'
                : 'Action recorded. Thank you!'}
            </p>
          </div>
        )}

        {/* Line items */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden mb-6">
          {(estimate.sections ?? []).map((section: EstimateSection) => (
            <div key={section.id}>
              <div className="px-6 py-3 bg-gray-50 dark:bg-zinc-900/80 border-b border-gray-200 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                  {section.name}
                </h3>
              </div>
              <div className="px-6 py-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-zinc-800">
                      <th className="text-left py-2 font-medium text-gray-500 dark:text-zinc-500 text-xs">
                        Description
                      </th>
                      <th className="text-right py-2 font-medium text-gray-500 dark:text-zinc-500 text-xs pr-4">
                        Qty
                      </th>
                      <th className="text-right py-2 font-medium text-gray-500 dark:text-zinc-500 text-xs pr-4">
                        Unit Cost
                      </th>
                      <th className="text-right py-2 font-medium text-gray-500 dark:text-zinc-500 text-xs">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(section.lineItems ?? []).map((item) => (
                      <LineItemRow key={item.id} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Totals */}
          {estimate.totals && (
            <div className="px-6 py-4 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/60">
              <div className="ml-auto max-w-xs space-y-1.5 text-sm">
                {[
                  { label: 'Subtotal', value: estimate.totals.subtotal },
                  { label: `Overhead (${estimate.overheadPct}%)`, value: estimate.totals.overheadAmt },
                  { label: `Profit (${estimate.profitPct}%)`, value: estimate.totals.profitAmt },
                  { label: `Tax (${estimate.taxPct}%)`, value: estimate.totals.taxAmt },
                  { label: `Bond (${estimate.bondPct}%)`, value: estimate.totals.bondAmt },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-gray-600 dark:text-zinc-400">
                    <span>{label}</span>
                    <span className="tabular-nums">{formatCurrency(value)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-gray-900 dark:text-zinc-100 border-t border-gray-200 dark:border-zinc-700 pt-2 mt-2">
                  <span>Grand Total</span>
                  <span className="tabular-nums">{formatCurrency(estimate.totals.grandTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isApproved && !isRejected && !isExpired && !actionDone && (
          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              leftIcon={<XCircle className="w-4 h-4" />}
              onClick={() => setActionModalOpen('reject')}
              className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/20"
            >
              Reject
            </Button>
            <Button
              leftIcon={<CheckCircle className="w-4 h-4" />}
              onClick={() => setActionModalOpen('approve')}
            >
              Approve Estimate
            </Button>
          </div>
        )}
      </div>

      {/* Action modal */}
      <Modal
        isOpen={!!actionModalOpen}
        onClose={() => setActionModalOpen(null)}
        title={actionModalOpen === 'approve' ? 'Approve Estimate' : 'Reject Estimate'}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setActionModalOpen(null)}>
              Cancel
            </Button>
            <Button
              variant={actionModalOpen === 'reject' ? 'danger' : 'primary'}
              onClick={handleAction}
              isLoading={portalAction.isPending}
            >
              {actionModalOpen === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-zinc-400">
            {actionModalOpen === 'approve'
              ? 'By approving, you confirm acceptance of this estimate.'
              : 'Please let us know if you have any concerns.'}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
              Comment (optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm px-3 py-2 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Add a comment…"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
