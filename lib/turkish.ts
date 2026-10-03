// Turkish wording helpers: suffixes after numbers and clock times, and short date labels.
// A suffix follows how the number is read aloud: 08:00 is read "sekiz", so "08:00’de"; 02:14 ends in
// "dört", so "02:14’te"; 08:30 ends in "otuz", so "08:30’da".

export const WD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
export const MO = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ONES = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const FRONT = 'eiöü', BACK = 'aıou', VOICELESS = 'çfhkpsşt';

export const upper = (s: string) => s.toLocaleUpperCase('tr-TR');

/** The last word of a number read aloud: 14 → "dört", 30 → "otuz", 100 → "yüz". */
export function lastWord(n: number): string {
  n = Math.abs(Math.trunc(n));
  if (n === 0) return 'sıfır';
  if (n % 10) return ONES[n % 10];
  if (n % 100) return TENS[(n % 100) / 10];
  if (n % 1000) return 'yüz';
  return n % 1000000 ? 'bin' : 'milyon';
}

function lastVowel(word: string) {
  for (let i = word.length - 1; i >= 0; i--) if (FRONT.includes(word[i]) || BACK.includes(word[i])) return word[i];
  return 'e';
}

/** Locative suffix for a word: "sekiz" → "de", "dört" → "te", "otuz" → "da", "kırk" → "ta". */
export function locative(word: string) {
  return (VOICELESS.includes(word.at(-1) ?? '') ? 't' : 'd') + (FRONT.includes(lastVowel(word)) ? 'e' : 'a');
}

/** How a clock time ends when read aloud: the minutes, or the hour on the hour. */
export function timeWord(hhmm: string) {
  const h = Number(hhmm.slice(0, 2)), m = Number(hhmm.slice(3, 5));
  return lastWord(m || h);
}

/** “08:14’te”, “08:30’da”. */
export const atTime = (hhmm: string) => hhmm + '’' + locative(timeWord(hhmm));

/** Dative after a clock time, as read aloud: “17:00’ye”, “16:00’ya”, “14:00’e”, “10:30’a” (as in “17:00’ye kadar”). */
export function untilTime(hhmm: string) {
  const word = timeWord(hhmm), end = word.at(-1) ?? '';
  return hhmm + '’' + (FRONT.includes(end) || BACK.includes(end) ? 'y' : '') + (FRONT.includes(lastVowel(word)) ? 'e' : 'a');
}

/** Third-person possessive after a number: 1 → "i", 2 → "si", 3 → "ü", 6 → "sı" (as in “2’si hazır”). */
export function possessive(n: number) {
  const word = lastWord(n), v = lastVowel(word), end = word.at(-1) ?? '';
  const vowel = 'aı'.includes(v) ? 'ı' : 'ei'.includes(v) ? 'i' : 'ou'.includes(v) ? 'u' : 'ü';
  return (FRONT.includes(end) || BACK.includes(end) ? 's' : '') + vowel;
}

const noon = (date: string) => new Date(date + 'T12:00:00Z');

/** “Cmt 26 Eyl” for an ISO date. */
export function shortDay(date: string) {
  const d = noon(date);
  return WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MO[d.getUTCMonth()];
}

/** “26 Eyl” for an ISO date. */
export function dayMonth(date: string) {
  const d = noon(date);
  return d.getUTCDate() + ' ' + MO[d.getUTCMonth()];
}

/** “CMT 26 EYLÜL” for an ISO date. */
export function longDay(date: string) {
  const d = noon(date);
  return upper(WD[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]);
}
