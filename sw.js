/*
  PayTrax Payroll Management
  Copyright (c) 2025 greenwh

  Service Worker for PWA functionality.
  Licensed under the MIT License.
*/

const CACHE_NAME = 'paytrax-cache-v10';
// This list should include all the files that make up the application's shell.
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './js/main.js',
  './js/state.js',
  './js/logic.js',
  './js/ui.js',
  './js/banking.js',
  './js/data-io.js',
  './js/db.js',
  './js/migration.js',
  './js/utils.js',
  './js/validation.js',
  './js/pdf-export.js',
  './icons/icon-192.png', // Also cache the main icons
  './icons/icon-512.png'
];

// Install event: opens a cache and adds the app shell files to it.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: clean up old caches.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event: serves assets from the cache first (Cache First strategy).
// This is ideal for an app shell that doesn't change often.
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request);
      }
    )
  );
});
