const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const pdfParse = require('pdf-parse');

async function createAndTest() {
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  
  for(let i=1; i<=3; i++){
    const page = pdfDoc.addPage();
    page.drawText(`This is page ${i}`, { x: 50, y: 500, size: 30, font: timesRomanFont, color: rgb(0,0,0) });
  }
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('test.pdf', pdfBytes);

  let targetPages = new Set([2]); // 1-based, we want only page 2

  function render_page(pageData) {
      // pageData.pageIndex is 0-based
      if (!targetPages.has(pageData.pageIndex + 1)) {
          return ''; // skip page
      }
      return pageData.getTextContent().then(function(textContent) {
          let lastY, text = '';
          for (let item of textContent.items) {
              if (lastY == item.transform[5] || !lastY){
                  text += item.str;
              } else {
                  text += '\n' + item.str;
              }    
              lastY = item.transform[5];
          }
          return text;
      });
  }

  const data = await pdfParse(pdfBytes, { pagerender: render_page });
  console.log("Extracted text:");
  console.log(data.text);
}

createAndTest();
