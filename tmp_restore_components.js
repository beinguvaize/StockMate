import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

function processFile(filePath) {
    if (!filePath.endsWith('.jsx')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    // Convert components that still have the old "TITLE." or missing the green dot
    content = content.replace(/<h1 className="[^"]*text-(3xl|4xl|5xl|6xl|7xl|8xl)[^"]*">([^<.]+)[\.]?[^<]*<\/h1>/g, (match, p1, p2) => {
        // Don't modify the PremiumInvoice actual invoice header, only page titles
        if(p2.trim().toUpperCase() === 'INVOICE') return match;
        if(p2.trim().toUpperCase() === 'ERROR') return match;
        
        return `<h1 className="text-4xl md:text-7xl font-black font-sora text-ink-primary leading-[0.85] tracking-tight mb-2 uppercase">${p2.trim()}<span className="text-accent-signature">.</span></h1>`;
    });
    
    // Also upgrade component subtitles if they have text-[10px] or are following the h1
    // Payroll.jsx subtitle: <p className="text-gray-700 font-semibold text-[10px] opacity-[0.85]">COMPENSATION & STAFF ACCOUNTS</p>
    content = content.replace(/<p className="([a-zA-Z0-9-\[\]\.\s]*)opacity-[a-zA-Z0-9-\[\]\.\s]*">([^<]+)<\/p>/g, (match, classes, text) => {
        if(classes.includes('text-[10px]') || classes.includes('text-xs') || classes.includes('text-sm')) {
             return `<p className="text-[10px] font-semibold text-gray-600 opacity-80 mb-6 uppercase">${text}</p>`;
        }
        return match;
    });

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log("Restored typography in: " + filePath);
    }
}

['./src/pages', './src/components'].forEach(dir => {
    walkDir(dir, processFile);
});
