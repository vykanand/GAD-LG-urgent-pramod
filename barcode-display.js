/**
 * Barcode Display Module
 * Generates and displays visual barcodes using JsBarcode library
 * Handles rendering, printing, and barcode presentation
 * Optimized for Electron apps with native print support
 */

(function () {
  'use strict';

  const BarcodeDisplay = {
    /**
     * Ensure JsBarcode library is loaded
     * @returns {Promise<boolean>} True if library is available
     */
    ensureBarcodeLibraryLoaded: async function () {
      try {
        if (typeof JsBarcode !== 'undefined') {
          return true;
        }
        if (typeof JsBarcode === 'undefined') {
          console.warn('BarcodeDisplay: JsBarcode not loaded');
          return false;
        }
        return typeof JsBarcode !== 'undefined';
      } catch (e) {
        console.error('BarcodeDisplay.ensureBarcodeLibraryLoaded error:', e);
        return false;
      }
    },

    /**
     * Generate and render a barcode
     * @param {string} barcode - The barcode value to render
     * @param {HTMLElement} container - Container element for the barcode
     * @param {Object} options - Rendering options
     * @returns {Promise<boolean>} Success status
     */
    renderBarcode: async function (barcode, container, options = {}) {
      try {
        const libLoaded = await this.ensureBarcodeLibraryLoaded();
        if (!libLoaded) {
          console.error('BarcodeDisplay.renderBarcode: JsBarcode not available');
          return false;
        }

        if (!container || !barcode) {
          console.error('BarcodeDisplay.renderBarcode: missing container or barcode value');
          return false;
        }

        const defaultOptions = {
          format: 'EAN13',
          width: 2,
          height: 100,
          displayValue: true,
          fontSize: 16,
          margin: 10,
          lineColor: '#000000',
          background: '#ffffff',
          ...options
        };

        container.innerHTML = '';

        const canvas = document.createElement('canvas');
        canvas.id = 'barcode-canvas-' + Math.random().toString(36).substr(2, 9);
        container.appendChild(canvas);

        JsBarcode(canvas, barcode, defaultOptions);

        return true;
      } catch (e) {
        console.error('BarcodeDisplay.renderBarcode error:', e);
        return false;
      }
    },

    /**
     * Create a complete barcode display element with metadata
     * @param {string} barcode - The barcode to display
     * @param {Object} metadata - Barcode metadata
     * @param {Object} options - Display options
     * @returns {HTMLElement} Complete barcode display element
     */
    createBarcodeElement: async function (barcode, metadata = {}, options = {}) {
      try {
        const libLoaded = await this.ensureBarcodeLibraryLoaded();

        const container = document.createElement('div');
        container.className = 'barcode-display-container';
        container.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: #ffffff;
          border-radius: 8px;
          margin: 16px 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        `;

        const barcodeContainer = document.createElement('div');
        barcodeContainer.className = 'barcode-canvas-wrapper';
        barcodeContainer.style.cssText = `
          display: flex;
          justify-content: center;
          align-items: center;
          background: #fafafa;
          padding: 16px;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
          width: 100%;
          min-height: 150px;
        `;

        if (libLoaded && typeof JsBarcode !== 'undefined') {
          await this.renderBarcode(barcode, barcodeContainer, {
            format: 'EAN13',
            width: 2.5,
            height: 100,
            displayValue: true,
            fontSize: 18,
            margin: 12,
            lineColor: '#000000',
            background: '#ffffff'
          });
        } else {
          const fallback = document.createElement('div');
          fallback.style.cssText = `
            font-family: monospace;
            font-size: 32px;
            font-weight: bold;
            color: #333;
            text-align: center;
            letter-spacing: 4px;
          `;
          fallback.textContent = this._formatBarcodeText(barcode);
          barcodeContainer.appendChild(fallback);
        }

        container.appendChild(barcodeContainer);

        if (Object.keys(metadata).length > 0) {
          const metadataDiv = document.createElement('div');
          metadataDiv.className = 'barcode-metadata';
          metadataDiv.style.cssText = `
            width: 100%;
            text-align: center;
            font-size: 13px;
            color: #666;
          `;

          const parts = [];
          if (metadata.dateTime) {
            const date = new Date(metadata.dateTime);
            parts.push(`Date: ${date.toLocaleDateString('en-GB')}`);
            parts.push(`Time: ${date.toLocaleTimeString('en-GB')}`);
          }
          if (metadata.scanBy) {
            parts.push(`Scanned by: ${metadata.scanBy}`);
          }

          metadataDiv.innerHTML = parts.map(p => `<div>${p}</div>`).join('');
          container.appendChild(metadataDiv);
        }

        return container;
      } catch (e) {
        console.error('BarcodeDisplay.createBarcodeElement error:', e);
        return null;
      }
    },

    /**
     * Format barcode for text display (with hyphens)
     * @param {string} barcode - The barcode value
     * @returns {string} Formatted barcode text
     */
    _formatBarcodeText: function (barcode) {
      try {
        if (!barcode || barcode.length !== 13) return barcode;
        return barcode.slice(0, 4) + '-' + 
               barcode.slice(4, 8) + '-' + 
               barcode.slice(8);
      } catch (e) {
        return barcode;
      }
    },

    /**
     * Print a barcode element using Electron's native print
     * Optimized for TSC label printer with continuous label roll
     * @param {string} barcode - The barcode to print
     * @param {Object} metadata - Barcode metadata (not used)
     * @returns {Promise<boolean>} Success status
     */
    printBarcode: async function (barcode, metadata = {}) {
      try {
        // Check if we're in Electron environment
        const isElectron = typeof require !== 'undefined' && require('electron');
        
        if (isElectron) {
          // Use Electron's native print through IPC
          return await this._printWithElectron(barcode);
        }
        
        // Fallback: Use browser print for non-Electron environment
        return await this._printWithBrowser(barcode);
        
      } catch (e) {
        console.error('BarcodeDisplay.printBarcode error:', e);
        return false;
      }
    },

    /**
     * Print using Electron's native webContents.print
     * @param {string} barcode - The barcode to print
     * @returns {Promise<boolean>} Success status
     */
    _printWithElectron: async function (barcode) {
      try {
        const { ipcRenderer } = require('electron');
        
        // Create a temporary container to generate barcode
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0';
        document.body.appendChild(tempContainer);

        // Generate barcode canvas
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, barcode, {
          format: 'EAN13',
          width: 2,
          height: 50,
          displayValue: false,
          margin: 0,
          fontSize: 0,
          lineColor: '#000000',
          background: '#ffffff'
        });
        
        tempContainer.appendChild(canvas);

        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png');

        // Clean up temp element
        document.body.removeChild(tempContainer);

        // Send to main process for printing
        const result = await ipcRenderer.invoke('print-barcode', {
          barcode: barcode,
          dataUrl: dataUrl
        });

        return result.success || false;
        
      } catch (e) {
        console.error('BarcodeDisplay._printWithElectron error:', e);
        // Fallback to browser print
        return await this._printWithBrowser(barcode);
      }
    },

    /**
     * Print using browser's print dialog (fallback)
     * @param {string} barcode - The barcode to print
     * @returns {Promise<boolean>} Success status
     */
    _printWithBrowser: async function (barcode) {
      try {
        // Create a hidden print window
        const printWindow = window.open('', '_blank', 'width=300,height=200');
        
        if (!printWindow) {
          console.error('Could not open print window');
          return false;
        }

        // Write print content
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <title>Print Barcode</title>
              <script src="JsBarcode.js"><\/script>
              <style>
                @page {
                  size: 50mm 15mm;
                  margin: 0;
                  padding: 0;
                }
                html, body {
                  margin: 0;
                  padding: 0;
                  width: 50mm;
                  height: 15mm;
                  overflow: hidden;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .print-container {
                  width: 48mm;
                  height: 13mm;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  padding: 1mm;
                  box-sizing: border-box;
                }
              </style>
            </head>
            <body>
              <div class="print-container">
                <svg id="barcode"></svg>
              </div>
              <script>
                try {
                  JsBarcode("#barcode", "${barcode}", {
                    format: "EAN13",
                    width: 2,
                    height: 40,
                    displayValue: false,
                    margin: 0,
                    fontSize: 0,
                    lineColor: "#000000",
                    background: "#ffffff"
                  });
                  setTimeout(function() {
                    window.print();
                    window.close();
                  }, 300);
                } catch(e) {
                  console.error(e);
                  setTimeout(function() {
                    window.close();
                  }, 100);
                }
              <\/script>
            </body>
          </html>
        `);
        
        printWindow.document.close();
        return true;
        
      } catch (e) {
        console.error('BarcodeDisplay._printWithBrowser error:', e);
        return false;
      }
    },

    /**
     * Download barcode as image
     * @param {HTMLElement} barcodeElement - The barcode canvas/element
     * @param {string} filename - Output filename
     * @returns {boolean} Success status
     */
    downloadBarcodeImage: function (barcodeElement, filename = 'barcode.png') {
      try {
        const canvas = barcodeElement.querySelector('canvas');
        if (!canvas) {
          console.error('BarcodeDisplay.downloadBarcodeImage: no canvas found');
          return false;
        }

        canvas.toBlob((blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        });

        return true;
      } catch (e) {
        console.error('BarcodeDisplay.downloadBarcodeImage error:', e);
        return false;
      }
    }
  };

  // Export to global scope
  if (typeof window !== 'undefined') {
    window.BarcodeDisplay = BarcodeDisplay;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BarcodeDisplay;
  }

})();

