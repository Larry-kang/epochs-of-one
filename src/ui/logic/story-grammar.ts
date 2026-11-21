/** v0.13.1: English grammar helpers for the death story ("born in the United States", "studied up to university"). */
const NEEDS_THE = /^(United |Netherlands$|Philippines$|Bahamas$|Gambia$|Central African Republic$|Dominican Republic$|Maldives$|Comoros$|Seychelles$|Czech Republic$|.+ Islands$)/;
export function enCountry(name: string): string {
  return !/^the /i.test(name) && NEEDS_THE.test(name) ? `the ${name}` : name;
}
/** education label used mid-sentence: lower-case, and "primary" reads as "primary school" */
export function enEdu(plan: string, label: string): string {
  return plan === 'primary' ? 'primary school' : label.toLowerCase();
}
