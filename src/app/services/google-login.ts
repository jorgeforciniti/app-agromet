import { Capacitor } from '@capacitor/core';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { environment } from 'src/environments/environment';

/**
 * Ingreso con Google en el celular (plugin @capgo/capacitor-social-login): devuelve el idToken de
 * Google y CuentaService lo cambia por la sesión de Firebase (signInWithIdp). El token sale para el
 * cliente web de OAuth del proyecto agromet-web, así Firebase lo acepta aunque la app no esté en ese
 * proyecto (las notificaciones usan otro). Sólo en Android: en iOS harían falta su propio ID de
 * cliente y, por las reglas de App Store, también «Iniciar sesión con Apple». En el navegador no.
 */
export function googleDisponible(): boolean {
  return Capacitor.getPlatform() === 'android' && !!environment.googleWebClientId;
}

let inicializado = false;

/** idToken de Google; null si la persona cerró la ventana sin elegir cuenta */
export async function idTokenDeGoogle(): Promise<string | null> {
  if (!inicializado) {
    await SocialLogin.initialize({ google: { webClientId: environment.googleWebClientId } });
    inicializado = true;
  }
  try {
    const r = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
    const idToken = (r.result as { idToken?: string | null }).idToken;
    if (!idToken) throw new Error('Google no devolvió la identificación.');
    return idToken;
  } catch (e) {
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return null;
    throw new Error('No se pudo ingresar con Google. Volvé a intentar.');
  }
}
