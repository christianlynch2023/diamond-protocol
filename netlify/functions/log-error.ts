// Netlify function: writes app crash reports to the function log. Logic: ../lib/logerror.ts
import { createLogErrorHandler } from '../lib/logerror';
export const handler = createLogErrorHandler();
