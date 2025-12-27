/**
 * PDF Export Utility for MedTrack / EP Group
 * Uses jspdf and jspdf-autotable for generating PDF reports
 * Unified template system with settings integration
 * Supports Arabic and English text using html2canvas
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { getBackendBaseUrl } from './api';

/**
 * Common utility functions for PDF generation
 */
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [234, 88, 12]; // Default orange (EP Group brand)
};

const getDocumentPrefix = (settings) => {
    return settings.document_prefix || settings.invoice_company_name || 'EP Group';
};

/**
 * Save PDF with explicit filename using blob + anchor method
 * This bypasses jsPDF's internal save which can be unreliable
 * @param {jsPDF} doc - jsPDF document instance
 * @param {string} filename - The desired filename including .pdf extension
 */
const savePDFWithFilename = (doc, filename) => {
    // Generate blob from PDF
    const blob = doc.output('blob');

    // Create object URL for the blob
    const url = URL.createObjectURL(blob);

    // Create anchor element
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;  // This sets the download filename
    link.style.display = 'none';

    // Append to body, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke the object URL to free memory
    setTimeout(() => URL.revokeObjectURL(url), 100);
};

/**
 * Load an image from URL and convert to base64 for PDF embedding
 * Handles CORS by using the API base URL for relative paths
 * @param {string} imageUrl - URL of the image to load
 * @returns {Promise<{data: string, format: string}|null>} - Base64 data and format or null if failed
 */
const loadImageAsBase64 = async (imageUrl) => {
    if (!imageUrl) return null;

    try {
        // Handle relative URLs - use API base URL to avoid CORS
        let fullUrl = imageUrl;
        if (imageUrl.startsWith('/')) {
            // Use dynamic backend URL for mobile/network access
            fullUrl = `${getBackendBaseUrl()}${imageUrl}`;
        }

        // Detect format from URL
        const extension = fullUrl.split('.').pop()?.toLowerCase() || 'png';
        const formatMap = {
            'png': 'PNG',
            'jpg': 'JPEG',
            'jpeg': 'JPEG',
            'gif': 'GIF',
            'webp': 'WEBP'
        };
        const format = formatMap[extension] || 'PNG';

        // Fetch the image
        const response = await fetch(fullUrl, {
            mode: 'cors',
            credentials: 'omit' // Don't send credentials for image fetch
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();

        // Convert to base64
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve({
                data: reader.result,
                format: format
            });
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.warn('[PDF] Failed to load logo:', error.message);
        return null;
    }
};

/**
 * Preload logo for PDF generation
 * @param {Object} settings - Site settings containing invoice_logo_url
 * @returns {Promise<string|null>} - Base64 logo or null
 */
export const preloadLogoForPDF = async (settings) => {
    if (!settings?.invoice_logo_url) return null;
    return await loadImageAsBase64(settings.invoice_logo_url);
};

/**
 * Add unified header to PDF document with optional logo
 * @param {jsPDF} doc - jsPDF document instance
 * @param {Object} settings - Site settings
 * @param {string} title - Document title (INVOICE, EXPENSE CLAIM, etc.)
 * @param {string} serialNum - Serial number to display
 * @param {string} status - Document status
 * @param {string} date - Document date
 * @param {{data: string, format: string}|null} logoData - Logo object with base64 data and format or null
 */
const addUnifiedHeader = (doc, settings, title, serialNum, status, date, logoData = null) => {
    const pageWidth = doc.internal.pageSize.width;
    const primaryColor = hexToRgb(settings.invoice_primary_color || '#ea580c');
    const companyName = settings.invoice_company_name || settings.company_name || 'EP Group';
    const tagline = settings.invoice_tagline || '';

    // Header background
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Logo or Company name
    let textStartX = 14;
    if (logoData && logoData.data) {
        try {
            // Add logo (white background area for better visibility)
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(10, 5, 36, 28, 2, 2, 'F');
            // Add the logo image with detected format
            doc.addImage(logoData.data, logoData.format || 'PNG', 12, 7, 32, 24);
            textStartX = 52; // Move text to the right of logo
        } catch (err) {
            console.warn('[PDF] Failed to add logo to PDF:', err);
        }
    }

    // Company name
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(logoData && logoData.data ? 18 : 22);
    doc.text(companyName, textStartX, 16);

    // Tagline
    if (tagline) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(tagline, textStartX, 23);
    }

    // Document title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(title, textStartX, 34);

    // Right side - serial, status, date
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`#${serialNum}`, pageWidth - 14, 14, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Status: ${status?.toUpperCase() || 'PENDING'}`, pageWidth - 14, 23, { align: 'right' });
    doc.text(`Date: ${date}`, pageWidth - 14, 30, { align: 'right' });

    return primaryColor;
};

/**
 * Add MODERN template header - gradient purple/indigo with sleek design
 */
const addModernHeader = (doc, settings, title, serialNum, status, date, logoData = null) => {
    const pageWidth = doc.internal.pageSize.width;
    const companyName = settings.invoice_company_name || settings.company_name || 'EP Group';
    const tagline = settings.invoice_tagline || '';

    // Gradient effect with multiple rectangles (purple to pink gradient simulation)
    doc.setFillColor(99, 102, 241); // Indigo-500
    doc.rect(0, 0, pageWidth / 3, 45, 'F');
    doc.setFillColor(139, 92, 246); // Violet-500
    doc.rect(pageWidth / 3, 0, pageWidth / 3, 45, 'F');
    doc.setFillColor(168, 85, 247); // Purple-500
    doc.rect((pageWidth / 3) * 2, 0, pageWidth / 3, 45, 'F');

    // Accent line at bottom of header
    doc.setFillColor(236, 72, 153); // Pink-500
    doc.rect(0, 45, pageWidth, 3, 'F');

    // Logo
    let textStartX = 14;
    if (logoData && logoData.data) {
        try {
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(10, 8, 32, 28, 3, 3, 'F');
            doc.addImage(logoData.data, logoData.format || 'PNG', 12, 10, 28, 24);
            textStartX = 48;
        } catch (err) { console.warn('Logo failed:', err); }
    }

    // Company name - larger, bold
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(companyName, textStartX, 20);

    // Tagline
    if (tagline) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(10);
        doc.text(tagline, textStartX, 28);
    }

    // Document title with modern styling
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title, textStartX, 40);

    // Right side info with modern badge style
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(`#${serialNum}`, pageWidth - 14, 18, { align: 'right' });

    // Status badge
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(pageWidth - 50, 22, 36, 10, 2, 2, 'F');
    doc.setTextColor(99, 102, 241);
    doc.setFontSize(8);
    doc.text(status?.toUpperCase() || 'PENDING', pageWidth - 32, 28, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text(`Date: ${date}`, pageWidth - 14, 42, { align: 'right' });

    return [139, 92, 246]; // Return violet color for consistency
};

/**
 * Add MINIMAL template header - clean, simple with subtle borders
 */
const addMinimalHeader = (doc, settings, title, serialNum, status, date, logoData = null) => {
    const pageWidth = doc.internal.pageSize.width;
    const companyName = settings.invoice_company_name || settings.company_name || 'EP Group';
    const tagline = settings.invoice_tagline || '';
    const primaryColor = hexToRgb(settings.invoice_primary_color || '#14b8a6');

    // Clean white background with subtle border
    doc.setFillColor(250, 250, 250);
    doc.rect(0, 0, pageWidth, 38, 'F');

    // Top accent line
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 2, 'F');

    // Bottom border
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(14, 38, pageWidth - 14, 38);

    // Logo
    let textStartX = 14;
    if (logoData && logoData.data) {
        try {
            doc.addImage(logoData.data, logoData.format || 'PNG', 14, 6, 28, 24);
            textStartX = 48;
        } catch (err) { console.warn('Logo failed:', err); }
    }

    // Company name - clean, dark
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(companyName, textStartX, 14);

    // Tagline
    if (tagline) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text(tagline, textStartX, 21);
    }

    // Document title - subtle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...primaryColor);
    doc.text(title, textStartX, 32);

    // Right side - clean layout
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(`#${serialNum}`, pageWidth - 14, 14, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`${status?.toUpperCase() || 'PENDING'}`, pageWidth - 14, 22, { align: 'right' });
    doc.text(date, pageWidth - 14, 30, { align: 'right' });

    return primaryColor;
};

/**
 * Route to correct header based on template selection
 */
const addTemplateHeader = (doc, settings, title, serialNum, status, date, logoData = null) => {
    const template = settings.invoice_template || 'classic';

    switch (template) {
        case 'modern':
            return addModernHeader(doc, settings, title, serialNum, status, date, logoData);
        case 'minimal':
            return addMinimalHeader(doc, settings, title, serialNum, status, date, logoData);
        case 'classic':
        default:
            return addUnifiedHeader(doc, settings, title, serialNum, status, date, logoData);
    }
};

/**
 * Add unified footer to PDF document
 */
const addUnifiedFooter = (doc, settings) => {
    const pageWidth = doc.internal.pageSize.width;
    const footerText = settings.invoice_footer || 'Thank you for your business!';
    const footerY = doc.internal.pageSize.height - 15;

    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(footerText, pageWidth / 2, footerY, { align: 'center' });
    doc.text(`Generated on ${new Date().toLocaleString()}`, pageWidth / 2, footerY + 5, { align: 'center' });
};

/**
 * Generate PDF Preview for Settings page (Live Preview)
 * Creates a sample PDF with current settings to show how invoices/expenses will look
 * @param {string} type - 'invoice' or 'expense'
 * @param {Object} settings - Current site settings from Print Templates
 * @param {string|null} preloadedLogo - Optional preloaded logo base64 (for faster previews)
 * @returns {Promise<string>} - Blob URL for embedding in iframe
 */
export const generatePreviewPDF = async (type = 'invoice', settings = {}, preloadedLogo = null) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const textColor = [51, 65, 85];

    // Load logo if not preloaded
    let logoData = preloadedLogo;
    if (!logoData && settings.invoice_logo_url) {
        logoData = await loadImageAsBase64(settings.invoice_logo_url);
    }

    if (type === 'invoice') {
        // Sample invoice data
        const sampleOrder = {
            serial_number: '1001',
            status: 'approved',
            created_at: new Date().toISOString(),
            order_type: 'regular',
            products: [
                { name: 'Medical Product A', quantity: 2, price: 150 },
                { name: 'Medical Product B', quantity: 3, price: 200 },
                { name: 'Healthcare Kit C', quantity: 1, price: 350 }
            ],
            subtotal: 1250,
            discount_type: 'percentage',
            discount_value: 10,
            total_amount: 1125,
            notes: 'Sample invoice preview - This is how your invoices will appear.'
        };

        const sampleClinic = {
            name: 'Sample Medical Center',
            doctor_name: 'Ahmed Mohamed',
            address: 'Cairo, Egypt - Main Street 123',
            phone: '+20 100 123 4567'
        };

        // Add header based on selected template (Classic/Modern/Minimal)
        const primaryColor = addTemplateHeader(doc, settings, 'INVOICE / FATURA', sampleOrder.serial_number, sampleOrder.status, new Date().toLocaleDateString('en-GB'), logoData);
        doc.setTextColor(...textColor);

        // Bill To section
        let yPos = 50;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('BILL TO:', 14, yPos);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        yPos += 6;
        doc.text(sampleClinic.name, 14, yPos);
        yPos += 5;
        doc.text(`Dr. ${sampleClinic.doctor_name}`, 14, yPos);
        yPos += 5;
        doc.text(sampleClinic.address, 14, yPos);
        yPos += 5;
        doc.text(`Tel: ${sampleClinic.phone}`, 14, yPos);

        // Products table
        yPos = 85;
        const tableData = sampleOrder.products.map((p, i) => [
            i + 1,
            p.name,
            p.quantity,
            `${p.price.toLocaleString()} EGP`,
            `${(p.quantity * p.price).toLocaleString()} EGP`
        ]);

        autoTable(doc, {
            head: [['#', 'Product / Item', 'Qty', 'Unit Price', 'Total']],
            body: tableData,
            startY: yPos,
            styles: { fontSize: 9, cellPadding: 4, textColor: textColor },
            headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            columnStyles: {
                0: { halign: 'center', cellWidth: 12 },
                2: { halign: 'center', cellWidth: 20 },
                3: { halign: 'right', cellWidth: 30 },
                4: { halign: 'right', cellWidth: 35 },
            },
        });

        // Totals section
        let finalY = doc.lastAutoTable?.finalY + 10 || 150;
        const subtotal = sampleOrder.subtotal;
        const discountAmount = subtotal * (sampleOrder.discount_value / 100);
        const total = sampleOrder.total_amount;
        const boxX = pageWidth - 85;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Subtotal:', boxX, finalY);
        doc.text(`${subtotal.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });

        finalY += 7;
        doc.setTextColor(234, 88, 12);
        doc.text(`Discount (${sampleOrder.discount_value}%):`, boxX, finalY);
        doc.text(`-${discountAmount.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });
        doc.setTextColor(...textColor);

        finalY += 10;
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.5);
        doc.line(boxX, finalY - 3, pageWidth - 14, finalY - 3);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('TOTAL:', boxX, finalY + 3);
        doc.text(`${total.toLocaleString()} EGP`, pageWidth - 14, finalY + 3, { align: 'right' });
        doc.setTextColor(...textColor);

        // Notes
        finalY += 18;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Notes:', 14, finalY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(sampleOrder.notes, 14, finalY + 6);

    } else {
        // Sample expense data
        const sampleExpense = {
            serial_number: '3001',
            status: 'approved',
            expense_date: new Date().toISOString(),
            expense_type: 'Transportation',
            amount: 250,
            description: 'Sample expense preview - This shows how expense claims will appear when exported.',
            submitter_name: 'Ahmed Mohamed',
            approved_by: 'Manager Name'
        };

        // Add header based on selected template (Classic/Modern/Minimal)
        const primaryColor = addTemplateHeader(doc, settings, 'EXPENSE CLAIM', sampleExpense.serial_number, sampleExpense.status, new Date().toLocaleDateString('en-GB'), logoData);
        doc.setTextColor(...textColor);

        let yPos = 55;

        // Expense details
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('EXPENSE DETAILS:', 14, yPos);
        yPos += 10;

        // Details table
        const detailsData = [
            ['Expense Type', sampleExpense.expense_type],
            ['Amount', `${sampleExpense.amount.toLocaleString()} EGP`],
            ['Date', new Date().toLocaleDateString('en-GB')],
            ['Submitted By', sampleExpense.submitter_name],
            ['Status', sampleExpense.status.toUpperCase()]
        ];

        autoTable(doc, {
            body: detailsData,
            startY: yPos,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 5 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 50, fillColor: [248, 250, 252] },
                1: { cellWidth: 100 }
            }
        });

        // Description
        let descY = doc.lastAutoTable?.finalY + 15 || 140;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('DESCRIPTION:', 14, descY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const splitDesc = doc.splitTextToSize(sampleExpense.description, pageWidth - 28);
        doc.text(splitDesc, 14, descY + 8);

        // Total box
        let totalY = descY + 40;
        doc.setFillColor(...hexToRgb(settings.invoice_primary_color || '#ea580c'));
        doc.roundedRect(pageWidth - 80, totalY, 66, 20, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('TOTAL AMOUNT', pageWidth - 47, totalY + 8, { align: 'center' });
        doc.setFontSize(14);
        doc.text(`${sampleExpense.amount.toLocaleString()} EGP`, pageWidth - 47, totalY + 16, { align: 'center' });
        doc.setTextColor(...textColor);
    }

    // Footer
    addUnifiedFooter(doc, settings);

    // Return blob URL for preview (not saving)
    return doc.output('bloburl');
};

/**
 * Export orders to PDF (bulk report)
 */
export const exportOrdersToPDF = (orders, title = 'Orders Report') => {
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 28, { align: 'center' });

    const tableData = orders.map((order, index) => [
        index + 1,
        order.clinic_name || order.clinic_id || '-',
        order.status || '-',
        `${order.total_amount || 0} EGP`,
        order.order_type || 'regular',
        new Date(order.created_at).toLocaleDateString()
    ]);

    autoTable(doc, {
        head: [['#', 'Clinic', 'Status', 'Total', 'Type', 'Date']],
        body: tableData,
        startY: 35,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [234, 88, 12], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 3: { halign: 'right' } },
    });

    const total = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
    const finalY = doc.lastAutoTable?.finalY + 10 || 150;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Orders: ${orders.length}`, 14, finalY);
    doc.text(`Total Amount: ${total.toLocaleString()} EGP`, 14, finalY + 6);

    savePDFWithFilename(doc, `EP Group_orders_report_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * Export single order as Invoice PDF with Arabic support
 * Uses html2canvas for Arabic text rendering in Bill To section
 * @param {Object} order - Order object with products, clinic info, etc.
 * @param {Object} clinic - Clinic details
 * @param {Object} settings - Invoice settings from site settings
 */
export const exportInvoicePDF = async (order, clinic = {}, settings = {}) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const textColor = [51, 65, 85];

    // Get serial number
    const serialNum = order.serial_number || order.id?.slice(0, 8).toUpperCase() || '000';
    const orderDate = new Date(order.order_date || order.created_at).toLocaleDateString('en-GB');

    // Add unified header
    const primaryColor = addUnifiedHeader(doc, settings, 'INVOICE / FATURA', serialNum, order.status, orderDate);

    doc.setTextColor(...textColor);

    // Bill To section - Create HTML element for proper Arabic rendering
    const billToContent = `
        <div style="
            font-family: 'Segoe UI', 'Arial', 'Tahoma', sans-serif;
            font-size: 12px;
            color: #334155;
            padding: 10px;
            width: 350px;
            background: white;
            direction: rtl;
            text-align: right;
        ">
            <div style="font-weight: bold; font-size: 13px; margin-bottom: 8px; color: #1e293b;">BILL TO:</div>
            <div style="margin-bottom: 4px; font-weight: 600;">${clinic.name || order.clinic_name || 'Unknown Clinic'}</div>
            ${clinic.doctor_name ? `<div style="margin-bottom: 4px;">Dr. ${clinic.doctor_name}</div>` : ''}
            ${clinic.address ? `<div style="margin-bottom: 4px;">${clinic.address}</div>` : ''}
            ${clinic.phone ? `<div>Tel: ${clinic.phone}</div>` : ''}
        </div>
    `;

    // Create temporary container
    const container = document.createElement('div');
    container.innerHTML = billToContent;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    try {
        // Render Bill To section as canvas
        const canvas = await html2canvas(container.firstElementChild, {
            scale: 3,
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true
        });

        // Add Bill To image to PDF
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 70; // mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        doc.addImage(imgData, 'PNG', 14, 48, imgWidth, imgHeight);
    } catch (err) {
        console.warn('html2canvas failed, using fallback:', err);
        // Fallback to plain English text
        let yPos = 50;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('BILL TO:', 14, yPos);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        yPos += 6;
        doc.text(String(clinic.name || order.clinic_name || 'Unknown Clinic'), 14, yPos);
        if (clinic.doctor_name) {
            yPos += 5;
            doc.text(`Dr. ${clinic.doctor_name}`, 14, yPos);
        }
        if (clinic.phone) {
            yPos += 5;
            doc.text(`Tel: ${clinic.phone}`, 14, yPos);
        }
    } finally {
        // Cleanup
        document.body.removeChild(container);
    }

    // Order type badge
    if (order.order_type === 'demo') {
        doc.setFillColor(234, 179, 8);
        doc.roundedRect(pageWidth - 40, 48, 26, 8, 2, 2, 'F');
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(8);
        doc.text('DEMO', pageWidth - 27, 53.5, { align: 'center' });
        doc.setTextColor(...textColor);
    }

    // Products table
    const yPos = 95;
    const products = order.products || [];
    const tableData = products.map((p, i) => [
        i + 1,
        p.name || p.product_name || 'Product',
        p.quantity || 1,
        `${(p.price || 0).toLocaleString()} EGP`,
        `${((p.quantity || 1) * (p.price || 0)).toLocaleString()} EGP`
    ]);

    autoTable(doc, {
        head: [['#', 'Product / Item', 'Qty', 'Unit Price', 'Total']],
        body: tableData,
        startY: yPos,
        styles: { fontSize: 9, cellPadding: 4, textColor: textColor },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            2: { halign: 'center', cellWidth: 20 },
            3: { halign: 'right', cellWidth: 30 },
            4: { halign: 'right', cellWidth: 35 },
        },
    });

    // Totals section with discount display
    let finalY = doc.lastAutoTable?.finalY + 10 || 150;
    const subtotal = order.subtotal || products.reduce((s, p) => s + (p.quantity || 1) * (p.price || 0), 0);
    const discountValue = order.discount_value || 0;
    const discountType = order.discount_type || 'fixed';
    const discountAmount = discountValue > 0
        ? (discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue)
        : 0;
    const total = order.total_amount ?? (subtotal - discountAmount);

    const boxX = pageWidth - 85;

    // Subtotal
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', boxX, finalY);
    doc.text(`${subtotal.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });

    // Discount (if any)
    if (discountAmount > 0) {
        finalY += 7;
        doc.setTextColor(234, 88, 12);
        const discountLabel = discountType === 'percentage'
            ? `Discount (${discountValue}%):`
            : `Discount (Fixed):`;
        doc.text(discountLabel, boxX, finalY);
        doc.text(`-${discountAmount.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });
        doc.setTextColor(...textColor);
    }

    // Total line
    finalY += 10;
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(boxX, finalY - 3, pageWidth - 14, finalY - 3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('TOTAL:', boxX, finalY + 3);

    if (order.order_type === 'demo') {
        doc.setTextColor(22, 163, 74);
        doc.text('FREE (Demo)', pageWidth - 14, finalY + 3, { align: 'right' });
    } else {
        doc.text(`${total.toLocaleString()} EGP`, pageWidth - 14, finalY + 3, { align: 'right' });
    }
    doc.setTextColor(...textColor);

    // Notes section
    if (order.notes) {
        finalY += 18;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Notes:', 14, finalY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const splitNotes = doc.splitTextToSize(String(order.notes), pageWidth - 28);
        doc.text(splitNotes, 14, finalY + 6);
    }

    // Footer
    addUnifiedFooter(doc, settings);

    // Save with proper filename
    const prefix = getDocumentPrefix(settings);
    const filename = `${prefix}_invoice_${serialNum}.pdf`;
    savePDFWithFilename(doc, filename);
};


/**
 * Export single expense as PDF
 * @param {Object} expense - Expense object with details
 * @param {Object} settings - Site settings
 */
export const exportExpensePDF = (expense, settings = {}) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const textColor = [51, 65, 85];

    // Get serial number
    const serialNum = expense.serial_number || expense.id?.slice(0, 8).toUpperCase() || '000';
    const expenseDate = new Date(expense.expense_date || expense.created_at).toLocaleDateString('en-GB');

    // Add unified header
    const primaryColor = addUnifiedHeader(doc, settings, 'EXPENSE CLAIM', serialNum, expense.status, expenseDate);

    doc.setTextColor(...textColor);

    // Submitter info
    let yPos = 50;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('SUBMITTED BY:', 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    yPos += 6;
    doc.text(expense.submitter_name || 'Unknown', 14, yPos);

    // Expense details box
    yPos += 12;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, yPos, pageWidth - 28, 50, 3, 3);

    yPos += 10;
    const labelX = 20;
    const valueX = 70;

    // Expense Type
    doc.setFont('helvetica', 'bold');
    doc.text('Expense Type:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(expense.expense_type || '-', valueX, yPos);

    // Category
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Category:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(expense.custom_category || expense.category || 'Other', valueX, yPos);

    // Amount
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Amount:', labelX, yPos);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...primaryColor);
    doc.text(`${(expense.amount || 0).toLocaleString()} EGP`, valueX, yPos);
    doc.setTextColor(...textColor);
    doc.setFontSize(10);

    // Date
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(expenseDate, valueX, yPos);

    // Description
    if (expense.description) {
        yPos += 20;
        doc.setFont('helvetica', 'bold');
        doc.text('Description / Reason:', 14, yPos);
        doc.setFont('helvetica', 'normal');
        yPos += 6;
        const splitDesc = doc.splitTextToSize(expense.description, pageWidth - 28);
        doc.text(splitDesc, 14, yPos);
        yPos += splitDesc.length * 5;
    }

    // Approval info
    if (expense.status === 'approved' || expense.status === 'rejected') {
        yPos += 15;
        if (expense.status === 'approved') {
            doc.setFillColor(220, 252, 231);
            doc.roundedRect(14, yPos - 5, pageWidth - 28, 15, 2, 2, 'F');
            doc.setTextColor(22, 163, 74);
            doc.setFont('helvetica', 'bold');
            doc.text(`✓ Approved by: ${expense.reviewer_name || 'Manager'}`, 20, yPos + 4);
        } else {
            doc.setFillColor(254, 226, 226);
            doc.roundedRect(14, yPos - 5, pageWidth - 28, expense.rejection_reason ? 22 : 15, 2, 2, 'F');
            doc.setTextColor(220, 38, 38);
            doc.setFont('helvetica', 'bold');
            doc.text(`✕ Rejected by: ${expense.reviewer_name || 'Manager'}`, 20, yPos + 4);
            if (expense.rejection_reason) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text(`Reason: ${expense.rejection_reason}`, 20, yPos + 12);
            }
        }
        if (expense.reviewed_at) {
            doc.setFontSize(8);
            doc.text(`on ${new Date(expense.reviewed_at).toLocaleString('en-GB')}`, pageWidth - 20, yPos + 4, { align: 'right' });
        }
        doc.setTextColor(...textColor);
    }

    // Footer
    addUnifiedFooter(doc, settings);

    // Save with proper filename
    const prefix = getDocumentPrefix(settings);
    const filename = `${prefix}_expenses_${serialNum}.pdf`;
    savePDFWithFilename(doc, filename);
};

/**
 * Export visits to PDF
 */
export const exportVisitsToPDF = (visits, title = 'Visits Report') => {
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 28, { align: 'center' });

    const tableData = visits.map((visit, index) => [
        index + 1,
        visit.clinic_name || visit.clinic_id || '-',
        visit.visit_reason || '-',
        visit.visit_result || '-',
        visit.status || '-',
        new Date(visit.created_at).toLocaleDateString()
    ]);

    autoTable(doc, {
        head: [['#', 'Clinic', 'Reason', 'Result', 'Status', 'Date']],
        body: tableData,
        startY: 35,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [139, 92, 246], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    const finalY = doc.lastAutoTable?.finalY + 10 || 150;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Visits: ${visits.length}`, 14, finalY);

    savePDFWithFilename(doc, `EP Group_visits_report_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * Export users to PDF
 */
export const exportUsersToPDF = (users, title = 'Users Report') => {
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 105, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 28, { align: 'center' });

    const tableData = users.map((user, index) => [
        index + 1,
        user.full_name || '-',
        user.username || '-',
        user.role || '-',
        user.phone || '-',
        user.is_active ? 'Active' : 'Inactive'
    ]);

    autoTable(doc, {
        head: [['#', 'Name', 'Username', 'Role', 'Phone', 'Status']],
        body: tableData,
        startY: 35,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 245, 245] },
    });

    const finalY = doc.lastAutoTable?.finalY + 10 || 150;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Users: ${users.length}`, 14, finalY);

    savePDFWithFilename(doc, `EP Group_users_report_${new Date().toISOString().split('T')[0]}.pdf`);
};

// ═══════════════════════════════════════════════════════════════════════════
// ACCOUNTING MODULE PDF EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export accounting invoice PDF (created from approved order)
 * Includes full invoice details, payment history, and remaining balance
 * NOTE: Using English labels because jsPDF Helvetica font doesn't support Arabic
 * @param {Object} invoice - Invoice object from accounting module
 * @param {Object} settings - Site settings for PDF styling
 * @param {Object|null} logoData - Preloaded logo data (optional)
 */
export const exportAccountingInvoicePDF = async (invoice, settings = {}, logoData = null) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const textColor = [51, 65, 85];

    // Load logo if not preloaded
    if (!logoData && settings.invoice_logo_url) {
        logoData = await loadImageAsBase64(settings.invoice_logo_url);
    }

    // Get serial number
    const serialNum = invoice.invoice_number || invoice.order_serial || '000';
    const invoiceDate = new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('en-GB');

    // Determine status label (English)
    const statusLabels = {
        'approved': 'Pending Collection',
        'partially_paid': 'Partially Paid',
        'fully_paid': 'Fully Paid',
        'cancelled': 'Cancelled'
    };
    const statusLabel = statusLabels[invoice.status] || invoice.status;

    // Add header based on template setting
    const primaryColor = addTemplateHeader(doc, settings, 'INVOICE', serialNum, statusLabel, invoiceDate, logoData);
    doc.setTextColor(...textColor);

    // Get header offset based on template
    let yPos = settings.invoice_template === 'modern' ? 55 : 50;

    // Bill To and Invoice Info sections
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('BILL TO:', 14, yPos);

    // Order/Invoice Info on right side
    doc.text('INVOICE INFO:', pageWidth - 14, yPos, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // Left side - Clinic info
    yPos += 6;
    doc.text(invoice.clinic_name || 'Unknown Clinic', 14, yPos);
    yPos += 5;
    doc.text(`Area: ${invoice.area_name || '-'}`, 14, yPos);
    yPos += 5;
    doc.text(`Line: ${invoice.line_name || '-'}`, 14, yPos);

    // Right side - Order/Rep info
    let rightY = yPos - 10;
    doc.text(`Rep: ${invoice.created_by_name || '-'}`, pageWidth - 14, rightY, { align: 'right' });
    rightY += 5;
    doc.text(`Approved By: ${invoice.approved_by_name || '-'}`, pageWidth - 14, rightY, { align: 'right' });
    rightY += 5;
    doc.text(`Order #: ${invoice.order_serial || '-'}`, pageWidth - 14, rightY, { align: 'right' });

    // Manager info
    yPos += 5;
    if (invoice.manager_name) {
        doc.text(`Manager: ${invoice.manager_name}`, 14, yPos);
    }

    // Products table
    yPos += 15;
    const products = invoice.products || [];
    const tableData = products.map((p, i) => [
        i + 1,
        p.name || p.product_name || 'Product',
        p.quantity || 1,
        `${(p.price || 0).toLocaleString()} EGP`,
        `${((p.quantity || 1) * (p.price || 0)).toLocaleString()} EGP`
    ]);

    autoTable(doc, {
        head: [['#', 'Product', 'Qty', 'Unit Price', 'Total']],
        body: tableData,
        startY: yPos,
        styles: { fontSize: 9, cellPadding: 4, textColor: textColor },
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
            0: { halign: 'center', cellWidth: 12 },
            2: { halign: 'center', cellWidth: 20 },
            3: { halign: 'right', cellWidth: 35 },
            4: { halign: 'right', cellWidth: 35 },
        },
    });

    // Totals section
    let finalY = doc.lastAutoTable?.finalY + 10 || 150;
    const subtotal = invoice.subtotal || 0;
    const discountValue = invoice.discount_value || 0;
    const discountType = invoice.discount_type || 'fixed';
    const discountAmount = discountValue > 0
        ? (discountType === 'percentage' ? subtotal * (discountValue / 100) : discountValue)
        : 0;
    const total = invoice.total_amount ?? (subtotal - discountAmount);
    const paid = invoice.paid_amount || 0;
    const remaining = invoice.remaining_amount ?? (total - paid);

    const boxX = pageWidth - 85;

    // Subtotal
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Subtotal:', boxX, finalY);
    doc.text(`${subtotal.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });

    // Discount (if any)
    if (discountAmount > 0) {
        finalY += 6;
        doc.setTextColor(234, 88, 12);
        const discountLabel = discountType === 'percentage'
            ? `Discount (${discountValue}%):`
            : `Discount:`;
        doc.text(discountLabel, boxX, finalY);
        doc.text(`-${discountAmount.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });
        doc.setTextColor(...textColor);
    }

    // Total
    finalY += 8;
    doc.setDrawColor(...primaryColor);
    doc.setLineWidth(0.5);
    doc.line(boxX, finalY - 2, pageWidth - 14, finalY - 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL:', boxX, finalY + 4);
    doc.text(`${total.toLocaleString()} EGP`, pageWidth - 14, finalY + 4, { align: 'right' });

    // Paid amount
    finalY += 10;
    doc.setTextColor(22, 163, 74); // Green
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Paid:', boxX, finalY);
    doc.text(`${paid.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });

    // Remaining amount
    finalY += 6;
    doc.setTextColor(234, 88, 12); // Orange
    doc.setFont('helvetica', 'bold');
    doc.text('Remaining:', boxX, finalY);
    doc.text(`${remaining.toLocaleString()} EGP`, pageWidth - 14, finalY, { align: 'right' });
    doc.setTextColor(...textColor);

    // Payment History (if any)
    const payments = invoice.payments || [];
    if (payments.length > 0) {
        finalY += 15;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Payment History:', 14, finalY);

        const paymentData = payments.map((p, i) => [
            i + 1,
            p.payment_number || '-',
            `${(p.amount || 0).toLocaleString()} EGP`,
            p.method || '-',
            p.collected_by_name || '-',
            p.date ? new Date(p.date).toLocaleDateString('en-GB') : '-'
        ]);

        autoTable(doc, {
            head: [['#', 'Payment #', 'Amount', 'Method', 'Collected By', 'Date']],
            body: paymentData,
            startY: finalY + 5,
            styles: { fontSize: 8, cellPadding: 3, textColor: textColor },
            headStyles: { fillColor: [22, 163, 74], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                2: { halign: 'right', cellWidth: 30 },
            },
        });
    }

    // Notes
    if (invoice.notes) {
        let notesY = doc.lastAutoTable?.finalY + 10 || finalY + 20;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Notes:', 14, notesY);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(invoice.notes, pageWidth - 28);
        doc.text(splitNotes, 14, notesY + 5);
    }

    // Footer
    addUnifiedFooter(doc, settings);

    // Save
    const prefix = getDocumentPrefix(settings);
    const filename = `${prefix}_accounting_invoice_${serialNum}.pdf`;
    savePDFWithFilename(doc, filename);
};

/**
 * Export payment receipt PDF
 * NOTE: Using English labels because jsPDF Helvetica font doesn't support Arabic
 * @param {Object} payment - Payment object
 * @param {Object} invoice - Related invoice object
 * @param {Object} settings - Site settings
 * @param {Object|null} logoData - Preloaded logo data (optional)
 */
export const exportPaymentReceiptPDF = async (payment, invoice = {}, settings = {}, logoData = null) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const textColor = [51, 65, 85];

    // Load logo if not preloaded
    if (!logoData && settings.invoice_logo_url) {
        logoData = await loadImageAsBase64(settings.invoice_logo_url);
    }

    const serialNum = payment.payment_number || payment.id?.slice(0, 8).toUpperCase() || '000';
    const paymentDate = new Date(payment.payment_date || payment.created_at).toLocaleDateString('en-GB');

    // Add header
    const primaryColor = addTemplateHeader(doc, settings, 'PAYMENT RECEIPT', serialNum, 'PAID', paymentDate, logoData);
    doc.setTextColor(...textColor);

    let yPos = settings.invoice_template === 'modern' ? 55 : 50;

    // Receipt details box
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, yPos, pageWidth - 28, 70, 3, 3);

    yPos += 10;
    const labelX = 20;
    const valueX = 80;

    // Invoice Number
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Invoice #:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`#${payment.invoice_number || invoice.invoice_number || '-'}`, valueX, yPos);

    // Clinic Name
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Clinic:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(payment.clinic_name || invoice.clinic_name || '-', valueX, yPos);

    // Payment Method
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Payment Method:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    const methodLabels = { cash: 'Cash', bank: 'Bank Transfer', check: 'Check', credit: 'Credit' };
    doc.text(methodLabels[payment.payment_method] || payment.payment_method || '-', valueX, yPos);

    // Receipt Number
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Receipt #:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(payment.receipt_number || '-', valueX, yPos);

    // Collected By
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Collected By:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(payment.collected_by_name || '-', valueX, yPos);

    // Payment Date
    yPos += 10;
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', labelX, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(paymentDate, valueX, yPos);

    // Amount box
    yPos += 25;
    doc.setFillColor(...hexToRgb(settings.invoice_primary_color || '#22c55e'));
    doc.roundedRect(pageWidth / 2 - 50, yPos, 100, 35, 4, 4, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('AMOUNT PAID', pageWidth / 2, yPos + 12, { align: 'center' });
    doc.setFontSize(20);
    doc.text(`${(payment.amount || 0).toLocaleString()} EGP`, pageWidth / 2, yPos + 28, { align: 'center' });

    doc.setTextColor(...textColor);

    // Notes
    if (payment.notes) {
        yPos += 50;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Notes:', 14, yPos);
        doc.setFont('helvetica', 'normal');
        const splitNotes = doc.splitTextToSize(payment.notes, pageWidth - 28);
        doc.text(splitNotes, 14, yPos + 5);
    }

    // Footer
    addUnifiedFooter(doc, settings);

    // Save
    const prefix = getDocumentPrefix(settings);
    const filename = `${prefix}_payment_receipt_${serialNum}.pdf`;
    savePDFWithFilename(doc, filename);
};

/**
 * Export accounting report PDF (daily/monthly summary)
 * @param {Object} report - Report data from API
 * @param {string} type - 'daily' or 'monthly'
 * @param {Object} settings - Site settings
 */
export const exportAccountingReportPDF = (report, type = 'daily', settings = {}) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.width;
    const textColor = [51, 65, 85];
    const primaryColor = hexToRgb(settings.invoice_primary_color || '#059669');

    // Title
    doc.setFillColor(...primaryColor);
    doc.rect(0, 0, pageWidth, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    const title = type === 'daily' ? 'Daily Financial Report' : 'Monthly Financial Report';
    doc.text(title, pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    if (type === 'daily') {
        doc.text(`Date: ${report.date}`, pageWidth / 2, 24, { align: 'center' });
    } else {
        doc.text(`${report.month}/${report.year}`, pageWidth / 2, 24, { align: 'center' });
    }

    doc.setTextColor(...textColor);
    let yPos = 45;

    // Summary boxes
    const boxWidth = (pageWidth - 42) / 3;
    const boxHeight = 30;

    if (type === 'daily' && report.invoices) {
        // Invoices box
        doc.setFillColor(16, 185, 129); // Emerald
        doc.roundedRect(14, yPos, boxWidth, boxHeight, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('Invoices', 14 + boxWidth / 2, yPos + 10, { align: 'center' });
        doc.setFontSize(14);
        doc.text(`${report.invoices.count}`, 14 + boxWidth / 2, yPos + 20, { align: 'center' });
        doc.setFontSize(8);
        doc.text(`${report.invoices.total?.toLocaleString() || 0} EGP`, 14 + boxWidth / 2, yPos + 26, { align: 'center' });

        // Payments box
        doc.setFillColor(59, 130, 246); // Blue
        doc.roundedRect(14 + boxWidth + 7, yPos, boxWidth, boxHeight, 3, 3, 'F');
        doc.setFontSize(9);
        doc.text('Collections', 14 + boxWidth + 7 + boxWidth / 2, yPos + 10, { align: 'center' });
        doc.setFontSize(14);
        doc.text(`${report.payments.count}`, 14 + boxWidth + 7 + boxWidth / 2, yPos + 20, { align: 'center' });
        doc.setFontSize(8);
        doc.text(`${report.payments.total?.toLocaleString() || 0} EGP`, 14 + boxWidth + 7 + boxWidth / 2, yPos + 26, { align: 'center' });

        // Expenses box
        doc.setFillColor(239, 68, 68); // Red
        doc.roundedRect(14 + (boxWidth + 7) * 2, yPos, boxWidth, boxHeight, 3, 3, 'F');
        doc.setFontSize(9);
        doc.text('Expenses', 14 + (boxWidth + 7) * 2 + boxWidth / 2, yPos + 10, { align: 'center' });
        doc.setFontSize(14);
        doc.text(`${report.expenses.count}`, 14 + (boxWidth + 7) * 2 + boxWidth / 2, yPos + 20, { align: 'center' });
        doc.setFontSize(8);
        doc.text(`${report.expenses.total?.toLocaleString() || 0} EGP`, 14 + (boxWidth + 7) * 2 + boxWidth / 2, yPos + 26, { align: 'center' });

        doc.setTextColor(...textColor);
        yPos += boxHeight + 15;

        // Net cash flow
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Net Cash Flow:', 14, yPos);
        const netFlow = report.net_cash_flow || 0;
        doc.setTextColor(netFlow >= 0 ? 22 : 220, netFlow >= 0 ? 163 : 38, netFlow >= 0 ? 74 : 38);
        doc.text(`${netFlow.toLocaleString()} EGP`, pageWidth - 14, yPos, { align: 'right' });
        doc.setTextColor(...textColor);
    }

    // Footer
    const footerY = doc.internal.pageSize.height - 15;
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${new Date().toLocaleString('en-GB')}`, pageWidth / 2, footerY, { align: 'center' });

    // Save
    const prefix = getDocumentPrefix(settings);
    const dateStr = type === 'daily' ? report.date : `${report.year}-${report.month}`;
    savePDFWithFilename(doc, `${prefix}_${type}_report_${dateStr}.pdf`);
};

export default {
    exportOrdersToPDF,
    exportInvoicePDF,
    exportExpensePDF,
    exportVisitsToPDF,
    exportUsersToPDF,
    exportAccountingInvoicePDF,
    exportPaymentReceiptPDF,
    exportAccountingReportPDF
};
