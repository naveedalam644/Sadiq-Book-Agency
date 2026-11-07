import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { EducationalBoardDocument, SchoolDocument } from '../../types/database';
import { createSchool, updateSchool } from '../../services/syllabusService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';

export interface SchoolModalProps {
  isOpen: boolean;
  onClose: () => void;
  boards: EducationalBoardDocument[];
  initialBoardId?: string;
  editingSchool?: SchoolDocument | null;
  onSaved: () => void;
}

export const SchoolModal: React.FC<SchoolModalProps> = ({
  isOpen,
  onClose,
  boards,
  initialBoardId,
  editingSchool,
  onSaved,
}) => {
  const { currentUser } = useAuth();
  const { success } = useToast();

  const [boardId, setBoardId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (editingSchool) {
      setBoardId(editingSchool.boardId || '');
      setName(editingSchool.name || '');
      setPhone(editingSchool.phone || '');
      setAddress(editingSchool.address || '');
      setCity(editingSchool.city || '');
      setContactPerson(editingSchool.contactPerson || '');
    } else {
      setBoardId(initialBoardId && initialBoardId !== 'all' ? initialBoardId : (boards[0]?.id || ''));
      setName('');
      setPhone('');
      setAddress('');
      setCity('');
      setContactPerson('');
    }
    setValidationError(null);
  }, [editingSchool, initialBoardId, boards, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardId) {
      setValidationError('Please select an educational board.');
      return;
    }
    if (!name.trim()) {
      setValidationError('School name is required.');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      if (editingSchool) {
        await updateSchool(
          editingSchool.id,
          {
            name: name.trim(),
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            city: city.trim() || undefined,
            contactPerson: contactPerson.trim() || undefined,
          },
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`School "${name}" updated successfully.`);
      } else {
        await createSchool(
          {
            boardId,
            name: name.trim(),
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            city: city.trim() || undefined,
            contactPerson: contactPerson.trim() || undefined,
          },
          currentUser?.uid || 'admin',
          currentUser?.email || 'admin@sadiqbookagency.com'
        );
        success(`School "${name}" registered successfully.`);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save school.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingSchool ? 'Edit School / اسکول ایڈٹ کریں' : 'Add New School / نیا اسکول شامل کریں'}
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Board Selection */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Affiliated Board / الحاق شدہ تعلیمی بورڈ <span className="text-rose-500">*</span>
          </label>
          <select
            value={boardId}
            disabled={Boolean(editingSchool)}
            onChange={(e) => setBoardId(e.target.value)}
            className="w-full px-3 py-2 text-sm text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
            required
          >
            <option value="">Select an educational board...</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} {b.city ? `(${b.city})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* School Name */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            School Name / اسکول کا نام <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. City Model School, Iqbal Academy..."
            className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
          />
        </div>

        {/* Phone & Contact Person */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Contact Person / Principal
            </label>
            <input
              type="text"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Sir Aslam / Principal"
              className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Phone / Mobile
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="03xx-xxxxxxx"
              className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            />
          </div>
        </div>

        {/* City & Address */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Peshawar"
              className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Address / Campus
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Main Branch, Cantt"
              className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gold"
            isLoading={isSubmitting}
            leftIcon={<CheckCircle2 className="w-4 h-4 text-[#071F49]" />}
          >
            {editingSchool ? 'Update School' : 'Save School'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
