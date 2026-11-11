import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';

const EMAIL = 'saadjunaidi@gmail.com';
const SITE = 'https://moneyinmypocket.web.app';
const KEY = 'bachat.feedbackHidden';
const SUBJECT = encodeURIComponent('MoneyInMyPocket feedback');
const MAIL = `mailto:${EMAIL}?subject=${SUBJECT}`;
const GMAIL = `https://mail.google.com/mail/?view=cm&fs=1&to=${EMAIL}&su=${SUBJECT}`;
const OUTLOOK = `https://outlook.live.com/mail/0/deeplink/compose?to=${EMAIL}&subject=${SUBJECT}`;

/**
 * A plain mailto link does nothing when no email app is set up (common with webmail), so offer
 * webmail compose links and copying the address as well.
 */
function FeedbackMenu({ className, label = 'Send feedback' }: { className: string; label?: string }) {
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const copy = async () => {
    setOpen(false);
    try { await navigator.clipboard.writeText(EMAIL); toast(`Copied ${EMAIL}`); } catch { toast(`Email ${EMAIL}`); }
  };
  return (
    <div className="fb-menu" ref={ref}>
      <button className={className} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && (
        <div className="fb-pop" role="menu">
          <a role="menuitem" href={GMAIL} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Write in Gmail</a>
          <a role="menuitem" href={OUTLOOK} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)}>Write in Outlook</a>
          <a role="menuitem" href={MAIL} onClick={() => setOpen(false)}>Open my email app</a>
          <button role="menuitem" onClick={copy}>Copy email address</button>
        </div>
      )}
    </div>
  );
}

function readHidden(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** Share the app link: the system share sheet where there is one, otherwise copy the link. */
async function shareApp(onCopied: () => void) {
  const text = 'MoneyInMyPocket shows what’s yours to spend each month, from your own bank statements.';
  try {
    if (navigator.share) { await navigator.share({ title: 'MoneyInMyPocket', text, url: SITE }); return; }
    await navigator.clipboard.writeText(SITE);
    onCopied();
  } catch { /* share cancelled */ }
}

function ShareButton({ className }: { className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className={className} onClick={() => shareApp(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
      {copied ? 'Link copied' : 'Share the app'}
    </button>
  );
}

/** Dismissible strip asking for shares and feedback. */
export function FeedbackBar() {
  const [hidden, setHidden] = useState(readHidden);
  if (hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* fine */ } };
  return (
    <div className="feedback" role="note">
      <p><b>Finding it useful?</b> Share it with someone who'd like it. Feedback and suggestions are welcome at <b className="fb-addr">{EMAIL}</b>.</p>
      <div className="feedback-actions">
        <ShareButton className="btn plain" />
        <FeedbackMenu className="btn plain" />
        <button className="gear" aria-label="Hide this message" title="Hide" onClick={hide}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}

/** Always-there footer line, so feedback stays reachable after the strip is hidden. */
export function FeedbackFooter() {
  return (
    <footer className="wrap site-foot small muted">
      Like it? <ShareButton className="linkbtn small" /> · Ideas or problems? <FeedbackMenu className="linkbtn small" label={`Email ${EMAIL}`} />
    </footer>
  );
}
