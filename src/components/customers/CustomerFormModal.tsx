import React, { useState, useEffect } from 'react';
import { AlertCircle, Store, Building2, User } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import type { CustomerDocument, CustomerType } from '../../types/database';
import type { CreateCustomerInput } from '../../services/customerService';

export interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateCustomerInput) => Promise<void>;
  initialData?: CustomerDocument | null;
  isLoading?: boolean;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading = false,
}) => {
  const [type, setType] = useState<CustomerType>('wholesaler');
  const [name, setName] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState<number | ''>(0);
  const [creditLimit, setCreditLimit] = useState<number | ''>(50000);
  const [creditDays, setCreditDays] = useState<number | ''>(30);
  const [initialBalance, setInitialBalance] = useState<number | ''>(0);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setName(initialData.name);
      setShopName(initialData.shopName || '');
      setPhone(initialData.phone);
      setSecondaryPhone(initialData.secondaryPhone || '');
      setAddress(initialData.address || '');
      setCity(initialData.city || '');
      setDiscountPercentage(initialData.discountPercentage ?? 0);
      setCreditLimit(initialData.creditLimit ?? 0);
      setCreditDays(initialData.creditDays ?? 30);
      setInitialBalance(0); // Cannot change opening balance directly via edit
      setNotes(initialData.notes || '');
    } else {
      setType('wholesaler');
      setName('');
      setShopName('');
      setPhone('');
      setSecondaryPhone('');
      setAddress('');
      setCity('');
      setDiscountPercentage(0);
      setCreditLimit(50000);
      setCreditDays(30);
      setInitialBalance(0);
      setNotes('');
    }
    setFormError(null);
  }, [initialData, isOpen]);

  // Adjust defaults when customer type changes during creation
  const handleTypeChange = (newType: CustomerType) => {
    setType(newType);
    if (!initialData) {
      if (newType === 'wholesaler') {
        setCreditLimit(50000);
        setCreditDays(30);
        setDiscountPercentage(0);
        if (name === 'Walk-in Retail Customer') setName('');
      } else if (newType === 'marketshop') {
        setCreditLimit(25000);
        setCreditDays(15);
        setDiscountPercentage(15);
        if (name === 'Walk-in Retail Customer') setName('');
      } else if (newType === 'parchon') {
        setCreditLimit(0);
        setCreditDays(0);
        setDiscountPercentage(0);
        if (!name) setName('Walk-in Retail Customer');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (type === 'wholesaler' && !shopName.trim()) {
      setFormError('Shop or Business Name is required for Wholesalers.');
      return;
    }

    if (type === 'marketshop' && !shopName.trim()) {
      setFormError('Shop or Kiosk Name is required for Marketshop customers.');
      return;
    }

    if (type !== 'parchon' && !phone.trim()) {
      setFormError('Primary mobile number is required.');
      return;
    }

    const payload: CreateCustomerInput = {
      type,
      name: name.trim() || (type === 'parchon' ? 'Walk-in Retail Customer' : 'Customer'),
      shopName: shopName.trim() || undefined,
      phone: phone.trim(),
      secondaryPhone: secondaryPhone.trim() || undefined,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      discountPercentage: type === 'marketshop' ? Number(discountPercentage) || 0 : 0,
      creditLimit: type === 'parchon' ? 0 : Number(creditLimit) || 0,
      creditDays: type !== 'parchon' && creditDays !== '' ? Number(creditDays) : undefined,
      initialBalance: !initialData && initialBalance !== '' ? Number(initialBalance) : undefined,
      notes: notes.trim() || undefined,
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save customer account.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Customer Profile' : 'Register New Customer Account'}
      description="Manage account details, credit limits, base discounts, and Khata ledger terms."
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="gold" type="submit" form="customer-form" isLoading={isLoading}>
            {initialData ? 'Save Changes' : 'Create Customer Account'}
          </Button>
        </div>
      }
    >
      <form id="customer-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Customer Type Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
            Customer Archetype *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange('wholesaler')}
              className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition ${
                type === 'wholesaler'
                  ? 'border-[#F5B51B] bg-[#071F49] text-white shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Building2 className={`w-4 h-4 mt-0.5 shrink-0 ${type === 'wholesaler' ? 'text-[#F5B51B]' : 'text-slate-400'}`} />
              <div>
                <div className="text-xs font-bold">Wholesaler</div>
                <div className={`text-[10px] mt-0.5 ${type === 'wholesaler' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Schools, bulk dealers, wholesale pricing
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange('marketshop')}
              className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition ${
                type === 'marketshop'
                  ? 'border-[#F5B51B] bg-[#071F49] text-white shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <Store className={`w-4 h-4 mt-0.5 shrink-0 ${type === 'marketshop' ? 'text-[#F5B51B]' : 'text-slate-400'}`} />
              <div>
                <div className="text-xs font-bold">Marketshop</div>
                <div className={`text-[10px] mt-0.5 ${type === 'marketshop' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Local stationery shops, agreed % discount
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleTypeChange('parchon')}
              className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition ${
                type === 'parchon'
                  ? 'border-[#F5B51B] bg-[#071F49] text-white shadow-xs'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
            >
              <User className={`w-4 h-4 mt-0.5 shrink-0 ${type === 'parchon' ? 'text-[#F5B51B]' : 'text-slate-400'}`} />
              <div>
                <div className="text-xs font-bold">Parchon (Retail)</div>
                <div className={`text-[10px] mt-0.5 ${type === 'parchon' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Counter walk-in, students, retail price
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Business & Personal Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {type !== 'parchon' && (
            <Input
              label={type === 'wholesaler' ? 'Business / Agency Name *' : 'Shop / Kiosk Name *'}
              placeholder="e.g. Al-Madina Book Depot"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              required
            />
          )}

          <Input
            label={type === 'parchon' ? 'Customer Name' : 'Proprietor / Contact Person Name *'}
            placeholder="e.g. Haji Muhammad Aslam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required={type !== 'parchon'}
          />

          {type === 'parchon' && (
            <Input
              label="Area / Neighborhood"
              placeholder="e.g. Minara Road / Military Road"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          )}
        </div>

        {/* Phone & Location */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label={type === 'parchon' ? 'Mobile Phone (Optional)' : 'Primary Mobile Phone *'}
            placeholder="0300-1234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required={type !== 'parchon'}
          />

          <Input
            label="Secondary Phone / WhatsApp"
            placeholder="0333-7654321"
            value={secondaryPhone}
            onChange={(e) => setSecondaryPhone(e.target.value)}
          />

          <Input
            label="City / Town"
            placeholder="e.g. Sukkur, Shikarpur"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        {type !== 'parchon' && (
          <Input
            label="Street Address / Market Row"
            placeholder="e.g. Shop # 14, Urdu Bazar / Liaquat Market"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        )}

        {/* Financial & Khata Terms */}
        {type !== 'parchon' && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Khata Credit Terms & Pricing
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {type === 'marketshop' ? (
                <Input
                  label="Agreed Store Discount (%) *"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={discountPercentage}
                  onChange={(e) =>
                    setDiscountPercentage(e.target.value === '' ? '' : parseFloat(e.target.value))
                  }
                  required
                />
              ) : (
                <div className="flex flex-col justify-center">
                  <span className="text-[11px] font-semibold text-slate-500">Base Price Rule</span>
                  <span className="text-xs font-bold text-[#071F49] mt-1">Wholesale Trade Price</span>
                </div>
              )}

              <Input
                label="Credit Limit (PKR) *"
                type="number"
                min="0"
                step="1000"
                value={creditLimit}
                onChange={(e) =>
                  setCreditLimit(e.target.value === '' ? '' : parseFloat(e.target.value))
                }
                required
              />

              <Input
                label="Credit Cycle (Days)"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 15 or 30 days"
                value={creditDays}
                onChange={(e) =>
                  setCreditDays(e.target.value === '' ? '' : parseInt(e.target.value, 10))
                }
              />
            </div>
          </div>
        )}

        {/* Initial Opening Balance from Paper Registers (New Customers Only) */}
        {!initialData && type !== 'parchon' && (
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-amber-900">
                Opening Balance from Paper Khata (Optional)
              </label>
              <span className="text-[10px] text-amber-700 font-medium">
                Positive = Udhaar debt; Negative = Advance
              </span>
            </div>
            <Input
              type="number"
              step="any"
              placeholder="0.00"
              value={initialBalance}
              onChange={(e) =>
                setInitialBalance(e.target.value === '' ? '' : parseFloat(e.target.value))
              }
            />
            <p className="text-[10px] text-amber-800/80 mt-1 italic">
              * If entered, an initial ledger entry will automatically be logged and the customer balance set via double-entry transaction.
            </p>
          </div>
        )}

        <Input
          label="Notes / Special Instructions"
          placeholder="e.g. Requires bilty delivery via Sadiq Goods / Special discount on registers"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </form>
    </Modal>
  );
};
