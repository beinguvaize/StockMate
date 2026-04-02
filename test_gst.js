import { calculateGST, formatINR, amountToWords } from './src/lib/gstEngine.js';

const testItems = [
  { productId: 'P1', name: 'Paper Cup 2101ml', qty: 100, rate: 2.50, hsn_code: '4823', taxRate: 18 },
  { productId: 'P2', name: 'Apple Cover 13x16', qty: 50, rate: 5.00, hsn_code: '3923', taxRate: 12 }
];

console.log("--- Testing formatINR ---");
console.log(formatINR(123456.78));

console.log("\n--- Testing amountToWords ---");
console.log(amountToWords(575));
console.log(amountToWords(123456.78));

console.log("\n--- Testing calculateGST (Intrastate) ---");
const intra = calculateGST(testItems, 'Kerala', 'Kerala');
console.log(JSON.stringify(intra, null, 2));

console.log("\n--- Testing calculateGST (Interstate) ---");
const inter = calculateGST(testItems, 'Kerala', 'Tamil Nadu');
console.log(JSON.stringify(inter, null, 2));
