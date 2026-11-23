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

// The part of the Google Maps JavaScript API this app uses (maps.ts, CollectionMap.tsx).
declare namespace google.maps {
  type LatLngLiteral = { lat: number; lng: number };
  class Map {
    constructor(element: HTMLElement, options: Record<string, unknown>);
    fitBounds(bounds: LatLngBounds, padding?: number): void;
    setCenter(center: LatLngLiteral): void;
    setZoom(zoom: number): void;
  }
  class LatLngBounds {
    extend(point: LatLngLiteral): LatLngBounds;
  }
  namespace marker {
    class AdvancedMarkerElement {
      constructor(options: { map?: Map | null; position: LatLngLiteral; title?: string; gmpClickable?: boolean });
      map: Map | null;
      addListener(event: 'click', handler: () => void): void;
    }
  }
}
