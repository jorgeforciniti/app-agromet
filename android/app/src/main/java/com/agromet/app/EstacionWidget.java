package com.agromet.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
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
 * Widget de la pantalla de inicio. Con estaciones favoritas muestra las que entran en su alto, hasta 8
 * (temperatura, lluvia de hoy en mm y hora del registro); sin favoritas, la estación elegida en la app en grande (además con la
 * humedad). Toma las estaciones y su último registro de la app (WidgetPlugin) y cada 30 minutos los
 * pide de nuevo a /services/estaciones.php (la misma API que la app) con ActualizarWidgetWorker, aunque
 * no se abra la app. Abajo dice «Agromet · EEAOC» y a qué hora se actualizó; el botón ↻ lo actualiza en
 * el momento. Sin red queda lo último, con su hora. Al tocarlo se abre la app.
 */
public class EstacionWidget extends AppWidgetProvider {

    static final String PREFS = "agromet_widget";
    static final String CLAVE_ESTACIONES = "estaciones";
    static final String CLAVE_DATOS = "datos";
    /** Hora (ms) de la última vez que se trajeron los datos, para el pie del widget */
    static final String CLAVE_ACTUALIZADO = "actualizado";

    /** El botón ↻ del widget */
    private static final String ACCION_ACTUALIZAR = "com.agromet.app.ACTUALIZAR_WIDGET";

    private static final String API = "https://agromet.eeaoc.gob.ar/services/estaciones.php";
    private static final Locale ES_AR = new Locale("es", "AR");

    /** Filas de la lista de favoritas (widget_favoritos.xml): hasta 8, el máximo de favoritas de la cuenta */
    private static final int[] FILAS = { R.id.fila1, R.id.fila2, R.id.fila3, R.id.fila4,
            R.id.fila5, R.id.fila6, R.id.fila7, R.id.fila8 };
    private static final int[] NOMBRES = { R.id.fila1_nombre, R.id.fila2_nombre, R.id.fila3_nombre, R.id.fila4_nombre,
            R.id.fila5_nombre, R.id.fila6_nombre, R.id.fila7_nombre, R.id.fila8_nombre };
    private static final int[] TEMPERATURAS = { R.id.fila1_temperatura, R.id.fila2_temperatura, R.id.fila3_temperatura,
            R.id.fila4_temperatura, R.id.fila5_temperatura, R.id.fila6_temperatura, R.id.fila7_temperatura, R.id.fila8_temperatura };
    private static final int[] LLUVIAS = { R.id.fila1_lluvia, R.id.fila2_lluvia, R.id.fila3_lluvia, R.id.fila4_lluvia,
            R.id.fila5_lluvia, R.id.fila6_lluvia, R.id.fila7_lluvia, R.id.fila8_lluvia };
    private static final int[] HORAS = { R.id.fila1_hora, R.id.fila2_hora, R.id.fila3_hora, R.id.fila4_hora,
            R.id.fila5_hora, R.id.fila6_hora, R.id.fila7_hora, R.id.fila8_hora };

    /** Más minutos que esto sin registro: dato atrasado (ver atrasado()) */
    private static final int MINUTOS_ATRASADO = 45;
    private static final String SIN_DATO = "—";
    /** Ámbar de los avisos de la app (--ion-color-warning) */
    private static final int COLOR_ATRASADO = 0xFFFFD534;

    /** Alto (dp) de cada fila y de lo fijo (márgenes, encabezado de columnas y pie), para ver cuántas entran */
    private static final int ALTO_FILA = 24;
    private static final int ALTO_FIJO = 46;

    @Override
    public void onEnabled(Context context) {
        ActualizarWidgetWorker.programar(context);
    }

    @Override
    public void onDisabled(Context context) {
        ActualizarWidgetWorker.cancelar(context);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        mostrar(context, manager, ids, estaciones(context), datosGuardados(context));
        // También acá: los widgets agregados antes de esta versión no pasaron por onEnabled
        ActualizarWidgetWorker.programar(context);
        actualizarEnSegundoPlano(context);
    }

    /** Al agrandar o achicar el widget: muestra las favoritas que entran en el nuevo tamaño */
    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle opciones) {
        mostrar(context, manager, new int[] { id }, estaciones(context), datosGuardados(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACCION_ACTUALIZAR.equals(intent.getAction())) actualizarEnSegundoPlano(context);
    }

    /** La red no puede ir en el hilo principal; goAsync da unos segundos para terminar */
    private void actualizarEnSegundoPlano(Context context) {
        final PendingResult pendiente = goAsync();
        new Thread(() -> {
            try {
                actualizarDesdeServidor(context);
            } finally {
                pendiente.finish();
            }
        }).start();
    }

    /**
     * Pide los datos de las estaciones del widget, los guarda y redibuja. false si no se pudo (sin red,
     * servidor caído): queda lo último guardado. Lo usan el ↻, onUpdate y ActualizarWidgetWorker.
     */
    static boolean actualizarDesdeServidor(Context context) {
        List<String> estaciones = estaciones(context);
        if (estaciones.isEmpty()) return true;
        try {
            Map<String, JSONObject> datos = pedir(estaciones);
            JSONArray guardar = new JSONArray();
            for (JSONObject d : datos.values()) guardar.put(d);
            prefs(context).edit()
                    .putString(CLAVE_DATOS, guardar.toString())
                    .putLong(CLAVE_ACTUALIZADO, System.currentTimeMillis())
                    .apply();
            mostrarGuardado(context);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** Hay al menos un widget en la pantalla de inicio */
    static boolean hayWidgets(Context context) {
        return AppWidgetManager.getInstance(context)
                .getAppWidgetIds(new ComponentName(context, EstacionWidget.class)).length > 0;
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

        Intent abrir = new Intent(context, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent alAbrir = PendingIntent.getActivity(context, 0, abrir,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent actualizar = new Intent(context, EstacionWidget.class).setAction(ACCION_ACTUALIZAR);
        PendingIntent alActualizar = PendingIntent.getBroadcast(context, 0, actualizar,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long actualizado = prefs(context).getLong(CLAVE_ACTUALIZADO, 0);

        // Uno por uno: cada widget puede tener otro tamaño y mostrar otra cantidad de favoritas
        for (int id : ids) {
            RemoteViews vista = estaciones.size() > 1
                    ? favoritas(context, lista, filasQueEntran(manager, id))
                    : unaEstacion(context, lista);
            vista.setOnClickPendingIntent(R.id.widget_raiz, alAbrir);
            // Pie: de quién son los datos y cuándo se actualizó el widget; ↻ lo actualiza en el momento
            vista.setTextViewText(R.id.pie_actualizado, actualizado > 0 ? "Act. " + momento(actualizado) : "");
            vista.setOnClickPendingIntent(R.id.pie_actualizar, alActualizar);
            manager.updateAppWidget(id, vista);
        }
    }

    /**
     * Cuántas filas de favoritas entran en el alto del widget. En el celular vertical el alto real es
     * OPTION_APPWIDGET_MAX_HEIGHT (dp); sin ese dato se muestran 4, el tamaño inicial.
     */
    private static int filasQueEntran(AppWidgetManager manager, int id) {
        int alto = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        if (alto <= 0) return 4;
        return Math.max(1, Math.min(FILAS.length, (alto - ALTO_FIJO) / ALTO_FILA));
    }

    /** «10:40» si es de hoy; si no, «23/11 10:40» */
    private static String momento(long ms) {
        Date fecha = new Date(ms);
        boolean hoy = new SimpleDateFormat("yyyyMMdd", Locale.US).format(fecha)
                .equals(new SimpleDateFormat("yyyyMMdd", Locale.US).format(new Date()));
        return new SimpleDateFormat(hoy ? "HH:mm" : "dd/MM HH:mm", ES_AR).format(fecha);
    }

    /** Sin favoritas (o con una sola): la estación en grande */
    private static RemoteViews unaEstacion(Context context, List<JSONObject> lista) {
        RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_estacion);
        boolean hayDato = !lista.isEmpty();
        vista.setViewVisibility(R.id.widget_datos, hayDato ? View.VISIBLE : View.GONE);
        vista.setViewVisibility(R.id.widget_vacio, hayDato ? View.GONE : View.VISIBLE);
        if (hayDato) {
            JSONObject dato = lista.get(0);
            String fechaI = dato.optString("fecha_I", "");
            boolean atrasado = atrasado(fechaI);
            vista.setTextViewText(R.id.widget_estacion, dato.optString("nombre", ""));
            vista.setTextViewText(R.id.widget_temperatura, atrasado ? SIN_DATO : numero(dato, "temp_af", 1, "°"));
            vista.setTextViewText(R.id.widget_humedad, "Humedad " + (atrasado ? SIN_DATO : numero(dato, "hum_af", 0, " %")));
            vista.setTextViewText(R.id.widget_lluvia, "Lluvia hoy " + (atrasado ? SIN_DATO : numero(dato, "RR_dia", 1, " mm")));
            vista.setTextViewText(R.id.widget_hora, atrasado ? "Sin datos desde " + hora(fechaI) : hora(fechaI));
            if (atrasado) vista.setTextColor(R.id.widget_hora, COLOR_ATRASADO);
        }
        return vista;
    }

    /** Favoritas: una fila por estación, hasta las que entran (`maximo`) */
    private static RemoteViews favoritas(Context context, List<JSONObject> lista, int maximo) {
        RemoteViews vista = new RemoteViews(context.getPackageName(), R.layout.widget_favoritos);
        vista.setViewVisibility(R.id.widget_vacio, lista.isEmpty() ? View.VISIBLE : View.GONE);
        for (int i = 0; i < FILAS.length; i++) {
            boolean hay = i < lista.size() && i < maximo;
            vista.setViewVisibility(FILAS[i], hay ? View.VISIBLE : View.GONE);
            if (!hay) continue;
            JSONObject dato = lista.get(i);
            String fechaI = dato.optString("fecha_I", "");
            boolean atrasado = atrasado(fechaI);
            vista.setTextViewText(NOMBRES[i], dato.optString("nombre", ""));
            vista.setTextViewText(TEMPERATURAS[i], atrasado ? SIN_DATO : numero(dato, "temp_af", 1, "°"));
            vista.setTextViewText(LLUVIAS[i], atrasado ? SIN_DATO : numero(dato, "RR_dia", 1, ""));
            vista.setTextViewText(HORAS[i], horaCorta(fechaI));
            if (atrasado) vista.setTextColor(HORAS[i], COLOR_ATRASADO);
        }
        return vista;
    }

    /**
     * El último registro tiene más de 45 minutos (el mismo criterio que Inicio): en vez de mostrar
     * valores viejos como si fueran actuales van «—» y la hora (o la fecha) del registro en ámbar.
     * No se estima con OpenWeatherMap para no gastar su cuota; la app sí muestra la estimación.
     */
    private static boolean atrasado(String fechaI) {
        if (fechaI.length() < 16) return true;
        try {
            Date registro = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).parse(fechaI.substring(0, 16));
            return registro == null || System.currentTimeMillis() - registro.getTime() > MINUTOS_ATRASADO * 60000L;
        } catch (Exception e) {
            return true;
        }
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
            JSONArray lista = new JSONArray(texto.toString());
            if (lista.length() == 0) throw new Exception("Respuesta vacía");
            Map<String, JSONObject> datos = porEstacion(lista);
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
            // Deshabilitada: con una sola favorita ?estacion= la devuelve igual, con su último dato (viejo)
            if (e != null && !"0".equals(e.optString("habilitada"))) datos.put(e.optString("Identificacion"), e);
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
