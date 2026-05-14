import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
    PushNotifications,
    Token,
    PushNotificationSchema,
    ActionPerformed,
} from '@capacitor/push-notifications';

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

@Injectable({
    providedIn: 'root',
})
export class PushService {

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

                if (data?.tipo === 'helada_inicio') {
                    console.log('[PUSH] Abrir pantalla Heladas');
                    // Después conectamos navegación a /tabs/heladas
                }
            }
        );
    }

    private async enviarTokenAlServidor(token: string): Promise<any> {
        const endpoint =
            'https://agromet.eeaoc.gob.ar/api/push/push-registrar-token.php';

        const estacion = localStorage.getItem('estacion') || '';
        const plataforma = Capacitor.getPlatform();

        const body = {
            token,
            platform: plataforma,
            estacion,
            app: 'agromet_publica',
        };

        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify(body),
            });

            const json = await resp.json().catch(() => null);

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
        const endpoint =
            'https://agromet.eeaoc.gob.ar/api/push/push-obtener-preferencias.php';

        const token = localStorage.getItem('push_token') || '';
        const dispositivo_id = localStorage.getItem('push_dispositivo_id') || '';

        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    token,
                    dispositivo_id,
                }),
            });

            const json = await resp.json().catch(() => null);

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
        const endpoint =
            'https://agromet.eeaoc.gob.ar/api/push/push-guardar-preferencias.php';

        const token = localStorage.getItem('push_token') || '';
        const dispositivo_id = localStorage.getItem('push_dispositivo_id') || '';

        try {
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({
                    token,
                    dispositivo_id,

                    heladas_activo: pref.heladas_activo,
                    heladas_alcance: pref.heladas_alcance,

                    smn_activo: pref.smn_activo,
                    smn_area_3373: pref.smn_area_3373,
                    smn_area_3375: pref.smn_area_3375,
                }),
            });

            const json = await resp.json().catch(() => null);

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