export type BeboDialect = 'egyptian' | 'saudi' | 'gulf' | 'msa' | 'english';
export const DIALECTS: Record<BeboDialect, {label:string; language:string}>;
export function chooseDialect(text:string, requested?:string, previous?:string): {dialect:BeboDialect; source:string};
export function commandFor(text:string): string | null;
export function acknowledge(action:string, dialect:BeboDialect): string;
export function makePrompt(message:string, history:{role:string;content:string}[], dialect:BeboDialect): string;
export function briefReply(text:string): string;
