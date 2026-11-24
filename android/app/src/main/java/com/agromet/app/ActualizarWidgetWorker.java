package com.agromet.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.TimeUnit;

/**
 * Actualiza el widget cada 30 minutos aunque no se abra la app. updatePeriodMillis del widget no
 * alcanza: muchos celulares (Samsung, Xiaomi…) lo demoran o no lo mandan para ahorrar batería;
 * WorkManager es el mecanismo que Android respeta para tareas periódicas y espera a que haya red.
 */
public class ActualizarWidgetWorker extends Worker {

    private static final String NOMBRE = "actualizar-widget";

    public ActualizarWidgetWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        // Sin red o con el servidor caído se reintenta más tarde; sin estaciones no hay nada que hacer
        return EstacionWidget.actualizarDesdeServidor(getApplicationContext()) ? Result.success() : Result.retry();
    }

    /** Programa la actualización periódica (si ya estaba programada, la deja como está) */
    static void programar(Context context) {
        Constraints conRed = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest pedido = new PeriodicWorkRequest.Builder(ActualizarWidgetWorker.class, 30, TimeUnit.MINUTES)
                .setConstraints(conRed)
                .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(NOMBRE, ExistingPeriodicWorkPolicy.KEEP, pedido);
    }

    /** Sin widgets en la pantalla no hace falta seguir pidiendo datos */
    static void cancelar(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(NOMBRE);
    }
}
