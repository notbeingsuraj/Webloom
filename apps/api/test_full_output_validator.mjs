/**
 * Output Validator — Validates and repairs AI structured output.
 *
 * Handles both native structured output (JSON schema) and models without
 * native support (Nemotron 3 Ultra) by extracting and repairing JSON.
 */

import { validateSchema } from '../services/ai/AIResponseValidator.js';
import { validateStructuredOutput } from '../services/ai/AIResponseValidator.js';

export class OutputValidator {
  constructor(options = {}) {
    this._maxRepairAttempts = options.maxRepairAttempts ?? 1;
    this._strictMode = options.strictMode ?? false;
  }

  /**
   * Validate output against a JSON schema.
   * Returns validated output or throws.
   */
  validate(output, schema, context = {}) {
    if (!schema) return output;

    try {
      return validateStructuredOutput(output, schema, {
        provider: context.provider ?? 'unknown',
        model: context.model ?? 'unknown',
      });
    } catch (error) {
      if (this._strictMode) throw error;

      // Attempt repair
      return this.repair(output, schema, error, context);
    }
  }

  /**
   * Attempt to repair invalid JSON output.
   */
  repair(output, schema, originalError, context = {}) {
    if (typeof output !== 'string') {
      throw new Error('Cannot repair non-string output');
    }

    // Attempt 1: Extract JSON from markdown code blocks
    let repaired = this._extractFromMarkdown(output);
    if (repaired) {
      try {
        return validateStructuredOutput(repaired, schema, { provider: 'repaired' });
      } catch (e) {
        // Continue to next repair attempt
      }
    }

    // Attempt 2: Extract JSON from prose (find first { ... } or [ ... ])
    repaired = this._extractJsonFromText(output);
    if (repaired) {
      try {
        return validateStructuredOutput(repaired, schema, { provider: 'repaired' });
      } catch (e) {
        // Continue
      }
    }

    // Attempt 3: Fix common JSON issues (trailing commas, single quotes, etc.)
    repaired = this._fixCommonJsonIssues(output);
    if (repaired) {
      try {
        return validateStructuredOutput(repaired, schema, { provider: 'repaired' });
      } catch (e) {
        // Continue
      }
    }

    // If all repairs failed, throw the original error
    throw originalError;
  }

  _extractFromMarkdown(text) {
    // Match ```json ... ``` or ``` ... ```
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
    const matches = [...text.matchAll(codeBlockRegex)];

    for (const match of matches) {
      const content = match[1].trim();
      if (content.startsWith('{') || content.startsWith('[')) {
        return content;
      }
    }
    return null;
  }

  _extractJsonFromText(text) {
    // Find the first complete JSON object or array
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let startIdx = -1;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        if (braceCount === 0 && bracketCount === 0 && startIdx === -1) {
          startIdx = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && bracketCount === 0 && startIdx !== -1) {
          return text.substring(startIdx, i + 1);
        }
      } else if (char === '[') {
        if (braceCount === 0 && bracketCount === 0 && startIdx === -1) {
          startIdx = i;
        }
        bracketCount++;
      } else if (char === ']') {
        bracketCount--;
        if (bracketCount === 0 && braceCount === 0 && startIdx !== -1) {
          return text.substring(startIdx, i + 1);
        }
      }
    }

    return null;
  }

  _fixCommonJsonIssues(text) {
    // Extract potential JSON first
    const jsonCandidate = this._extractJsonFromText(text);
    if (!jsonCandidate) return null;

    let fixed = jsonCandidate
      // Fix single quotes to double quotes (but not inside strings)
      .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => `"${content.replace(/"/g, '\\"')}"`)
      // Remove trailing commas before } or ]
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix missing quotes on keys
      .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3')
      // Fix true/false/null not in quotes
      .replace(/\b(true|false|null)\b/g, '"$1"') // This is aggressive, might break real strings
      // Fix newlines in strings
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    try {
      JSON.parse(fixed);
      return fixed;
    } catch (e) {
      return null;
    }
  }

  /**
   * Validate and repair with schema, returning result with metadata.
   */
  async validateAndRepair(output, schema, context = {}) {
    const attempts = [];
    let currentOutput = output;
    let lastError = null;

    for (let attempt = 0; attempt <= this._maxRepairAttempts; attempt++) {
      try {
        const validated = validateStructuredOutput(currentOutput, schema, {
          provider: context.provider ?? 'validator',
          model: context.model ?? 'unknown',
        });

        return {
          output: validated,
          valid: true,
          attempts,
          repaired: attempt > 0,
        };
      } catch (error) {
        lastError = error;
        attempts.push({
          attempt,
          error: error.message,
          outputPreview: typeof currentOutput === 'string' ? currentOutput.slice(0, 200) : String(currentOutput).slice(0, 200),
        });

        if (attempt < this._maxRepairAttempts) {
          // Try repair
          if (typeof currentOutput === 'string') {
            const repaired = this.repair(currentOutput, schema, error, context);
            if (repaired !== currentOutput) {
              currentOutput = repaired;
              continue;
            }
          }
        }
      }

    throw lastError;
  }
}

export default OutputValidator;