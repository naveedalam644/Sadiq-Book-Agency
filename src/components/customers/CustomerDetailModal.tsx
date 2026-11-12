import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Phone,
  MapPin,
  Wallet,
  Percent,
  Plus,
  Trash2,
  FileText,
  CreditCard,
  AlertTriangle,
  Receipt,
  User,
  Calendar,
  Clock,
  Printer,
  Globe,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { WhatsAppIcon } from '../common/WhatsAppIcon';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { WhatsAppMessageModal } from '../common/WhatsAppMessageModal';
import { A4InvoiceModal } from '../pos/A4InvoiceModal';
import {
  buildOutstandingBalanceWhatsAppMessage,
  buildAccountStatementWhatsAppMessage,
  buildInvoiceWhatsAppMessage,
} from '../../utils/whatsappTemplates';
import {
  syncCustomerPortal,
  buildCustomerPortalWhatsAppMessage,
} from '../../services/customerPortalService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type {
  CustomerDocument,
  CustomerDiscountDocument,
  CustomerLedgerDocument,
  SaleDocument,
} from '../../types/database';
import {
  getCustomerDiscountsPaginated,
  deleteCustomerProductDiscount,
} from '../../services/discountService';
import { getCustomerLedgerPaginated } from '../../services/ledgerService';
import {
  getCustomerInvoicesWithFifoBalances,
  type CustomerInvoiceFifoItem,
} from '../../services/dueDateService';
import { EditDueDateModal } from '../sales/EditDueDateModal';
import { CustomerBillModal } from './CustomerBillModal';
import { formatCurrency } from '../../utils/formatters';

export interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerDocument | null;
  onOpenPaymentModal: (customer: CustomerDocument) => void;
  onOpenDiscountModal: (customer: CustomerDocument, discount?: CustomerDiscountDocument) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  onClose,
  customer,
  onOpenPaymentModal,
  onOpenDiscountModal,
}) => {
  const { isAdmin } = useAuth();
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<'overview' | 'discounts' | 'invoices' | 'ledger'>('overview');
  const [discounts, setDiscounts] = useState<CustomerDiscountDocument[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerDocument[]>([]);
  const [invoices, setInvoices] = useState<CustomerInvoiceFifoItem[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState<'all_outstanding' | 'due_soon' | 'overdue' | 'paid'>('all_outstanding');
  const [editingDueDateSale, setEditingDueDateSale] = useState<SaleDocument | null>(null);
  const [isBillModalOpen, setIsBillModalOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [deletingDiscountId, setDeletingDiscountId] = useState<string | null>(null);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [isSyncingPortal, setIsSyncingPortal] = useState(false);

  // WhatsApp & Invoice Share State
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppMessageType, setWhatsAppMessageType] = useState<'outstanding_balance' | 'account_statement' | 'invoice'>('outstanding_balance');
  const [selectedInvoiceForA4, setSelectedInvoiceForA4] = useState<SaleDocument | null>(null);
  const [selectedInvoiceForWhatsApp, setSelectedInvoiceForWhatsApp] = useState<SaleDocument | null>(null);

  const handleSharePortalWhatsApp = () => {
    if (!customer) return;
    const url = `${window.location.origin}/khata/${customer.portalCode || 'wh-' + customer.id.slice(0, 8)}`;
    const msg = buildCustomerPortalWhatsAppMessage({
      customer,
      portalUrl: url,
    });
    const phone = customer.phone ? customer.phone.replace(/[^0-9]/g, '') : '';
    const cleanPhone = phone.startsWith('0') ? '92' + phone.slice(1) : phone;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
  };

  const handleSyncPortal = async () => {
    if (!customer) return;
    setIsSyncingPortal(true);
    try {
      await syncCustomerPortal(customer.id);
      toastSuccess('Khata portal synchronized with latest invoices and ledger!');
    } catch (err: any) {
      toastError(err?.message || 'Failed to sync Khata portal');
    } finally {
      setIsSyncingPortal(false);
    }
  };

  const handleOpenWhatsApp = (type: 'outstanding_balance' | 'account_statement') => {
    setSelectedInvoiceForWhatsApp(null);
    setWhatsAppMessageType(type);
    setIsWhatsAppModalOpen(true);
  };

  const handleShareInvoice = (sale: SaleDocument) => {
    setSelectedInvoiceForWhatsApp(sale);
    setWhatsAppMessageType('invoice');
    setIsWhatsAppModalOpen(true);
  };

  const loadCustomerDetails = useCallback(async () => {
    if (!customer) return;
    setLoadingData(true);
    try {
      const [discRes, ledgerRes, invRes] = await Promise.all([
        getCustomerDiscountsPaginated(customer.id, null, 50),
        getCustomerLedgerPaginated(customer.id, null, 50),
        getCustomerInvoicesWithFifoBalances(customer.id, customer.currentBalance),
      ]);
      setDiscounts(discRes.discounts);
      setLedgerEntries(ledgerRes.entries);
      setInvoices(invRes);
    } catch (err) {
      console.error('Failed to load customer details:', err);
    } finally {
      setLoadingData(false);
    }
  }, [customer]);

  useEffect(() => {
    if (isOpen && customer) {
      setActiveTab('overview');
      loadCustomerDetails();
    }
  }, [isOpen, customer, loadCustomerDetails]);

  if (!customer) return null;

  const currentBal = customer.currentBalance || 0;
  const creditLimit = customer.creditLimit || 0;
  const creditUsagePct = creditLimit > 0 ? Math.round((Math.max(0, currentBal) / creditLimit) * 100) : 0;
  const isOverCreditLimit = creditLimit > 0 && currentBal > creditLimit;

  const filteredInvoices = invoices.filter((inv) => {
    if (invoiceFilter === 'all_outstanding') return inv.remainingBalance > 0;
    if (invoiceFilter === 'due_soon') return inv.remainingBalance > 0 && inv.dueStatus === 'due_soon';
    if (invoiceFilter === 'overdue') return inv.remainingBalance > 0 && inv.dueStatus === 'overdue';
    if (invoiceFilter === 'paid') return inv.remainingBalance <= 0 || inv.dueStatus === 'paid';
    return true;
  });

  const handleDeleteDiscount = async (productId: string) => {
    if (!window.confirm('Are you sure you want to remove this product discount rule? Standard prices will apply.')) {
      return;
    }
    setDeletingDiscountId(productId);
    try {
      await deleteCustomerProductDiscount(customer.id, productId);
      setDiscounts((prev) => prev.filter((d) => d.productId !== productId));
    } catch (err) {
      console.error('Failed to remove discount:', err);
      alert('Failed to remove discount rule.');
    } finally {
      setDeletingDiscountId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={customer.shopName || customer.name}
      description={`Customer ID: ${customer.id} • Registered: ${customer.createdAt.split('T')[0]}`}
      size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {customer.type !== 'parchon' && (
              <>
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => setIsBillModalOpen(true)}
                  leftIcon={<Receipt className="w-3.5 h-3.5 text-[#071F49]" />}
                >
                  Create Credit Bill
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenPaymentModal(customer)}
                  leftIcon={<Wallet className="w-3.5 h-3.5" />}
                >
                  Record Khata Payment
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenWhatsApp('outstanding_balance')}
                  className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                  leftIcon={<WhatsAppIcon className="w-3.5 h-3.5" />}
                >
                  WhatsApp Reminder
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenDiscountModal(customer)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Product Discount
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Top Header Card */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#071F49] text-[#F5B51B] flex items-center justify-center shrink-0 shadow-xs">
              {customer.type === 'wholesaler' ? (
                <Building2 className="w-6 h-6" />
              ) : customer.type === 'marketshop' ? (
                <Building2 className="w-6 h-6" />
              ) : (
                <User className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-slate-900">
                  {customer.shopName ? `${customer.shopName}` : customer.name}
                </h3>
                <Badge
                  variant={
                    customer.type === 'wholesaler'
                      ? 'info'
                      : customer.type === 'marketshop'
                      ? 'gold'
                      : 'neutral'
                  }
                  size="sm"
                >
                  {customer.type.toUpperCase()}
                </Badge>
                {!customer.isActive && (
                  <Badge variant="danger" size="sm">
                    INACTIVE
                  </Badge>
                )}
              </div>
              {customer.shopName && (
                <p className="text-xs text-slate-500 mt-0.5">Contact: {customer.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Khata Balance
              </span>
              <span
                className={`font-mono text-base font-black ${
                  currentBal > 0
                    ? 'text-rose-700'
                    : currentBal < 0
                    ? 'text-sky-700'
                    : 'text-emerald-700'
                }`}
              >
                {formatCurrency(currentBal)}
              </span>
            </div>
            <div className="border-l border-slate-200 pl-4">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                Credit Limit
              </span>
              <span className="font-mono text-xs font-bold text-slate-700">
                {formatCurrency(creditLimit)}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'overview'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Profile & Terms
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('discounts')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'discounts'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Percent className="w-3.5 h-3.5" />
            <span>Product Discounts ({discounts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('invoices')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'invoices'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Outstanding Invoices ({invoices.filter((i) => i.remainingBalance > 0).length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'ledger'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Khata Ledger ({ledgerEntries.length})</span>
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Credit Limit Utilization */}
            {creditLimit > 0 && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-700 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-[#071F49]" />
                    Credit Limit Utilization
                  </span>
                  <span
                    className={`font-mono ${
                      isOverCreditLimit ? 'text-rose-600' : 'text-slate-700'
                    }`}
                  >
                    {creditUsagePct}% ({formatCurrency(Math.max(0, currentBal))} /{' '}
                    {formatCurrency(creditLimit)})
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      isOverCreditLimit
                        ? 'bg-rose-600'
                        : creditUsagePct > 80
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                    }`}
                    style={{ width: `${Math.min(100, creditUsagePct)}%` }}
                  />
                </div>
                {isOverCreditLimit && (
                  <div className="text-[11px] text-rose-700 font-semibold flex items-center gap-1 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Customer has exceeded approved credit limit by {formatCurrency(currentBal - creditLimit)}.</span>
                  </div>
                )}
              </div>
            )}

            {/* Wholesale Online Khata Portal Card */}
            {customer.type !== 'parchon' && (
              <div className="p-4 bg-linear-to-r from-sky-50 via-indigo-50/40 to-amber-50/50 border border-sky-200 rounded-2xl shadow-xs space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#071F49] text-[#F5B51B] flex items-center justify-center shadow-xs shrink-0">
                      <Globe className="w-5 h-5 text-[#F5B51B]" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-[#071F49] leading-tight">
                        Wholesale Online Khata Portal (آن لائن کھاتہ پورٹل لنک)
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Customer can view all invoices, book lists, discounts, and ledger balance in realtime.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSyncPortal}
                      disabled={isSyncingPortal}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-xs"
                      title="Sync latest bills & payments to customer portal"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPortal ? 'animate-spin text-[#071F49]' : ''}`} />
                      <span>{isSyncingPortal ? 'Syncing...' : 'Sync Portal'}</span>
                    </button>

                    <a
                      href={`/khata/${customer.portalCode || 'wh-' + customer.id.slice(0, 8)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#F5B51B]" />
                      <span>Open Portal</span>
                    </a>
                  </div>
                </div>

                {/* Link & Password Display Strip */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                  <div className="md:col-span-2 p-2.5 bg-white rounded-xl border border-sky-200 flex items-center justify-between gap-2 shadow-xs">
                    <div className="truncate text-xs font-mono text-slate-800">
                      <span className="text-slate-400 font-sans font-bold mr-1">Link:</span>
                      <span className="text-[#071F49] font-bold">
                        {typeof window !== 'undefined'
                          ? `${window.location.origin}/khata/${customer.portalCode || 'wh-' + customer.id.slice(0, 8)}`
                          : `/khata/${customer.portalCode}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const url = `${window.location.origin}/khata/${customer.portalCode || 'wh-' + customer.id.slice(0, 8)}`;
                        navigator.clipboard.writeText(url);
                        setCopiedPortal(true);
                        setTimeout(() => setCopiedPortal(false), 2500);
                      }}
                      className="px-2.5 py-1 bg-sky-100 hover:bg-sky-200 text-sky-950 rounded font-bold text-[11px] transition flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      {copiedPortal ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedPortal ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="p-2.5 bg-white rounded-xl border border-sky-200 flex items-center justify-between gap-2 shadow-xs">
                    <div className="text-xs">
                      <span className="text-slate-400 font-sans font-bold mr-1">PIN:</span>
                      <span className="font-mono font-black text-slate-900 tracking-wider">
                        {customer.portalPassword || '123456'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleSharePortalWhatsApp}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-[11px] transition flex items-center gap-1 shrink-0 cursor-pointer shadow-xs"
                      title="Share Portal Link & Password via WhatsApp"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>WhatsApp Link</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <span className="text-slate-400 font-medium block">Phone Number</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {customer.phone || 'N/A'}
                </span>
                {customer.secondaryPhone && (
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Alt: {customer.secondaryPhone}
                  </span>
                )}
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <span className="text-slate-400 font-medium block">City & Address</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  {customer.city || 'Sukkur'}
                </span>
                {customer.address && (
                  <span className="text-[11px] text-slate-500 block mt-1 truncate">
                    {customer.address}
                  </span>
                )}
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <span className="text-slate-400 font-medium block">Store Base Discount</span>
                <span className="font-mono text-sm font-bold text-slate-900 mt-0.5 block">
                  {customer.discountPercentage ? `${customer.discountPercentage}%` : '0%'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {customer.type === 'marketshop' ? 'Agreed retail store discount' : 'Standard catalog pricing'}
                </span>
              </div>
            </div>

            {customer.notes && (
              <div className="p-3 bg-amber-50/50 border border-amber-200 rounded-xl text-xs text-amber-900">
                <span className="font-bold block mb-0.5">Account Notes:</span>
                <p>{customer.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CUSTOM PRODUCT DISCOUNTS */}
        {activeTab === 'discounts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-500">
                Product rates manually customized for this customer. Overrides general catalog pricing.
              </p>
              <Button
                variant="gold"
                size="sm"
                onClick={() => onOpenDiscountModal(customer)}
                leftIcon={<Plus className="w-3 h-3 text-[#071F49]" />}
              >
                Assign Product Discount
              </Button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/70 uppercase font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Product Title & SKU</th>
                      <th className="px-3 py-2.5">Discount Rule</th>
                      <th className="px-3 py-2.5 text-right">Standard Rate</th>
                      <th className="px-3 py-2.5 text-right">Effective Custom Rate</th>
                      <th className="px-3 py-2.5 w-20 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingData ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-400">
                          Loading custom discounts...
                        </td>
                      </tr>
                    ) : discounts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-slate-400">
                          No product-wise discounts assigned yet. Click "Assign Product Discount" above.
                        </td>
                      </tr>
                    ) : (
                      discounts.map((d) => (
                        <tr key={d.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 py-2.5">
                            <span className="font-semibold text-slate-900 block truncate max-w-xs">
                              {d.productTitle}
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">{d.productSku}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={d.discountType === 'percentage' ? 'gold' : 'info'} size="sm">
                              {d.discountType === 'percentage'
                                ? `${d.discountValue}% Off ${d.basePriceType}`
                                : `Fixed Rate: ${formatCurrency(d.discountValue)}`}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-slate-500">
                            {formatCurrency(d.standardPrice)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                            {formatCurrency(d.effectivePrice)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteDiscount(d.productId)}
                              disabled={deletingDiscountId === d.productId}
                              className="p-1 text-slate-400 hover:text-rose-600 transition disabled:opacity-40"
                              title="Delete discount rule"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: OUTSTANDING INVOICES & DUE DATES */}
        {activeTab === 'invoices' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setInvoiceFilter('all_outstanding')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    invoiceFilter === 'all_outstanding'
                      ? 'bg-white text-slate-900 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Outstanding ({invoices.filter((i) => i.remainingBalance > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter('due_soon')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    invoiceFilter === 'due_soon'
                      ? 'bg-amber-500 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Due Soon ({invoices.filter((i) => i.remainingBalance > 0 && i.dueStatus === 'due_soon').length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter('overdue')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    invoiceFilter === 'overdue'
                      ? 'bg-red-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Overdue ({invoices.filter((i) => i.remainingBalance > 0 && i.dueStatus === 'overdue').length})
                </button>
                <button
                  type="button"
                  onClick={() => setInvoiceFilter('paid')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    invoiceFilter === 'paid'
                      ? 'bg-emerald-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Paid / Settled ({invoices.filter((i) => i.remainingBalance <= 0).length})
                </button>
              </div>

              {customer.type !== 'parchon' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => setIsBillModalOpen(true)}
                    leftIcon={<Receipt className="w-3 h-3 text-[#071F49]" />}
                  >
                    Create Credit Bill
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenPaymentModal(customer)}
                    leftIcon={<Wallet className="w-3 h-3 text-[#071F49]" />}
                  >
                    Record Payment
                  </Button>
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/70 uppercase font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Invoice #</th>
                      <th className="px-3 py-2.5">Bill Date</th>
                      <th className="px-3 py-2.5 text-right">Total Bill</th>
                      <th className="px-3 py-2.5 text-right text-emerald-700">Paid Amount</th>
                      <th className="px-3 py-2.5 text-right text-rose-700">Remaining Debt</th>
                      <th className="px-3 py-2.5 text-center">Due Date</th>
                      <th className="px-3 py-2.5 text-center">Status</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingData ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-slate-400">
                          Loading customer invoices...
                        </td>
                      </tr>
                    ) : filteredInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-8 text-slate-400">
                          No invoices found for selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredInvoices.map((inv) => (
                        <tr key={inv.sale.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {inv.sale.invoiceNo}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                            {(inv.sale.saleDate || inv.sale.createdAt).split('T')[0]}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">
                            {formatCurrency(inv.sale.grandTotal)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                            {formatCurrency(inv.allocatedPayments)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-black text-rose-700">
                            {formatCurrency(inv.remainingBalance)}
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-slate-700">
                            {inv.sale.dueDate ? (
                              <div className="flex items-center justify-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>{inv.sale.dueDate}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">None</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${inv.badgeColor}`}>
                              {inv.statusLabel}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right space-x-1 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoiceForA4(inv.sale)}
                              className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                              title="View & Print A4 Invoice"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareInvoice(inv.sale)}
                              className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition"
                              title="Share Invoice on WhatsApp"
                            >
                              <WhatsAppIcon className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setEditingDueDateSale(inv.sale)}
                                className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg transition"
                                title="Edit Invoice Due Date"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: KHATA LEDGER */}
        {activeTab === 'ledger' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs text-slate-500">
                Immutable chronological double-entry record of billing debits and payment receipts.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenWhatsApp('account_statement')}
                  className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                  leftIcon={<WhatsAppIcon className="w-3.5 h-3.5" />}
                >
                  WhatsApp Statement
                </Button>
                {customer.type !== 'parchon' && (
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => onOpenPaymentModal(customer)}
                    leftIcon={<Receipt className="w-3 h-3 text-[#071F49]" />}
                  >
                    Record Payment Receipt
                  </Button>
                )}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100/70 uppercase font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Voucher / Invoice #</th>
                      <th className="px-3 py-2.5 min-w-[180px]">Description</th>
                      <th className="px-3 py-2.5 text-right text-rose-700">Debit (Invoice)</th>
                      <th className="px-3 py-2.5 text-right text-emerald-700">Credit (Payment)</th>
                      <th className="px-3 py-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loadingData ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          Loading ledger history...
                        </td>
                      </tr>
                    ) : ledgerEntries.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          No ledger transactions recorded yet.
                        </td>
                      </tr>
                    ) : (
                      ledgerEntries.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{l.date}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">
                            {l.referenceInvoiceNo || l.referenceReceiptNo || '—'}
                          </td>
                          <td className="px-3 py-2.5 text-slate-800">{l.description}</td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-rose-700">
                            {l.entryType === 'debit' ? formatCurrency(l.amount) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-700">
                            {l.entryType === 'credit' ? formatCurrency(l.amount) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-black text-slate-900">
                            {formatCurrency(l.runningBalance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <EditDueDateModal
        isOpen={Boolean(editingDueDateSale)}
        onClose={() => setEditingDueDateSale(null)}
        sale={editingDueDateSale}
        onSuccess={() => {
          loadCustomerDetails();
        }}
      />

      <CustomerBillModal
        isOpen={isBillModalOpen}
        onClose={() => setIsBillModalOpen(false)}
        customer={customer}
        onSuccess={(newSale) => {
          loadCustomerDetails();
          setSelectedInvoiceForA4(newSale);
        }}
      />

      {/* A4 Invoice Preview & Print Modal */}
      <A4InvoiceModal
        isOpen={Boolean(selectedInvoiceForA4)}
        onClose={() => setSelectedInvoiceForA4(null)}
        sale={selectedInvoiceForA4}
      />

      {/* WhatsApp Message Modal */}
      {isWhatsAppModalOpen && customer && (
        <WhatsAppMessageModal
          isOpen={isWhatsAppModalOpen}
          onClose={() => {
            setIsWhatsAppModalOpen(false);
            setSelectedInvoiceForWhatsApp(null);
          }}
          initialCustomerName={customer.name}
          initialPhone={customer.phone || ''}
          customerId={customer.id}
          messageType={whatsAppMessageType}
          relatedInvoiceNo={selectedInvoiceForWhatsApp?.invoiceNo}
          sale={selectedInvoiceForWhatsApp || undefined}
          defaultMessageText={
            whatsAppMessageType === 'account_statement'
              ? buildAccountStatementWhatsAppMessage({
                  customerName: customer.name,
                  currentBalance: customer.currentBalance || 0,
                  recentEntries: ledgerEntries,
                })
              : selectedInvoiceForWhatsApp
              ? buildInvoiceWhatsAppMessage({
                  sale: selectedInvoiceForWhatsApp,
                  customer,
                })
              : buildOutstandingBalanceWhatsAppMessage({
                  customerName: customer.name,
                  currentBalance: customer.currentBalance || 0,
                  dueDate: invoices.find((i) => i.remainingBalance > 0 && i.sale.dueDate)?.sale.dueDate,
                })
          }
        />
      )}
    </Modal>
  );
};
