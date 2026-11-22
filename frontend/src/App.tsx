import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, hasToken, readCache, setToken, writeCache } from './api';
import { PlaceList, type Tab } from './PlaceList';
import { Settings } from './Settings';
import { SignIn } from './SignIn';
import { Toast } from './Toast';
import type { Data } from './types';

// App shell: sign-in, the saved copy of /api/bootstrap (instant start, offline), top bar, bottom tabs and the
// phone's Back button (sub-views push a history entry; tabs replace it).

type View = 'list' | 'settings';
const TABS: [Tab, string, string][] = [
  ['all', '📋', 'All'],
  ['wishlist', '🔖', 'Wishlist'],
  ['near', '📍', 'Near me'],
];

export function App() {
  const [signedIn, setSignedIn] = useState(hasToken);
  const [signInMessage, setSignInMessage] = useState('');
  const [data, setData] = useState(readCache);
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<View>('list');

  // Signing out forgets the token and the saved list on this phone.
  const signOut = useCallback((message: string) => {
    setToken('');
    writeCache(null);
    setData(null);
    window.google?.accounts.id.disableAutoSelect();
    setSignInMessage(message);
    setSignedIn(false);
    history.replaceState({ view: 'list' }, '');
    setView('list');
  }, []);

  const refresh = useCallback(async () => {
    setStatus('Loading…');
    try {
      const fresh = await api<Data>('/api/bootstrap');
      setData(fresh);
      writeCache(fresh);
      setStatus('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) signOut(e.message);
      else setStatus(`Could not refresh: ${(e as Error).message}`);
    }
  }, [signOut]);

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => setView(event.state?.view ?? 'list');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const onToken = useCallback((token: string) => {
    setToken(token);
    setSignedIn(true);
  }, []);

  function open(next: View) {
    history.pushState({ view: next }, '');
    setView(next);
    window.scrollTo(0, 0);
  }

  function selectTab(next: Tab) {
    history.replaceState({ view: 'list' }, '');
    setTab(next);
    setView('list');
    window.scrollTo(0, 0);
  }

  const me = data?.people.find((p) => p.id === data.me);

  return (
    <>
      <header className="topbar">
        <h1>Foodies</h1>
        {signedIn && (
          <button type="button" className="topbar-button" aria-label="Settings" onClick={() => open('settings')}>⚙</button>
        )}
      </header>
      <main>
        {!signedIn ? (
          <SignIn message={signInMessage} onToken={onToken} />
        ) : !data ? (
          <div className="fields">
            <p className="muted" role="status">{status || 'Loading…'}</p>
            {status && status !== 'Loading…' && <button type="button" className="button" onClick={refresh}>Try again</button>}
          </div>
        ) : view === 'settings' ? (
          <Settings name={me?.name ?? ''} onSignOut={signOut} />
        ) : (
          <PlaceList data={data} tab={tab} status={status} onRefresh={refresh} />
        )}
      </main>
      <Toast />
      {signedIn && data && (
        <nav className="tabbar" aria-label="Sections">
          {TABS.map(([key, icon, label]) => (
            <button key={key} type="button" aria-current={view === 'list' && tab === key ? 'page' : 'false'} onClick={() => selectTab(key)}>
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </>
  );
}
