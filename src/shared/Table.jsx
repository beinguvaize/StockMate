import React from 'react';

const Table = ({ 
  headers = [], 
  rows = [], 
  renderRow, 
  emptyMessage = 'No data found',
  className = ''
}) => {
  return (
    <div className={`glass-panel !p-0 overflow-hidden !rounded-bento border-none shadow-premium ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-canvas border-b border-black/5">
              {headers.map((header, idx) => (
                <th 
                  key={idx} 
                  className={`px-4 py-3 text-sm font-semibold text-gray-700 opacity-80 ${header.className || ''}`}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {rows.length > 0 ? (
              rows.map((row, idx) => renderRow(row, idx))
            ) : (
              <tr>
                <td colSpan={headers.length} className="p-20 text-center">
                  <div className="w-16 h-16 rounded-pill bg-canvas flex items-center justify-center mx-auto mb-4 opacity-10">
                    <div className="w-8 h-8 rounded-pill bg-ink-primary" />
                  </div>
                  <div className="text-sm font-semibold text-ink-primary opacity-60">
                    {emptyMessage}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Table;
