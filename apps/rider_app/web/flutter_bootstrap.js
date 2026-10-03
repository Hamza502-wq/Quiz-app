{{flutter_js}}
{{flutter_build_config}}

// Load the app without Flutter's deprecated service worker (DoorStep registers
// its own small one for install-to-home-screen and an offline page).
_flutter.loader.load();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
  });
}
