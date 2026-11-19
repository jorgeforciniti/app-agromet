import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';

/** Sesión guardada en el celular */
export interface Sesion {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  /** ms (Date.now()) en que vence idToken */
  vence: number;
}

const CLAVE = 'cuenta';
const IDENTITY = 'https://identitytoolkit.googleapis.com/v1/accounts:';
const SECURE_TOKEN = 'https://securetoken.googleapis.com/v1/token';

/** Mensajes de Firebase en castellano (los mismos de la web, auth.component.ts) */
const MENSAJES: Record<string, string> = {
  EMAIL_EXISTS: 'Ya existe una cuenta con ese correo. Iniciá sesión o recuperá la contraseña.',
  INVALID_EMAIL: 'El correo electrónico no es válido.',
  WEAK_PASSWORD: 'La contraseña debe tener al menos 6 caracteres.',
  INVALID_LOGIN_CREDENTIALS: 'Correo o contraseña incorrectos.',
  INVALID_PASSWORD: 'Correo o contraseña incorrectos.',
  EMAIL_NOT_FOUND: 'No hay una cuenta con ese correo.',
  USER_DISABLED: 'La cuenta está deshabilitada.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Demasiados intentos. Esperá unos minutos y volvé a probar.',
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: 'Por seguridad, cerrá la sesión, volvé a ingresar y repetí el borrado.',
};

/**
 * Cuenta compartida con la web: el mismo proyecto de Firebase (agromet-web) y la misma API de
 * usuarios (/services/usuarios/). Usa la API REST de Firebase Authentication en vez del SDK, que
 * pide un TypeScript más nuevo que el de la app (Angular 12). El idToken va como
 * `Authorization: Bearer` a la API, que toma el usuario sólo de ese token.
 */
@Injectable({ providedIn: 'root' })
export class CuentaService {

  private sesionSubject = new BehaviorSubject<Sesion | null>(this.leer());
  sesion$ = this.sesionSubject.asObservable();

  constructor(private http: HttpClient) { }

  get sesion(): Sesion | null {
    return this.sesionSubject.value;
  }

  ingresar(email: string, password: string): Promise<Sesion> {
    return this.identity('signInWithPassword', { email, password, returnSecureToken: true });
  }

  /** Crea la cuenta (queda con sesión iniciada) y manda el correo de verificación, como la web */
  async crear(email: string, password: string): Promise<Sesion> {
    const sesion = await this.identity('signUp', { email, password, returnSecureToken: true });
    this.http.post(`${IDENTITY}sendOobCode?key=${environment.firebaseApiKey}`,
      { requestType: 'VERIFY_EMAIL', idToken: sesion.idToken }).subscribe({ error: () => { } });
    return sesion;
  }

  /** Con el idToken de Google (plugin nativo) inicia sesión en Firebase */
  ingresarConGoogle(googleIdToken: string): Promise<Sesion> {
    return this.identity('signInWithIdp', {
      postBody: `id_token=${encodeURIComponent(googleIdToken)}&providerId=google.com`,
      requestUri: 'https://agromet.eeaoc.gob.ar',
      returnSecureToken: true,
      returnIdpCredential: true,
    });
  }

  async recuperarContrasena(email: string): Promise<void> {
    try {
      await this.http.post(`${IDENTITY}sendOobCode?key=${environment.firebaseApiKey}`,
        { requestType: 'PASSWORD_RESET', email }).toPromise();
    } catch (e) {
      throw new Error(this.mensaje(e));
    }
  }

  /**
   * Borra la cuenta (exigido por Play Store y App Store a las apps que permiten crearla): primero en
   * Firebase, que puede pedir haber ingresado hace poco, y después sus datos en la API de usuarios
   * (favoritas, consultas, alertas y cuaderno) con el mismo token, que sigue valiendo hasta vencer.
   */
  async borrarCuenta(): Promise<void> {
    const idToken = await this.token();
    if (!idToken) throw new Error('No hay conexión. Revisá tu red y volvé a intentar.');
    try {
      await this.http.post(`${IDENTITY}delete?key=${environment.firebaseApiKey}`, { idToken }).toPromise();
      await this.http.post(`${environment.usuariosBase}cuenta_borrar.php`, {},
        { headers: new HttpHeaders({ Authorization: `Bearer ${idToken}` }) }).toPromise();
    } catch (e) {
      throw new Error(this.mensaje(e));
    }
  }

  salir() {
    localStorage.removeItem(CLAVE);
    this.sesionSubject.next(null);
  }

  /** idToken vigente (lo renueva si vence en menos de 5 minutos); null sin sesión */
  async token(): Promise<string | null> {
    const s = this.sesion;
    if (!s) return null;
    if (s.vence - Date.now() > 5 * 60000) return s.idToken;
    try {
      const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refreshToken)}`;
      const r: any = await this.http.post(`${SECURE_TOKEN}?key=${environment.firebaseApiKey}`, body,
        { headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }) }).toPromise();
      this.guardar({ ...s, idToken: r.id_token, refreshToken: r.refresh_token, vence: Date.now() + Number(r.expires_in) * 1000 });
      return r.id_token;
    } catch (e) {
      // Sin red se reintenta después; si Firebase rechaza la renovación (cuenta borrada o
      // deshabilitada, contraseña cambiada), la sesión ya no sirve
      if (e instanceof HttpErrorResponse && e.status >= 400 && e.status < 500) this.salir();
      return null;
    }
  }

  /** Encabezados para la API de usuarios; null sin sesión o sin poder renovar el token */
  async encabezados(): Promise<HttpHeaders | null> {
    const t = await this.token();
    return t ? new HttpHeaders({ Authorization: `Bearer ${t}` }) : null;
  }

  private async identity(metodo: string, cuerpo: any): Promise<Sesion> {
    try {
      const r: any = await this.http.post(`${IDENTITY}${metodo}?key=${environment.firebaseApiKey}`, cuerpo).toPromise();
      const sesion: Sesion = {
        uid: r.localId,
        email: r.email,
        idToken: r.idToken,
        refreshToken: r.refreshToken,
        vence: Date.now() + Number(r.expiresIn) * 1000,
      };
      this.guardar(sesion);
      return sesion;
    } catch (e) {
      throw new Error(this.mensaje(e));
    }
  }

  private mensaje(e: any): string {
    if (e instanceof HttpErrorResponse && e.status === 0) return 'No hay conexión. Revisá tu red y volvé a intentar.';
    // «WEAK_PASSWORD : Password should be at least 6 characters» → WEAK_PASSWORD
    const codigo = String(e?.error?.error?.message ?? '').split(' ')[0];
    return MENSAJES[codigo] ?? 'No se pudo completar la operación. Volvé a intentar.';
  }

  private guardar(s: Sesion) {
    localStorage.setItem(CLAVE, JSON.stringify(s));
    this.sesionSubject.next(s);
  }

  private leer(): Sesion | null {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      return s?.uid && s?.refreshToken ? s : null;
    } catch {
      return null;
    }
  }
}
