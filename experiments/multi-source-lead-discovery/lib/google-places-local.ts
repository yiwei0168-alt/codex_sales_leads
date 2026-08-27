import { requestJson, trustedEndpoint } from "./http";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GooglePlacesLocalRegion {
  id: string;
  label: string;
  low: GeoPoint;
  high: GeoPoint;
}

export interface GooglePlacesLocalCandidate {
  placeId: string;
  displayName: string;
  websiteUri: string | null;
  googleMapsUri: string | null;
  formattedAddress: string;
  addressCountryCode: string | null;
  businessStatus: string;
  primaryType: string | null;
  primaryTypeLabel: string | null;
  types: string[];
  pureServiceAreaBusiness: boolean;
}

export interface GooglePlacesLocalCellResult {
  query: string;
  regionId: string;
  requestCount: number;
  returnedCount: number;
  operationalGermanyCount: number;
  rejectedByBusinessStatus: number;
  rejectedByCountry: number;
  candidates: GooglePlacesLocalCandidate[];
}

interface PlaceResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    addressComponents?: Array<{ shortText?: string; types?: string[] }>;
    websiteUri?: string;
    googleMapsUri?: string;
    businessStatus?: string;
    primaryType?: string;
    primaryTypeDisplayName?: { text?: string };
    types?: string[];
    pureServiceAreaBusiness?: boolean;
  }>;
  nextPageToken?: string;
}

function countryCode(place: NonNullable<PlaceResponse["places"]>[number]): string | null {
  const country = place.addressComponents?.find((component) => component.types?.includes("country"));
  return country?.shortText?.toUpperCase() ?? null;
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

export async function searchGooglePlacesLocalCell(options: {
  apiKey: string;
  baseUrl: string;
  query: string;
  region: GooglePlacesLocalRegion;
  countryCode: string;
  languageCode: string;
  pageSize: number;
  maxPages: number;
  minimumAcceptedBeforePaginationStops: number;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<GooglePlacesLocalCellResult> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const pageSize = boundedInteger(options.pageSize, 1, 20, "pageSize");
  const maxPages = boundedInteger(options.maxPages, 1, 3, "maxPages");
  const canonicalBaseUrl = `${new URL(options.baseUrl).origin}/v1`;
  const endpoint = trustedEndpoint(canonicalBaseUrl, ["places.googleapis.com"], "places:searchText");
  const fieldMask = [
    "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
    "places.websiteUri", "places.googleMapsUri", "places.businessStatus", "places.primaryType",
    "places.primaryTypeDisplayName", "places.types", "places.pureServiceAreaBusiness", "nextPageToken",
  ].join(",");
  const baseBody = {
    textQuery: `${options.query} ${options.region.label}`,
    pageSize,
    languageCode: options.languageCode,
    regionCode: options.countryCode,
    locationRestriction: { rectangle: { low: options.region.low, high: options.region.high } },
  };
  const candidates = new Map<string, GooglePlacesLocalCandidate>();
  let pageToken: string | undefined;
  let requestCount = 0;
  let returnedCount = 0;
  let rejectedByBusinessStatus = 0;
  let rejectedByCountry = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const response = await requestJson<PlaceResponse>("google-places", endpoint, {
      method: "POST",
      headers: {
        "x-goog-api-key": options.apiKey,
        "x-goog-fieldmask": fieldMask,
        "content-type": "application/json",
      },
      body: JSON.stringify({ ...baseBody, ...(pageToken ? { pageToken } : {}) }),
    }, fetchImplementation, options.timeoutMs ?? 45_000, options.signal);
    requestCount += 1;
    returnedCount += response.places?.length ?? 0;
    for (const place of response.places ?? []) {
      if (!place.id) continue;
      if (place.businessStatus !== "OPERATIONAL") {
        rejectedByBusinessStatus += 1;
        continue;
      }
      const addressCountryCode = countryCode(place);
      if (addressCountryCode !== options.countryCode.toUpperCase()) {
        rejectedByCountry += 1;
        continue;
      }
      candidates.set(place.id, {
        placeId: place.id,
        displayName: place.displayName?.text?.trim() || `Google Place ${place.id.slice(-8)}`,
        websiteUri: place.websiteUri?.trim() || null,
        googleMapsUri: place.googleMapsUri?.trim() || null,
        formattedAddress: place.formattedAddress?.trim() || "",
        addressCountryCode,
        businessStatus: place.businessStatus,
        primaryType: place.primaryType?.trim() || null,
        primaryTypeLabel: place.primaryTypeDisplayName?.text?.trim() || null,
        types: [...new Set(place.types ?? [])],
        pureServiceAreaBusiness: place.pureServiceAreaBusiness === true,
      });
    }
    pageToken = response.nextPageToken;
    if (!pageToken || candidates.size >= options.minimumAcceptedBeforePaginationStops) break;
  }
  return {
    query: options.query,
    regionId: options.region.id,
    requestCount,
    returnedCount,
    operationalGermanyCount: candidates.size,
    rejectedByBusinessStatus,
    rejectedByCountry,
    candidates: [...candidates.values()],
  };
}
