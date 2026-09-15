import * as tsNs from 'typescript';
const api: any = (tsNs as any).default ?? tsNs;
console.log('default keys sample:', Object.keys(api).slice(0, 15));
console.log('createSourceFile:', typeof api.createSourceFile);
