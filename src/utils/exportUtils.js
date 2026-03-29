/**
 * Utility for exporting data to CSV format
 * @param {Array} data - Array of objects to export
 * @param {String} filename - The name of the resulting file (without extension)
 * @param {Array} headers - Optional array of strings for column headers
 */
export const exportToCSV = (data, filename = 'export', headers = null) => {
    if (!data || !data.length) {
        console.warn('No data available for export');
        return false;
    }

    // 1. Get headers from the first object if not provided
    const columnHeaders = headers || Object.keys(data[0]);

    // 2. Create CSV content
    const csvRows = [];
    
    // Add header row
    csvRows.push(columnHeaders.join(','));

    // Add data rows
    for (const rowObj of data) {
        const values = columnHeaders.map(header => {
            const val = rowObj[header];
            const escaped = ('' + (val ?? '')).replace(/"/g, '""'); // Escape double quotes
            return `"${escaped}"`; // Wrap in double quotes to handle commas within values
        });
        csvRows.push(values.join(','));
    }

    const csvString = csvRows.join('\n');

    // 3. Create blob and download
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${timestamp}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    return true;
};
