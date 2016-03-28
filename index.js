'use strict';

const throng = require('throng');

const WORKERS = process.env.WEB_CONCURRENCY || 1;
const PORT = process.env.PORT || 3000;

throng({
  workers: WORKERS
}, (workerId) => {
  console.log(`Starting worker ${workerId}`);

  process.on('SIGTERM', function() {
    console.log(`Worker ${id} exiting`);
    console.log('Cleanup here');
    process.exit();
  });

  const express = require('express');
  const app = express();
  const request = require('request');
  const redis = require('redis');
  const bluebird = require('bluebird');
  const debug = require('debug');

  bluebird.promisifyAll(redis.RedisClient.prototype);
  bluebird.promisifyAll(redis.Multi.prototype);

  const debugApp = debug('app:main');
  const debugAppParseJson = debug('app:parse-json');
  const debugAppGetImgThumbnail = debug('app:get-img-thumbnail');
  const debugRequest = debug('app:request');
  const debugCache = debug('app:cache');

  const REDIS_URL = process.env.REDIS || 'redis://localhost';
  const VIMEO_DATA_URL = 'https://vimeo.com/api/v2/video/';
  const CACHE_KEY_PREFIX = 'vimeo-thumbnail:';

  let redisClient;
  try {
    debugCache(`Connecting to redis ${REDIS_URL}`);
    redisClient = redis.createClient(REDIS_URL);
  } catch (err) {
    console.error(`Could not connect to Redis ${REDIS_URL}`);
  }

  redisClient.on('error', (err) => {
    console.error('Unexpected redis error', err);
  });

  app.on('error', (err) => {
    console.error('Unexpected error', err);
  });

  function getVimeoDataUrl (id) {
    return VIMEO_DATA_URL + id + '.json';
  }

  function parseJson (json) {
    debugAppParseJson(`Parsing ${json}`);
    try {
      let data = JSON.parse(json);
      if (data[0]) {
        debugAppParseJson(`Data found in json.`);
        return data[0];
      } else {
        debugAppParseJson(`Empty array found.`);
        return false;
      }
    } catch (err) {
      if (err) debugAppParseJson(`Invalid json response.`, err);
      return false;
    }
  }

  function getImgThumbnail (data, size, fallback) {
    debugAppGetImgThumbnail(data, size, fallback);
    const large = 'thumbnail_large';
    const medium = 'thumbnail_medium';
    const small = 'thumbnail_small';
    if (size === 'large') {
      if (data[large]) return data[large];
      if (!fallback) return false;
      debugAppGetImgThumbnail(`${size} not found falling medium.`);
    } else if (size === 'medium') {
      if (data[medium]) return data[medium];
      if (!fallback) return false;
      debugAppGetImgThumbnail(`${size} not found falling back to small.`);
    } else if (size === 'small') {
      if (data[small]) return data[small];
      if (!fallback) return false;
      debugAppGetImgThumbnail(`${size} not found falling back to null.`);
    } else {
      debugAppGetImgThumbnail(`${size} not resolved.`);
      return false;
    }
  }

  function fetchFromCache (id) {
    return redisClient.getAsync(CACHE_KEY_PREFIX + id)
      .then((res) => {
        debugCache(`Cache found for ${id}`, res);
        return res;
      })
      .catch((err) => {
        debugCache(`Redis error`, err);
      });
  }

  function saveToCache (id, url) {
    redisClient.set(CACHE_KEY_PREFIX + id, url, (err, res) => {
      redisClient.expireat(CACHE_KEY_PREFIX + id, parseInt((+new Date)/1000) + 2629743);
      if (err) console.error(`Redis error on [set(${CACHE_KEY_PREFIX + id}, ${url})]:`, err);
      else debugCache(`Cached ${url} to ${CACHE_KEY_PREFIX + id}`);
    });
  }

  app.get('/v/*', function (req, res) {
    let id = req.path.replace(/^\/v\//, '');
    if (id.match(/[^\d]+/)) {
      debugApp(`Video id not a number: ${id}`);
      return res.status(400).send('Video id must be a number.');
    }
    fetchFromCache(id)
      .then((imgUrl) => {
        if(!imgUrl || !imgUrl.match(/^https?:\/\//)) return Promise.reject(imgUrl);
        debugApp(`Using cached redirect`);
        debugApp(`Sending redirect for ${id} to ${imgUrl}`);
        return res.redirect(301, imgUrl);
      })
      .catch((error) => {
        debugCache(`Cache not found for ${id}`, error);
        debugApp(`Fetching Vimeo data ${getVimeoDataUrl(id)}`);
        request(getVimeoDataUrl(id), (requestError, requestResponse, requestBody) => {
          debugRequest(`Error`, requestError);
          debugRequest(`Response`, requestResponse);
          debugRequest(`Body`, requestBody);
          if (requestError) {
            console.error(`Error fetching data from Vimeo api (${getVimeoDataUrl(id)})`, requestError);
            return res.status(404).send(`Could not get data from vimeo: ${getVimeoDataUrl(id)}`);
          } else {
            let size = req.query.s || 'large';
            let sizeFallback = req.query.sfb === 'false' ? false : true;
            let data = parseJson(requestBody);
            if (!data) {
              let response = `Recieved invalid response from Vimeo api (${getVimeoDataUrl(id)}): ${requestBody}`;
              debugApp(response)
              return res.status(404).send(response);
            }
            let imgUrl = getImgThumbnail(data, size, sizeFallback);
            if (!imgUrl) {
              let response = `Recieved invalid img url (${imgUrl}) from Vimeo api (${getVimeoDataUrl(id)})`;
              debugApp(response)
              return res.status(404).send(response);
            }
            saveToCache(id, imgUrl);
            debugApp(`Sending redirect for ${id} to ${imgUrl}`);
            return res.redirect(301, imgUrl);
          }
        });
      });
  });

  app.listen(PORT, function () {
    console.log(`Server listening on port ${PORT}`);
  });

});
