/* ==========================================================================
   BOARDLY - pdf-export.js
   --------------------------------------------------------------------------
   A shared "turn this bit of the page into a downloadable PDF" helper,
   used by Documents, and by the "Download PDF" buttons on Custom Forms
   and Proposals. Lazy-loads two small libraries from a CDN the first
   time anything on the page actually asks for a PDF - not on every
   dashboard load, the same discipline the Metadata Remover's ffmpeg.wasm
   load already follows.

   HOW THIS ACTUALLY WORKS: jsPDF alone only draws text/lines/shapes -
   it has no idea how to lay out styled HTML (headings, bullet lists,
   bold text) on its own. html2canvas instead takes a real on-screen
   element and rasterizes it into an image exactly as the browser is
   already rendering it - so whatever fonts, colors, and formatting the
   page shows is exactly what ends up in the PDF. jsPDF's only job here
   is to place that image onto one or more A4 pages. The tradeoff worth
   knowing: the resulting PDF is an image of the page, not real
   selectable/searchable text - genuinely fine for "a document I can
   send or print," not for "a document someone will search inside a PDF
   reader for one word." If that distinction ever matters, a text-based
   renderer would be a separate, harder project for another day.
   ========================================================================== */

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Couldn't load " + src));
    document.head.appendChild(script);
  });
}

function loadStyleOnce(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

let _pdfLibsPromise = null;
function loadPDFLibs() {
  if (!_pdfLibsPromise) {
    _pdfLibsPromise = Promise.all([
      loadScriptOnce("https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js"),
      loadScriptOnce("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"),
    ]);
  }
  return _pdfLibsPromise;
}

/**
 * Renders a live DOM element to a downloaded PDF, splitting across
 * multiple A4 pages if the content is taller than one page. `element`
 * must currently be visible/in-flow (html2canvas can't rasterize
 * something with display:none), so callers that build an offscreen
 * element for this purpose position it off-screen rather than hiding it.
 */
async function exportElementToPDF(element, filename, onStatus) {
  onStatus?.("Loading PDF engine…");
  await loadPDFLibs();
  onStatus?.("Rendering…");

  const canvas = await window.html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.95);

  let heightLeft = imgHeight;
  let position = 0;
  pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(filename);
}

/**
 * Builds a plain, print-friendly offscreen element from an HTML string,
 * renders it to PDF, then removes it - for callers (Custom Forms,
 * Proposals) that don't already have a live styled element to point at
 * and just need "turn this HTML into a PDF" in one step.
 */
async function exportHTMLToPDF(innerHTML, filename, onStatus) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed; left:-9999px; top:0; width:595pt; padding:32pt; background:#ffffff; color:#111; font-family:Arial,sans-serif;";
  wrap.innerHTML = innerHTML;
  document.body.appendChild(wrap);
  try {
    await exportElementToPDF(wrap, filename, onStatus);
  } finally {
    wrap.remove();
  }
}
