import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, signal, ChangeDetectionStrategy, NgZone, inject } from '@angular/core';
import { environment } from '../../environments/environment';

type EventLocation = {
  lat: number;
  lng: number;
  title: string;
  address?: string;
};

@Component({
  selector: 'app-google-map',
  templateUrl: './google-map.component.html',
  styleUrl: './google-map.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GoogleMapComponent implements AfterViewInit {
  private readonly zone = inject(NgZone);
  private googleMapsScriptPromise: Promise<void> | null = null;
  private activeMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

  protected readonly events = signal<EventLocation[]>([]);
  protected readonly selectedPlace = signal<{
    id: string;
    name: string;
    location: { lat: number; lng: number };
  } | null>(null);
  protected readonly showAddButton = signal(false);

  private readonly defaultLocations: EventLocation[] = [
    {
      lat: 37.4239163,
      lng: -122.0947209,
      title: 'Googleplex',
    },
    {
      lat: 37.4301736,
      lng: -122.083922,
      title: 'Charleston Park',
    },
    {
      lat: 37.4189847,
      lng: -122.0781323,
      title: 'Shoreline Lake',
    },
  ];

  protected readonly mapCenter = `${this.defaultLocations[0].lat},${this.defaultLocations[0].lng}`;
  protected readonly mapId = environment.googleMapId;
  protected readonly mapError = signal<string | null>(null);

  ngAfterViewInit(): void {
    void this.initMap();
    this.loadStoredEvents();
  }

  private async initMap(): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    if (!environment.googleApiKey) {
      this.mapError.set('La clé Google Maps n\'est pas configurée dans environment.ts.');
      return;
    }

    try {
      await this.loadGoogleMapsScript();
      await customElements.whenDefined('gmp-map');

      const mapElement = document.querySelector('gmp-map');
      if (!(mapElement instanceof HTMLElement)) {
        this.mapError.set('Impossible de trouver l\'élément gmp-map.');
        return;
      }

      await google.maps.importLibrary('maps');
      await google.maps.importLibrary('places');
      const markerLibrary = (await google.maps.importLibrary('marker')) as google.maps.MarkerLibrary;

      const innerMap = (mapElement as any).innerMap as google.maps.Map;
      this.setupPlaceAutocomplete(mapElement, innerMap);
      this.renderAllMarkers(mapElement, markerLibrary);
      this.mapError.set(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Chargement de la carte impossible.';
      this.mapError.set(message);
    }
  }

  private setupPlaceAutocomplete(mapElement: HTMLElement, map: google.maps.Map): void {
    const placeAutocomplete = mapElement.querySelector('gmp-basic-place-autocomplete');
    if (!placeAutocomplete) return;

    // Bias autocomplete results toward current map center when the map is idle
    map.addListener('idle', () => {
      const center = map.getCenter();
      if (!center) return;
      (placeAutocomplete as any).locationBias = new google.maps.Circle({
        center: { lat: center.lat(), lng: center.lng() },
        radius: 10000,
      });
    });

    placeAutocomplete.addEventListener('gmp-select', async (event: any) => {
      const place = event.place;
      try {
        await place.fetchFields({ fields: ['displayName', 'location'] });
      } catch {
        return;
      }
      if (place?.location && place?.displayName) {
        map.setCenter(place.location);
        this.zone.run(() => {
          this.selectedPlace.set({
            id: place.id ?? '',
            name: place.displayName,
            location: {
              lat: place.location.lat(),
              lng: place.location.lng(),
            },
          });
          this.showAddButton.set(true);
        });
      }
    });
  }

  addSelectedPlace(): void {
    const place = this.selectedPlace();
    if (!place) return;

    const newEvent: EventLocation = {
      lat: place.location.lat,
      lng: place.location.lng,
      title: place.name,
      address: place.name,
    };

    const currentEvents = this.events();
    const updatedEvents = [...currentEvents, newEvent];
    this.events.set(updatedEvents);
    this.saveEventsToStorage(updatedEvents);

    this.selectedPlace.set(null);
    this.showAddButton.set(false);

    const mapElement = document.querySelector('gmp-map');
    if (mapElement instanceof HTMLElement) {
      this.reloadMarkers(mapElement);
    }
  }

  removeEvent(index: number): void {
    const currentEvents = this.events();
    const updatedEvents = currentEvents.filter((_, i) => i !== index);
    this.events.set(updatedEvents);
    this.saveEventsToStorage(updatedEvents);

    const mapElement = document.querySelector('gmp-map');
    if (mapElement instanceof HTMLElement) {
      this.reloadMarkers(mapElement);
    }
  }

  clearAllEvents(): void {
    this.events.set([]);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('googleMapEvents');
    }

    const mapElement = document.querySelector('gmp-map');
    if (mapElement instanceof HTMLElement) {
      this.reloadMarkers(mapElement);
    }
  }

  private loadStoredEvents(): void {
    if (typeof localStorage === 'undefined') return;
    const stored = localStorage.getItem('googleMapEvents');
    if (stored) {
      try {
        const events = JSON.parse(stored) as EventLocation[];
        this.events.set(events);
      } catch {
        console.warn('Impossible de charger les événements stockés.');
      }
    }
  }

  private saveEventsToStorage(events: EventLocation[]): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('googleMapEvents', JSON.stringify(events));
  }

  private renderAllMarkers(
    mapElement: HTMLElement,
    markerLibrary: google.maps.MarkerLibrary
  ): void {
    const allLocations = [...this.defaultLocations, ...this.events()];
    this.renderMarkers(mapElement, markerLibrary, allLocations);
  }

  private reloadMarkers(mapElement: HTMLElement): void {
    this.loadGoogleMapsScript()
      .then(() => google.maps.importLibrary('marker'))
      .then((markerLibrary) => this.renderAllMarkers(mapElement, markerLibrary as google.maps.MarkerLibrary))
      .catch(() => {});
  }

  private renderMarkers(
    mapElement: HTMLElement,
    markerLibrary: google.maps.MarkerLibrary,
    locations: EventLocation[]
  ): void {
    // Remove only previous markers, not other children (e.g. autocomplete slot)
    for (const marker of this.activeMarkers) {
      marker.remove();
    }
    this.activeMarkers = [];

    for (const location of locations) {
      const marker = new markerLibrary.AdvancedMarkerElement({
        position: {
          lat: location.lat,
          lng: location.lng,
        },
        title: location.title,
      });

      mapElement.append(marker);
      this.activeMarkers.push(marker);
    }
  }

  private loadGoogleMapsScript(): Promise<void> {
    if (
      typeof google !== 'undefined' &&
      typeof google.maps?.importLibrary === 'function'
    ) {
      return Promise.resolve();
    }

    if (this.googleMapsScriptPromise) {
      return this.googleMapsScriptPromise;
    }

    this.googleMapsScriptPromise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(
        'script[data-google-maps-loader="true"]'
      ) as HTMLScriptElement | null;

      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(), { once: true });
        existingScript.addEventListener('error', () => {
          reject(new Error('Le script Google Maps a échoué au chargement.'));
        }, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(environment.googleApiKey)}&v=beta&libraries=places,marker`;
      script.defer = true;
      script.setAttribute('data-google-maps-loader', 'true');
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => {
        reject(new Error('Le script Google Maps a échoué au chargement.'));
      }, { once: true });

      document.head.append(script);
    });

    return this.googleMapsScriptPromise;
  }
}
