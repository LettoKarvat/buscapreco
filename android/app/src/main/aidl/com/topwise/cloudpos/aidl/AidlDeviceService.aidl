package com.topwise.cloudpos.aidl;

import android.os.IBinder;

/** Serviço raiz que fornece os managers de hardware. */
interface AidlDeviceService {
    /** Retorna o Binder do ScannerManager. */
    IBinder getScanner();
}
