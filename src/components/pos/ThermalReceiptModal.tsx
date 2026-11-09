import React from 'react';
import { A4InvoiceModal, type A4InvoiceModalProps } from './A4InvoiceModal';

export interface ThermalReceiptModalProps extends A4InvoiceModalProps {}

/**
 * Renders the bill printing modal defaulting to 80mm continuous thermal POS roll paper,
 * with full dual-printer support for A4 laser/inkjet invoices.
 */
export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = (props) => {
  return <A4InvoiceModal defaultPaperSize="thermal" {...props} />;
};

export { A4InvoiceModal };
