import { validateStructuredOutput } from './src/services/ai/AIResponseValidator.js';

export class OutputValidator {
  constructor(options = {}) {
    this._maxRepairAttempts = options.maxRepairAttempts ?? 1;
    this._strictMode = options.strictMode ?? false;
  }
}
export default OutputValidator;
