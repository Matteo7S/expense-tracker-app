/**
 * Smart Receipt Analyzer Service
 * 
 * Utilizza algoritmi avanzati per analizzare scontrini e estrarre informazioni strutturate:
 * - Importi (totale, singoli prodotti, tasse)
 * - Date e orari
 * - Informazioni merchant (nome, indirizzo, P.IVA)
 * - Classificazione categoria (supermercato, ristorante, farmacia, etc.)
 * - Calcolo precisione migliorato
 */

import logger from '../utils/logger';

export interface ExtractedAmount {
  value: number;
  currency: string;
  type: 'total' | 'subtotal' | 'tax' | 'item' | 'discount';
  text: string; // Testo originale trovato
  confidence: number;
  position?: {
    line: number;
    startIndex: number;
    endIndex: number;
  };
}

export interface ExtractedDate {
  date: Date;
  text: string;
  confidence: number;
  type: 'transaction' | 'expiry' | 'other';
}

export interface MerchantInfo {
  name: string;
  address?: string;
  vatNumber?: string;
  fiscalCode?: string;
  phone?: string;
  confidence: number;
}

export interface ReceiptCategory {
  category: string;
  confidence: number;
  keywords: string[];
}

export interface SmartAnalysisResult {
  // Informazioni estratte
  amounts: ExtractedAmount[];
  primaryAmount: ExtractedAmount | null; // Importo principale (probabile totale)
  dates: ExtractedDate[];
  merchant: MerchantInfo | null;
  category: ReceiptCategory | null;
  
  // Metriche qualità
  overallAccuracy: number;
  textQuality: number;
  structureQuality: number;
  contentQuality: number;
  
  // Metadati
  originalText: string;
  processedLines: string[];
  processingTime: number;
}

class SmartReceiptAnalyzer {
  
  /**
   * Analizza un testo OCR per estrarre informazioni strutturate
   */
  async analyzeReceiptText(text: string, confidence: number): Promise<SmartAnalysisResult> {
    const startTime = Date.now();
    
    // Preprocessing del testo
    const processedLines = this.preprocessText(text);
    
    // Estrazione parallela delle informazioni
    const [amounts, dates, merchant, category] = await Promise.all([
      this.extractAmounts(processedLines),
      this.extractDates(processedLines),
      this.extractMerchantInfo(processedLines),
      this.classifyReceipt(processedLines)
    ]);
    
    // Identificazione importo principale
    const primaryAmount = this.identifyPrimaryAmount(amounts, processedLines);
    
    // Calcolo metriche di qualità
    const textQuality = this.calculateTextQuality(text, confidence);
    const structureQuality = this.calculateStructureQuality(processedLines);
    const contentQuality = this.calculateContentQuality(amounts, dates, merchant);
    const overallAccuracy = this.calculateOverallAccuracy(textQuality, structureQuality, contentQuality);
    
    const processingTime = Date.now() - startTime;
    
    return {
      amounts,
      primaryAmount,
      dates,
      merchant,
      category,
      overallAccuracy,
      textQuality,
      structureQuality,
      contentQuality,
      originalText: text,
      processedLines,
      processingTime
    };
  }
  
  /**
   * Preprocessing del testo per migliorare l'analisi
   */
  private preprocessText(text: string): string[] {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Normalizza caratteri comuni negli scontrini
        return line
          .replace(/['']/g, "'")
          .replace(/[""]/g, '"')
          .replace(/–/g, '-')
          .replace(/\s+/g, ' ')
          .trim();
      });
  }
  
  /**
   * Estrae tutti gli importi monetari dal testo
   */
  private async extractAmounts(lines: string[]): Promise<ExtractedAmount[]> {
    const amounts: ExtractedAmount[] = [];
    
    // Pattern per importi in diverse forme
    const amountPatterns = [
      // Formato europeo: €12,34 o EUR 12,34
      /(?:€|EUR|euro)\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi,
      // Formato: 12,34 € o 12,34 EUR
      /(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(?:€|EUR|euro)/gi,
      // Formato semplice: 12.34 o 12,34
      /(?:^|\s)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})(?:\s|$)/g,
      // Totali specifici
      /(?:totale|total|tot[.:]?)\s*(?:€|EUR)?\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/gi,
    ];
    
    lines.forEach((line, lineIndex) => {
      amountPatterns.forEach(pattern => {
        let match;
        const globalPattern = new RegExp(pattern.source, pattern.flags);
        
        while ((match = globalPattern.exec(line)) !== null) {
          const amountText = match[1] || match[0];
          const numericValue = this.parseAmountToNumber(amountText);
          
          if (numericValue > 0) {
            // Context-aware type determination
            const type = this.determineAmountTypeWithContext(line, lineIndex, lines, numericValue);
            const confidence = this.calculateAmountConfidence(line, match[0], type);
            
            amounts.push({
              value: numericValue,
              currency: 'EUR',
              type,
              text: match[0],
              confidence,
              position: {
                line: lineIndex,
                startIndex: match.index!,
                endIndex: match.index! + match[0].length
              }
            });
          }
        }
      });
    });
    
    // Rimuovi duplicati e ordina per confidenza
    return this.deduplicateAmounts(amounts)
      .sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Converte testo importo in numero
   */
  private parseAmountToNumber(amountText: string): number {
    const cleaned = amountText
      .replace(/[€$£¥EUR USD GBP JPY]/gi, '')
      .replace(/\s/g, '')
      .trim();
    
    // Gestisce formato europeo (virgola per decimali)
    if (cleaned.includes(',') && !cleaned.includes('.')) {
      return parseFloat(cleaned.replace(',', '.'));
    }
    
    // Gestisce formato americano o misto
    if (cleaned.includes('.') && cleaned.includes(',')) {
      // Probabilmente formato: 1,234.56
      return parseFloat(cleaned.replace(/,/g, ''));
    }
    
    return parseFloat(cleaned.replace(',', '.'));
  }
  
  /**
   * Determina il tipo di importo con analisi del contesto delle righe adiacenti
   */
  private determineAmountTypeWithContext(
    line: string, 
    lineIndex: number, 
    allLines: string[], 
    amount: number
  ): ExtractedAmount['type'] {
    console.log(`🔍 DEBUG: Context analysis for "${line}" (amount: ${amount})`);
    
    // Prima analizza la riga corrente
    const directType = this.determineAmountType(line, amount);
    if (directType !== 'item') {
      return directType; // Se già identificato come non-item, usa quello
    }
    
    // Analizza il contesto con range più ampio e logica migliorata
    const contextRange = 3; // Aumentato da 2 a 3 righe
    const contextLines = [];
    const exactLines = []; // Righe esatte per analisi specifica
    
    for (let i = Math.max(0, lineIndex - contextRange); i <= Math.min(allLines.length - 1, lineIndex + contextRange); i++) {
      if (i !== lineIndex) {
        contextLines.push(allLines[i]);
        exactLines.push({ text: allLines[i], index: i });
      }
    }
    
    const contextText = contextLines.join(' ').toLowerCase();
    const fullText = allLines.join(' ').toLowerCase(); // Tutto il testo per pattern globali
    
    console.log(`🔎 DEBUG: Context text for ${amount}: "${contextText}"`);
    
    // Pattern migliorati per totali con flessibilità OCR
    const totalPatterns = [
      // Pattern base
      /(?:totale\s*(?:complessivo|generale|finale|euro)?)/i,
      /(?:total\s*(?:amount|general|final|euro)?)/i,
      /(?:tot[.:]?\s*(?:compl|gen|fin)?)/i,
      /(?:somma\s*(?:totale|finale))/i,
      /(?:grand\s*total)/i,
      /(?:importo\s*(?:pagato|totale|finale|dovuto))/i,
      
      // Pattern specifici italiani
      /(?:pagamento\s*(?:elettronico|elettronico|contanti))/i,
      /(?:saldo|resto|dovuto)/i,
      
      // Pattern separati (per OCR che spezza le parole)
      /(?:to\s*ta\s*le|tot\s*ale)/i,
      /(?:com\s*ples\s*si\s*vo|compless)/i,
      /(?:pag\s*ato|pa\s*ga\s*to)/i
    ];
    
    // Test pattern totali
    for (const pattern of totalPatterns) {
      if (pattern.test(contextText) || pattern.test(fullText)) {
        console.log(`✅ DEBUG: Found TOTAL pattern "${pattern.source}" for ${amount}`);
        return 'total';
      }
    }
    
    // Pattern subtotali migliorati
    const subtotalPatterns = [
      /(?:sub\s*totale|subtotal)/i,
      /(?:sub[.\s]?tot|s\.tot)/i,
      /(?:imponibile|parziale)/i,
      /(?:sub\s*tot|s\s*tot)/i
    ];
    
    for (const pattern of subtotalPatterns) {
      if (pattern.test(contextText)) {
        console.log(`📊 DEBUG: Found SUBTOTAL pattern "${pattern.source}" for ${amount}`);
        return 'subtotal';
      }
    }
    
    // Pattern IVA/tasse migliorati
    const taxPatterns = [
      /(?:iva|i\.v\.a\.?|imposta)/i,
      /(?:tax|vat|tassa|tasse)/i,
      /(?:di\s*cui\s*iva)/i,
      /(?:i\s*v\s*a|i\s*va)/i
    ];
    
    for (const pattern of taxPatterns) {
      if (pattern.test(contextText)) {
        console.log(`💸 DEBUG: Found TAX pattern "${pattern.source}" for ${amount}`);
        return 'tax';
      }
    }
    
    // Analisi posizionale migliorata: cerca pattern nelle righe specifiche
    for (const lineInfo of exactLines) {
      const lineText = lineInfo.text.toLowerCase();
      
      // Se una riga vicina contiene chiaramente "totale" e l'importo corrente
      if (lineText.includes('totale') || lineText.includes('total')) {
        const amountInLine = lineText.includes(amount.toString().replace('.', ','));
        if (amountInLine || Math.abs(lineInfo.index - lineIndex) <= 1) {
          console.log(`✅ DEBUG: Found TOTAL via nearby line "${lineInfo.text}" for ${amount}`);
          return 'total';
        }
      }
      
      // Pattern per importo pagato/pagamento
      if ((lineText.includes('pagato') || lineText.includes('pagamento')) && 
          (lineText.includes('elettronico') || lineText.includes('contanti'))) {
        console.log(`✅ DEBUG: Found TOTAL via payment line "${lineInfo.text}" for ${amount}`);
        return 'total';
      }
    }
    
    // Logica migliorata per occorrenze multiple
    const amountStr = amount.toString().replace('.', ',');
    const duplicateCount = allLines.filter(l => l.includes(amountStr)).length;
    
    if (duplicateCount > 1) {
      // Trova la posizione dell'importo corrente tra le occorrenze
      let currentPosition = 0;
      for (let i = 0; i <= lineIndex; i++) {
        if (allLines[i].includes(amountStr)) {
          currentPosition++;
        }
      }
      
      // Priorità per ultima occorrenza O occorrenze vicino a pattern totali
      const isLastOccurrence = currentPosition === duplicateCount;
      const isNearTotalPattern = contextText.match(/(?:totale|total|pagato|pagamento)/i);
      
      if (isLastOccurrence && duplicateCount >= 2) {
        console.log(`✅ DEBUG: ${amount} is LAST occurrence (${currentPosition}/${duplicateCount}) - likely TOTAL`);
        return 'total';
      }
      
      if (isNearTotalPattern && duplicateCount >= 2) {
        console.log(`✅ DEBUG: ${amount} near total pattern (${currentPosition}/${duplicateCount}) - likely TOTAL`);
        return 'total';
      }
      
      // Se è l'importo più alto tra quelli duplicati e appare nell'ultima metà
      if (currentPosition > duplicateCount / 2) {
        const duplicateAmounts = allLines
          .map((l, i) => ({ line: l, index: i }))
          .filter(item => item.line.includes(amountStr))
          .map(item => this.extractAmountFromLine(item.line))
          .filter(amt => amt > 0);
          
        const maxAmount = Math.max(...duplicateAmounts);
        if (amount === maxAmount && duplicateCount >= 3) {
          console.log(`✅ DEBUG: ${amount} is HIGHEST duplicate in lower half - likely TOTAL`);
          return 'total';
        }
      }
    }
    
    console.log(`📦 DEBUG: No context match found for ${amount} - defaulting to ITEM`);
    return 'item';
  }
  
  /**
   * Estrae il primo importo trovato in una riga (helper method)
   */
  private extractAmountFromLine(line: string): number {
    const match = line.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/);
    if (match) {
      return this.parseAmountToNumber(match[1]);
    }
    return 0;
  }
  
  /**
   * Determina il tipo di importo basandosi sul contesto
   */
  private determineAmountType(line: string, amount: number): ExtractedAmount['type'] {
    const lowerLine = line.toLowerCase();
    
    console.log(`🔍 DEBUG: Analyzing line for amount type: "${line}" (amount: ${amount})`);
    
    // Totali - pattern migliorati
    if (/(?:totale\s*complessivo|totale|total|tot[.:]?|somma|amount|grand\s*total|importo\s*pagato)/i.test(line)) {
      console.log(`✅ DEBUG: Recognized as TOTAL: "${line}"`);
      return 'total';
    }
    
    // Subtotali
    if (/(?:subtotale|subtotal|sub[.\s]?tot|imponibile)/i.test(line)) {
      console.log(`📊 DEBUG: Recognized as SUBTOTAL: "${line}"`);
      return 'subtotal';
    }
    
    // Tasse/IVA
    if (/(?:iva|tax|vat|imposta|tassa)/i.test(line)) {
      console.log(`💸 DEBUG: Recognized as TAX: "${line}"`);
      return 'tax';
    }
    
    // Sconti
    if (/(?:sconto|discount|off|riduzione|promo)/i.test(line)) {
      console.log(`🏷️ DEBUG: Recognized as DISCOUNT: "${line}"`);
      return 'discount';
    }
    
    // Default: item
    console.log(`📦 DEBUG: Defaulting to ITEM: "${line}"`);
    return 'item';
  }
  
  /**
   * Calcola la confidenza di un importo estratto
   */
  private calculateAmountConfidence(line: string, matchText: string, type: ExtractedAmount['type']): number {
    let confidence = 0.5; // Base confidence
    
    // Bonus per contesto
    if (type === 'total') confidence += 0.3;
    if (type === 'subtotal') confidence += 0.2;
    if (type === 'tax') confidence += 0.15;
    
    // Bonus per formato chiaro
    if (/€\s*\d+[.,]\d{2}/.test(matchText)) confidence += 0.15;
    if (/\d+[.,]\d{2}\s*€/.test(matchText)) confidence += 0.1;
    
    // Bonus per posizione nel contesto
    if (/(?:totale|total)/i.test(line)) confidence += 0.2;
    if (line.trim().length < 30) confidence += 0.1; // Righe corte spesso sono totali
    
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Rimuove importi duplicati simili
   */
  private deduplicateAmounts(amounts: ExtractedAmount[]): ExtractedAmount[] {
    const unique: ExtractedAmount[] = [];
    
    for (const amount of amounts) {
      const isDuplicate = unique.some(existing => 
        Math.abs(existing.value - amount.value) < 0.01 &&
        existing.currency === amount.currency
      );
      
      if (!isDuplicate) {
        unique.push(amount);
      }
    }
    
    return unique;
  }
  
  /**
   * Identifica l'importo principale (totale più probabile)
   */
  private identifyPrimaryAmount(amounts: ExtractedAmount[], lines: string[]): ExtractedAmount | null {
    if (amounts.length === 0) return null;
    
    console.log('🔍 DEBUG: All extracted amounts:', amounts.map(a => `${a.value} ${a.currency} (${a.type}, conf: ${a.confidence.toFixed(2)}, text: "${a.text}")`));
    
    // Prima priorità: importi marcati come 'total'
    const totals = amounts.filter(a => a.type === 'total');
    console.log('🏆 DEBUG: Found totals:', totals.map(a => `${a.value} ${a.currency} (conf: ${a.confidence.toFixed(2)})`));
    
    if (totals.length > 0) {
      // Strategia migliorata per selezionare il migliore tra i totali
      let bestTotal: ExtractedAmount;
      
      // Se ci sono totali ad alta confidenza (>= 0.85), scegli il più alto
      const highConfidenceTotals = totals.filter(t => t.confidence >= 0.85);
      if (highConfidenceTotals.length > 0) {
        bestTotal = highConfidenceTotals.reduce((best, current) => {
          // Prima priorità: valore più alto
          if (current.value > best.value) return current;
          // Se stesso valore, priorità alla confidenza più alta
          if (current.value === best.value && current.confidence > best.confidence) return current;
          // Se stesso valore e confidenza, preferisci l'ultima occorrenza (posizione più bassa)
          if (current.value === best.value && current.confidence === best.confidence) {
            return (current.position?.line || 0) > (best.position?.line || 0) ? current : best;
          }
          return best;
        });
        console.log('💎 DEBUG: Selected best high-confidence total:', `${bestTotal.value} ${bestTotal.currency} (conf: ${bestTotal.confidence.toFixed(2)}, line: ${bestTotal.position?.line})`);
      } else {
        // Fallback: miglior totale per confidenza e poi per valore
        bestTotal = totals.reduce((best, current) => {
          if (current.confidence > best.confidence) return current;
          if (current.confidence === best.confidence && current.value > best.value) return current;
          return best;
        });
        console.log('📊 DEBUG: Selected best total by confidence:', `${bestTotal.value} ${bestTotal.currency} (conf: ${bestTotal.confidence.toFixed(2)})`);
      }
      
      console.log('✅ DEBUG: Selected primary amount (total):', `${bestTotal.value} ${bestTotal.currency}`);
      return bestTotal;
    }
    
    // Seconda priorità: importo più alto con buona confidenza
    const highConfidenceAmounts = amounts.filter(a => a.confidence > 0.7);
    console.log('💰 DEBUG: High confidence amounts (>0.7):', highConfidenceAmounts.map(a => `${a.value} ${a.currency} (conf: ${a.confidence.toFixed(2)})`));
    
    if (highConfidenceAmounts.length > 0) {
      const bestHighConf = highConfidenceAmounts.reduce((best, current) => 
        current.value > best.value ? current : best
      );
      console.log('✅ DEBUG: Selected primary amount (highest value):', `${bestHighConf.value} ${bestHighConf.currency}`);
      return bestHighConf;
    }
    
    // Fallback: importo con confidenza più alta
    const fallback = amounts.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
    console.log('⚠️ DEBUG: Selected primary amount (fallback - highest confidence):', `${fallback.value} ${fallback.currency}`);
    return fallback;
  }
  
  /**
   * Estrae date e orari dal testo
   */
  private async extractDates(lines: string[]): Promise<ExtractedDate[]> {
    const dates: ExtractedDate[] = [];
    
    const dateTimePatterns = [
      // DD/MM/YYYY HH:MM o DD-MM-YYYY HH:MM
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\s+(\d{1,2})[.:]?(\d{2})/g,
      // DD/MM/YY HH:MM
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2})\s+(\d{1,2})[.:]?(\d{2})/g,
      // YYYY-MM-DD HH:MM
      /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\s+(\d{1,2})[.:]?(\d{2})/g,
      // HH:MM DD/MM/YYYY (ora prima della data)
      /(\d{1,2})[.:]?(\d{2})\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g,
    ];
    
    const dateOnlyPatterns = [
      // DD/MM/YYYY o DD-MM-YYYY
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/g,
      // DD/MM/YY
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2})/g,
      // YYYY-MM-DD
      /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/g,
    ];
    
    const timeOnlyPatterns = [
      // HH:MM o HH.MM
      /(?:^|\s)(\d{1,2})[.:]?(\d{2})(?:\s|$)/g,
      // Patterns con contesto temporale
      /(?:ora|orario|time)[:\s]*(\d{1,2})[.:]?(\d{2})/gi,
    ];
    
    // Cerca pattern data+ora combinati
    lines.forEach((line, lineIndex) => {
      dateTimePatterns.forEach(pattern => {
        let match;
        const globalPattern = new RegExp(pattern.source, pattern.flags);
        
        while ((match = globalPattern.exec(line)) !== null) {
          let dateStr, hourStr, minuteStr;
          
          if (match[3]) {
            // Formato: DD/MM/YYYY HH:MM
            [, dateStr, hourStr, minuteStr] = match;
          } else if (match[4]) {
            // Formato: HH:MM DD/MM/YYYY
            [, hourStr, minuteStr, dateStr] = match;
          } else {
            continue;
          }
          
          const parsedDate = this.parseDate(dateStr);
          const hour = parseInt(hourStr, 10);
          const minute = parseInt(minuteStr, 10);
          
          if (parsedDate && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            parsedDate.setHours(hour, minute, 0, 0);
            
            dates.push({
              date: parsedDate,
              text: `${dateStr} ${hourStr}:${minuteStr.padStart(2, '0')}`,
              confidence: this.calculateDateConfidence(line, match[0]) + 0.2, // Bonus per data+ora
              type: this.determineDateType(line)
            });
          }
        }
      });
    });
    
    // Cerca date senza orario
    lines.forEach((line, lineIndex) => {
      dateOnlyPatterns.forEach(pattern => {
        let match;
        const globalPattern = new RegExp(pattern.source, pattern.flags);
        
        while ((match = globalPattern.exec(line)) !== null) {
          const dateStr = match[1];
          const parsedDate = this.parseDate(dateStr);
          
          if (parsedDate) {
            // Verifica che non sia già stata trovata con orario
            const alreadyExists = dates.some(d => 
              Math.abs(d.date.getTime() - parsedDate.getTime()) < 24 * 60 * 60 * 1000
            );
            
            if (!alreadyExists) {
              dates.push({
                date: parsedDate,
                text: dateStr,
                confidence: this.calculateDateConfidence(line, dateStr),
                type: this.determineDateType(line)
              });
            }
          }
        }
      });
    });
    
    // Cerca orari separati e prova ad abbinarli alla data più probabile
    const possibleTimes: Array<{hour: number, minute: number, text: string, line: string}> = [];
    
    lines.forEach(line => {
      timeOnlyPatterns.forEach(pattern => {
        let match;
        const globalPattern = new RegExp(pattern.source, pattern.flags);
        
        while ((match = globalPattern.exec(line)) !== null) {
          const hourStr = match[1];
          const minuteStr = match[2] || '00';
          const hour = parseInt(hourStr, 10);
          const minute = parseInt(minuteStr, 10);
          
          if (hour >= 6 && hour <= 23 && minute >= 0 && minute <= 59) { // Orari ragionevoli
            possibleTimes.push({
              hour,
              minute,
              text: `${hourStr}:${minuteStr.padStart(2, '0')}`,
              line
            });
          }
        }
      });
    });
    
    // Se abbiamo orari separati, proviamo ad abbinarli alla data più probabile
    if (possibleTimes.length > 0 && dates.length > 0) {
      const mostLikelyDate = dates.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
      
      possibleTimes.forEach(timeInfo => {
        const newDate = new Date(mostLikelyDate.date);
        newDate.setHours(timeInfo.hour, timeInfo.minute, 0, 0);
        
        // Sostituisce la data senza orario con quella completa
        const existingIndex = dates.findIndex(d => 
          Math.abs(d.date.getTime() - mostLikelyDate.date.getTime()) < 1000
        );
        
        if (existingIndex >= 0) {
          dates[existingIndex] = {
            date: newDate,
            text: `${mostLikelyDate.text} ${timeInfo.text}`,
            confidence: mostLikelyDate.confidence + 0.15,
            type: mostLikelyDate.type
          };
        }
      });
    }
    
    return dates
      .filter(d => d.date.getFullYear() >= 2020 && d.date.getFullYear() <= 2030) // Filtra date ragionevoli
      .sort((a, b) => b.confidence - a.confidence);
  }
  
  /**
   * Parse flessibile delle date
   */
  private parseDate(dateStr: string): Date | null {
    try {
      // Sostituisci separatori
      const normalized = dateStr.replace(/[\/\-]/g, '/');
      const parts = normalized.split('/');
      
      if (parts.length === 3) {
        let [day, month, year] = parts.map(p => parseInt(p, 10));
        
        // Gestisci anni a 2 cifre
        if (year < 100) {
          year += year > 50 ? 1900 : 2000;
        }
        
        // Formato italiano: DD/MM/YYYY
        if (day <= 31 && month <= 12) {
          const date = new Date(year, month - 1, day);
          
          // Verifica che la data sia ragionevole (non troppo nel futuro/passato)
          const now = new Date();
          const diffYears = Math.abs(now.getFullYear() - date.getFullYear());
          
          if (diffYears <= 10) {
            return date;
          }
        }
      }
    } catch (error) {
      console.log('Date parsing error:', error);
    }
    
    return null;
  }
  
  /**
   * Calcola confidenza per le date
   */
  private calculateDateConfidence(line: string, dateStr: string): number {
    let confidence = 0.5;
    
    // Bonus per contesto
    if (/(?:data|date|giorno)/i.test(line)) confidence += 0.3;
    if (/(?:ora|time|orario)/i.test(line)) confidence += 0.2;
    
    // Bonus per formato completo
    if (dateStr.includes('/') || dateStr.includes('-')) confidence += 0.2;
    
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Determina il tipo di data
   */
  private determineDateType(line: string): ExtractedDate['type'] {
    const lowerLine = line.toLowerCase();
    
    if (/(?:scaden|expir|valid)/i.test(line)) {
      return 'expiry';
    }
    
    if (/(?:data|date|giorno|ora|time)/i.test(line)) {
      return 'transaction';
    }
    
    return 'other';
  }
  
  /**
   * Estrae informazioni del merchant
   */
  private async extractMerchantInfo(lines: string[]): Promise<MerchantInfo | null> {
    let name = '';
    let address = '';
    let vatNumber = '';
    let fiscalCode = '';
    let phone = '';
    let confidence = 0;
    
    // Il nome è spesso nelle prime righe
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      
      // Skip righe con solo numeri o caratteri speciali
      if (/^[\d\s\-\.\/]+$/.test(line)) continue;
      
      // Se sembra un nome (ha lettere e non è troppo lungo)
      if (line.length > 3 && line.length < 50 && /[a-zA-Z]/.test(line)) {
        if (!name && !this.looksLikeAddress(line) && !this.looksLikeVatNumber(line)) {
          name = line;
          confidence += 0.3;
          break;
        }
      }
    }
    
    // Cerca P.IVA e codice fiscale
    lines.forEach(line => {
      // P.IVA patterns
      const vatMatch = line.match(/(?:p\.?\s*iva|vat|partita\s*iva)[:\s]*(\d{10,15})/i);
      if (vatMatch && !vatNumber) {
        vatNumber = vatMatch[1];
        confidence += 0.2;
      }
      
      // Codice fiscale
      const cfMatch = line.match(/(?:c\.?\s*f\.?|cod\.?\s*fisc|fiscal)[:\s]*([A-Z0-9]{11,16})/i);
      if (cfMatch && !fiscalCode) {
        fiscalCode = cfMatch[1];
        confidence += 0.15;
      }
      
      // Telefono
      const phoneMatch = line.match(/(?:tel|phone)[:\s]*(\d{2,4}[\s\-]?\d{3,8})/i);
      if (phoneMatch && !phone) {
        phone = phoneMatch[1];
        confidence += 0.1;
      }
      
      // Indirizzo (cerca pattern di indirizzi)
      if (this.looksLikeAddress(line) && !address) {
        address = line;
        confidence += 0.15;
      }
    });
    
    if (name || vatNumber || address) {
      return {
        name: name || 'Sconosciuto',
        address: address || undefined,
        vatNumber: vatNumber || undefined,
        fiscalCode: fiscalCode || undefined,
        phone: phone || undefined,
        confidence: Math.min(confidence, 1.0)
      };
    }
    
    return null;
  }
  
  /**
   * Verifica se una riga sembra un indirizzo
   */
  private looksLikeAddress(line: string): boolean {
    const addressIndicators = [
      /via|viale|corso|piazza|largo|strada/i,
      /\d+.*(?:milano|roma|napoli|torino|bologna)/i,
      /\d{5}[\s\-]/,  // CAP italiano
      /\(\w{2}\)$/    // Provincia tra parentesi
    ];
    
    return addressIndicators.some(pattern => pattern.test(line));
  }
  
  /**
   * Verifica se una riga contiene una P.IVA
   */
  private looksLikeVatNumber(line: string): boolean {
    return /(?:p\.?\s*iva|vat|partita)/i.test(line);
  }
  
  /**
   * Classifica il tipo di scontrino
   */
  private async classifyReceipt(lines: string[]): Promise<ReceiptCategory | null> {
    const fullText = lines.join(' ').toLowerCase();
    
    const categories = [
      {
        category: 'food',
        keywords: [
          // Supermercati e catene alimentari
          'supermercato', 'conad', 'coop', 'esselunga', 'carrefour', 'pam', 'iper', 'bennet', 'auchan', 'lidl', 'eurospin', 'md', 'penny', 'simply', 'tigros', 'famila', 'sigma', 'todis',
          // Ristoranti e locali
          'ristorante', 'pizzeria', 'trattoria', 'osteria', 'bar', 'caffè', 'cafe', 'tavola', 'bistrot', 'pub', 'gelateria', 'pasticceria', 'panetteria', 'rosticceria', 'paninoteca', 'gastronomia',
          // Alimenti comuni
          'pane', 'latte', 'pasta', 'riso', 'carne', 'pesce', 'verdura', 'frutta', 'formaggio', 'salumi', 'prosciutto', 'uova', 'olio', 'burro', 'zucchero', 'sale', 'acqua', 'vino', 'birra',
          // Prodotti da forno
          'pizza', 'focaccia', 'grissini', 'crackers', 'biscotti', 'torta', 'dolce', 'gelato',
          // Bevande
          'bibita', 'succo', 'spremuta', 'tè', 'te', 'caffé', 'cappuccino', 'espresso', 'coca', 'pepsi', 'fanta', 'sprite',
          // Categorie alimentari
          'alimentari', 'generi', 'grocery', 'market', 'minimarket', 'discount', 'fresh',
          // Parole indicative
          'menu', 'tavolo', 'coperti', 'coperto', 'servizio', 'pranzo', 'cena', 'colazione', 'aperitivo', 'spuntino',
          // Reparti supermercato
          'ortofrutta', 'macelleria', 'salumeria', 'pescheria', 'panificio', 'latticini', 'surgelati', 'scatolame',
          // Fast food e delivery
          'mcdonald', 'burger', 'kebab', 'sushi', 'take', 'away', 'delivery', 'domicilio',
          // Termini generici
          'food', 'eat', 'drink', 'meal', 'dish', 'piatto', 'porzione'
        ],
        patterns: [
          /(?:kg|lt|pz|confezioni|coperti|servizio|tavolo)/i,
          /(?:gr|grammi|litri|etto|hg)/i,
          /(?:x\s*\d+|n[\s.]\d+)/i, // Pattern per quantità: x2, n.1, ecc.
          /(?:reparto|banco|scaffale)/i,
          /(?:scad|scadenza)/i // Data di scadenza tipica degli alimentari
        ]
      },
      {
        category: 'transport',
        keywords: ['benzina', 'diesel', 'gas', 'carburante', 'eni', 'shell', 'q8', 'agip', 'taxi', 'uber', 'treno', 'aereo'],
        patterns: [/(?:litri|self|service)/i]
      },
      {
        category: 'health',
        keywords: ['farmacia', 'parafarmacia', 'medicina', 'farmaco', 'ricetta', 'medicinale'],
        patterns: [/(?:mg|ml|compresse|capsule)/i]
      },
      {
        category: 'shopping',
        keywords: ['abbigliamento', 'moda', 'vestiti', 'scarpe', 'jeans', 'shirt', 'dress', 'elettronica', 'computer', 'telefono', 'mediaworld', 'unieuro', 'apple'],
        patterns: [/(?:taglia|size|xl|xs|m|l|gb|tb|hz|inch)/i]
      },
      {
        category: 'entertainment',
        keywords: ['cinema', 'teatro', 'museo', 'sport', 'concerto', 'evento'],
        patterns: [/(?:biglietto|ticket|ingresso)/i]
      },
      {
        category: 'accommodation',
        keywords: ['hotel', 'albergo', 'ostello', 'bed', 'breakfast', 'airbnb'],
        patterns: [/(?:notte|night|camera|room)/i]
      }
    ];
    
    // Traccia tutte le categorie con i loro score per debug
    const categoryScores: Array<{ category: string; score: number; confidence: number; foundKeywords: string[] }> = [];
    
    for (const cat of categories) {
      let score = 0;
      const foundKeywords: string[] = [];
      
      // Conta keyword matches con peso maggiore
      cat.keywords.forEach(keyword => {
        if (fullText.includes(keyword)) {
          score += 2; // Aumentato da 1 a 2 per dare più peso
          foundKeywords.push(keyword);
        }
      });
      
      // Conta pattern matches con peso aumentato
      cat.patterns.forEach(pattern => {
        if (pattern.test(fullText)) {
          score += 1.5; // Aumentato da 0.5 a 1.5
        }
      });
      
      // Calcolo confidenza migliorato: usa score assoluto invece di normalizzare
      // Più match = più confidenza, indipendentemente dal numero totale di keyword
      let confidence = 0;
      if (foundKeywords.length > 0) {
        // Base: ogni keyword trovata vale
        confidence = Math.min(foundKeywords.length * 0.15, 0.9); // Max 90% da keywords
        
        // Bonus per pattern matches (ogni pattern aggiunge 10%)
        let patternMatches = 0;
        cat.patterns.forEach(pattern => {
          if (pattern.test(fullText)) patternMatches++;
        });
        confidence = Math.min(confidence + (patternMatches * 0.1), 1.0);
        
        // Bonus extra per molte keyword (indica forte match)
        if (foundKeywords.length >= 3) {
          confidence = Math.min(confidence + 0.15, 1.0);
        }
        if (foundKeywords.length >= 5) {
          confidence = Math.min(confidence + 0.1, 1.0);
        }
      }
      
      categoryScores.push({
        category: cat.category,
        score,
        confidence,
        foundKeywords
      });
    }
    
    // Ordina per confidenza decrescente e prendi la migliore
    categoryScores.sort((a, b) => b.confidence - a.confidence);
    
    // Log per debug
    logger.debug('🏷️ Category classification scores:', categoryScores.map(c => 
      `${c.category}: ${c.confidence.toFixed(2)} (keywords: ${c.foundKeywords.length})`
    ));
    
    // Soglia più bassa: accetta se confidenza >= 0.15 (prima era 0.3)
    const bestMatch = categoryScores[0];
    if (bestMatch && bestMatch.confidence >= 0.15) {
      logger.info(`✅ Selected category: ${bestMatch.category} with confidence ${bestMatch.confidence.toFixed(2)}`);
      logger.debug(`🔑 Found keywords: ${bestMatch.foundKeywords.join(', ')}`);
      return {
        category: bestMatch.category,
        confidence: bestMatch.confidence,
        keywords: bestMatch.foundKeywords
      };
    }
    
    return null;
  }
  
  /**
   * Calcola la qualità del testo OCR
   */
  private calculateTextQuality(text: string, ocrConfidence: number): number {
    let score = ocrConfidence * 100;
    
    // Bonus per lunghezza ragionevole
    if (text.length >= 50 && text.length <= 1000) {
      score += 10;
    } else if (text.length < 20) {
      score -= 30;
    }
    
    // Bonus per caratteri validi
    const validCharsRatio = (text.match(/[a-zA-Z0-9\s.,€$\-]/g) || []).length / text.length;
    score += validCharsRatio * 15;
    
    // Penalty per troppi caratteri strani
    const strangeCharsRatio = (text.match(/[^\w\s.,€$\-()\/]/g) || []).length / text.length;
    score -= strangeCharsRatio * 20;
    
    return Math.max(0, Math.min(score, 100));
  }
  
  /**
   * Calcola la qualità della struttura
   */
  private calculateStructureQuality(lines: string[]): number {
    let score = 50; // Base score
    
    // Bonus per numero appropriato di righe
    if (lines.length >= 5 && lines.length <= 30) {
      score += 20;
    } else if (lines.length < 3) {
      score -= 30;
    }
    
    // Bonus per righe con pattern riconoscibili
    let recognizedPatterns = 0;
    lines.forEach(line => {
      // Pattern tipici degli scontrini
      if (/(?:totale|iva|data|ora)/i.test(line)) recognizedPatterns++;
      if (/\d+[.,]\d{2}/.test(line)) recognizedPatterns++; // Importi
      if (/(?:via|corso|piazza)/i.test(line)) recognizedPatterns++; // Indirizzi
    });
    
    score += Math.min(recognizedPatterns * 5, 30);
    
    return Math.max(0, Math.min(score, 100));
  }
  
  /**
   * Calcola la qualità del contenuto estratto
   */
  private calculateContentQuality(amounts: ExtractedAmount[], dates: ExtractedDate[], merchant: MerchantInfo | null): number {
    let score = 0;
    
    // Bonus per informazioni trovate
    if (amounts.length > 0) score += 30;
    if (amounts.some(a => a.type === 'total')) score += 20;
    if (dates.length > 0) score += 20;
    if (merchant?.name) score += 15;
    if (merchant?.vatNumber) score += 15;
    
    return Math.min(score, 100);
  }
  
  /**
   * Calcola la precisione complessiva migliorata
   */
  private calculateOverallAccuracy(textQuality: number, structureQuality: number, contentQuality: number): number {
    // Weighted average con pesi diversi
    const weightedScore = (
      textQuality * 0.4 +      // 40% peso sulla qualità OCR
      structureQuality * 0.3 +  // 30% peso sulla struttura
      contentQuality * 0.3      // 30% peso sul contenuto estratto
    );
    
    return Math.round(Math.max(0, Math.min(weightedScore, 100)));
  }
  
  /**
   * Formatta un importo per la visualizzazione
   */
  formatAmount(amount: ExtractedAmount): string {
    return `${amount.currency} ${amount.value.toFixed(2).replace('.', ',')}`;
  }
  
  /**
   * Ottieni suggerimenti per migliorare la scansione
   */
  getScanningTips(analysis: SmartAnalysisResult): string[] {
    const tips: string[] = [];
    
    if (analysis.overallAccuracy < 70) {
      tips.push("📸 Prova a inquadrare meglio lo scontrino");
    }
    
    if (analysis.amounts.length === 0) {
      tips.push("💰 Assicurati che gli importi siano visibili");
    }
    
    if (!analysis.merchant?.name) {
      tips.push("🏪 Includi il nome del negozio nella foto");
    }
    
    if (analysis.dates.length === 0) {
      tips.push("📅 Verifica che la data sia leggibile");
    }
    
    if (analysis.textQuality < 60) {
      tips.push("💡 Migliora l'illuminazione o la messa a fuoco");
    }
    
    return tips;
  }

  /**
   * Valida se i dati estratti sono sufficienti per il salvataggio automatico
   * Criteri: importo, data e ora con confidenza > 80%
   */
  validateReceiptData(analysis: SmartAnalysisResult): {
    isValid: boolean;
    missingData: string[];
    validatedData: {
      amount?: { value: number; currency: string; confidence: number };
      date?: { date: Date; confidence: number };
      time?: { time: string; confidence: number };
      merchant?: { name: string; confidence: number };
    };
  } {
    const missingData: string[] = [];
    const validatedData: any = {};
    
    // Valida importo (confidenza > 80%)
    const validAmount = analysis.primaryAmount && analysis.primaryAmount.confidence > 0.8;
    if (validAmount && analysis.primaryAmount) {
      validatedData.amount = {
        value: analysis.primaryAmount.value,
        currency: analysis.primaryAmount.currency,
        confidence: analysis.primaryAmount.confidence
      };
    } else {
      missingData.push('Importo');
    }
    
    // Valida data e ora (confidenza > 80%)
    const validDateTime = analysis.dates.find(d => d.confidence > 0.8);
    if (validDateTime) {
      validatedData.date = {
        date: validDateTime.date,
        confidence: validDateTime.confidence
      };
      
      // Estrai ora se presente
      const dateText = validDateTime.text;
      const timeMatch = dateText.match(/(\d{1,2})[.:]?(\d{2})/);
      if (timeMatch && timeMatch.length >= 3) {
        const hour = parseInt(timeMatch[1], 10);
        const minute = parseInt(timeMatch[2], 10);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
          validatedData.time = {
            time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
            confidence: validDateTime.confidence
          };
        }
      }
    } else {
      missingData.push('Data');
    }
    
    // Opzionale: merchant name (non bloccante ma utile)
    if (analysis.merchant && analysis.merchant.confidence > 0.6) {
      validatedData.merchant = {
        name: analysis.merchant.name,
        confidence: analysis.merchant.confidence
      };
    }
    
    const isValid = missingData.length === 0;
    
    return {
      isValid,
      missingData,
      validatedData
    };
  }

  /**
   * Estrae i dati essenziali per il salvataggio con fallback
   */
  extractEssentialData(analysis: SmartAnalysisResult): {
    amount: number;
    currency: string;
    date: string; // ISO date string
    time?: string; // HH:MM format
    merchantName?: string;
    extractedData: any; // Full analysis for reference
  } {
    // Importo: usa primaryAmount o il primo disponibile
    let amount = 0;
    let currency = 'EUR';
    if (analysis.primaryAmount) {
      amount = analysis.primaryAmount.value;
      currency = analysis.primaryAmount.currency;
    } else if (analysis.amounts.length > 0) {
      const bestAmount = analysis.amounts[0]; // Già ordinato per confidenza
      amount = bestAmount.value;
      currency = bestAmount.currency;
    }
    
    // Data: usa la migliore disponibile o fallback a oggi
    let date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    let time: string | undefined;
    
    if (analysis.dates.length > 0) {
      const bestDate = analysis.dates[0]; // Già ordinato per confidenza
      date = bestDate.date.toISOString().split('T')[0];
      
      // Estrai orario se presente
      const hour = bestDate.date.getHours();
      const minute = bestDate.date.getMinutes();
      if (hour > 0 || minute > 0) { // Se non è mezzanotte esatta
        time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      }
    }
    
    // Merchant name opzionale
    const merchantName = analysis.merchant?.name;
    
    return {
      amount,
      currency,
      date,
      time,
      merchantName,
      extractedData: {
        overallAccuracy: analysis.overallAccuracy,
        amounts: analysis.amounts,
        dates: analysis.dates,
        merchant: analysis.merchant,
        category: analysis.category,
        originalText: analysis.originalText
      }
    };
  }
}

export const smartReceiptAnalyzer = new SmartReceiptAnalyzer();
