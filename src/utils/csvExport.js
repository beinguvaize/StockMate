/**
 * Ledgr ERP Centralized CSV Export Utility
 * Handles standard data structures and flattens nested objects (like Sales items)
 */

export const downloadCSV = (data, filename, businessName = 'Ledgr ERP') => {
    if (!data || data.length === 0) {
        alert("No data available to export.");
        return;
    }

    const timestamp = new Date().toLocaleString();
    const rows = [];
    
    // Add Branding Header
    rows.push([`"${businessName} - Data Export"`]);
    rows.push([`"Generated on: ${timestamp}"`]);
    rows.push([]); // Spacer

    // Extract Headers and Data
    const headers = Object.keys(data[0]);
    rows.push(headers.map(h => `"${String(h).toUpperCase()}"`));

    data.forEach(item => {
        const row = headers.map(header => {
            const val = item[header];
            if (val === null || val === undefined) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
        });
        rows.push(row);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

/**
 * Specifically flattens Sales data where each item is a separate row.
 */
export const exportSalesCSV = (sales, businessName = 'Ledgr ERP', getShopName = (id) => id) => {
    if (!sales || sales.length === 0) return alert("No sales data to export.");

    const flatSales = [];
    sales.forEach(sale => {
        const items = sale.items || [];
        items.forEach(item => {
            flatSales.push({
                'SALE_ID': sale.id,
                'DATE': sale.date,
                'CUSTOMER': getShopName(sale.shopId),
                'ITEM_NAME': item.name || 'Unknown',
                'SKU': item.sku || 'N/A',
                'QUANTITY': item.quantity,
                'UNIT_PRICE': item.price || item.sellingPrice,
                'LINE_TOTAL': (item.quantity * (item.price || item.sellingPrice)),
                'PAYMENT': sale.paymentStatus || 'COMPLETED',
                'ROUTE': sale.routeId || 'STORE'
            });
        });
    });

    downloadCSV(flatSales, 'ledgr_sales_detailed', businessName);
};

/**
 * Flattens Inventory data.
 */
export const exportInventoryCSV = (products, businessName = 'Ledgr ERP') => {
    const flatInventory = (products || []).map(p => ({
        'SKU': p.sku,
        'NAME': p.name,
        'CATEGORY': p.category,
        'UNIT': p.unit,
        'COST_PRICE': p.costPrice,
        'SELLING_PRICE': p.sellingPrice,
        'STOCK_LEVEL': p.stock,
        'TOTAL_VALUE_COST': (p.stock * p.costPrice),
        'TAX_RATE': p.taxRate,
    }));

    downloadCSV(flatInventory, 'ledgr_inventory', businessName);
};
