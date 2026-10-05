'use client';
// The inner page head (design review, Aşama 5): a back link where there is one, the serif title and, when
// useful, one mono line. No brand bar, no compass seal.
import {type ReactNode} from 'react';
import {ArrowLeft} from 'lucide-react';

type Props = {title: string; back?: string; onBack?: () => void; top?: string; meta?: ReactNode};

export default function PageHead({title, back, onBack, top, meta}: Props) {
  return <header className="page-head">
    {back && <button className="page-back" onClick={onBack}><ArrowLeft size={16}/>{back}</button>}
    {top && <p className="page-top">{top}</p>}
    <h1 className="page-title">{title}</h1>
    {meta && <p className="page-meta">{meta}</p>}
  </header>;
}
