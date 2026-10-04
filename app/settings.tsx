'use client';
// Tercihler (design 1m): real settings as grouped, tappable rows with the value on the right. Ritim and the
// mail signature are editable here (both undoable from the change log); what Berthier learned from corrected
// first steps is listed with its own undo; the device rows are read-only. Kind and front-type corrections
// (4 Ekim, K8) are listed the same way.
import {useState, useSyncExternalStore} from 'react';
import {ChevronRight, Compass} from 'lucide-react';
import {Dialog, DialogContent, DialogDescription, DialogTitle} from '@/components/ui/dialog';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select';
import {RHYTHM, typeNames, type KindPreference, type MovePreference, type Rhythm, type State, type TypePreference} from '@/lib/domain';
import {KIND_TAG} from '@/lib/kinds';
import {type Profile} from '@/lib/calendar';
import {calendarDay} from '@/lib/calendar';
import {clockText} from '@/lib/expedition/camps';
import {undoBlock} from '@/lib/ledger';
import {dayMonth} from '@/lib/turkish';

type Action = (body: {kind: string; [key: string]: unknown}, options?: {quiet?: boolean; silent?: boolean}) => Promise<boolean | undefined>;
type Props = {state: State; queued: number; savedAt: string | null; busy: boolean; online: boolean; why: string; action: Action; exportData: () => void};
type Edit = 'report' | 'review' | 'quiet' | 'profile' | null;

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const EMPTY: Profile = {name: '', number: '', department: '', university: ''};
const FIELDS: [keyof Profile, string][] = [['name', 'Ad soyad'], ['number', 'Öğrenci numarası'], ['department', 'Bölüm'], ['university', 'Üniversite']];

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?: boolean}).standalone === true;
const watchStandalone = (change: () => void) => { const q = window.matchMedia('(display-mode: standalone)'); q.addEventListener('change', change); return () => q.removeEventListener('change', change); };

/** The change that recorded a learned preference: undoing it takes the preference (and its correction) back. */
function sourceOf(s: State, p: MovePreference) {
  const same = (x: MovePreference) => x.at === p.at && x.after === p.after && x.before === p.before;
  return s.changes.find(c => c.ops.some(o => o.key === 'preferences' && !o.undone && (o.after as MovePreference[] | null)?.some(same) && !(o.before as MovePreference[] | null)?.some(same)));
}

/** The change that recorded a kind or type correction (rekind, retype); undoing it takes the correction back. */
function learnedBy(s: State, p: KindPreference | TypePreference) {
  const same = (x: {at: string}) => x.at === p.at;
  const list = (v: unknown) => [...((v as {kindPreferences?: {at: string}[]} | null)?.kindPreferences ?? []), ...((v as {typePreferences?: {at: string}[]} | null)?.typePreferences ?? [])];
  return s.changes.find(c => c.ops.some(o => o.key === 'learned' && !o.undone && list(o.after).some(same) && !list(o.before).some(same)));
}
const kindName = (k: keyof typeof KIND_TAG) => KIND_TAG[k].charAt(0) + KIND_TAG[k].slice(1).toLocaleLowerCase('tr-TR');

export default function Settings({state, queued, savedAt, busy, online, why, action, exportData}: Props) {
  const rhythm = state.rhythm ?? RHYTHM, prefs = [...(state.movePreferences ?? [])].reverse();
  const kinds = [...(state.kindPreferences ?? []).map(p => ({p, head: p.text, line: `${kindName(p.from)} → ${kindName(p.to)}`})), ...(state.typePreferences ?? []).map(p => ({p, head: p.title, line: `${typeNames[p.from]} → ${p.to === 'routine' ? 'Rutin' : typeNames[p.to]}`}))].sort((a, b) => b.p.at.localeCompare(a.p.at));
  const [types, setTypes] = useState(false);
  const [edit, setEdit] = useState<Edit>(null), [draft, setDraft] = useState<Rhythm>(rhythm), [profile, setProfile] = useState<Profile>(state.profile ?? EMPTY), [learned, setLearned] = useState(false);
  const installed = useSyncExternalStore(watchStandalone, standalone, () => true);
  const off = busy || !online;
  function open(e: Edit) { setDraft(rhythm); setProfile(state.profile ?? EMPTY); setEdit(e); }
  async function save() { if (await action(edit === 'profile' ? {kind: 'profile', profile} : {kind: 'rhythm', rhythm: draft})) setEdit(null); }
  const synced = savedAt ? (calendarDay(new Date(savedAt)) === calendarDay() ? clockText(savedAt) : `${dayMonth(calendarDay(new Date(savedAt)))} ${clockText(savedAt)}`) : 'henüz yok';
  const signature = state.profile ? [state.profile.name, state.profile.university].filter(Boolean).join(' · ') || 'Eklendi' : 'Eklenmedi';
  const row = (label: string, value: string, onClick?: () => void) => onClick
    ? <button className="pref-row" onClick={onClick}><span>{label}</span><span>{value}</span><ChevronRight size={18}/></button>
    : <div className="pref-row"><span>{label}</span><span>{value}</span></div>;

  return <div className="prefs">
    <section><h2>RİTİM</h2><div className="pref-group">
      {row('Günün başlangıcı', '04:00')}
      {row('Sabah raporu', rhythm.report, () => open('report'))}
      {row('Haftalık teftiş', `${DAYS[rhythm.reviewDay]} ${rhythm.reviewTime}`, () => open('review'))}
      {row('Sessiz saatler', `${rhythm.quietFrom}–${rhythm.quietTo}`, () => open('quiet'))}
    </div></section>

    <section><h2>BİLDİRİMLER</h2><div className="pref-group">{row('Kurulum', 'Yakında')}</div>
      <p className="pref-note">iPhone’da ana ekran uygulaması ve izinle çalışır; üç adımlık kurulum hazır olunca burada açılır. Rutin hatırlatmaları şimdilik yalnız uygulama açıkken, Söyle’nin üstündeki kartta görünür; uygulama kapalıyken hatırlatma gelmez.</p></section>

    <section><h2>MAİL İMZASI</h2><div className="pref-group">{row('Ad, numara, bölüm, üniversite', signature, () => open('profile'))}</div>
      <p className="pref-note">Çakışma maili taslaklarının altına eklenir.</p></section>

    <section><h2>BERTHİER’İN ÖĞRENDİKLERİ</h2><div className="pref-group">
      <button className="pref-row" aria-expanded={learned} onClick={() => setLearned(!learned)}><span>Ön adım tercihleri</span><span>{prefs.length} örnek</span><ChevronRight size={18} className={learned ? 'is-open' : undefined}/></button>
      {learned && prefs.map(p => {
        const change = sourceOf(state, p), block = change ? undoBlock(state, change) : null;
        return <div className="pref-learned" key={p.at + p.after}>
          <span className="pref-learned-front">{p.frontTitle.toLocaleUpperCase('tr-TR')} · {dayMonth(calendarDay(new Date(p.at))).toLocaleUpperCase('tr-TR')}</span>
          <span className="pref-learned-before">{p.before}</span>
          <span className="pref-learned-after">{p.after}</span>
          {change && <button className="ledger-undo" disabled={off || !!block} onClick={() => action({kind: 'undo', changeId: change.id})}>Geri al</button>}
          {block && <p className="ledger-why">{block}</p>}
        </div>;
      })}
      {learned && !prefs.length && <p className="pref-learned quiet">Henüz örnek yok. Bir ön adımı düzelttiğinde ya da “Ön adıma gerek yok” dediğinde burada görünür.</p>}
      <button className="pref-row" aria-expanded={types} onClick={() => setTypes(!types)}><span>Tür tercihleri</span><span>{kinds.length} örnek</span><ChevronRight size={18} className={types ? 'is-open' : undefined}/></button>
      {types && kinds.map(({p, head, line}) => {
        const change = learnedBy(state, p), block = change ? undoBlock(state, change) : null;
        return <div className="pref-learned" key={p.at + head}>
          <span className="pref-learned-front">{dayMonth(calendarDay(new Date(p.at))).toLocaleUpperCase('tr-TR')}</span>
          <span className="pref-learned-after">{head}</span>
          <span className="pref-learned-before is-plain">{line}</span>
          {change && <button className="ledger-undo" disabled={off || !!block} onClick={() => action({kind: 'undo', changeId: change.id})}>Geri al</button>}
          {block && <p className="ledger-why">{block}</p>}
        </div>;
      })}
      {types && !kinds.length && <p className="pref-learned quiet">Henüz örnek yok. Bir kalemin türünü ya da bir cephenin türünü değiştirdiğinde burada görünür.</p>}
    </div>
      <p className="pref-note">Düzelttiğin ön adımlar ve türler. Son 30 örnek benzer işlerde dikkate alınır; tek tek geri alabilirsin.</p></section>

    <section><h2>BU CİHAZ</h2><div className="pref-group">
      {row('Ana ekran uygulaması', installed ? '✓ Kurulu' : 'Kurulu değil')}
      {row('Son eşitleme', synced)}
      {row('Cihazdaki kuyruk', `${queued} girdi`)}
    </div></section>
    {!installed && <section className="pref-install"><Compass size={22}/><div><h3>iPhone ana ekranına ekle</h3><p>Safari’de Paylaş menüsünü aç, “Ana Ekrana Ekle”yi seç. Berthier kendi penceresinde açılır.</p></div></section>}

    <section><h2>VERİ</h2><div className="pref-group">{row('Verilerimi dışa aktar', 'JSON', exportData)}</div>
      <p className="pref-note">Ham diktelerin, cephelerin ve değişiklik geçmişin.</p></section>

    <section><h2>BAĞLANTILAR</h2><div className="pref-group">{row('Gmail ve Google Takvim', 'Ertelendi')}</div></section>

    <Dialog open={edit !== null} onOpenChange={value => { if (!value && !busy) setEdit(null); }}>
      <DialogContent className="berthier-dialog">
        <DialogTitle>{edit === 'report' ? 'Sabah raporu' : edit === 'review' ? 'Haftalık teftiş' : edit === 'quiet' ? 'Sessiz saatler' : 'Mail imzası'}</DialogTitle>
        <DialogDescription>{edit === 'report' ? 'Raporun hazır olduğunu bildireceği saat.' : edit === 'review' ? 'Teftiş kartı bu saatte Karargâh’ta da çıkar.' : edit === 'quiet' ? 'Bu aralıkta bildirim gönderilmez.' : 'Çakışma maili taslaklarının altına eklenir. İstersen boş bırakabilirsin.'}</DialogDescription>
        <form className="event-form" onSubmit={e => { e.preventDefault(); void save(); }}>
          {edit === 'report' && <label>Saat<input type="time" required value={draft.report} onChange={e => setDraft({...draft, report: e.target.value})}/></label>}
          {edit === 'review' && <div className="field-grid">
            <label>Gün<Select value={String(draft.reviewDay)} onValueChange={v => setDraft({...draft, reviewDay: Number(v)})}><SelectTrigger aria-label="Gün"><SelectValue/></SelectTrigger><SelectContent>{DAYS.map((d, i) => <SelectItem key={d} value={String(i)}>{d}</SelectItem>)}</SelectContent></Select></label>
            <label>Saat<input type="time" required value={draft.reviewTime} onChange={e => setDraft({...draft, reviewTime: e.target.value})}/></label>
          </div>}
          {edit === 'quiet' && <div className="field-grid">
            <label>Başlangıç<input type="time" required value={draft.quietFrom} onChange={e => setDraft({...draft, quietFrom: e.target.value})}/></label>
            <label>Bitiş<input type="time" required value={draft.quietTo} onChange={e => setDraft({...draft, quietTo: e.target.value})}/></label>
          </div>}
          {edit === 'profile' && FIELDS.map(([key, label]) => <label key={key}>{label}<input maxLength={key === 'number' ? 50 : 100} value={profile[key]} onChange={e => setProfile({...profile, [key]: e.target.value})}/></label>)}
          <button className="btn-main" disabled={off}>Kaydet</button>
          {off && <p className="why">{why}</p>}
          <p className="quiet">Değişikliği kayıt defterinden geri alabilirsin.</p>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
