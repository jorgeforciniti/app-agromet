import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import {
    PushNotifications,
    Token,
    PushNotificationSchema,
    ActionPerformed,
} from '@capacitor/push-notifications';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface PushNavigationIntent {
    tipo: string;
    estacionId: string | null;
}

export interface PushPreferencias {
    dispositivo_id?: number;
    estacion_id?: number | null;

    heladas_activo: number;
    heladas_alcance: 'provincia' | 'localidad';
    cooldown_heladas_min?: number;

    smn_activo: number;
    smn_alcance?: string;
    cooldown_smn_min?: number;
    smn_area_3373: number;
    smn_area_3375: number;
}

/** Alerta a medida (push-alertas.php) */
export interface AlertaUsuario {
    id: number;
    identificacion: number;
    estacion: string;
    variable: string;
    umbral: number;
    texto: string;
    unidad: string;
    ultimo_envio: string | null;
}

/** Condiciones que se pueden elegir (las define el servidor, con su rango) */
export interface OpcionAlerta {
    variable: string;
    texto: string;
    unidad: string;
    min: number;
    max: number;
}

export interface RespuestaAlertas {
    ok: boolean;
    error?: string;
    alertas?: AlertaUsuario[];
    opciones?: OpcionAlerta[];
    maximo?: number;
}

@Injectable({
    providedIn: 'root',
})
export class PushService {

    /**
     * Alertas a medida: listar, agregar ({ identificacion, variable, umbral }) o borrar ({ id }).
     * Siempre devuelve la lista actualizada, o ok: false con el error del servidor.
     */
    async alertas(accion: 'listar' | 'agregar' | 'borrar', extra: any = {}): Promise<RespuestaAlertas> {
        const endpoint = `${environment.pushApiBase}push-alertas.php`;
        const token = localStorage.getItem('push_token') || '';
        const dispositivo_id = localStorage.getItem('push_dispositivo_id') || '';

        try {
            return await this.http.post<RespuestaAlertas>(endpoint, { token, dispositivo_id, accion, ...extra })
                .toPromise();
        } catch (e: any) {
            return { ok: false, error: e?.error?.error || 'No se pudo conectar con el servidor.' };
        }
    }

    /**
     * Intent de navegación pendiente al tocar una notificación.
     * No navegamos directo desde el listener: app.component.ts recién lo
     * consume una vez que terminó de cargar la lista de estaciones (evita
     * la carrera típica de cold start entre initPush() y traeEstacionesYDatos()).
     */
    private pendingNavigationSubject = new BehaviorSubject<PushNavigationIntent | null>(null);
    pendingNavigation$ = this.pendingNavigationSubject.asObservable();

    clearPendingNavigation() {
        this.pendingNavigationSubject.next(null);
    }

    constructor(private http: HttpClient) { }

    async initPush() {
        if (!Capacitor.isNativePlatform()) {
            console.log('[PUSH] No se inicializa push en navegador.');
            return;
        }

        let permStatus = await PushNotifications.checkPermissions();

        if (permStatus.receive !== 'granted') {
            permStatus = await PushNotifications.requestPermissions();
        }

        if (permStatus.receive !== 'granted') {
            console.log('[PUSH] Permiso de notificaciones no concedido.');
            return;
        }

        await PushNotifications.register();

        PushNotifications.addListener('registration', (token: Token) => {
            console.log('[PUSH] Token FCM:', token.value);

            localStorage.setItem('push_token', token.value);

            this.enviarTokenAlServidor(token.value);
        });

        PushNotifications.addListener('registrationError', (error: any) => {
            console.error('[PUSH] Error de registro:', error);
        });

        PushNotifications.addListener(
            'pushNotificationReceived',
            (notification: PushNotificationSchema) => {
                console.log('[PUSH] Notificación recibida:', notification);
            }
        );

        PushNotifications.addListener(
            'pushNotificationActionPerformed',
            (notification: ActionPerformed) => {
                console.log('[PUSH] Notificación tocada:', notification);

                const data = notification?.notification?.data || {};
                const tipo = data?.tipo ? String(data.tipo) : '';
                const estacionIdRaw = data?.estacion_id ?? data?.estacionId ?? null;

                if (!tipo && estacionIdRaw == null) {
                    return;
                }

                this.pendingNavigationSubject.next({
                    tipo,
                    estacionId: estacionIdRaw != null ? String(estacionIdRaw) : null,
                });
            }
        );
    }

    private async enviarTokenAlServidor(token: string): Promise<any> {
        const endpoint = `${environment.pushApiBase}push-registrar-token.php`;

        const estacion = localStorage.getItem('estacion') || '';
        const plataforma = Capacitor.getPlatform();

        const body = {
            token,
            platform: plataforma,
            estacion,
            app: 'agromet_publica',
        };

        try {
            const json: any = await this.http.post(endpoint, body).toPromise().catch(() => null);

            console.log('[PUSH] Token enviado al servidor:', json);

            if (json?.ok) {
                localStorage.setItem('push_token_registrado', '1');
                localStorage.setItem('push_dispositivo_id', String(json.dispositivo_id || ''));
                return json;
            } else {
                localStorage.setItem('push_token_registrado', '0');
            }

        } catch (e) {
            console.error('[PUSH] No se pudo enviar token al servidor:', e);
            localStorage.setItem('push_token_registrado', '0');
            return null;
        }
    }

    async registrarTokenActual() {
        const token = localStorage.getItem('push_token');

        if (!token) {
            console.log('[PUSH] No hay token guardado para registrar.');
            return null;
        }

        return await this.enviarTokenAlServidor(token);
    }

    async obtenerPreferencias(): Promise<PushPreferencias | null> {
        const endpoint = `${environment.pushApiBase}push-obtener-preferencias.php`;

        const token = localStorage.getItem('push_token') || '';
        const dispositivo_id = localStorage.getItem('push_dispositivo_id') || '';

        try {
            const json: any = await this.http.post(endpoint, { token, dispositivo_id })
                .toPromise().catch(() => null);

            if (json?.ok && json?.preferencias) {
                return json.preferencias as PushPreferencias;
            }

            console.error('[PUSH] No se pudieron obtener preferencias:', json);
            return null;
        } catch (e) {
            console.error('[PUSH] Error obteniendo preferencias:', e);
            return null;
        }
    }

    async guardarPreferencias(pref: PushPreferencias): Promise<boolean> {
        const endpoint = `${environment.pushApiBase}push-guardar-preferencias.php`;

        const token = localStorage.getItem('push_token') || '';
        const dispositivo_id = localStorage.getItem('push_dispositivo_id') || '';

        try {
            const json: any = await this.http.post(endpoint, {
                token,
                dispositivo_id,

                heladas_activo: pref.heladas_activo,
                heladas_alcance: pref.heladas_alcance,

                smn_activo: pref.smn_activo,
                smn_area_3373: pref.smn_area_3373,
                smn_area_3375: pref.smn_area_3375,
            }).toPromise().catch(() => null);

            console.log('[PUSH] Preferencias guardadas:', json);

            return !!json?.ok;
        } catch (e) {
            console.error('[PUSH] Error guardando preferencias:', e);
            return false;
        }
    }

    tieneTokenRegistrado(): boolean {
        const token = localStorage.getItem('push_token');
        const dispositivoId = localStorage.getItem('push_dispositivo_id');

        return !!token && !!dispositivoId;
    }

    esPlataformaNativa(): boolean {
        return Capacitor.isNativePlatform();
    }

}