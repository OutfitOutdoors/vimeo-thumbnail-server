Vimeo Thumbnail Server
----------------------

This is a simple server which fetches the thumbnail for a Vimeo video id. This
server uses the Vimeo API to fetch the thumbnail image and returns it as a 301
redirect.

By using a 301 redirect the browser can cache the redirect and render the image
faster. The server also maintains a local redis cache so other clients will gain
a speed boost by not having to wait on the server to query the Vimeo API.

## Options
There are a few options available by adding it to the url query.

- `s=<size>`: choose the size of thumbnail you want returned. [`small`, `medium`, `large`] (default: `large`)
- `sfb=<enabled>`: whether to fallback to a smaller size else return 404. [`true`, `false`] (default: `true`)
- `c=<enable>`: whether to use backend cache or fetch fresh from API. [`true`, `false`] (default: `true`)

Example: `http://localhost:3000/v/56?s=large&sfb=false&c=false`

## Running
To run:

```
npm i & npm start
```

Environment variables:

- Port: `PORT=3000`
- Workers: `WEB_CONCURRENCY=1`
- Redis DB: `REDIS_URL=redis://localhost`

## Hosted
You can use the hosted platform located at http://vimeo-thumbnail.herokuapp.com
