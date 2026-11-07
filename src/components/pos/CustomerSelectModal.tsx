import React, { useState, useEffect } from 'react';
import { Search, X, Users, Store, UserCheck, Phone, MapPin, Check } from 'lucide-react';
import type { CustomerDocument, CustomerType } from '../../types/database';
import { getActiveCustomersForDropdown } from '../../services/customerService';

export interface CustomerSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: CustomerDocument | null, type: CustomerType) => void;
  activeCustomer: CustomerDocument | null;
  activeCustomerType: CustomerType;
}

export const CustomerSelectModal: React.FC<CustomerSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectCustomer,
  activeCustomer,
  activeCustomerType,
}) => {
  const [tabType, setTabType] = useState<CustomerType>(activeCustomerType || 'parchon');
  const [customers, setCustomers] = useState<CustomerDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const loadCustomers = async (type: CustomerType) => {
    if (type === 'parchon') {
      setCustomers([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getActiveCustomersForDropdown(false, type);
      setCustomers(data);
    } catch (err) {
      console.error('Error loading customers for POS selection:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTabType(activeCustomerType);
      loadCustomers(activeCustomerType);
    }
  }, [isOpen, activeCustomerType]);

  const handleTabChange = (type: CustomerType) => {
    setTabType(type);
    setSearchTerm('');
    if (type === 'parchon') {
      onSelectCustomer(null, 'parchon');
      onClose();
    } else {
      loadCustomers(type);
    }
  };

  if (!isOpen) return null;

  const filtered = customers.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      c.name.toLowerCase().includes(term) ||
      (c.shopName && c.shopName.toLowerCase().includes(term)) ||
      (c.phone && c.phone.includes(term)) ||
      (c.city && c.city.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#071F49] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-[#F5B51B]" />
            <h3 className="font-bold text-lg">Select Customer / Pricing Terms</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Customer Type Tabs */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-2">
          <button
            type="button"
            onClick={() => handleTabChange('parchon')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
              tabType === 'parchon'
                ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Parchon (Walk-in Cash)</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('wholesaler')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
              tabType === 'wholesaler'
                ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Wholesale Customer</span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('marketshop')}
            className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all ${
              tabType === 'marketshop'
                ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Marketshop Customer</span>
          </button>
        </div>

        {/* Body content based on tab */}
        {tabType === 'parchon' ? (
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <UserCheck className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-800">Counter Cash Customer Selected</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                Standard retail prices are applied with strictly 0% discount. No customer registration required. Cash only at counter.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectCustomer(null, 'parchon');
                onClose();
              }}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
            >
              Confirm Counter Walk-in
            </button>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden p-4 space-y-3">
            {/* Search filter input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search ${tabType === 'wholesaler' ? 'Wholesalers' : 'Marketshops'} by shop, name, or phone...`}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-slate-500">Loading customers...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No active {tabType} customers found matching "{searchTerm}".
                </div>
              ) : (
                filtered.map((c) => {
                  const isSelected = activeCustomer?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        onSelectCustomer(c, tabType);
                        onClose();
                      }}
                      className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50/80 border-l-4 border-blue-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            {c.shopName ? `${c.shopName} (${c.name})` : c.name}
                          </span>
                          {c.discountPercentage && c.discountPercentage > 0 && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-full">
                              {c.discountPercentage}% Base Off
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {c.phone}
                            </span>
                          )}
                          {c.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {c.city}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right space-y-0.5">
                        <div className="text-xs font-bold text-slate-800">
                          Khata:{' '}
                          <span className={(c.currentBalance || 0) > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                            PKR {(c.currentBalance || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Limit: PKR {c.creditLimit.toLocaleString()}
                        </div>
                        {isSelected && (
                          <div className="flex items-center justify-end gap-1 text-[10px] text-blue-600 font-bold">
                            <Check className="w-3 h-3" />
                            <span>Active</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
