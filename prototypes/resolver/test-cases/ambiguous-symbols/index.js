// Import both "format" exports with aliases to disambiguate
import { format as formatDate } from './date-utils.js';
import { format as formatCurrency } from './currency-utils.js';

// These calls should not resolve to ambiguous relationships
// The resolver must NOT guess which "format" was called
const d = formatDate(new Date());
const c = formatCurrency(100);

export { formatDate, formatCurrency };