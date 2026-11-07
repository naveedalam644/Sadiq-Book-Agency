import React from 'react';
import { A4InvoiceModal, type A4InvoiceModalProps } from './A4InvoiceModal';

export interface ThermalReceiptModalProps extends A4InvoiceModalProps {}

/**
 * Backwards-compatible export that now renders the official A4 Professional Invoice
 * requested by Sadiq Book Agency.
 */
export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = (props) => {
  return <A4InvoiceModal {...props} />;
};

export { A4InvoiceModal };
