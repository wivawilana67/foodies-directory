import { useEffect, useState } from 'react';

// A short message at the bottom ("Copied"). toast() can be called from anywhere; <Toast /> is mounted once in App.
let show: (message: string) => void = () => {};
export const toast = (message: string) => show(message);

export function Toast() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    let timer: number | undefined;
    show = (m) => {
      setMessage(m);
      clearTimeout(timer);
      timer = window.setTimeout(() => setMessage(''), 2000);
    };
    return () => {
      show = () => {};
      clearTimeout(timer);
    };
  }, []);
  return (
    <p className="toast" role="status" hidden={!message}>
      {message}
    </p>
  );
}

// Clipboard API first; older iPhone Safari or a blocked clipboard falls back to a hidden textarea.
// Both need a real tap: call this from a click handler.
export async function copyText(value: string, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value, readOnly: true, className: 'offscreen' });
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) return toast('Copy is blocked on this browser');
  }
  toast(done);
}
