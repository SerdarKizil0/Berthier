'use client';
// Berthier’e söyle (design 1f): the text sheets open from the bottom and sit on top of the on-screen
// keyboard instead of the middle of the screen. iOS Safari and the home-screen app leave fixed elements
// behind the keyboard, so window.visualViewport tells how much of the layout viewport it covers.
import {useEffect, useState, type ReactNode} from 'react';
import {Dialog as Primitive} from 'radix-ui';
import {X} from 'lucide-react';

/** The height hidden under the visual viewport (the keyboard) and the visible height, while `active`. */
export function useVisualViewport(active: boolean) {
  const [box, setBox] = useState({bottom: 0, height: 0});
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const update = () => {
      const height = vv ? vv.height : window.innerHeight;
      const bottom = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      setBox(b => (b.bottom === bottom && b.height === height ? b : {bottom, height}));
    };
    update();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [active]);
  return box;
}

type Props = {
  open: boolean; onClose: () => void;
  /** While saving, recording or transcribing the sheet cannot be dismissed. */
  locked: boolean;
  title: string; description: string;
  /** The description is for screen readers only (the dictation sheet keeps its first screen short). */
  quietDescription?: boolean;
  /** The recording panel draws its own heading; the title stays for screen readers. */
  bare?: boolean;
  /** The description is one mono line (a routine's record sheet: “SIRADA · 22:30 · ≈32 DK”). */
  metaDescription?: boolean;
  children: ReactNode;
};

export default function SaySheet({open, onClose, locked, title, description, quietDescription, bare, metaDescription, children}: Props) {
  const {bottom, height} = useVisualViewport(open);
  return <Primitive.Root open={open} onOpenChange={value => { if (!value && !locked) onClose(); }}>
    <Primitive.Portal>
      <Primitive.Overlay className="say-overlay"/>
      <Primitive.Content className={bottom > 0 ? 'say-sheet is-raised' : 'say-sheet'} style={{bottom, maxHeight: height ? height - 12 : undefined}}>
        {bare && <div className="say-grip" aria-hidden="true"/>}
        <div className={bare ? 'say-head sr-only' : 'say-head'}>
          <Primitive.Title>{title}</Primitive.Title>
          <Primitive.Close asChild><button className="say-close" disabled={locked} aria-label="Kapat"><X size={20}/></button></Primitive.Close>
        </div>
        <Primitive.Description className={quietDescription || bare ? 'sr-only' : metaDescription ? 'say-description is-meta' : 'say-description'}>{description}</Primitive.Description>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
