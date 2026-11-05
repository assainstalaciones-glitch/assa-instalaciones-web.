// Unchanged legacy text must not be revalidated or overwritten when editing another field.
export function changedJobFields(original,draft){return Object.fromEntries(Object.entries(draft).filter(([key,value])=>String(value??'').trim()!==String(original[key]??'').trim()));}
