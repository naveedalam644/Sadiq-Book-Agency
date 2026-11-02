import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import type { SupplierDocument } from '../../types/database';
import type { CreateSupplierInput } from '../../services/supplierService';

export interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateSupplierInput) => Promise<void>;
  initialData?: SupplierDocument | null;
  isLoading?: boolean;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [currentBalance, setCurrentBalance] = useState<number | ''>(0);
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setCompanyName(initialData.companyName);
      setContactPerson(initialData.contactPerson);
      setPhone(initialData.phone);
      setEmail(initialData.email || '');
      setAddress(initialData.address || '');
      setCurrentBalance(initialData.currentBalance || 0);
      setIsActive(initialData.isActive);
    } else {
      setCompanyName('');
      setContactPerson('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCurrentBalance(0);
      setIsActive(true);
    }
    setFormError(null);
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!companyName.trim()) {
      setFormError('Company or Publisher name is required.');
      return;
    }

    if (!contactPerson.trim()) {
      setFormError('Contact person / Representative name is required.');
      return;
    }

    if (!phone.trim()) {
      setFormError('Phone number is required.');
      return;
    }

    const payload: CreateSupplierInput = {
      companyName: companyName.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      currentBalance: Number(currentBalance) || 0,
      isActive,
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save supplier.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Supplier' : 'Add New Supplier / Publisher'}
      description="Register publishing houses, notebook paper mills, and stationery distributors."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="gold"
            type="submit"
            form="supplier-form"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {initialData ? 'Save Changes' : 'Register Supplier'}
          </Button>
        </div>
      }
    >
      <form id="supplier-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
            {formError}
          </div>
        )}

        <Input
          label="Company / Publisher Name *"
          placeholder="e.g. Oxford University Press / Deer Paper Mills"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Contact Person / Rep *"
            placeholder="e.g. Tariq Mehmood"
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            required
          />

          <Input
            label="Phone Number *"
            placeholder="e.g. 0300-1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>

        <Input
          label="Email Address (Optional)"
          type="email"
          placeholder="e.g. sales@oxfordpress.pk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Input
          label="Warehouse / Billing Address"
          placeholder="e.g. Urdu Bazar, Lahore / Industrial Area, Karachi"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <Input
          label="Payable Balance (PKR)"
          type="number"
          min="0"
          step="any"
          value={currentBalance}
          onChange={(e) => setCurrentBalance(e.target.value === '' ? '' : parseFloat(e.target.value))}
          helperText="Amount currently owed to supplier (if opening ledger exists)"
        />

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="supplier-is-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded text-[#071F49] focus:ring-[#F5B51B] border-slate-300"
          />
          <label htmlFor="supplier-is-active" className="text-xs font-semibold text-slate-700 cursor-pointer">
            Active Supplier (Eligible for purchase orders)
          </label>
        </div>
      </form>
    </Modal>
  );
};
