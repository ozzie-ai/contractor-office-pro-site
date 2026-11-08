# Optional property square-footage lookup

## Experience

Enter a service address and tap "Find property sq ft". The app checks a property-record source, shows the matched address, reported living area and provenance, and asks whether to use the value for a cleaning estimate. For remodeling, it is reference information only — total building area is not necessarily the floor-installation or remodel area.

The customer PDF also shows post-construction dust level (Light/Moderate/Heavy), while Step 3 displays the worker-hours used to price the service.

## Current status

The iPhone client and the example serverless API adapter (api/property-lookup.js) are implemented. The LIVE lookup is NOT enabled. The default propertyLookupUrl in mobile/app.json is empty. Users receive a clear "not connected yet" message rather than an invented square-footage value and may enter area manually.

Potential provider: RentCast Property Records (https://developers.rentcast.io/reference/property-records). Its squareFootage field is reported living area, not the measured cleaning/renovation area; coverage varies by county.

## Backend deployment requirements

1. Deploy api/property-lookup.js behind a trusted HTTPS service. Configure RENTCAST_API_KEY on that server only.
2. Add account authentication and rate limits BEFORE public production deployment, plus provider terms/privacy review. This sample adapter does not yet authenticate users and must not be exposed as a public paid-data proxy.
3. Configure a trusted HTTPS propertyLookupUrl in the mobile build's Expo extra settings. Never place the provider API key in mobile code, GitHub, or app config.
4. Verify matching, multiple units, additions/ADUs, unavailable records, area limitations and real-device functionality.

Property size is never silently treated as a room remodeling takeoff. Confirm cleanable or measured work area before using an amount in a binding quote.
