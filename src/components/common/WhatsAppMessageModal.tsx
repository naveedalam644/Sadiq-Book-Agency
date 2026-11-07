import React, { useState, useEffect, useMemo } from 'react';
import {
  Copy,
  Download,
  Share2,
  Check,
  AlertCircle,
  Phone,
  User,
} from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { WhatsAppIcon } from './WhatsAppIcon';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import type { SaleDocument, WhatsAppMessageType } from '../../types/database';
import { normalizePakistaniPhone } from '../../utils/phoneNormalizer';
import {
  openWhatsAppWebChat,
  logWhatsAppCommunication,
  isNativeFileShareSupported,
  shareViaDeviceNativeSheet,
} from '../../services/whatsappService';
import { downloadInvoicePdf, generateInvoicePdfFile } from '../../utils/invoicePdfGenerator';

export interface WhatsAppMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCustomerName?: string;
  initialPhone?: string;
  customerId?: string;
  defaultMessageText: string;
  messageType: WhatsAppMessageType;
  sale?: SaleDocument | null;
  relatedInvoiceNo?: string;
  relatedReturnNo?: string;
}

export const WhatsAppMessageModal: React.FC<WhatsAppMessageModalProps> = ({
  isOpen,
  onClose,
  initialCustomerName = 'Valued Customer',
  initialPhone = '',
  customerId,
  defaultMessageText,
  messageType,
  sale,
  relatedInvoiceNo,
  relatedReturnNo,
}) => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [messageText, setMessageText] = useState(defaultMessageText);
  const [isCopied, setIsCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Sync state when modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setCustomerName(initialCustomerName);
      setPhoneNumber(initialPhone || '');
      setMessageText(defaultMessageText);
      setIsCopied(false);
    }
  }, [isOpen, initialCustomerName, initialPhone, defaultMessageText]);

  // Real-time phone number normalization & validation
  const phoneValidation = useMemo(() => {
    return normalizePakistaniPhone(phoneNumber);
  }, [phoneNumber]);

  const canShareNative = useMemo(() => {
    return Boolean(sale && isNativeFileShareSupported());
  }, [sale]);

  if (!isOpen) return null;

  // Handle Copy Message
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setIsCopied(true);
      success('Message copied to clipboard.');

      // Log communication asynchronously
      logWhatsAppCommunication({
        customerId,
        customerName,
        phone: phoneNumber,
        messageType,
        messageText,
        relatedInvoiceNo: relatedInvoiceNo || sale?.invoiceNo,
        relatedReturnNo,
        status: 'copied',
        userId: currentUser?.uid,
        userEmail: currentUser?.email || undefined,
      });

      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toastError('Failed to copy to clipboard.');
    }
  };

  // Handle Open WhatsApp Web/Mobile
  const handleOpenWhatsApp = () => {
    if (!phoneValidation.isValid) {
      toastError(phoneValidation.error || 'Please enter a valid Pakistani mobile number.');
      return;
    }

    const res = openWhatsAppWebChat(phoneValidation.normalizedNumber, messageText);
    if (!res.success) {
      toastError(res.error || 'Could not open WhatsApp.');
      return;
    }

    // Log communication asynchronously
    logWhatsAppCommunication({
      customerId,
      customerName,
      phone: phoneValidation.normalizedNumber,
      messageType,
      messageText,
      relatedInvoiceNo: relatedInvoiceNo || sale?.invoiceNo,
      relatedReturnNo,
      status: 'opened',
      userId: currentUser?.uid,
      userEmail: currentUser?.email || undefined,
    });

    success('WhatsApp chat opened in a new tab.');
  };

  // Handle Native Share Sheet (for mobile devices with file sharing)
  const handleNativeShare = async () => {
    if (!sale) return;
    setIsSharing(true);
    try {
      const file = generateInvoicePdfFile(sale);
      const shared = await shareViaDeviceNativeSheet({
        file,
        title: `Invoice ${sale.invoiceNo}`,
        text: messageText,
      });

      if (shared) {
        logWhatsAppCommunication({
          customerId,
          customerName,
          phone: phoneValidation.normalizedNumber || phoneNumber,
          messageType,
          messageText,
          relatedInvoiceNo: sale.invoiceNo,
          status: 'opened',
          userId: currentUser?.uid,
          userEmail: currentUser?.email || undefined,
        });
        success('Shared successfully.');
        onClose();
      }
    } catch (err: any) {
      console.warn('Share error:', err);
      toastError('Could not launch device share sheet.');
    } finally {
      setIsSharing(false);
    }
  };

  // Handle Download PDF Invoice
  const handleDownloadPdf = () => {
    if (!sale) return;
    setIsDownloading(true);
    try {
      downloadInvoicePdf(sale);
      success('Invoice PDF downloaded.');
    } catch {
      toastError('Failed to download invoice PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share on WhatsApp"
      description="Sadiq Book Agency • Customer Messaging & Invoice Sharing"
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2.5 w-full">
          <div className="flex items-center gap-2">
            {sale && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                isLoading={isDownloading}
                leftIcon={<Download className="w-4 h-4 text-[#071F49]" />}
              >
                Download PDF
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              leftIcon={isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
            >
              {isCopied ? 'Copied' : 'Copy Text'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
            >
              Close
            </Button>

            {canShareNative && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNativeShare}
                isLoading={isSharing}
                leftIcon={<Share2 className="w-4 h-4 text-indigo-600" />}
              >
                Device Share
              </Button>
            )}

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleOpenWhatsApp}
              disabled={!phoneValidation.isValid}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              leftIcon={<WhatsAppIcon className="w-4 h-4" />}
            >
              Open WhatsApp
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Recipient Details Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
              Customer Name
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer Name"
                className="w-full pl-9 pr-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#071F49]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Mobile Number</span>
              {phoneValidation.isValid ? (
                <span className="text-emerald-700 font-mono text-[10px] font-black">
                  {phoneValidation.formattedDisplay}
                </span>
              ) : phoneNumber ? (
                <span className="text-rose-600 text-[10px] font-normal">
                  Invalid Format
                </span>
              ) : (
                <span className="text-slate-400 text-[10px] font-normal">
                  (03xx-xxxxxxx)
                </span>
              )}
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 0344-9633526"
                className={`w-full pl-9 pr-3 py-1.5 text-xs font-mono font-semibold bg-white border rounded-lg focus:outline-none focus:ring-1 ${
                  phoneValidation.isValid
                    ? 'border-emerald-500 text-slate-900 focus:ring-emerald-600'
                    : phoneNumber
                    ? 'border-rose-400 text-rose-800 focus:ring-rose-500'
                    : 'border-slate-300 text-slate-900 focus:ring-[#071F49]'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Validation Warning Alert */}
        {!phoneValidation.isValid && phoneNumber && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{phoneValidation.error}</span>
          </div>
        )}

        {/* Desktop Helper Note */}
        <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-[11px] text-emerald-900 flex items-start gap-2">
          <WhatsAppIcon className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">How Manual WhatsApp Sharing Works:</p>
            <p className="text-emerald-800">
              Clicking <strong>Open WhatsApp</strong> launches WhatsApp Web or your desktop app with the prefilled message.
              {sale && ' To send the invoice PDF, download it above and drag it into the opened chat.'}
            </p>
          </div>
        </div>

        {/* Editable Message Area */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-slate-700">
              Message Content (Editable)
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              {messageText.length} characters
            </span>
          </div>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={10}
            className="w-full p-3 text-xs font-sans text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#071F49] shadow-inner font-mono leading-relaxed"
            placeholder="Type or edit message..."
          />
        </div>
      </div>
    </Modal>
  );
};
