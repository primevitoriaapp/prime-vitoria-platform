export {};

declare global {
  interface Window {
    google?: {
      maps: {
        places: {
          Autocomplete: new (
            input: HTMLInputElement,
            opts?: { componentRestrictions?: { country: string | string[] }; fields?: string[] }
          ) => {
            addListener: (eventName: string, handler: () => void) => MapsEventListener;
            getPlace: () => {
              formatted_address?: string;
              name?: string;
              geometry?: { location?: { lat: () => number; lng: () => number } };
            };
          };
        };
        event: {
          removeListener: (listener: MapsEventListener) => void;
        };
      };
    };
  }

  type MapsEventListener = object;
}
