import React, { useState, useEffect } from 'react';
import { Building2, Phone, Mail, MapPin, Receipt, Calendar, ChevronRight } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import type { SupplierDocument, PurchaseDocument } from '../../types/database';
import { getSupplierPurchases } from '../../services/supplierService';
import { formatCurrency } from '../../utils/formatters';

export interface SupplierDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: SupplierDocument | null;
  onEdit?: (supplier: SupplierDocument) => void;
  onViewPurchase?: (purchase: PurchaseDocument) => void;
}

export const SupplierDetailModal: React.FC<SupplierDetailModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onEdit,
  onViewPurchase,
}) => {
  const [purchases, setPurchases] = useState<PurchaseDocument[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  useEffect(() => {
    if (supplier && isOpen) {
      setLoadingPurchases(true);
      getSupplierPurchases(supplier.id, 15)
        .then((data) => setPurchases(data))
        .catch((err) => console.error('Failed to load purchases:', err))
        .finally(() => setLoadingPurchases(false));
    } else {
      setPurchases([]);
    }
  }, [supplier, isOpen]);

  if (!supplier) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={supplier.companyName}
      description={`Contact: ${supplier.contactPerson} | Onboarded: ${new Date(supplier.createdAt).toLocaleDateString()}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          {onEdit && (
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(supplier);
              }}
            >
              Edit Supplier
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Contact & Payable Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 text-xs">
            <h4 className="font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-[#071F49]" />
              Vendor Contact Info
            </h4>
            <div className="flex items-center gap-2 text-slate-600">
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-900">{supplier.phone}</span>
            </div>
            {supplier.email && (
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{supplier.email}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-slate-600">
              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{supplier.address || 'Address not recorded'}</span>
            </div>
          </div>

          <div className="p-4 bg-[#071F49] text-white rounded-2xl flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 block mb-1">
                Outstanding Balance Payable
              </span>
              <div className="text-2xl font-black text-[#F5B51B] font-mono">
                {formatCurrency(supplier.currentBalance)}
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                Net liability owed to this publisher/vendor
              </p>
            </div>
            <div className="mt-3">
              {supplier.isActive ? (
                <Badge variant="success" size="sm" dot>
                  Active Vendor
                </Badge>
              ) : (
                <Badge variant="danger" size="sm">
                  Deactivated
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Purchase Invoices History */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#071F49]" />
              Purchase History References ({purchases.length})
            </h4>
            <span className="text-[11px] text-slate-400">Past stock shipments</span>
          </div>

          {loadingPurchases ? (
            <div className="p-6 text-center text-xs text-slate-400">Loading purchase records...</div>
          ) : purchases.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
              No purchase orders recorded for this supplier yet.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {purchases.map((p) => (
                <div
                  key={p.id}
                  className="p-3 hover:bg-slate-50 transition flex items-center justify-between text-xs cursor-pointer group"
                  onClick={() => onViewPurchase && onViewPurchase(p)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-[#071F49]">{p.purchaseInvoiceNo}</span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{p.items.length} items</span>
                    </div>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {p.purchaseDate}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-900 block">
                        {formatCurrency(p.grandTotal)}
                      </span>
                      <span className="text-[10px] text-slate-500 capitalize">
                        {p.paymentMethod.replace('_', ' ')}
                      </span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
