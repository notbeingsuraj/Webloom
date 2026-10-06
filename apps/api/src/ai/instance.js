import { WebloomAI } from './WebloomAI.js';

/** Shared singleton used by routes, services, and the evaluation harness. */
const webloomAI = new WebloomAI();
export default webloomAI;
