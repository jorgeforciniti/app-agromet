package com.agromet.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Widget de la pantalla de inicio. Con estaciones favoritas muestra hasta cuatro (temperatura, lluvia
 * de hoy en mm y hora del registro); sin favoritas, la estación elegida en la app en grande (además con la
 * humedad). Toma las estaciones y su último registro de la app (WidgetPlugin) y cada 30 minutos los
 * pide de nuevo a /services/estaciones.php (la misma API que la app). Sin red queda lo último, con su
 * hora. Al tocarlo se abre la app.
 */
public class EstacionWidget extends AppWidgetProvider {

    static final String PREFS = "agromet_widget";
    static final String CLAVE_ESTACIONES = "estaciones";
    static final String CLAVE_DATOS = "datos";

    private static final String API = "https://agromet.eeaoc.gob.ar/services/estaciones.php";
    private static final Locale ES_AR = new Locale("es", "AR");

    /** Filas de la lista de favoritas (widget_favoritos.xml) */
    private static final int[] FILAS = { R.id.fila1, R.id.fila2, R.id.fila3, R.id.fila4 };
    private static final int[] NOMBRES = { R.id.fila1_nombre, R.id.fila2_nombre, R.id.fila3_nombre, R.id.fila4_nombre };
    private static final int[] TEMPERATURAS = { R.id.fila1_temperatura, R.id.fila2_temperatura, R.id.fila3_temperatura, R.id.fila4_temperatura };
    private static final int[] LLUVIAS = { R.id.fila1_lluvia, R.id.fila2_lluvia, R.id.fila3_lluvia, R.id.fila4_lluvia };
    private static final int[] HORAS = { R.id.fila1_hora, R.id.fila2_hora, R.id.fila3_hora, R.id.fila4_hora };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        List<String> estaciones = estaciones(context);
        mostrar(context, manager, ids, estaciones, datosGuardados(context));
        if (estaciones.isEmpty()) return;

        // La red no puede ir en el hilo principal; goAsync da unos segundos para terminar
        final PendingResult pendiente = goAsync();
        new Thread(() -> {
            try {
                Map<String, JSONObject> datos = pedir(estaciones);
                if (!datos.isEmpty()) {
                    JSONArray guardar = new JSONArray();
                    for (JSONObject d : datos.values()) guardar.put(d);
                    prefs(context).edit().putString(CLAVE_DATOS, guardar.toString()).apply();
                    mostrar(context, manager, ids, estaciones, datos);
                }
            } catch (Exception ignorada) {
                // Sin red: queda lo último guardado
            } finally {
                pendiente.finish();
            }
        }).start();
    }

    /** Redibuja todos los widgets con lo guardado (lo llama la app al tener registros nuevos) */
    static void mostrarGuardado(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, EstacionWidget.class));
        if (ids.length > 0) mostrar(context, manager, ids, estaciones(context), datosGuardados(context));
    }

    private static void mostrar(Context context, AppWidgetManager manager, int[] ids,
                                List<String> estaciones, Map<String, JSONObject> datos) {
        List<JSONObject> lista = new ArrayList<>();
        for (String id : estaciones) {
            JSONObject dato = datos.get(id);
            if (dato != null && lista.size() < FILAS.length) lista.add(dato);
        }

        RemoteViews vista = estaciones.size() > 1 ? favoritas(context, lista) : unaEstacion(context, lista);
        Intent abrir = new Intent(context, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        vista.setOnClickPendingIntent(R.id.widget_raiz, PendingIntent.getActivity(context, 0, abrir,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        manager.updateAppWidget(ids, vista);
    }

    /** Sin favoritas (o con una sola): la estación en grande */
    private static RemoteViews unaEstacion(Context context, List<JSONObject> lista) {
        RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_estacion);
        boolean hayDato = !lista.isEmpty();
        vista.setViewVisibility(R.id.widget_datos, hayDato ? View.VISIBLE : View.GONE);
        vista.setViewVisibility(R.id.widget_vacio, hayDato ? View.GONE : View.VISIBLE);
        if (hayDato) {
            JSONObject dato = lista.get(0);
            vista.setTextViewText(R.id.widget_estacion, dato.optString("nombre", ""));
            vista.setTextViewText(R.id.widget_temperatura, numero(dato, "temp_af", 1, "°"));
            vista.setTextViewText(R.id.widget_humedad, "Humedad " + numero(dato, "hum_af", 0, " %"));
            vista.setTextViewText(R.id.widget_lluvia, "Lluvia hoy " + numero(dato, "RR_dia", 1, " mm"));
            vista.setTextViewText(R.id.widget_hora, hora(dato.optString("fecha_I", "")));
        }
        return vista;
    }

    /** Favoritas: una fila por estación, hasta cuatro */
    private static RemoteViews favoritas(Context context, List<JSONObject> lista) {
        RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_favoritos);
        vista.setViewVisibility(R.id.widget_vacio, lista.isEmpty() ? View.VISIBLE : View.GONE);
        for (int i = 0; i < FILAS.length; i++) {
            boolean hay = i < lista.size();
            vista.setViewVisibility(FILAS[i], hay ? View.VISIBLE : View.GONE);
            if (!hay) continue;
            JSONObject dato = lista.get(i);
            vista.setTextViewText(NOMBRES[i], dato.optString("nombre", ""));
            vista.setTextViewText(TEMPERATURAS[i], numero(dato, "temp_af", 1, "°"));
            vista.setTextViewText(LLUVIAS[i], numero(dato, "RR_dia", 1, ""));
            vista.setTextViewText(HORAS[i], horaCorta(dato.optString("fecha_I", "")));
        }
        return vista;
    }

    /** «20,8°»; «S/D» si falta el valor (sensor dado de baja) */
    private static String numero(JSONObject dato, String campo, int decimales, String unidad) {
        if (dato.isNull(campo)) return "S/D";
        try {
            double valor = Double.parseDouble(dato.getString(campo));
            return String.format(ES_AR, "%." + decimales + "f", valor) + unidad;
        } catch (Exception e) {
            return "S/D";
        }
    }

    /** «08:15» si el registro es de hoy; si no, «18/11 08:15» */
    private static String hora(String fechaI) {
        if (fechaI.length() < 16) return "";
        String hoy = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String hhmm = fechaI.substring(11, 16);
        if (fechaI.startsWith(hoy)) return hhmm;
        return fechaI.substring(8, 10) + "/" + fechaI.substring(5, 7) + " " + hhmm;
    }

    /** En la lista no entra la fecha: «08:15» si es de hoy, si no «18/11» */
    private static String horaCorta(String fechaI) {
        String texto = hora(fechaI);
        return texto.length() > 5 ? texto.substring(0, 5) : texto;
    }

    /** Una estación: ?estacion=; varias: la lista de habilitadas (un solo pedido) */
    private static Map<String, JSONObject> pedir(List<String> estaciones) throws Exception {
        String url = estaciones.size() == 1 ? API + "?estacion=" + estaciones.get(0) : API + "?habilitada=1";
        HttpURLConnection conexion = (HttpURLConnection) new URL(url).openConnection();
        conexion.setConnectTimeout(8000);
        conexion.setReadTimeout(8000);
        try (BufferedReader lector = new BufferedReader(new InputStreamReader(conexion.getInputStream(), "UTF-8"))) {
            StringBuilder texto = new StringBuilder();
            String linea;
            while ((linea = lector.readLine()) != null) texto.append(linea);
            Map<String, JSONObject> datos = porEstacion(new JSONArray(texto.toString()));
            datos.keySet().retainAll(estaciones);
            return datos;
        } finally {
            conexion.disconnect();
        }
    }

    private static Map<String, JSONObject> porEstacion(JSONArray lista) {
        Map<String, JSONObject> datos = new HashMap<>();
        for (int i = 0; i < lista.length(); i++) {
            JSONObject e = lista.optJSONObject(i);
            if (e != null) datos.put(e.optString("Identificacion"), e);
        }
        return datos;
    }

    private static List<String> estaciones(Context context) {
        List<String> estaciones = new ArrayList<>();
        try {
            JSONArray lista = new JSONArray(prefs(context).getString(CLAVE_ESTACIONES, "[]"));
            for (int i = 0; i < lista.length(); i++) estaciones.add(lista.getString(i));
        } catch (Exception ignorada) {
            // Lo guardado no se pudo leer: como si no hubiera estaciones
        }
        return estaciones;
    }

    private static Map<String, JSONObject> datosGuardados(Context context) {
        try {
            return porEstacion(new JSONArray(prefs(context).getString(CLAVE_DATOS, "[]")));
        } catch (Exception e) {
            return new HashMap<>();
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
