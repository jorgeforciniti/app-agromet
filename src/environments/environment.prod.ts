export const environment = {
  production: true,
  agrometBase: 'https://agromet.eeaoc.gob.ar/android/',
  servicesBase: 'https://agromet.eeaoc.gob.ar/services/',
  pushApiBase: 'https://agromet.eeaoc.gob.ar/api/push/',
  publicidadUrl: 'https://agromet.eeaoc.gob.ar/android/prop1.gif',
  openWeatherApiKey: 'ea2faa440ccc747a20a042317dadac3f',
  openWeatherBase: 'https://api.openweathermap.org/data/2.5/',
  swpcKpUrl: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  // Pronóstico horario gratuito (uso no comercial; citar «Open-Meteo»)
  openMeteoUrl: 'https://api.open-meteo.com/v1/forecast',
  // Cuenta compartida con la web: mismo proyecto de Firebase y misma API de usuarios que el sitio
  // (la clave de Firebase es pública: está en el environment de la web)
  firebaseApiKey: 'AIzaSyDUCna7SOAKXvmTbC9FJUHobuV9KwYSbao',
  usuariosBase: 'https://agromet.eeaoc.gob.ar/services/usuarios/',
  // ID de cliente web de OAuth del proyecto agromet-web (Firebase → Authentication → Google → Configuración
  // del SDK web). Vacío: no aparece «Continuar con Google»
  googleWebClientId: '',
  mapboxAccessToken: 'pk.eyJ1Ijoiam9yZ2Vmb3JjaW5pdGkiLCJhIjoiY2tkMXJmaG51MGljODMxcnlybW1uaWFhMSJ9.r5sRXgwgOL-34LRNjx0Mzg'
};
