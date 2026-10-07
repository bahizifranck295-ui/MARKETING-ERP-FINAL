/**
 * PREMIDIS SARL - Safe Printing Utility
 * Handles printing gracefully even inside sandboxed iframes or modal contexts.
 */
export function printDocument({
  title,
  html,
}: {
  title: string;
  html: string;
}) {
  try {
    // Attempt printing via a hidden iframe to isolate the printable document
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html lang="fr">
          <head>
            <meta charset="utf-8" />
            <title>${title}</title>
            <style>
              @page {
                size: A4;
                margin: 15mm;
              }
              *, *::before, *::after {
                box-sizing: border-box;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #0f172a;
                background: #ffffff;
                margin: 0;
                padding: 16px;
                font-size: 13px;
                line-height: 1.5;
              }
              h1, h2, h3, h4, h5, h6 {
                color: #211A5C;
                margin-top: 0;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin: 16px 0;
                font-size: 12px;
              }
              th, td {
                border: 1px solid #cbd5e1;
                padding: 8px 10px;
                text-align: left;
              }
              th {
                background-color: #f1f5f9;
                font-weight: 700;
                color: #334155;
              }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-bold { font-weight: 700; }
              .font-mono { font-family: monospace; }
              .header-box {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 2px solid #211A5C;
                padding-bottom: 12px;
                margin-bottom: 20px;
              }
              .grid-2 {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
                margin-bottom: 16px;
              }
              .badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 9999px;
                font-size: 11px;
                font-weight: 600;
                background-color: #f1f5f9;
                color: #475569;
              }
              .total-box {
                margin-top: 16px;
                padding: 12px;
                background-color: #f8fafc;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
                display: flex;
                justify-content: space-between;
                font-size: 14px;
                font-weight: 700;
              }
              .footer {
                margin-top: 32px;
                padding-top: 12px;
                border-top: 1px solid #e2e8f0;
                font-size: 10px;
                color: #64748b;
                text-align: center;
              }
              @media print {
                body { padding: 0; }
                .no-print { display: none !important; }
              }
            </style>
          </head>
          <body>
            ${html}
            <div class="footer">
              Document officiel généré par PREMIDIS SARL • RDC • ${new Date().toLocaleDateString("fr-FR")} • ${new Date().toLocaleTimeString("fr-FR")}
            </div>
          </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn("Iframe print invocation failed, falling back to window.print()", e);
          window.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 30000);
        }
      }, 300);
      return;
    }
  } catch (err) {
    console.error("Print document failed, using standard print", err);
  }

  // Fallback
  try {
    window.print();
  } catch (e) {
    console.error("Window print error", e);
  }
}
