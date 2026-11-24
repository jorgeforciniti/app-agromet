package com.agromet.app;

import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le pasa al widget las estaciones a mostrar (las favoritas o, si no hay, la elegida) y su último
 * registro (src/app/services/widget.ts): el widget no puede leer el localStorage del WebView.
 */
@CapacitorPlugin(name = "AgrometWidget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void actualizar(PluginCall call) {
        JSArray estaciones = call.getArray("estaciones");
        JSArray datos = call.getArray("datos", new JSArray());
        if (estaciones == null || estaciones.length() == 0) {
            call.reject("Faltan las estaciones");
            return;
        }
        getContext().getSharedPreferences(EstacionWidget.PREFS, Context.MODE_PRIVATE).edit()
                .putString(EstacionWidget.CLAVE_ESTACIONES, estaciones.toString())
                .putString(EstacionWidget.CLAVE_DATOS, datos.toString())
                .putLong(EstacionWidget.CLAVE_ACTUALIZADO, System.currentTimeMillis())
                .apply();
        // Si el widget ya estaba de antes de esta versión, que empiece a actualizarse solo
        if (EstacionWidget.hayWidgets(getContext())) ActualizarWidgetWorker.programar(getContext());
        EstacionWidget.mostrarGuardado(getContext());
        call.resolve();
    }
}
