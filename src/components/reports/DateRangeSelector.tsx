import React, { useState } from 'react';
import { Calendar, Check } from 'lucide-react';
import type { DateRangePreset, DateRange } from '../../types/reports';
import { computeDateRange, validateDateRange } from '../../utils/datePresets';

export interface DateRangeSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  isLoading?: boolean;
}

const PRESET_OPTIONS: Array<{ preset: DateRangePreset; label: string }> = [
  { preset: 'today', label: 'Today' },
  { preset: 'yesterday', label: 'Yesterday' },
  { preset: 'this_week', label: 'This Week' },
  { preset: 'this_month', label: 'This Month' },
  { preset: 'last_month', label: 'Previous Month' },
  { preset: 'custom', label: 'Custom Range' },
];

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  value,
  onChange,
  isLoading = false,
}) => {
  const [isCustomOpen, setIsCustomOpen] = useState(value.preset === 'custom');
  const [customStart, setCustomStart] = useState(value.startDate);
  const [customEnd, setCustomEnd] = useState(value.endDate);
  const [customError, setCustomError] = useState<string | null>(null);

  const handlePresetSelect = (preset: DateRangePreset) => {
    if (preset === 'custom') {
      setIsCustomOpen(true);
      return;
    }
    setIsCustomOpen(false);
    setCustomError(null);
    const newRange = computeDateRange(preset);
    onChange(newRange);
  };

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateDateRange(customStart, customEnd);
    if (!validation.isValid) {
      setCustomError(validation.error || 'Invalid date range.');
      return;
    }
    setCustomError(null);
    const newRange = computeDateRange('custom', customStart, customEnd);
    onChange(newRange);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Presets Button Chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESET_OPTIONS.map((item) => {
            const isActive = value.preset === item.preset;
            return (
              <button
                key={item.preset}
                type="button"
                disabled={isLoading}
                onClick={() => handlePresetSelect(item.preset)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#071F49] text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                } disabled:opacity-50`}
              >
                {isActive && <Check className="w-3.5 h-3.5" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Period Label Display */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 shrink-0">
          <Calendar className="w-4 h-4 text-[#071F49]" />
          <span>{value.label}</span>
        </div>
      </div>

      {/* Custom Date Pickers Drawer */}
      {isCustomOpen && (
        <form
          onSubmit={handleApplyCustom}
          className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end gap-3 text-xs"
        >
          <div className="flex-1 space-y-1">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
              From (Start Date)
            </label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                setCustomError(null);
              }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#071F49] focus:outline-none"
              required
            />
          </div>

          <div className="flex-1 space-y-1">
            <label className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
              To (End Date)
            </label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                setCustomError(null);
              }}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#071F49] focus:outline-none"
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-[#071F49] hover:bg-[#0d3477] text-white font-bold rounded-xl text-xs shadow-xs transition active:scale-95 disabled:opacity-50"
            >
              Apply Custom Range
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCustomOpen(false);
                handlePresetSelect('this_month');
              }}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition"
            >
              Cancel
            </button>
          </div>

          {customError && (
            <div className="w-full text-rose-600 text-[11px] font-semibold pt-1">
              ⚠️ {customError}
            </div>
          )}
        </form>
      )}
    </div>
  );
};
