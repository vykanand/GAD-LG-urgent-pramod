/**
 * Barcode Generator Module
 * Generates unique barcodes based on date/time using a deterministic algorithm
 * Supports encoding and decoding to retrieve original timestamps
 */

(function () {
  'use strict';

  const BarcodeGenerator = {
    /**
     * Configuration constants
     */
    config: {
      // Use 13-digit EAN-style format for standard barcode compatibility
      BARCODE_LENGTH: 13,
      // Epoch offset (use a custom epoch to keep numbers manageable)
      EPOCH_OFFSET: 1609459200, // 2021-01-01 00:00:00 UTC in seconds
      // Multiplier to convert to fixed digit format
      TIME_MULTIPLIER: 100,
    },

    /**
     * Generate a unique barcode from current date/time
     * @param {Date} dateTime - Optional date object, uses current time if not provided
     * @returns {Object} { barcode, timestamp, encoded }
     */
    generateBarcode: function (dateTime) {
      try {
        dateTime = dateTime || new Date();
        
        // Get Unix timestamp in seconds
        const timestamp = Math.floor(dateTime.getTime() / 1000);
        
        // Calculate offset from our custom epoch
        const offset = timestamp - this.config.EPOCH_OFFSET;
        
        // If offset is negative, use timestamp directly (safety fallback)
        let timeValue = offset >= 0 ? offset : timestamp;
        
        // Create base code: pad to specific length
        let baseCode = timeValue.toString().padStart(10, '0').slice(-10);
        
        // Add milliseconds component for extra uniqueness
        const ms = dateTime.getMilliseconds();
        const msCode = Math.floor(ms / 10).toString().padStart(2, '0');
        
        // Combine: 10 chars (time) + 2 chars (milliseconds) = 12 chars
        const combinedCode = baseCode + msCode;
        
        // Calculate check digit using Luhn algorithm
        const checkDigit = this._calculateCheckDigit(combinedCode);
        
        // Final barcode: 12 data digits + 1 check digit = 13 total
        const barcode = combinedCode + checkDigit;
        
        return {
          barcode: barcode,
          timestamp: timestamp,
          dateTime: dateTime,
          encoded: {
            milliseconds: ms,
            timeValue: timeValue,
            offset: offset
          }
        };
      } catch (e) {
        console.error('BarcodeGenerator.generateBarcode error:', e);
        return null;
      }
    },

    /**
     * Calculate Luhn check digit (standard barcode validation)
     * @param {string} code - Code without check digit
     * @returns {number} Check digit
     */
    _calculateCheckDigit: function (code) {
      try {
        let sum = 0;
        let isEven = true;
        
        // Process digits from right to left
        for (let i = code.length - 1; i >= 0; i--) {
          let digit = parseInt(code[i], 10);
          
          if (isEven) {
            digit *= 3;
          }
          sum += digit;
          isEven = !isEven;
        }
        
        // Check digit is the amount needed to make sum a multiple of 10
        return (10 - (sum % 10)) % 10;
      } catch (e) {
        console.error('BarcodeGenerator._calculateCheckDigit error:', e);
        return 0;
      }
    },

    /**
     * Verify a barcode's check digit
     * @param {string} barcode - Complete barcode with check digit
     * @returns {boolean} True if check digit is valid
     */
    verifyBarcode: function (barcode) {
      try {
        if (!barcode || barcode.length !== this.config.BARCODE_LENGTH) {
          return false;
        }
        
        const code = barcode.slice(0, -1);
        const checkDigit = parseInt(barcode.slice(-1), 10);
        const calculated = this._calculateCheckDigit(code);
        
        return checkDigit === calculated;
      } catch (e) {
        console.error('BarcodeGenerator.verifyBarcode error:', e);
        return false;
      }
    },

    /**
     * Decode a barcode to retrieve the original timestamp and date
     * @param {string} barcode - The barcode to decode
     * @returns {Object|null} { timestamp, dateTime, milliseconds, verified } or null if invalid
     */
    decodeBarcode: function (barcode) {
      try {
        // Validate format and check digit
        if (!barcode || barcode.length !== this.config.BARCODE_LENGTH) {
          console.warn('BarcodeGenerator.decodeBarcode: invalid barcode length', barcode);
          return null;
        }
        
        // Verify check digit
        const verified = this.verifyBarcode(barcode);
        if (!verified) {
          console.warn('BarcodeGenerator.decodeBarcode: check digit verification failed', barcode);
        }
        
        // Extract components (12 digits, last 1 is check digit)
        const code = barcode.slice(0, -1);
        const timeStr = code.slice(0, 10);
        const msStr = code.slice(10, 12);
        
        // Reconstruct values
        let timeValue = parseInt(timeStr, 10);
        const msValue = parseInt(msStr, 10) * 10;
        
        // Reconstruct timestamp (add back epoch offset if it was subtracted)
        let timestamp = timeValue;
        
        // Try to detect if it's an offset or absolute timestamp
        // If timeValue looks like it could be an offset (not too large), add epoch
        if (timeValue < 500000000) {
          // Likely an offset from our epoch
          timestamp = timeValue + this.config.EPOCH_OFFSET;
        }
        
        // Create Date object
        const dateTime = new Date(timestamp * 1000 + msValue);
        
        return {
          timestamp: timestamp,
          dateTime: dateTime,
          milliseconds: msValue,
          verified: verified,
          formatted: {
            date: dateTime.toLocaleDateString('en-GB'),
            time: dateTime.toLocaleTimeString('en-GB', { 
              hour: '2-digit', 
              minute: '2-digit', 
              second: '2-digit' 
            }),
            iso: dateTime.toISOString()
          }
        };
      } catch (e) {
        console.error('BarcodeGenerator.decodeBarcode error:', e);
        return null;
      }
    },

    /**
     * Format a barcode for display (groups of 4-4-5 digits)
     * @param {string} barcode - The barcode to format
     * @returns {string} Formatted barcode
     */
    formatBarcode: function (barcode) {
      try {
        if (!barcode || barcode.length !== this.config.BARCODE_LENGTH) {
          return barcode;
        }
        // Format as XXXX-XXXX-XXXXX for readability
        return barcode.slice(0, 4) + '-' + 
               barcode.slice(4, 8) + '-' + 
               barcode.slice(8);
      } catch (e) {
        console.error('BarcodeGenerator.formatBarcode error:', e);
        return barcode;
      }
    },

    /**
     * Remove formatting from barcode
     * @param {string} formatted - Formatted barcode with hyphens
     * @returns {string} Unformatted barcode
     */
    unfoldBarcode: function (formatted) {
      try {
        return (formatted || '').replace(/-/g, '');
      } catch (e) {
        console.error('BarcodeGenerator.unfoldBarcode error:', e);
        return formatted;
      }
    },

    /**
     * Generate barcode with metadata for storage
     * @param {Date} dateTime - Optional date object
     * @returns {Object} Complete barcode record with all metadata
     */
    generateBarcodeRecord: function (dateTime) {
      try {
        dateTime = dateTime || new Date();
        const gen = this.generateBarcode(dateTime);
        
        if (!gen) return null;
        
        return {
          barcode: gen.barcode,
          barcodeFormatted: this.formatBarcode(gen.barcode),
          scanDateTime: gen.dateTime,
          timestamp: gen.timestamp,
          verified: true,
          created: new Date().toISOString(),
          metadata: {
            algorithm: 'timestamp-based-luhn-checksum',
            epoch: this.config.EPOCH_OFFSET,
            format: 'EAN-13 style (13 digits)',
            decodable: true,
            checksumValid: true
          }
        };
      } catch (e) {
        console.error('BarcodeGenerator.generateBarcodeRecord error:', e);
        return null;
      }
    },

    /**
     * Get current metrics about the barcode system
     * @returns {Object} System metrics and information
     */
    getMetrics: function () {
      try {
        const testBarcode = this.generateBarcodeRecord();
        return {
          barcodeLength: this.config.BARCODE_LENGTH,
          format: 'EAN-13 (13 digits)',
          uniqueInterval: '10 milliseconds',
          epochStart: new Date(this.config.EPOCH_OFFSET * 1000).toISOString(),
          checksumMethod: 'Luhn algorithm',
          lastGenerated: testBarcode
        };
      } catch (e) {
        console.error('BarcodeGenerator.getMetrics error:', e);
        return {};
      }
    }
  };

  // Export to global scope
  if (typeof window !== 'undefined') {
    window.BarcodeGenerator = BarcodeGenerator;
  }

  // Support for Node.js/CommonJS if needed
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BarcodeGenerator;
  }

})();
