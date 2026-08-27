import { describe, expect, it, vi } from "vitest";

import { searchGooglePlacesLocalCell } from "./google-places-local";

const region = {
  id: "berlin", label: "Berlin",
  low: { latitude: 52.15, longitude: 12.55 }, high: { latitude: 52.85, longitude: 14.05 },
};

describe("Google Places Local benchmark discovery", () => {
  it("uses a hard viewport and keeps only operational German places", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [
      { id: "de-open", displayName: { text: "WLAN Berlin" }, businessStatus: "OPERATIONAL",
        addressComponents: [{ shortText: "DE", types: ["country"] }], websiteUri: "https://wlan-berlin.example" },
      { id: "de-closed", displayName: { text: "Closed" }, businessStatus: "CLOSED_PERMANENTLY",
        addressComponents: [{ shortText: "DE", types: ["country"] }] },
      { id: "at-open", displayName: { text: "Austria" }, businessStatus: "OPERATIONAL",
        addressComponents: [{ shortText: "AT", types: ["country"] }] },
    ] }), { status: 200 }));
    const result = await searchGooglePlacesLocalCell({
      apiKey: "test", baseUrl: "https://places.googleapis.com/v1", query: "WLAN Installation", region,
      countryCode: "DE", languageCode: "de", pageSize: 20, maxPages: 2,
      minimumAcceptedBeforePaginationStops: 10, fetchImplementation: fetchMock,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.locationRestriction.rectangle).toEqual({ low: region.low, high: region.high });
    expect(result.candidates.map((candidate) => candidate.placeId)).toEqual(["de-open"]);
    expect(result.rejectedByBusinessStatus).toBe(1);
    expect(result.rejectedByCountry).toBe(1);
  });

  it("paginates only when the accepted first page is below the quality floor", async () => {
    const country = [{ shortText: "DE", types: ["country"] }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [
        { id: "one", displayName: { text: "One" }, businessStatus: "OPERATIONAL", addressComponents: country },
      ], nextPageToken: "page-2" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ places: [
        { id: "two", displayName: { text: "Two" }, businessStatus: "OPERATIONAL", addressComponents: country },
      ] }), { status: 200 }));
    const result = await searchGooglePlacesLocalCell({
      apiKey: "test", baseUrl: "https://places.googleapis.com/v1", query: "IT Systemhaus", region,
      countryCode: "DE", languageCode: "de", pageSize: 20, maxPages: 2,
      minimumAcceptedBeforePaginationStops: 10, fetchImplementation: fetchMock,
    });
    expect(result.requestCount).toBe(2);
    expect(result.candidates).toHaveLength(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).pageToken).toBe("page-2");
  });
});
