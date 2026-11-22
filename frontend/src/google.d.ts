// The part of Google Identity Services (https://accounts.google.com/gsi/client) this app uses.
interface GoogleCredentialResponse {
  credential: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void;
        renderButton(parent: HTMLElement, options: { theme?: string; size?: string; text?: string }): void;
        disableAutoSelect(): void;
      };
    };
  };
}
