# POC for Nest.js/TypeScript evangelization effort

Central Booking is a web service that will store and retrieve Deferred Deep
Links used for Button Links.  This allows Button to:

1) Track attribution through the App Store or Google Play Store
2) Invoke a deeplink on behalf of the user when their app install completes (so
they can pickup their session in app where they left off on the web)

To do this, we store links and attribution tokens against a fingerprint of the
user that is expected to be constant between requests from their mobile web
browser and the app they just downloaded.  The signals we use to generate this
fingerprint are currently:

* `application_id` (brand)
* `ip`
* `os`
* `os_version`

When a user is redirected to an app store via
[Boomerang](https://github.com/button/boomerang), Boomerang will extract these
signals and post to Central Booking, creating an entry that can be matched later
with the same fingerprint.  When the user's install completes (and provided the
app being installed is fully integrated with Button), the app will make a
request to Button's servers and Central Booking will be queried to see if any
entries matching the same device fingerprint were recently created.  If so,
Central Booking returns the associated attribution token and deeplink.

Central Booking operates with two independent windows for fulfilling queries
for a match:

1. **Attribution Window** If an entry was created prior to the current
time minus this value, it is no longer eligible for matching. Currently set to
**3 hours**.
2. **Deeplink Window** If an entry was created prior to the current
time minus this value, no deeplink will be returned. Currently set to
**3 hours**.

The Deeplink Window must be less than or equal to the Attribution Window.

Central Booking relies on a Redis cluster to persist these entires.  This allows
for simple record expiration (they don't need to be long-lived).

### Collision Policy

In the event that two devices map to the same fingerprint (for example many
people testing an integration on the same IP), Central Booking will create two
entries that can be matched with a request for that fingerprint.  This means
that two devices with the same fingerprint going through the flow simultaneously
can each consume a match. Entries are consumed in reverse chronological order (
it's like a stack).

A natural race condition exists in such an event: attribution tokens or deferred
deeplinks might be delivered to the wrong device.  For this reason, we're likely
going to want to revisit our collision policy.  It might include different
collision policies for attribution tokens (fairly fungible, assuming no
important user state was bound to it at impression like segment) and deferred
deeplinks (not fungible at all).

A Redis list is used to maintain ordering of match slots at a given fingerprint
and to auto-evict entries that no longer qualify for matching on account of the
current attribution window.

### Eviction Policy

Matches are expired from Redis based on a set TTL specified at the time the
match was created.  The TTL is generally the size of the attribution window
Button currently has configured at match time: if our window is 3 hours, records
will expire in 3 hours.

A modest bit of extra logic is included so that records with distinct TTLs (two
match slots with the same fingerprint but created at an hour offset, say) aren't
prematurely expired.

## Requirements

- Node 16.13.1
- Redis

## Run Locally

Run the server and redis cache:

```
$ make setup
```

Try out a request:

```
$ curl -XPOST localhost:9000/api/deferred-deeplink \
  -H 'Content-Type: application/json' \
  -d '{ "application_id": "app-1111222233334444", "action": "https://brand.commerce", "signals": { "ip": "192.168.1.1" } }'
```

### Test

```
$ make test
```

## Routes

### GET /api/deferred-deeplink/:id

Used to retrieve a stored deferred deeplink by id.  Used for diagnostics.

Sample response:

```json
{
    "action": "/products/123",
    "application_id": "app-XXX",
    "attribution": {
        "btn_ref": "srctok-XXX"
    },
    "created_at": "2018-06-18T15:58:21.543Z",
    "id": "ddl-XXX",
    "modified_at": "2018-06-18T15:58:21.543Z",
    "session_id": null,
    "signals": {
        "ip": "70.214.79.82",
        "os": "ios",
        "os_version": "11.2.1"
    }
}
```

### POST /api/deferred-deeplink

Used to create a deferred deeplink

Required fields:

- `application_id`
- `action`
- `signals.ip`

Sample request:

```json
{
    "application_id": "app-XXX",
    "action":"/products/123",
    "attribution": {
        "btn_ref": "srctok-XXX"
    },
    "signals": {
        "ip": "1.1.1.1",
        "os": "ios",
        "os_version": "6.0"
    }
}
```

Sample response:

```json
{
    "action": "/products/123",
    "application_id": "app-XXX",
    "attribution": {
        "btn_ref": "srctok-XXX"
    },
    "created_at": "2018-06-18T17:09:21.686Z",
    "id": "ddl-XXX",
    "modified_at": "2018-06-18T17:09:21.686Z",
    "session_id": null,
    "signals": {
        "ip": "1.1.1.1",
        "os": "ios",
        "os_version": "6.0"
    }
}
```

### POST /api/deferred-deeplink/find-match-api

Used to query existing deeplinks and match based on signals.  If a match is
made, the deferred deeplink is marked as "matched" and can not be matched again.

Required fields:

- `application_id`
- `signals.ip`

Sample request:

```json
{
    "application_id": "app-XXX",
    "signals": {
        "ip": "1.1.1.1",
        "os": "ios",
        "os_version": "6.0"
    }
}
```

Sample response (match):

```json
{
    "action": "/products/123",
    "attribution": {
        "btn_ref": "srctok-XXX"
    },
    "id": "ddl-XXX",
    "match": true
}
```

Sample response (no match):

```json
{}
```
