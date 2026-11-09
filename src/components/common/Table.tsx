import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T, index: number) => string;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'No records found.',
  isLoading = false,
}: TableProps<T>) {
  const showInitialLoading = isLoading && data.length === 0;
  const isRefreshing = isLoading && data.length > 0;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Background refresh progress indicator */}
      {isRefreshing && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-100 overflow-hidden z-10">
          <div className="h-full bg-[#F5B51B] animate-pulse w-full" />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600 border-collapse">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`px-3 sm:px-6 py-3 sm:py-3.5 whitespace-nowrap ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  } ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody
            className={`divide-y divide-slate-100 font-normal transition-opacity duration-200 ${
              isRefreshing ? 'opacity-75' : 'opacity-100'
            }`}
          >
            {showInitialLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400">
                  <div className="inline-flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-[#071F49] border-t-transparent rounded-full animate-spin" />
                    <span>Loading data...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-10 text-center text-sm text-slate-500"
                >
                  <p>{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={keyExtractor(row, index)}
                  className="hover:bg-slate-50/70 transition-colors duration-150"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-slate-700 ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {col.render ? col.render(row, index) : (row as any)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
