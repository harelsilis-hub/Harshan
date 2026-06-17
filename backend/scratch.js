const fs = require('fs');
const pdfParse = require('pdf-parse');

async function testPdfParse() {
  // Try to find a PDF in the uploads folder or just create one with pdf-lib?
  // We can just check the pdf-parse documentation or properties.
  console.log(Object.keys(pdfParse));
}
testPdfParse();
