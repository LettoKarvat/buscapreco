package com.faives.scannerprodutos;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;    

// ─── Topwise AIDL ───
import com.topwise.cloudpos.aidl.AidlDeviceService;
import com.topwise.cloudpos.aidl.scanner.AidlScannerManager;
import com.topwise.cloudpos.aidl.scanner.AidlScannerListener;

@CapacitorPlugin(name = "ScannerPlugin")
public class ScannerPlugin extends Plugin {

    private AidlScannerManager scanner;

    /** Callback que recebe o código lido */
    private final AidlScannerListener cb = new AidlScannerListener.Stub() {
        @Override public void onScanResult(String data) {
            JSObject ret = new JSObject();
            ret.put("code", data);
            notifyListeners("scan", ret);
        }
    };

    /** Conecta-se ao serviço quando o plugin carrega */
    @Override public void load() {
        Intent svc = new Intent();
        svc.setPackage("com.topwise.cloudpos");
        svc.setAction("topwise_cloudpos_device_service");
        getContext().bindService(svc, conn, Context.BIND_AUTO_CREATE);
    }

    /** ServiceConnection para o DeviceService */
    private final ServiceConnection conn = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName n, IBinder b) {
            try {
                AidlDeviceService dev =
                    AidlDeviceService.Stub.asInterface(b);

                scanner = AidlScannerManager.Stub.asInterface(dev.getScanner());
                scanner.init();        // inicializa o módulo
                scanner.decode(cb);    // acende o laser e aguarda leitura
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        @Override public void onServiceDisconnected(ComponentName n) {
            scanner = null;
        }
    };

    /** Exposto ao JS para desligar o laser manualmente */
    @PluginMethod
    public void stop(PluginCall call) {
        try { if (scanner != null) scanner.exit(); } catch (Exception ignored) {}
        call.resolve();
    }

    /** Libera recursos quando o app fecha */
    @Override protected void handleOnDestroy() {
        try { if (scanner != null) scanner.exit(); } catch (Exception ignored) {}
        getContext().unbindService(conn);
    }
}
